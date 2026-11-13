"""Workspace API: accounts, ownership, documents, conversations, selection, dashboard, evaluation."""

import json
import unittest

from citecheck.db import Document, session_scope
from citecheck.tasks.indexer import requeue_unfinished
from citecheck.web import config
from citecheck.web.indexes import library_key, store
from web_support import ApiTestCase


class AuthTest(ApiTestCase):
    def test_register_login_logout(self) -> None:
        user = self.register(self.client)
        self.assertEqual(user["email"], "alice@example.com")
        self.assertEqual(self.client.get("/api/v1/auth/me").json()["id"], user["id"])

        self.assertEqual(self.client.post("/api/v1/auth/logout").status_code, 204)
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 401)

        bad = self.client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": "wrong-pass"})
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(bad.json()["detail"]["code"], "invalid_credentials")
        good = self.client.post("/api/v1/auth/login", json={"email": "ALICE@example.com", "password": "correct-horse"})
        self.assertEqual(good.status_code, 200)
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 200)

    def test_password_is_hashed_and_session_cookie_is_http_only(self) -> None:
        response = self.client.post(
            "/api/v1/auth/register",
            json={"email": "bob@example.com", "password": "long-enough-pw"},
        )
        self.assertIn("httponly", response.headers["set-cookie"].lower())
        from citecheck.db import User

        with session_scope() as db:
            stored = db.query(User).filter_by(email="bob@example.com").one().password_hash
        self.assertNotIn("long-enough-pw", stored)
        self.assertTrue(stored.startswith("$2"))

    def test_registration_rules(self) -> None:
        self.register(self.client)
        duplicate = self.client.post("/api/v1/auth/register", json={"email": "alice@example.com", "password": "another-pw"})
        self.assertEqual(duplicate.json()["detail"]["code"], "email_taken")
        weak = self.client.post("/api/v1/auth/register", json={"email": "c@example.com", "password": "short"})
        self.assertEqual(weak.json()["detail"]["code"], "weak_password")
        invalid = self.client.post("/api/v1/auth/register", json={"email": "not-an-email", "password": "long-enough"})
        self.assertEqual(invalid.json()["detail"]["code"], "invalid_email")

    def test_profile_update(self) -> None:
        self.register(self.client)
        response = self.client.patch("/api/v1/users/me", json={"display_name": "Alice L", "locale": "zh"})
        self.assertEqual(response.json()["display_name"], "Alice L")
        self.assertEqual(response.json()["locale"], "zh")
        self.assertEqual(self.client.patch("/api/v1/users/me", json={"locale": "fr"}).status_code, 400)

    def test_profile_llm_provider(self) -> None:
        self.register(self.client)
        me = self.client.get("/api/v1/auth/me").json()
        self.assertIn(me["llm_provider"], {"llm", "teamily"})
        health = self.client.get("/api/health").json()
        configured = [item["id"] for item in health["llm_providers"] if item["configured"]]
        if len(configured) < 2:
            self.skipTest("need both LLM and Teamily keys in .env")
        other = "teamily" if me["llm_provider"] == "llm" else "llm"
        updated = self.client.patch("/api/v1/users/me", json={"llm_provider": other}).json()
        self.assertEqual(updated["llm_provider"], other)
        self.assertEqual(self.client.patch("/api/v1/users/me", json={"llm_provider": "unknown"}).status_code, 400)

    def test_protected_routes_need_a_session(self) -> None:
        for path in ["/api/v1/documents", "/api/v1/conversations", "/api/v1/dashboard/summary", "/api/v1/evaluation/runs"]:
            self.assertEqual(self.client.get(path).status_code, 401, path)


