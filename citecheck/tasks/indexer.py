"""Parse and index uploaded PDFs one at a time on a single background thread.

One worker keeps memory flat on a 2 GB server: only one PDF is parsed and
embedded at a time, and each job frees its temporary file when it ends.
"""

from __future__ import annotations

import dataclasses
import gc
import json
import logging
import queue
import shutil
import tempfile
import threading
from pathlib import Path

from citecheck import locate
from citecheck.db import Document, session_scope
from citecheck.ingest import parse_pdf
from citecheck.storage import get_storage
from citecheck.web import config
from citecheck.web.indexes import store
from citecheck.web.service import outline_from_chunks

log = logging.getLogger("citecheck.indexer")


class IndexWorker:
    def __init__(self) -> None:
        self._queue: queue.Queue[str] = queue.Queue()
        self._queued: set[str] = set()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def enqueue(self, document_id: str) -> None:
        if config.settings.index_inline:
            process(document_id)
            return
        with self._lock:
            if document_id in self._queued:
                return
            self._queued.add(document_id)
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(target=self._run, name="citecheck-indexer", daemon=True)
                self._thread.start()
        self._queue.put(document_id)

    def pending(self) -> int:
        return self._queue.qsize()

    def _run(self) -> None:
        while True:
            document_id = self._queue.get()
            with self._lock:
                self._queued.discard(document_id)
            try:
                process(document_id)
            except Exception:
                log.exception("indexing crashed for %s", document_id)
            finally:
                self._queue.task_done()


worker = IndexWorker()


def requeue_unfinished() -> int:
    """After a restart, documents left in pending or indexing are parsed again."""
    with session_scope() as db:
        rows = db.query(Document).filter(Document.status.in_(["pending", "indexing"])).all()
        ids = [row.id for row in rows]
        for row in rows:
            row.status = "pending"
    for document_id in ids:
        worker.enqueue(document_id)
    return len(ids)


def _located_page(chunk, chunk_boxes):
    """Use the page where the chunk's text actually starts.

    The parser gives every piece of a long paragraph the paragraph's first
    page, so later pieces can cite an earlier page. The web index corrects
    this from the word boxes; the CLI and evaluation keep the parser output.
    """
    if not locate.is_exact(chunk_boxes):
        return chunk
    first = next(box for box in chunk_boxes if box is not None)
    return dataclasses.replace(chunk, page=first[0] + 1)


def process(document_id: str) -> None:
    with session_scope() as db:
        doc = db.get(Document, document_id)
        if doc is None:
            return
        doc.status = "indexing"
        doc.error_message = None
        storage_key, filename = doc.storage_key, doc.filename

    workdir = Path(tempfile.mkdtemp(prefix="citecheck-index-"))
    path = workdir / f"{document_id}.pdf"
    try:
        path.write_bytes(get_storage().get(storage_key))
        chunks = parse_pdf(path)
        if not chunks:
            raise ValueError("No extractable text. Scanned PDFs without a text layer are not supported.")
        detected = chunks[0].paper_title
        title = detected if detected and detected != document_id else Path(filename).stem
        chunks = [dataclasses.replace(chunk, paper_title=title) for chunk in chunks]
        boxes, page_count = locate.chunk_boxes(path, chunks)
        chunks = [_located_page(chunk, boxes.get(chunk.chunk_id)) for chunk in chunks]
        store.evict(document_id)
        store.save(document_id, chunks, boxes, page_count)
        store.library([document_id])
        outline = outline_from_chunks(chunks)
        sections = outline[0]["sections"] if outline else []
        for section in sections:
            section["page_index"] = None if section["page"] is None else section["page"] - 1

        with session_scope() as db:
            doc = db.get(Document, document_id)
            if doc is None:
                store.delete(document_id)
                return
            doc.title = title[:300]
            doc.page_count = page_count
            doc.chunk_count = len(chunks)
            doc.outline_json = json.dumps(sections)
            doc.status = "ready"
            doc.error_message = None
    except Exception as exc:
        log.warning("indexing failed for %s: %s", document_id, exc)
        store.delete(document_id)
        with session_scope() as db:
            doc = db.get(Document, document_id)
            if doc is not None:
                message = str(exc).replace(str(path), filename).replace(str(workdir), "")
                doc.status = "failed"
                doc.error_message = message[:500] or exc.__class__.__name__
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
        gc.collect()
