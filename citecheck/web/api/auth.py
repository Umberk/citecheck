"""Email and password accounts with server-side sessions in an HttpOnly cookie."""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from citecheck.db import User, UserSession, get_db
from citecheck.db.models import iso
from citecheck.web import config
from citecheck.llm import default_provider, provider_configured
from citecheck.web.api.deps import SESSION_COOKIE, current_user, fail, hash_token

router = APIRouter()

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
LOCALES = {"zh", "en"}
LLM_PROVIDERS = {"llm", "teamily"}


class RegisterBody(BaseModel):
    email: str
    password: str
    display_name: str = ""
    locale: str = "zh"


class LoginBody(BaseModel):
    email: str
    password: str


class ProfileBody(BaseModel):
    display_name: str | None = None
    locale: str | None = None
    llm_provider: str | None = None


def user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "locale": user.locale,
        "llm_provider": user.llm_provider or "llm",
        "created_at": iso(user.created_at),
    }


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def _check_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def _start_session(db: Session, response: Response, user: User) -> None:
    token = secrets.token_urlsafe(32)
    days = config.settings.session_days
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=datetime.now(timezone.utc) + timedelta(days=days),
        )
    )
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=days * 86400,
        httponly=True,
        samesite="lax",
        secure=config.settings.cookie_secure,
        path="/",
    )


@router.post("/auth/register", status_code=201)
def register(body: RegisterBody, response: Response, db: Session = Depends(get_db)) -> dict:
    email = body.email.strip().lower()
    if not EMAIL.match(email) or len(email) > 254:
        fail(400, "invalid_email")
    if len(body.password) < 8 or len(body.password.encode()) > 72:
        fail(400, "weak_password")
    if db.query(User).filter_by(email=email).first() is not None:
        fail(409, "email_taken")
    user = User(
        email=email,
        password_hash=_hash_password(body.password),
        display_name=(body.display_name.strip() or email.split("@")[0])[:80],
        locale=body.locale if body.locale in LOCALES else "zh",
        llm_provider=default_provider(),
    )
    db.add(user)
    db.commit()
    _start_session(db, response, user)
    return user_payload(user)


@router.post("/auth/login")
def login(body: LoginBody, response: Response, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter_by(email=body.email.strip().lower()).first()
    if user is None or not _check_password(body.password, user.password_hash):
        fail(401, "invalid_credentials")
    _start_session(db, response, user)
    return user_payload(user)


@router.post("/auth/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.query(UserSession).filter_by(token_hash=hash_token(token)).delete()
        db.commit()
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.get("/auth/me")
def me(user: User = Depends(current_user)) -> dict:
    return user_payload(user)


@router.patch("/users/me")
def update_me(body: ProfileBody, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    user = db.merge(user)
    if body.display_name is not None:
        name = body.display_name.strip()
        if not name:
            fail(400, "empty_name")
        user.display_name = name[:80]
    if body.locale is not None:
        if body.locale not in LOCALES:
            fail(400, "unknown_locale")
        user.locale = body.locale
    if body.llm_provider is not None:
        choice = body.llm_provider.strip().lower()
        if choice not in LLM_PROVIDERS:
            fail(400, "unknown_llm_provider")
        if not provider_configured(choice):
            fail(400, "llm_provider_unavailable")
        user.llm_provider = choice
    db.commit()
    return user_payload(user)
