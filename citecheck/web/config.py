"""Web settings read from the environment and the repo-root `.env`."""

from __future__ import annotations

import os
from dataclasses import dataclass, replace
from pathlib import Path

from dotenv import load_dotenv

from citecheck.llm import ROOT


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    db_path: Path
    results_dir: Path
    frontend_dist: Path
    max_upload_mb: int
    max_pending_per_user: int
    index_cache_size: int
    index_inline: bool
    session_days: int
    cookie_secure: bool
    cos_secret_id: str
    cos_secret_key: str
    cos_bucket: str
    cos_region: str
    cos_prefix: str

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def indexes_dir(self) -> Path:
        return self.data_dir / "indexes"

    @property
    def cos_enabled(self) -> bool:
        return all([self.cos_secret_id, self.cos_secret_key, self.cos_bucket, self.cos_region])


def _flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def load_settings() -> Settings:
    load_dotenv(ROOT / ".env")
    data_dir = Path(os.getenv("CITECHECK_DATA_DIR", str(ROOT / "data"))).expanduser()
    prefix = os.getenv("COS_PREFIX", "citecheck/").strip()
    if prefix and not prefix.endswith("/"):
        prefix += "/"
    return Settings(
        data_dir=data_dir,
        db_path=Path(os.getenv("CITECHECK_DB_PATH", str(data_dir / "citecheck.db"))).expanduser(),
        results_dir=Path(os.getenv("CITECHECK_RESULTS_DIR", str(data_dir / "results"))).expanduser(),
        frontend_dist=Path(os.getenv("CITECHECK_FRONTEND_DIST", str(ROOT / "frontend" / "dist"))).expanduser(),
        max_upload_mb=int(os.getenv("CITECHECK_MAX_UPLOAD_MB", "20")),
        max_pending_per_user=int(os.getenv("CITECHECK_MAX_PENDING", "5")),
        index_cache_size=max(1, int(os.getenv("CITECHECK_INDEX_CACHE", "3"))),
        index_inline=_flag("CITECHECK_INDEX_INLINE"),
        session_days=int(os.getenv("CITECHECK_SESSION_DAYS", "14")),
        cookie_secure=_flag("CITECHECK_COOKIE_SECURE"),
        cos_secret_id=os.getenv("COS_SECRET_ID", "").strip(),
        cos_secret_key=os.getenv("COS_SECRET_KEY", "").strip(),
        cos_bucket=os.getenv("COS_BUCKET", "").strip(),
        cos_region=os.getenv("COS_REGION", "").strip(),
        cos_prefix=prefix,
    )


settings = load_settings()


def configure(**overrides: object) -> Settings:
    """Replace settings in place; tests use this to point at a temporary data directory."""
    global settings
    settings = replace(settings, **overrides)
    return settings


def get_settings() -> Settings:
    return settings
