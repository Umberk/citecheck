"""Explain, translate, or answer questions about a passage the reader selected.

This is a single model call with the selected text and its surrounding chunk.
It does not run the planner or the verifier.
"""

from __future__ import annotations

import re
import time

from citecheck.ingest import Chunk
from citecheck.llm import LLMClient

ACTIONS = {"explain", "translate", "methods", "formula", "summarize", "ask"}

TASKS = {
    "explain": "Explain what the selected passage means in plain language for a graduate student. "
    "Define technical terms it uses. Keep it under 150 words.",
    "translate": "Translate the selected passage into Simplified Chinese. Keep technical terms accurate, "
    "and keep model names, dataset names, and numbers unchanged. Return only the translation.",
    "methods": "Analyze the research method described in the selected passage: what is done, why, "
    "and any assumptions or limitations it implies. Use short bullet points.",
    "formula": "Explain the formula or quantitative statement in the selected passage. "
    "Say what each symbol or number stands for and what the expression computes.",
    "summarize": "Summarize the selected passage in two or three sentences.",
    "ask": "Answer the user's question about the selected passage.",
}

LANGUAGE = {"zh": "Simplified Chinese", "en": "English"}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def find_chunk(chunks: list[Chunk], page_index: int, text: str) -> Chunk | None:
    """Chunk on or just before the page that contains the selection."""
    needle = _normalize(text)[:200]
    candidates = [chunk for chunk in chunks if chunk.page_index is not None and chunk.page_index <= page_index]
    on_page = [chunk for chunk in candidates if chunk.page_index == page_index] or candidates[-2:]
    for chunk in reversed(candidates):
        if needle and needle in _normalize(chunk.text):
            return chunk
    if not on_page:
        return None
    words = set(needle.split())
    return max(on_page, key=lambda chunk: len(words & set(_normalize(chunk.text).split())))


def analyze(
    llm: LLMClient,
    *,
    action: str,
    text: str,
    question: str | None,
    context: str | None,
    chunk: Chunk | None,
    locale: str,
) -> tuple[str, float]:
    language = LANGUAGE.get(locale, "English")
    surrounding = (chunk.text if chunk else context or "")[:2400]
    section = chunk.section if chunk else "unknown"
    paper = chunk.paper_title if chunk else "unknown"
    lines = [
        f"Task: {TASKS[action]}",
        "Use only the selected passage and its context. If they do not contain the answer, say so.",
    ]
    if action != "translate":
        lines.append(f"Write the answer in {language}.")
    lines += [
        "",
        f"Paper: {paper}",
        f"Section: {section}",
        f"Context:\n{surrounding}",
        "",
        f"Selected passage:\n{text[:4000]}",
    ]
    if action == "ask" and question:
        lines += ["", f"Question: {question[:500]}"]
    started = time.perf_counter()
    answer = llm.complete(
        [
            {"role": "system", "content": "You help researchers read papers. Be precise and concise."},
            {"role": "user", "content": "\n".join(lines)},
        ],
        temperature=0.2,
    )
    return answer.strip(), time.perf_counter() - started
