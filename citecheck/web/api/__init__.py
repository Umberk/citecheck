"""Versioned JSON API used by the React workspace."""

from fastapi import APIRouter

from citecheck.web.api import auth, conversations, documents, workspace

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(documents.router)
router.include_router(conversations.router)
router.include_router(workspace.router)

public_router = APIRouter(prefix="/api")
public_router.include_router(workspace.public)

__all__ = ["public_router", "router"]
