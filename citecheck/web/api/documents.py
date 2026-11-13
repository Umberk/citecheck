"""Document upload, listing, reading, download, deletion, and re-indexing."""

from __future__ import annotations

import hashlib
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy.orm import Session

from citecheck.db import Annotation, Document, User, get_db
from citecheck.db.models import new_id
from citecheck.llm import ROOT
from citecheck.sample_docs import write_examples
from citecheck.storage import StorageError, get_storage, object_key
from citecheck.tasks.indexer import worker
from citecheck.web import config
from citecheck.web.api.deps import current_user, fail
from citecheck.web.indexes import store

router = APIRouter()

SAMPLES = ["widgetnet.pdf", "widgetnet_lite.pdf"]
READ_BLOCK = 1024 * 1024


def owned_document(db: Session, user: User, document_id: str) -> Document:
    doc = db.get(Document, document_id)
    if doc is None or doc.user_id != user.id:
        fail(404, "document_not_found")
    return doc


def _create(db: Session, user: User, *, filename: str, data: bytes, source: str) -> Document:
    doc = Document(
        id=new_id(),
        user_id=user.id,
        title=Path(filename).stem[:300] or "paper",
        filename=filename[:255],
        source=source,
        storage_key="",
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        status="pending",
    )
    doc.storage_key = object_key(user.id, doc.id)
    try:
        get_storage().put(doc.storage_key, data)
    except StorageError as exc:
        fail(502, "storage_failed", str(exc))
    db.add(doc)
    db.commit()
    worker.enqueue(doc.id)
    db.refresh(doc)
    return doc


def _read_limited(upload: UploadFile, limit: int) -> bytes:
    chunks: list[bytes] = []
    size = 0
    while True:
        block = upload.file.read(READ_BLOCK)
        if not block:
            break
        size += len(block)
        if size > limit:
            fail(413, "file_too_large", f"Limit is {limit // (1024 * 1024)} MB")
        chunks.append(block)
    return b"".join(chunks)


@router.get("/documents")
def list_documents(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.query(Document).filter_by(user_id=user.id).order_by(Document.created_at.desc()).all()
    return [row.to_item() for row in rows]


@router.post("/documents", status_code=201)
def upload_document(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    name = Path(file.filename or "paper.pdf").name
    if Path(name).suffix.lower() != ".pdf":
        fail(400, "not_pdf")
    pending = (
        db.query(Document)
        .filter(Document.user_id == user.id, Document.status.in_(["pending", "indexing"]))
        .count()
    )
    if pending >= config.settings.max_pending_per_user:
        fail(429, "too_many_pending")
    data = _read_limited(file, config.settings.max_upload_bytes)
    if not data.startswith(b"%PDF-"):
        fail(400, "not_pdf")
    return _create(db, user, filename=name, data=data, source="upload").to_item()


@router.post("/documents/samples")
def import_samples(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    examples = ROOT / "examples"
    if not all((examples / name).exists() for name in SAMPLES):
        write_examples()
    existing = {
        doc.filename: doc for doc in db.query(Document).filter_by(user_id=user.id, source="sample").all()
    }
    docs = []
    for name in SAMPLES:
        doc = existing.get(name)
        if doc is None:
            doc = _create(db, user, filename=name, data=(examples / name).read_bytes(), source="sample")
        docs.append(doc.to_item())
    return docs


@router.get("/documents/{document_id}")
def get_document(document_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return owned_document(db, user, document_id).to_detail()


@router.get("/documents/{document_id}/file")
def read_file(
    document_id: str,
    download: bool = False,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    doc = owned_document(db, user, document_id)
    try:
        data = get_storage().get(doc.storage_key)
    except StorageError as exc:
        fail(502, "storage_failed", str(exc))
    fallback = doc.filename.encode("ascii", "ignore").decode() or "paper.pdf"
    disposition = "attachment" if download else "inline"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"{disposition}; filename=\"{fallback}\"; filename*=UTF-8''{quote(doc.filename)}",
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    doc = owned_document(db, user, document_id)
    try:
        get_storage().delete(doc.storage_key)
    except StorageError as exc:
        fail(502, "storage_failed", str(exc))
    store.delete(doc.id)
    db.query(Annotation).filter_by(document_id=doc.id).delete()
    db.delete(doc)
    db.commit()
    return Response(status_code=204)


@router.post("/documents/{document_id}/reindex")
def reindex(document_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    doc = owned_document(db, user, document_id)
    if doc.status in {"pending", "indexing"}:
        return doc.to_item()
    doc.status = "pending"
    doc.error_message = None
    db.commit()
    worker.enqueue(doc.id)
    db.refresh(doc)
    return doc.to_item()


@router.get("/documents/{document_id}/annotations")
def list_annotations(document_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    owned_document(db, user, document_id)
    rows = (
        db.query(Annotation)
        .filter_by(user_id=user.id, document_id=document_id)
        .order_by(Annotation.created_at.desc())
        .limit(100)
        .all()
    )
    return [row.to_dict() for row in rows]
