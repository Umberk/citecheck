"""One SQLite engine per process, created on first use."""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from citecheck.db.models import Base
from citecheck.web import config

_lock = threading.Lock()
_engine: Engine | None = None
_factory: sessionmaker[Session] | None = None


def _setup() -> sessionmaker[Session]:
    global _engine, _factory
    with _lock:
        if _factory is None:
            path = config.settings.db_path
            path.parent.mkdir(parents=True, exist_ok=True)
            engine = create_engine(
                f"sqlite:///{path}",
                connect_args={"check_same_thread": False, "timeout": 30},
            )

            @event.listens_for(engine, "connect")
            def _pragmas(connection, _record) -> None:
                cursor = connection.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()

            Base.metadata.create_all(engine)
            with engine.begin() as connection:
                columns = {
                    row[1]
                    for row in connection.execute(text("PRAGMA table_info(users)")).fetchall()
                }
                if "llm_provider" not in columns:
                    connection.execute(
                        text("ALTER TABLE users ADD COLUMN llm_provider VARCHAR(16) NOT NULL DEFAULT 'llm'")
                    )
            _engine = engine
            _factory = sessionmaker(bind=engine, expire_on_commit=False)
    return _factory


def reset_engine() -> None:
    """Drop the cached engine so the next session uses the current settings."""
    global _engine, _factory
    with _lock:
        if _engine is not None:
            _engine.dispose()
        _engine = None
        _factory = None


@contextmanager
def session_scope() -> Iterator[Session]:
    session = _setup()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Iterator[Session]:
    session = _setup()()
    try:
        yield session
    finally:
        session.close()
