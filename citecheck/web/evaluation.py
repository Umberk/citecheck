"""Read result files written by `python -m citecheck.evaluate`. Nothing here computes metrics."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from citecheck.llm import ROOT
from citecheck.web import config

NAME = re.compile(r"^[\w.-]+\.json$")
QUESTIONS = ROOT / "examples" / "custom_questions.json"


def _results_dir() -> Path:
    return config.settings.results_dir


def _load(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or "summary" not in data or "rows" not in data:
        return None
    return data


def _custom_questions() -> dict[str, dict]:
    try:
        records = json.loads(QUESTIONS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {str(record["id"]): record for record in records}


def _describe(path: Path, data: dict) -> dict:
    summary = data["summary"]
    rows = data["rows"]
    scifact = isinstance(summary, dict) and summary.get("dataset") == "scifact"
    ids = {str(row.get("id")) for row in rows}
    custom = _custom_questions()
    if scifact:
        dataset = "scifact"
    elif ids and ids <= set(custom):
        dataset = "custom"
    elif ids and all(re.fullmatch(r"[0-9a-f]{40}", item) for item in ids):
        dataset = "qasper"
    else:
        dataset = "unknown"
    modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    return {
        "name": path.name,
        "kind": "scifact" if scifact else "qa",
        "dataset": dataset,
        "modified_at": modified.isoformat().replace("+00:00", "Z"),
        "systems": [] if scifact else list(summary),
        "row_count": len(rows),
        "errors": sum(1 for row in rows if "error" in row),
    }


def list_runs() -> list[dict]:
    directory = _results_dir()
    if not directory.exists():
        return []
    runs = []
    for path in sorted(directory.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
        data = _load(path)
        if data is not None:
            runs.append(_describe(path, data))
    return runs


def read_run(name: str) -> dict | None:
    if not NAME.match(name):
        return None
    directory = _results_dir().resolve()
    path = (directory / name).resolve()
    if path.parent != directory or not path.exists():
        return None
    data = _load(path)
    if data is None:
        return None
    info = _describe(path, data)
    errors_by_system: dict[str, int] = {}
    for row in data["rows"]:
        if "error" in row and "system" in row:
            errors_by_system[row["system"]] = errors_by_system.get(row["system"], 0) + 1
    questions = []
    if info["dataset"] == "custom":
        custom = _custom_questions()
        seen: list[str] = []
        for row in data["rows"]:
            row_id = str(row.get("id"))
            if row_id in custom and row_id not in seen:
                seen.append(row_id)
        for row_id in seen:
            record = custom[row_id]
            questions.append(
                {
                    "id": row_id,
                    "question": record.get("question", ""),
                    "answers": list(record.get("answers") or []),
                    "citations": list(record.get("citations") or []),
                }
            )
    return {**info, "summary": data["summary"], "rows": data["rows"], "errors_by_system": errors_by_system, "questions": questions}
