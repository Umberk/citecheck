"""Shared route helpers: error format, the current user, and the model client."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from citecheck.db import User, UserSession, get_db
from citecheck.llm import LLMClient, default_provider, from_provider, provider_configured

SESSION_COOKIE = "citecheck_session"

def fail(status: int, code: str, message: str | None = None) -> None:
    detail: dict = {"code": code}
    if message:
        detail["message"] = message
    raise HTTPException(status_code=status, detail=detail)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        fail(401, "unauthorized")
    session = db.query(UserSession).filter_by(token_hash=hash_token(token)).first()
    if session is None or _aware(session.expires_at) < datetime.now(timezone.utc):
        fail(401, "unauthorized")
    user = db.get(User, session.user_id)
    if user is None:
        fail(401, "unauthorized")
    return user


def resolve_user_provider(user: User) -> str:
    choice = (getattr(user, "llm_provider", None) or "llm").strip().lower()
    if choice not in ("llm", "teamily"):
        choice = "llm"
    if provider_configured(choice):
        return choice
    return default_provider()


def get_llm(user: User = Depends(current_user)) -> LLMClient:
    provider = resolve_user_provider(user)
    try:
        return from_provider(provider)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={"code": "llm_not_configured", "message": str(exc)}) from exc
