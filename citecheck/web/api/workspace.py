"""Selection analysis, dashboard summary, evaluation results, and health."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from citecheck.db import Annotation, Conversation, Document, Message, User, get_db
from citecheck.db.models import new_id
from citecheck.llm import LLMClient, list_providers, load_settings
from citecheck.storage import get_storage
from citecheck.tasks.indexer import worker
from citecheck.web import config, evaluation
from citecheck.web.api.conversations import conversation_payload
from citecheck.web.api.deps import current_user, fail, get_llm
from citecheck.web.api.documents import owned_document
from citecheck.web.indexes import store
from citecheck.web.selection import ACTIONS, analyze, find_chunk

router = APIRouter()
public = APIRouter()


class Anchor(BaseModel):
    page_index: int
    rects: list[list[float]] = Field(default_factory=list, max_length=60)
    text_offset: int | None = None


class SelectionBody(BaseModel):
    document_id: str
    page_index: int = Field(ge=0)
    text: str
    action: str
    question: str | None = None
    context: str | None = None
    anchor: Anchor | None = None
    locale: str = "zh"


@router.post("/selection", status_code=201)
def selection(
    body: SelectionBody,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    text = body.text.strip()
    if not text:
        fail(400, "empty_selection")
    if body.action not in ACTIONS:
        fail(400, "unknown_action")
    if body.action == "ask" and not (body.question or "").strip():
        fail(400, "empty_question")
    doc = owned_document(db, user, body.document_id)
    if doc.page_count is not None and body.page_index >= doc.page_count:
        fail(400, "page_out_of_range")
    chunk = None
    if doc.status == "ready" and store.exists(doc.id):
        chunks, _boxes = store.load(doc.id)
        chunk = find_chunk(chunks, body.page_index, text)
    try:
        answer, latency = analyze(
            llm,
            action=body.action,
            text=text,
            question=body.question,
            context=body.context,
            chunk=chunk,
            locale=body.locale,
        )
    except Exception as exc:
        fail(502, "selection_failed", str(exc)[:300])
    anchor = body.anchor.model_dump() if body.anchor else None
    row = Annotation(
        id=new_id(),
        user_id=user.id,
        document_id=doc.id,
        page_index=body.page_index,
        text=text[:4000],
        action=body.action,
        question=(body.question or "").strip() or None,
        answer=answer,
        section=chunk.section if chunk else None,
        chunk_id=chunk.chunk_id if chunk else None,
        anchor_json=json.dumps(anchor) if anchor else None,
        latency_s=round(latency, 3),
    )
    db.add(row)
    db.commit()
    return row.to_dict()


def _claim_counts(messages: list[Message]) -> tuple[int, int]:
    total = supported = 0
    for message in messages:
        if not message.payload_json:
            continue
        payload = json.loads(message.payload_json)
        if not payload.get("verify"):
            continue
        claims = payload.get("claims") or []
        total += len(claims)
        supported += sum(1 for claim in claims if claim.get("label") == "supported")
    return total, supported


@router.get("/dashboard/summary")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    documents = db.query(Document).filter_by(user_id=user.id).order_by(Document.created_at.desc()).all()
    conversations = db.query(Conversation).filter_by(user_id=user.id).order_by(Conversation.updated_at.desc()).all()
    conversation_ids = [row.id for row in conversations]
    messages = (
        db.query(Message).filter(Message.conversation_id.in_(conversation_ids)).order_by(Message.created_at.desc()).all()
        if conversation_ids
        else []
    )
    annotations = db.query(Annotation).filter_by(user_id=user.id).order_by(Annotation.created_at.desc()).limit(10).all()
    doc_by_id = {doc.id: doc for doc in documents}
    conversation_by_id = {row.id: row for row in conversations}
    total, supported = _claim_counts([message for message in messages if message.role == "assistant"])

    activity: list[dict] = []
    for doc in documents[:10]:
        activity.append(
            {
                "kind": "upload",
                "title": doc.title,
                "detail": doc.filename,
                "document_id": doc.id if doc.status == "ready" else None,
                "conversation_id": None,
                "created_at": doc.to_item()["created_at"],
            }
        )
    for message in [item for item in messages if item.role == "user"][:10]:
        conversation = conversation_by_id[message.conversation_id]
        doc_id = next((item for item in conversation.document_ids if item in doc_by_id), None)
        activity.append(
            {
                "kind": "question",
                "title": message.content,
                "detail": doc_by_id[doc_id].title if doc_id else None,
                "document_id": doc_id,
                "conversation_id": conversation.id,
                "created_at": message.to_dict()["created_at"],
            }
        )
    for row in annotations:
        item = row.to_dict()
        activity.append(
            {
                "kind": "selection",
                "title": row.text[:160],
                "detail": row.answer[:200],
                "document_id": row.document_id,
                "conversation_id": None,
                "created_at": item["created_at"],
            }
        )
    activity.sort(key=lambda item: item["created_at"], reverse=True)

    return {
        "stats": {
            "documents": len(documents),
            "ready": sum(doc.status == "ready" for doc in documents),
            "processing": sum(doc.status in {"pending", "indexing"} for doc in documents),
            "failed": sum(doc.status == "failed" for doc in documents),
            "pages": sum(doc.page_count or 0 for doc in documents if doc.status == "ready"),
            "conversations": len(conversations),
            "questions": sum(message.role == "user" for message in messages),
            "selections": db.query(Annotation).filter_by(user_id=user.id).count(),
            "claims_total": total,
            "claims_supported": supported,
        },
        "recent_documents": [doc.to_item() for doc in documents[:6]],
        "recent_conversations": [conversation_payload(db, row, doc_by_id) for row in conversations[:6]],
        "activity": activity[:12],
    }


@router.get("/evaluation/runs")
def evaluation_runs(_user: User = Depends(current_user)) -> list[dict]:
    return evaluation.list_runs()


@router.get("/evaluation/runs/{name}")
def evaluation_run(name: str, _user: User = Depends(current_user)) -> dict:
    run = evaluation.read_run(name)
    if run is None:
        fail(404, "run_not_found")
    return run


@public.get("/health")
def health() -> dict:
    llm = load_settings()
    providers = list_providers()
    return {
        "status": "ok",
        "storage": get_storage().kind,
        "llm_configured": any(item["configured"] for item in providers),
        "llm_provider": llm.get("provider", "llm"),
        "llm_providers": providers,
        "index_queue": worker.pending(),
        "max_upload_mb": config.settings.max_upload_mb,
    }
