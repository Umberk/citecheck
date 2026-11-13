"""Turn an agent result into the Reader payload: claims, evidence, and PDF locations.

Claims are linked to evidence by the chunk id the verifier chose. Without it,
a claim is linked only when exactly one retrieved chunk matches its text,
section, page, and paper; otherwise the claim keeps page-level location.
"""

from __future__ import annotations

from citecheck import locate
from citecheck.agent import SYSTEMS, AgentResult, VerifiedClaim
from citecheck.ingest import Chunk


def claim_chunk(claim: VerifiedClaim, evidence: list[Chunk]) -> Chunk | None:
    if claim.chunk_id:
        for chunk in evidence:
            if chunk.chunk_id == claim.chunk_id:
                return chunk
    if not claim.evidence_text:
        return None
    matches = {
        chunk.chunk_id: chunk
        for chunk in evidence
        if chunk.text == claim.evidence_text
        and chunk.section == claim.section
        and chunk.page == claim.page
        and chunk.paper_title == claim.paper_title
    }
    if len(matches) == 1:
        return next(iter(matches.values()))
    return None


def claim_document(claim: VerifiedClaim, evidence: list[Chunk]) -> str | None:
    """Paper id when every candidate chunk for an unlinked claim comes from one paper."""
    if not claim.paper_title:
        return None
    papers = {chunk.paper_id for chunk in evidence if chunk.paper_title == claim.paper_title}
    return next(iter(papers)) if len(papers) == 1 else None


def _evidence_item(rank: int, chunk: Chunk, boxes: dict[str, list]) -> dict:
    chunk_boxes = boxes.get(chunk.chunk_id)
    exact = locate.is_exact(chunk_boxes)
    return {
        "evidence_id": chunk.chunk_id,
        "rank": rank,
        "chunk_id": chunk.chunk_id,
        "document_id": chunk.paper_id,
        "paper_title": chunk.paper_title,
        "section": chunk.section,
        "page": chunk.page,
        "page_index": chunk.page_index,
        "text": chunk.text,
        "locate": "exact" if exact else ("page" if chunk.page is not None else "none"),
        "locations": locate.locations(chunk_boxes) if exact else [],
    }


def _claim_item(index: int, claim: VerifiedClaim, evidence: list[Chunk], boxes: dict[str, list]) -> dict:
    chunk = claim_chunk(claim, evidence)
    page_index = None if claim.page is None else claim.page - 1
    item = {
        "index": index,
        "text": claim.text,
        "label": claim.label,
        "verdict": claim.verdict,
        "section": claim.section,
        "page": claim.page,
        "page_index": page_index,
        "paper_title": claim.paper_title,
        "document_id": None,
        "evidence_id": None,
        "locate": "none",
        "focus": [],
    }
    if chunk is not None:
        chunk_boxes = boxes.get(chunk.chunk_id)
        item["document_id"] = chunk.paper_id
        item["evidence_id"] = chunk.chunk_id
        if locate.is_exact(chunk_boxes):
            item["locate"] = "exact"
            span = locate.focus_range(claim.text, chunk.text)
            if span is not None:
                item["focus"] = locate.locations(chunk_boxes, *span)
        elif chunk.page is not None:
            item["locate"] = "page"
    elif claim.page is not None:
        document_id = claim_document(claim, evidence)
        if document_id is not None:
            item["document_id"] = document_id
            item["locate"] = "page"
    return item


def build_answer(result: AgentResult, boxes: dict[str, list], library_id: str) -> dict:
    spec = SYSTEMS[result.system]
    return {
        "answer": result.answer,
        "system": result.system,
        "verify": bool(spec["verify"]),
        "steps": result.steps,
        "latency_s": round(result.latency_s, 3),
        "prompt_tokens": result.prompt_tokens,
        "completion_tokens": result.completion_tokens,
        "trace": result.trace,
        "claims": [_claim_item(index, claim, result.evidence, boxes) for index, claim in enumerate(result.claims)],
        "evidence": [_evidence_item(rank, chunk, boxes) for rank, chunk in enumerate(result.evidence, start=1)],
        "library_id": library_id,
    }
