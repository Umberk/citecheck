"""Shared setup for API tests: temporary data dir, inline indexing, BM25 retriever, fake model."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from citecheck.db import reset_engine
from citecheck.ingest import Chunk
from citecheck.llm import TokenUsage
from citecheck.retrieve import BM25Index
from citecheck.storage import set_storage
from citecheck.web import config
from citecheck.web.api import deps
from citecheck.web.app import app
from citecheck.web.indexes import build_retriever, store


class BM25Retriever:
    """Retriever stand-in that skips the embedding model."""

    def __init__(self, chunks: list[Chunk]) -> None:
        self.chunks = chunks
        self.index = BM25Index(chunks)

    def search(self, query: str, k: int = 5, mode: str | None = None) -> list[Chunk]:
        del mode
        return [chunk for chunk, _score in self.index.search(query, k)]


class FakeLLM:
    def __init__(self) -> None:
        self.usage = TokenUsage()
        self.plans = 0
        self.prompts: list[str] = []

    def complete(self, messages, **kwargs):
        del kwargs
        self.usage.add(5, 7)
        text = messages[-1]["content"]
        self.prompts.append(text)
        if "Task: draft answer" in text:
            return "WidgetNet reaches 91 percent accuracy on Widget-100 [E1]."
        return "This passage says WidgetNet reaches 91 percent accuracy."

    def complete_json(self, messages, **kwargs):
        del kwargs
        self.usage.add(3, 2)
        text = messages[-1]["content"]
        if "Task: plan retrieval" in text:
            self.plans += 1
            if self.plans == 1:
                return {"action": "search", "queries": ["WidgetNet 91 percent accuracy Widget-100"]}
            return {"action": "stop", "queries": []}
        if "Task: verify claim" in text:
            return {"label": "supports", "evidence_id": "E1"}
        raise AssertionError(text[:120])


class ApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        data = Path(self._tmp.name)
        self._saved = config.settings
        config.configure(
            data_dir=data,
            db_path=data / "test.db",
            results_dir=data / "results",
            index_inline=True,
            max_upload_mb=1,
            cos_secret_id="",
            cos_secret_key="",
        )
        reset_engine()
        set_storage(None)
        store.clear()
        store.retriever_factory = BM25Retriever
        self.llm = FakeLLM()
        app.dependency_overrides[deps.get_llm] = lambda: self.llm
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        app.dependency_overrides.pop(deps.get_llm, None)
        store.retriever_factory = build_retriever
        store.clear()
        set_storage(None)
        reset_engine()
        config.configure(**{field: getattr(self._saved, field) for field in self._saved.__dataclass_fields__})
        self._tmp.cleanup()

    def new_client(self) -> TestClient:
        return TestClient(app)

    def register(self, client: TestClient, email: str = "alice@example.com", password: str = "correct-horse") -> dict:
        response = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "display_name": email.split("@")[0], "locale": "en"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def import_samples(self, client: TestClient) -> list[dict]:
        response = client.post("/api/v1/documents/samples")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()
