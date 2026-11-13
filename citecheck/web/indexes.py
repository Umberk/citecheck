"""Per-document chunk files and a small LRU of retrievers.

A document is the unit that is stored, parsed, and owned. A library is the set
of documents one question is asked against; its id is derived from the sorted
document ids, so the same set always reuses the same retriever.
"""

from __future__ import annotations

import hashlib
import json
import threading
from collections import OrderedDict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

from citecheck.ingest import Chunk
from citecheck.retrieve import Retriever
from citecheck.web import config

INDEX_VERSION = 1


def library_key(document_ids: list[str]) -> str:
    joined = "|".join(sorted(set(document_ids)))
    return "lib-" + hashlib.sha1(joined.encode()).hexdigest()[:16]


def build_retriever(chunks: list[Chunk]) -> Retriever:
    return Retriever(chunks, mode="hybrid")


@dataclass
class LibraryIndex:
    library_id: str
    document_ids: list[str]
    chunks: list[Chunk]
    boxes: dict[str, list]
    retriever: Retriever


class IndexStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cache: OrderedDict[str, LibraryIndex] = OrderedDict()
        self.retriever_factory: Callable[[list[Chunk]], Retriever] = build_retriever

    def _path(self, document_id: str) -> Path:
        return config.settings.indexes_dir / f"{document_id}.json"

    def save(self, document_id: str, chunks: list[Chunk], boxes: dict[str, list], page_count: int) -> None:
        path = self._path(document_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": INDEX_VERSION,
            "document_id": document_id,
            "page_count": page_count,
            "chunks": [asdict(chunk) for chunk in chunks],
            "boxes": boxes,
        }
        temp = path.with_suffix(".part")
        temp.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        temp.replace(path)

    def exists(self, document_id: str) -> bool:
        return self._path(document_id).exists()

    def load(self, document_id: str) -> tuple[list[Chunk], dict[str, list]]:
        data = json.loads(self._path(document_id).read_text(encoding="utf-8"))
        return [Chunk(**item) for item in data["chunks"]], data.get("boxes", {})

    def delete(self, document_id: str) -> None:
        self.evict(document_id)
        self._path(document_id).unlink(missing_ok=True)

    def evict(self, document_id: str) -> None:
        with self._lock:
            for key in [key for key, entry in self._cache.items() if document_id in entry.document_ids]:
                del self._cache[key]

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def library(self, document_ids: list[str]) -> LibraryIndex:
        """Retriever over the given documents, kept in a bounded LRU."""
        ids = sorted(set(document_ids))
        key = library_key(ids)
        with self._lock:
            cached = self._cache.get(key)
            if cached is not None:
                self._cache.move_to_end(key)
                return cached
        chunks: list[Chunk] = []
        boxes: dict[str, list] = {}
        for document_id in ids:
            doc_chunks, doc_boxes = self.load(document_id)
            chunks.extend(doc_chunks)
            boxes.update(doc_boxes)
        entry = LibraryIndex(
            library_id=key,
            document_ids=ids,
            chunks=chunks,
            boxes=boxes,
            retriever=self.retriever_factory(chunks),
        )
        with self._lock:
            self._cache[key] = entry
            self._cache.move_to_end(key)
            while len(self._cache) > config.settings.index_cache_size:
                self._cache.popitem(last=False)
        return entry

    def cached_keys(self) -> list[str]:
        with self._lock:
            return list(self._cache)


store = IndexStore()
