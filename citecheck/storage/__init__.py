"""PDF object storage: a private Tencent COS bucket, or a local folder when COS is not configured.

The browser never sees bucket names or keys. Every read goes through an
authenticated API route that checks the document owner first.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Protocol

from citecheck.web import config


class Storage(Protocol):
    kind: str

    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...


class StorageError(RuntimeError):
    pass


class LocalStorage:
    kind = "local"

    def __init__(self, root: Path) -> None:
        self.root = root

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root.resolve() not in path.parents:
            raise StorageError("invalid storage key")
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(path.suffix + ".part")
        temp.write_bytes(data)
        temp.replace(path)

    def get(self, key: str) -> bytes:
        path = self._path(key)
        if not path.exists():
            raise StorageError("object not found")
        return path.read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class CosStorage:
    """Private-bucket access with the official SDK; credentials stay on the server."""

    kind = "cos"

    def __init__(self, bucket: str, client: object) -> None:
        self.bucket = bucket
        self.client = client

    @classmethod
    def from_settings(cls, settings: config.Settings) -> "CosStorage":
        from qcloud_cos import CosConfig, CosS3Client

        cos_config = CosConfig(
            Region=settings.cos_region,
            SecretId=settings.cos_secret_id,
            SecretKey=settings.cos_secret_key,
            Scheme="https",
        )
        return cls(settings.cos_bucket, CosS3Client(cos_config))

    def put(self, key: str, data: bytes) -> None:
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Body=data,
                Key=key,
                ContentType="application/pdf",
                ACL="private",
            )
        except Exception as exc:
            raise StorageError(f"COS upload failed: {exc}") from exc

    def get(self, key: str) -> bytes:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            return response["Body"].get_raw_stream().read()
        except Exception as exc:
            raise StorageError(f"COS read failed: {exc}") from exc

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            raise StorageError(f"COS delete failed: {exc}") from exc


_lock = threading.Lock()
_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    with _lock:
        if _storage is None:
            settings = config.settings
            _storage = CosStorage.from_settings(settings) if settings.cos_enabled else LocalStorage(settings.uploads_dir)
        return _storage


def set_storage(storage: Storage | None) -> None:
    global _storage
    with _lock:
        _storage = storage


def object_key(user_id: str, document_id: str) -> str:
    return f"{config.settings.cos_prefix}{user_id}/{document_id}.pdf"
