"""Claim-to-evidence links: chunk ids first, page-level fallback when a match is ambiguous."""

import unittest

from citecheck.agent import AgentResult, VerifiedClaim
from citecheck.ingest import Chunk
from citecheck.web.evidence import build_answer, claim_chunk


def chunk(chunk_id: str, paper: str, section: str, page: int, text: str) -> Chunk:
    return Chunk(chunk_id, paper, paper.title(), section, page, 0, text)


def boxes_for(text: str, page_index: int) -> list:
    return [[page_index, 0.1 + i * 0.01, 0.2, 0.11 + i * 0.01, 0.22, 7] for i, _ in enumerate(text.split())]


class EvidenceLinkTest(unittest.TestCase):
    def setUp(self) -> None:
        self.text = "WidgetNet reaches 91 percent accuracy."
        self.a = chunk("doc-1", "doc", "3 Experiments", 5, self.text)
        self.b = chunk("doc-7", "doc", "3 Experiments", 5, self.text)

    def test_chunk_id_wins_even_when_text_repeats(self) -> None:
        claim = VerifiedClaim(self.text, "supported", "supports", "3 Experiments", 5, "Doc", self.text, chunk_id="doc-7")
        self.assertIs(claim_chunk(claim, [self.a, self.b]), self.b)

    def test_repeated_text_without_chunk_id_is_not_guessed(self) -> None:
        claim = VerifiedClaim(self.text, "supported", "supports", "3 Experiments", 5, "Doc", self.text)
        self.assertIsNone(claim_chunk(claim, [self.a, self.b]))
        result = AgentResult(answer=self.text, claims=[claim], evidence=[self.a, self.b], system="full")
        payload = build_answer(result, {"doc-1": boxes_for(self.text, 4), "doc-7": boxes_for(self.text, 4)}, "lib-x")
        item = payload["claims"][0]
        self.assertIsNone(item["evidence_id"])
        self.assertEqual(item["locate"], "page")
        self.assertEqual(item["document_id"], "doc")
        self.assertEqual(item["page_index"], 4)
        self.assertEqual(item["focus"], [])

    def test_unique_text_match_is_linked(self) -> None:
        claim = VerifiedClaim(self.text, "supported", "supports", "3 Experiments", 5, "Doc", self.text)
        self.assertIs(claim_chunk(claim, [self.a]), self.a)

    def test_missing_boxes_fall_back_to_page_level(self) -> None:
        claim = VerifiedClaim(self.text, "supported", "supports", "3 Experiments", 5, "Doc", self.text, chunk_id="doc-1")
        result = AgentResult(answer=self.text, claims=[claim], evidence=[self.a], system="full")
        payload = build_answer(result, {}, "lib-x")
        self.assertEqual(payload["claims"][0]["evidence_id"], "doc-1")
        self.assertEqual(payload["claims"][0]["locate"], "page")
        self.assertEqual(payload["evidence"][0]["locate"], "page")
        self.assertEqual(payload["evidence"][0]["locations"], [])

    def test_exact_location_merges_words_on_a_line(self) -> None:
        claim = VerifiedClaim(self.text, "supported", "supports", "3 Experiments", 5, "Doc", self.text, chunk_id="doc-1")
        result = AgentResult(answer=self.text, claims=[claim], evidence=[self.a], system="full")
        payload = build_answer(result, {"doc-1": boxes_for(self.text, 4)}, "lib-x")
        evidence = payload["evidence"][0]
        self.assertEqual(evidence["locate"], "exact")
        self.assertEqual(len(evidence["locations"]), 1)
        self.assertEqual(len(evidence["locations"][0]["rects"]), 1)
        self.assertEqual(payload["claims"][0]["locate"], "exact")
        self.assertTrue(payload["claims"][0]["focus"])

    def test_unsupported_claim_without_evidence_has_no_location(self) -> None:
        claim = VerifiedClaim("It is the best model.", "uncertain", "not_enough")
        result = AgentResult(answer="", claims=[claim], evidence=[self.a], system="full")
        item = build_answer(result, {}, "lib-x")["claims"][0]
        self.assertEqual(item["locate"], "none")
        self.assertIsNone(item["document_id"])


if __name__ == "__main__":
    unittest.main()
