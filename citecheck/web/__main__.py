"""Run the web workspace with a single Uvicorn worker."""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "citecheck.web.app:app",
        host=os.getenv("CITECHECK_HOST", "127.0.0.1"),
        port=int(os.getenv("CITECHECK_PORT", "8000")),
        workers=1,
        proxy_headers=True,
    )


if __name__ == "__main__":
    main()
