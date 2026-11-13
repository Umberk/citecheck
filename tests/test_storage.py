"""Local fallback storage and the COS adapter (with a fake SDK client, no network)."""

import tempfile
import unittest
from pathlib import Path

from citecheck.storage import CosStorage, LocalStorage, StorageError


class FakeBody:
    def __init__(self, data: bytes) -> None:
        self.data = data

    def get_raw_stream(self):
        import io

        return io.BytesIO(self.data)


class FakeCosClient:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.calls: list[tuple] = []

    def put_object(self, Bucket, Body, Key, ContentType, ACL):
        self.calls.append(("put", Bucket, Key, ContentType, ACL))
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        self.calls.append(("get", Bucket, Key))
        if (Bucket, Key) not in self.objects:
            raise KeyError(Key)
        return {"Body": FakeBody(self.objects[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.calls.append(("delete", Bucket, Key))
        self.objects.pop((Bucket, Key), None)


class StorageTest(unittest.TestCase):
    def test_local_round_trip_and_key_check(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            storage = LocalStorage(Path(directory))
            storage.put("citecheck/u1/d1.pdf", b"%PDF-1.4")
            self.assertEqual(storage.get("citecheck/u1/d1.pdf"), b"%PDF-1.4")
            storage.delete("citecheck/u1/d1.pdf")
            with self.assertRaises(StorageError):
                storage.get("citecheck/u1/d1.pdf")
            with self.assertRaises(StorageError):
                storage.put("../escape.pdf", b"x")

    def test_cos_adapter_uses_private_objects(self) -> None:
        client = FakeCosClient()
        storage = CosStorage("bucket-1250000000", client)
        storage.put("citecheck/u1/d1.pdf", b"%PDF-1.4")
        self.assertEqual(storage.get("citecheck/u1/d1.pdf"), b"%PDF-1.4")
        storage.delete("citecheck/u1/d1.pdf")
        self.assertEqual(client.calls[0], ("put", "bucket-1250000000", "citecheck/u1/d1.pdf", "application/pdf", "private"))
        with self.assertRaises(StorageError):
            storage.get("citecheck/u1/d1.pdf")


if __name__ == "__main__":
    unittest.main()
