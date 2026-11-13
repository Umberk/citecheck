"""Saved research conversations. Each question runs the unchanged CiteCheck agent."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from citecheck.agent import SYSTEMS, answer_question
from citecheck.llm import LLMClient
from citecheck.db import Conversation, Document, Message, User, get_db
from citecheck.db.models import iso, new_id
from citecheck.tasks.indexer import worker
from citecheck.web.api.deps import current_user, fail, get_llm
from citecheck.web.evidence import build_answer
from citecheck.web.indexes import library_key, store

router = APIRouter()

MAX_SCOPE = 4


class CreateBody(BaseModel):
    document_ids: list[str]


class AskBody(BaseModel):
    question: str
    system: str = "full"


def _documents(db: Session, user: User, ids: list[str]) -> dict[str, Document]:
    rows = db.query(Document).filter(Document.user_id == user.id, Document.id.in_(ids)).all() if ids else []
    return {row.id: row for row in rows}


def conversation_payload(db: Session, conversation: Conversation, docs: dict[str, Document] | None = None) -> dict:
    ids = conversation.document_ids
    if docs is None:
        docs = {row.id: row for row in db.query(Document).filter(Document.id.in_(ids)).all()} if ids else {}
    user_messages = [message for message in conversation.messages if message.role == "user"]
    return {
        "id": conversation.id,
        "title": conversation.title,
        "library_id": library_key(ids),
        "document_ids": ids,
        "documents": [
            {"id": doc_id, "title": docs[doc_id].title if doc_id in docs else "", "available": doc_id in docs}
            for doc_id in ids
        ],
        "created_at": iso(conversation.created_at),
        "updated_at": iso(conversation.updated_at),
        "message_count": len(conversation.messages),
        "last_question": user_messages[-1].content if user_messages else None,
    }


def owned_conversation(db: Session, user: User, conversation_id: str) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        fail(404, "conversation_not_found")
    return conversation


@router.get("/conversations")
def list_conversations(
    document_id: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = db.query(Conversation).filter_by(user_id=user.id).order_by(Conversation.updated_at.desc()).all()
    if document_id:
        rows = [row for row in rows if document_id in row.document_ids]
    ids = {doc_id for row in rows for doc_id in row.document_ids}
    docs = _documents(db, user, list(ids))
    return [conversation_payload(db, row, docs) for row in rows]


@router.post("/conversations", status_code=201)
def create_conversation(body: CreateBody, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    ids = list(dict.fromkeys(body.document_ids))
    if not ids:
        fail(400, "need_document")
    if len(ids) > MAX_SCOPE:
        fail(400, "too_many_documents")
    docs = _documents(db, user, ids)
    if len(docs) != len(ids):
        fail(404, "document_not_found")
    if any(doc.status != "ready" for doc in docs.values()):
        fail(409, "document_not_ready")
    conversation = Conversation(
        id=new_id(),
        user_id=user.id,
        title=" · ".join(docs[doc_id].title for doc_id in ids)[:300],
        document_ids_json=json.dumps(ids),
    )
    db.add(conversation)
    db.commit()
    return {**conversation_payload(db, conversation, docs), "messages": []}


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    conversation = owned_conversation(db, user, conversation_id)
    return {
        **conversation_payload(db, conversation),
        "messages": [message.to_dict() for message in conversation.messages],
    }


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    db.delete(owned_conversation(db, user, conversation_id))
    db.commit()
    return Response(status_code=204)


@router.post("/conversations/{conversation_id}/messages")
def ask(
    conversation_id: str,
    body: AskBody,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    question = body.question.strip()
    if not question:
        fail(400, "empty_question")
    if len(question) > 1000:
        fail(400, "question_too_long")
    if body.system not in SYSTEMS:
        fail(400, "unknown_system")
    conversation = owned_conversation(db, user, conversation_id)
    ids = conversation.document_ids
    docs = _documents(db, user, ids)
    if len(docs) != len(ids):
        fail(409, "document_unavailable")
    for doc in docs.values():
        if doc.status != "ready":
            fail(409, "document_not_ready")
        if not store.exists(doc.id):
            doc.status = "pending"
            db.commit()
            worker.enqueue(doc.id)
            fail(409, "document_not_ready", "The index was missing and is being rebuilt.")

    library = store.library(ids)
    try:
        result = answer_question(question, library.chunks, llm, system=body.system, retriever=library.retriever)
    except Exception as exc:
        fail(502, "ask_failed", str(exc)[:300])
    payload = build_answer(result, library.boxes, library.library_id)

    first_question = not any(message.role == "user" for message in conversation.messages)
    now = datetime.now(timezone.utc)
    user_message = Message(id=new_id(), conversation_id=conversation.id, role="user", content=question, created_at=now)
    answer_message = Message(
        id=new_id(),
        conversation_id=conversation.id,
        role="assistant",
        content=result.answer,
        system=body.system,
        payload_json=json.dumps(payload),
        created_at=datetime.now(timezone.utc),
    )
    db.add_all([user_message, answer_message])
    if first_question:
        conversation.title = question[:300]
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"question": user_message.to_dict(), "answer": answer_message.to_dict()}
