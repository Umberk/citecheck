"""Map chunk text back to word boxes in the source PDF.

Chunks are built from the same PyMuPDF text stream, so their tokens can be
aligned to `page.get_text("words")` in reading order. Aligning chunks in
order with a moving cursor keeps repeated sentences on the right occurrence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from citecheck.ingest import Chunk

KEY = re.compile(r"[\W_]+", re.UNICODE)
ANCHOR = 5
RESYNC_WINDOW = 40
EXACT_COVERAGE = 0.8
STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "are", "was", "were", "from", "has", "have",
    "its", "into", "than", "then", "also", "which", "their", "they", "on", "of", "in", "to",
    "a", "an", "is", "it", "by", "as", "at", "or", "be", "we", "our",
}

Box = list  # [page_index, x0, y0, x1, y1, line_id], coordinates in 0..1 page units


@dataclass
class _Word:
    key: str
    page: int
    x0: float
    y0: float
    x1: float
    y1: float
    line: int


def token_key(text: str) -> str:
    return KEY.sub("", text).lower()


def read_words(path: str | Path) -> tuple[list[_Word], int]:
    """Return every word with page-relative coordinates, in content order."""
    import pymupdf

    words: list[_Word] = []
    document = pymupdf.open(path)
    try:
        page_count = document.page_count
        for page_index, page in enumerate(document):
            width, height = page.rect.width or 1.0, page.rect.height or 1.0
            for x0, y0, x1, y1, text, block, line, _number in page.get_text("words"):
                key = token_key(text)
                if not key:
                    continue
                words.append(
                    _Word(
                        key=key,
                        page=page_index,
                        x0=max(0.0, x0 / width),
                        y0=max(0.0, y0 / height),
                        x1=min(1.0, x1 / width),
                        y1=min(1.0, y1 / height),
                        line=page_index * 1_000_000 + int(block) * 1_000 + int(line),
                    )
                )
    finally:
        document.close()
    return words, page_count


def chunk_boxes(path: str | Path, chunks: list[Chunk]) -> tuple[dict[str, list[Box | None]], int]:
    """Align every chunk to word boxes. A chunk that cannot be anchored gets an empty list."""
    words, page_count = read_words(path)
    keys = [word.key for word in words]
    boxes: dict[str, list[Box | None]] = {}
    cursor = 0
    for chunk in chunks:
        tokens = [token_key(token) for token in chunk.text.split()]
        start = _find_anchor(tokens, keys, cursor)
        if start is None:
            boxes[chunk.chunk_id] = []
            continue
        mapping, end = _align(tokens, keys, start)
        boxes[chunk.chunk_id] = [
            None
            if index is None
            else [
                words[index].page,
                round(words[index].x0, 4),
                round(words[index].y0, 4),
                round(words[index].x1, 4),
                round(words[index].y1, 4),
                words[index].line,
            ]
            for index in mapping
        ]
        cursor = end
    return boxes, page_count


def coverage(boxes: list[Box | None] | None) -> float:
    if not boxes:
        return 0.0
    return sum(box is not None for box in boxes) / len(boxes)


def is_exact(boxes: list[Box | None] | None) -> bool:
    return coverage(boxes) >= EXACT_COVERAGE


def locations(boxes: list[Box | None] | None, start: int = 0, end: int | None = None) -> list[dict]:
    """Merge token boxes into one rectangle per text line, grouped by page."""
    if not boxes:
        return []
    lines: dict[int, list[float]] = {}
    pages: dict[int, int] = {}
    for box in boxes[start:end]:
        if box is None:
            continue
        page, x0, y0, x1, y1, line = box
        rect = lines.get(line)
        if rect is None:
            lines[line] = [x0, y0, x1, y1]
            pages[line] = page
        else:
            rect[0], rect[1] = min(rect[0], x0), min(rect[1], y0)
            rect[2], rect[3] = max(rect[2], x1), max(rect[3], y1)
    grouped: dict[int, list[list[float]]] = {}
    for line, rect in lines.items():
        grouped.setdefault(pages[line], []).append(
            [round(rect[0] - 0.002, 4), round(rect[1] - 0.001, 4), round(rect[2] + 0.002, 4), round(rect[3] + 0.001, 4)]
        )
    return [{"page_index": page, "rects": rects} for page, rects in sorted(grouped.items())]


def focus_range(claim: str, chunk_text: str) -> tuple[int, int] | None:
    """Token range of the sentence in the chunk that best matches the claim, for display only."""
    claim_terms = _content_terms(claim.split())
    if not claim_terms:
        return None
    tokens = chunk_text.split()
    best: tuple[float, int, int] | None = None
    start = 0
    for index, token in enumerate(tokens):
        if re.search(r"[.!?][\"')\]]?$", token) or index == len(tokens) - 1:
            terms = _content_terms(tokens[start : index + 1])
            if terms:
                score = len(claim_terms & terms) / len(claim_terms)
                if best is None or score > best[0]:
                    best = (score, start, index + 1)
            start = index + 1
    if best is None or best[0] < 0.35:
        return None
    return best[1], best[2]


def _content_terms(tokens: list[str]) -> set[str]:
    keys = (token_key(token) for token in tokens)
    return {key for key in keys if len(key) > 2 and key not in STOPWORDS}


def _find_anchor(tokens: list[str], keys: list[str], cursor: int) -> int | None:
    anchor = [token for token in tokens if token][:ANCHOR]
    if not anchor:
        return None
    for offset in (cursor, 0):
        found = _search(anchor, keys, offset)
        if found is not None:
            return found
    if len(anchor) > 2:
        return _search(anchor[:3], keys, cursor)
    return None


def _search(needle: list[str], keys: list[str], start: int) -> int | None:
    size = len(needle)
    first = needle[0]
    for index in range(start, len(keys) - size + 1):
        if keys[index] == first and keys[index : index + size] == needle:
            return index
    return None


def _align(tokens: list[str], keys: list[str], start: int) -> tuple[list[int | None], int]:
    mapping: list[int | None] = []
    position = start
    last = start
    for token_index, token in enumerate(tokens):
        if not token:
            mapping.append(None)
            continue
        if position < len(keys) and keys[position] == token:
            mapping.append(position)
            last = position
            position += 1
            continue
        found = _resync(tokens, token_index, keys, position)
        if found is None:
            mapping.append(None)
            continue
        mapping.append(found)
        last = found
        position = found + 1
    return mapping, last + 1


def _resync(tokens: list[str], token_index: int, keys: list[str], position: int) -> int | None:
    """Skip page numbers or running headers between two halves of a chunk."""
    following = [token for token in tokens[token_index : token_index + 3] if token]
    limit = min(len(keys), position + RESYNC_WINDOW)
    for index in range(position, limit):
        if keys[index : index + len(following)] == following:
            return index
    return None