class DocumentTest(ApiTestCase):
    def test_samples_are_parsed_with_outline_and_served(self) -> None:
        self.register(self.client)
        docs = self.import_samples(self.client)
        self.assertEqual([doc["status"] for doc in docs], ["ready", "ready"])
        again = self.import_samples(self.client)
        self.assertEqual([doc["id"] for doc in again], [doc["id"] for doc in docs])

        detail = self.client.get(f"/api/v1/documents/{docs[0]['id']}").json()
        self.assertEqual(detail["title"], "WidgetNet: A Sample Paper for Citation Checking")
        self.assertEqual(detail["page_count"], 6)
        sections = {section["name"]: section for section in detail["outline"]}
        self.assertEqual(sections["3 Experiments"]["page"], 5)
        self.assertEqual(sections["3 Experiments"]["page_index"], 4)

        file = self.client.get(detail["file_url"])
        self.assertEqual(file.status_code, 200)
        self.assertEqual(file.headers["content-type"], "application/pdf")
        self.assertTrue(file.content.startswith(b"%PDF-"))
        download = self.client.get(f"{detail['file_url']}?download=1")
        self.assertTrue(download.headers["content-disposition"].startswith("attachment"))

    def test_upload_checks_type_and_size(self) -> None:
        self.register(self.client)
        not_pdf = self.client.post("/api/v1/documents", files={"file": ("notes.pdf", b"hello", "application/pdf")})
        self.assertEqual(not_pdf.json()["detail"]["code"], "not_pdf")
        wrong_ext = self.client.post("/api/v1/documents", files={"file": ("notes.txt", b"%PDF-1.4", "text/plain")})
        self.assertEqual(wrong_ext.json()["detail"]["code"], "not_pdf")
        big = b"%PDF-1.4\n" + b"0" * (config.settings.max_upload_bytes + 10)
        too_large = self.client.post("/api/v1/documents", files={"file": ("big.pdf", big, "application/pdf")})
        self.assertEqual(too_large.status_code, 413)

    def test_broken_pdf_is_marked_failed_and_can_be_reindexed(self) -> None:
        self.register(self.client)
        response = self.client.post("/api/v1/documents", files={"file": ("broken.pdf", b"%PDF-1.4 broken", "application/pdf")})
        self.assertEqual(response.status_code, 201)
        doc = self.client.get(f"/api/v1/documents/{response.json()['id']}").json()
        self.assertEqual(doc["status"], "failed")
        self.assertTrue(doc["error_message"])
        self.assertNotIn("citecheck-index-", doc["error_message"])
        self.assertFalse(store.exists(doc["id"]))
        retried = self.client.post(f"/api/v1/documents/{doc['id']}/reindex").json()
        self.assertEqual(retried["status"], "failed")

    def test_unfinished_documents_are_requeued(self) -> None:
        self.register(self.client)
        doc = self.import_samples(self.client)[0]
        with session_scope() as db:
            db.get(Document, doc["id"]).status = "indexing"
        self.assertEqual(requeue_unfinished(), 1)
        self.assertEqual(self.client.get(f"/api/v1/documents/{doc['id']}").json()["status"], "ready")

    def test_delete_removes_file_index_and_blocks_follow_up_questions(self) -> None:
        self.register(self.client)
        doc = self.import_samples(self.client)[0]
        conversation = self.client.post("/api/v1/conversations", json={"document_ids": [doc["id"]]}).json()
        self.assertEqual(self.client.delete(f"/api/v1/documents/{doc['id']}").status_code, 204)
        self.assertEqual(self.client.get(doc["file_url"]).status_code, 404)
        self.assertFalse(store.exists(doc["id"]))
        self.assertFalse(any(config.settings.uploads_dir.rglob(f"{doc['id']}.pdf")))
        ask = self.client.post(f"/api/v1/conversations/{conversation['id']}/messages", json={"question": "Accuracy?"})
        self.assertEqual(ask.json()["detail"]["code"], "document_unavailable")
        kept = self.client.get(f"/api/v1/conversations/{conversation['id']}").json()
        self.assertFalse(kept["documents"][0]["available"])


