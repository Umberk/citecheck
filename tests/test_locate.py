"""Chunk text aligned back to PDF word boxes."""

import tempfile
import unittest
from pathlib import Path

from citecheck.ingest import parse_pdf
from citecheck.locate import chunk_boxes, coverage, focus_range, locations
from citecheck.sample_docs import WIDGETNET, write_pdf


class LocateTest(unittest.TestCase):
    def test_sample_chunks_map_to_their_pages(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "widgetnet.pdf"
            write_pdf(path, WIDGETNET)
            chunks = parse_pdf(path)
            boxes, page_count = chunk_boxes(path, chunks)
        self.assertEqual(page_count, 6)
        for chunk in chunks:
            self.assertEqual(coverage(boxes[chunk.chunk_id]), 1.0, chunk.chunk_id)
            first = locations(boxes[chunk.chunk_id])[0]
            self.assertEqual(first["page_index"], chunk.page_index)

    def test_repeated_sentence_maps_to_each_occurrence_in_order(self) -> None:
        sentence = "The counter reaches 91 percent accuracy on the test split."
        pages = [
            [("Repeat Test Paper", "title"), ("1 First", "heading"), (sentence, "body")],
            [("2 Second", "heading"), (sentence, "body")],
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "repeat.pdf"
            write_pdf(path, pages)
            chunks = parse_pdf(path)
            boxes, _ = chunk_boxes(path, chunks)
        self.assertEqual([chunk.text for chunk in chunks], [sentence, sentence])
        pages_found = [locations(boxes[chunk.chunk_id])[0]["page_index"] for chunk in chunks]
        self.assertEqual(pages_found, [0, 1])

    def test_web_index_uses_the_page_where_the_text_starts(self) -> None:
        from citecheck.ingest import Chunk
        from citecheck.tasks.indexer import _located_page

        chunk = Chunk("p-3", "p", "Paper", "3 Model", 2, 3, "one two three four five")
        moved = _located_page(chunk, [[4, 0.1, 0.1, 0.2, 0.12, 1]] * 5)
        self.assertEqual(moved.page, 5)
        kept = _located_page(chunk, [None, None, None, None, [4, 0.1, 0.1, 0.2, 0.12, 1]])
        self.assertEqual(kept.page, 2)

    def test_focus_picks_the_matching_sentence(self) -> None:
        text = "The setup uses two GPUs. On Widget-100, WidgetNet reaches 91 percent accuracy. Training is fast."
        start, end = focus_range("WidgetNet reaches 91 percent accuracy on Widget-100", text)
        self.assertEqual(" ".join(text.split()[start:end]), "On Widget-100, WidgetNet reaches 91 percent accuracy.")
        self.assertIsNone(focus_range("Completely unrelated statement about cats", text))


if __name__ == "__main__":
    unittest.main()
