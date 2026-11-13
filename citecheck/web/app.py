"""HTTP entry: React workspace at /app, the original demo at /legacy, JSON APIs under /api."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from citecheck.agent import SYSTEMS
from citecheck.web import config
from citecheck.web.api import public_router, router as api_router
from citecheck.web.service import ask, get_library, index_sample, index_uploads

STATIC = Path(__file__).resolve().parent / "static"

APP_MISSING = """<!doctype html><meta charset="utf-8"><title>CiteCheck</title>
<body style="font-family:system-ui;padding:40px;color:#0f172a">
<h2>The React workspace has not been built yet</h2>
<p>Run <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code>, then reload.</p>
<p>The original demo is still available at <a href="/legacy">/legacy</a>.</p></body>"""


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from citecheck.tasks.indexer import requeue_unfinished

    requeue_unfinished()
    yield


app = FastAPI(title="CiteCheck", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.include_router(api_router)
app.include_router(public_router)


class AskBody(BaseModel):
    library_id: str
    question: str
    system: str = "full"


@app.get("/")
def index() -> RedirectResponse:
    return RedirectResponse("/app/")


@app.get("/legacy")
def legacy() -> FileResponse:
    return FileResponse(STATIC / "index.html")


@app.get("/app")
@app.get("/app/{path:path}")
def workspace(path: str = "") -> Response:
    dist = config.settings.frontend_dist
    index_file = dist / "index.html"
    if not index_file.exists():
        return HTMLResponse(APP_MISSING, status_code=503)
    if path:
        candidate = (dist / path).resolve()
        if dist.resolve() in candidate.parents and candidate.is_file():
            cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
        if path.startswith("assets/"):
            raise HTTPException(status_code=404)
    return FileResponse(index_file, headers={"Cache-Control": "no-cache"})


@app.post("/api/library")
def create_library(
    source: str = Form(...),
    include_lite: str = Form("false"),
    files: list[UploadFile] | None = File(default=None),
) -> dict:
    try:
        if source == "sample":
            library_id, outline = index_sample(_flag(include_lite))
        elif source == "upload":
            payloads = _read_uploads(files or [])
            if not payloads:
                _fail(400, "need_pdf")
            library_id, outline = index_uploads(payloads)
        else:
            _fail(400, "unknown_source")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "index_failed", "message": str(exc)},
        ) from exc
    return {"library_id": library_id, "papers": outline}


@app.post("/api/ask")
def create_answer(body: AskBody) -> dict:
    question = body.question.strip()
    if not question:
        _fail(400, "empty_question")
    if body.system not in SYSTEMS:
        _fail(400, "unknown_system")
    if get_library(body.library_id) is None:
        _fail(404, "unknown_library")
    try:
        return ask(body.library_id, question, body.system)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail={"code": "llm", "message": str(exc)}) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "ask_failed", "message": str(exc)},
        ) from exc


def _read_uploads(files: list[UploadFile]) -> list[tuple[str, bytes]]:
    payloads: list[tuple[str, bytes]] = []
    for upload in files:
        name = upload.filename or "paper.pdf"
        if Path(name).suffix.lower() != ".pdf":
            continue
        data = upload.file.read(config.settings.max_upload_bytes + 1)
        if len(data) > config.settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail={"code": "file_too_large"})
        payloads.append((name, data))
    return payloads


def _flag(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _fail(status: int, code: str) -> None:
    raise HTTPException(status_code=status, detail={"code": code})