class OwnershipTest(ApiTestCase):
    def test_users_cannot_reach_each_others_data(self) -> None:
        self.register(self.client, "alice@example.com")
        doc = self.import_samples(self.client)[0]
        conversation = self.client.post("/api/v1/conversations", json={"document_ids": [doc["id"]]}).json()

        other = self.new_client()
        self.register(other, "mallory@example.com")
        self.assertEqual(other.get("/api/v1/documents").json(), [])
        self.assertEqual(other.get("/api/v1/conversations").json(), [])
        for path in [
            f"/api/v1/documents/{doc['id']}",
            f"/api/v1/documents/{doc['id']}/file",
            f"/api/v1/documents/{doc['id']}/annotations",
            f"/api/v1/conversations/{conversation['id']}",
        ]:
            self.assertEqual(other.get(path).status_code, 404, path)
        self.assertEqual(other.delete(f"/api/v1/documents/{doc['id']}").status_code, 404)
        self.assertEqual(other.post(f"/api/v1/documents/{doc['id']}/reindex").status_code, 404)
        self.assertEqual(other.post("/api/v1/conversations", json={"document_ids": [doc["id"]]}).status_code, 404)
        stolen = other.post(f"/api/v1/conversations/{conversation['id']}/messages", json={"question": "Accuracy?"})
        self.assertEqual(stolen.status_code, 404)
        selection = other.post(
            "/api/v1/selection",
            json={"document_id": doc["id"], "page_index": 0, "text": "WidgetNet", "action": "explain"},
        )
        self.assertEqual(selection.status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/documents/{doc['id']}").status_code, 200)


class ConversationTest(ApiTestCase):
    def test_question_links_claims_to_stable_chunk_ids_with_pdf_locations(self) -> None:
        self.register(self.client)
        doc = self.import_samples(self.client)[0]
        conversation = self.client.post("/api/v1/conversations", json={"document_ids": [doc["id"]]}).json()
        self.assertEqual(conversation["library_id"], library_key([doc["id"]]))

        response = self.client.post(
            f"/api/v1/conversations/{conversation['id']}/messages",
            json={"question": "What accuracy does WidgetNet reach on Widget-100?", "system": "full"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()["answer"]["payload"]
        self.assertTrue(payload["verify"])
        claim = payload["claims"][0]
        self.assertEqual(claim["label"], "supported")
        evidence = {item["evidence_id"]: item for item in payload["evidence"]}
        source = evidence[claim["evidence_id"]]
        self.assertEqual(source["chunk_id"], f"{doc['id']}-4")
        self.assertEqual(source["document_id"], doc["id"])
        self.assertEqual(source["section"], "3 Experiments")
        self.assertEqual(source["page_index"], 4)
        self.assertEqual(claim["locate"], "exact")
        self.assertEqual(source["locations"][0]["page_index"], 4)
        self.assertTrue(claim["focus"])
        rect = source["locations"][0]["rects"][0]
        self.assertTrue(all(0 <= value <= 1 for value in rect))

        detail = self.client.get(f"/api/v1/conversations/{conversation['id']}").json()
        self.assertEqual([message["role"] for message in detail["messages"]], ["user", "assistant"])
        self.assertEqual(detail["title"], "What accuracy does WidgetNet reach on Widget-100?")
        listed = self.client.get(f"/api/v1/conversations?document_id={doc['id']}").json()
        self.assertEqual(len(listed), 1)
        self.assertEqual(self.client.get("/api/v1/conversations?document_id=other").json(), [])

    def test_validation(self) -> None:
        self.register(self.client)
        doc = self.import_samples(self.client)[0]
        conversation = self.client.post("/api/v1/conversations", json={"document_ids": [doc["id"]]}).json()
        url = f"/api/v1/conversations/{conversation['id']}/messages"
        self.assertEqual(self.client.post(url, json={"question": "  "}).json()["detail"]["code"], "empty_question")
        self.assertEqual(self.client.post(url, json={"question": "x", "system": "b9"}).json()["detail"]["code"], "unknown_system")
        self.assertEqual(self.client.post("/api/v1/conversations", json={"document_ids": []}).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/v1/conversations/{conversation['id']}").status_code, 204)
        self.assertEqual(self.client.get(f"/api/v1/conversations/{conversation['id']}").status_code, 404)

    def test_selection_is_answered_and_saved(self) -> None:
        self.register(self.client)
        doc = self.import_samples(self.client)[0]
        response = self.client.post(
            "/api/v1/selection",
            json={
                "document_id": doc["id"],
                "page_index": 4,
                "text": "WidgetNet reaches 91 percent accuracy",
                "action": "translate",
                "anchor": {"page_index": 4, "rects": [[0.1, 0.1, 0.5, 0.12]], "text_offset": 15},
                "locale": "zh",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["section"], "3 Experiments")
        self.assertEqual(body["chunk_id"], f"{doc['id']}-4")
        self.assertEqual(body["anchor"]["rects"], [[0.1, 0.1, 0.5, 0.12]])
        self.assertIn("Simplified Chinese", self.llm.prompts[-1])
        listed = self.client.get(f"/api/v1/documents/{doc['id']}/annotations").json()
        self.assertEqual([item["id"] for item in listed], [body["id"]])
        empty_question = self.client.post(
            "/api/v1/selection",
            json={"document_id": doc["id"], "page_index": 0, "text": "x", "action": "ask"},
        )
        self.assertEqual(empty_question.json()["detail"]["code"], "empty_question")

    def test_dashboard_counts_real_activity(self) -> None:
        self.register(self.client)
        doc = self.import_samples(self.client)[0]
        conversation = self.client.post("/api/v1/conversations", json={"document_ids": [doc["id"]]}).json()
        self.client.post(f"/api/v1/conversations/{conversation['id']}/messages", json={"question": "Accuracy on Widget-100?"})
        summary = self.client.get("/api/v1/dashboard/summary").json()
        self.assertEqual(summary["stats"]["documents"], 2)
        self.assertEqual(summary["stats"]["ready"], 2)
        self.assertEqual(summary["stats"]["pages"], 8)
        self.assertEqual(summary["stats"]["questions"], 1)
        self.assertEqual(summary["stats"]["claims_total"], 1)
        self.assertEqual(summary["stats"]["claims_supported"], 1)
        self.assertEqual(summary["activity"][0]["kind"], "question")


class EvaluationApiTest(ApiTestCase):
    def test_reads_result_files_without_changing_numbers(self) -> None:
        self.register(self.client)
        results = config.settings.results_dir
        results.mkdir(parents=True)
        payload = {
            "summary": {"full": {"n": 1, "citation_precision": 0.75, "prompt_tokens": 10, "completion_tokens": 2}},
            "rows": [
                {"id": "accuracy", "system": "full", "citation_precision": 0.75, "prompt_tokens": 10, "completion_tokens": 2},
                {"id": "accuracy", "system": "b1", "error": "Connection error."},
            ],
        }
        (results / "latest.json").write_text(json.dumps(payload))
        (results / "notes.json").write_text("[1, 2]")

        runs = self.client.get("/api/v1/evaluation/runs").json()
        self.assertEqual([run["name"] for run in runs], ["latest.json"])
        self.assertEqual(runs[0]["dataset"], "custom")
        self.assertEqual(runs[0]["errors"], 1)
        run = self.client.get("/api/v1/evaluation/runs/latest.json").json()
        self.assertEqual(run["summary"]["full"]["citation_precision"], 0.75)
        self.assertEqual(run["errors_by_system"], {"b1": 1})
        self.assertEqual(run["questions"][0]["id"], "accuracy")
        self.assertEqual(self.client.get("/api/v1/evaluation/runs/..%2Fsecret.json").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/evaluation/runs/missing.json").status_code, 404)

    def test_health_reports_without_secrets(self) -> None:
        body = self.client.get("/api/health").json()
        self.assertEqual(body["storage"], "local")
        self.assertEqual(body["max_upload_mb"], 1)
        self.assertNotIn("key", json.dumps(body).lower().replace("llm_configured", ""))


if __name__ == "__main__":
    unittest.main()
