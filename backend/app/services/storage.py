from collections.abc import Iterator
from typing import Protocol

from .. import models
from ..config import settings


class StorageBackend(Protocol):
    def put(
        self, *, attachment: models.Attachment, data: bytes, content_type: str
    ) -> str | None: ...

    def open(self, attachment: models.Attachment) -> Iterator[bytes]: ...

    def delete(self, attachment: models.Attachment) -> None: ...


class DbStorage:
    def put(
        self, *, attachment: models.Attachment, data: bytes, content_type: str
    ) -> str | None:
        attachment.data = data
        attachment.content_type = content_type
        return None

    def open(self, attachment: models.Attachment) -> Iterator[bytes]:
        if attachment.data:
            yield attachment.data

    def delete(self, attachment: models.Attachment) -> None:
        attachment.data = None
        attachment.storage_key = None


class S3Storage:
    def put(
        self, *, attachment: models.Attachment, data: bytes, content_type: str
    ) -> str | None:
        raise NotImplementedError("S3 storage backend is not implemented yet")

    def open(self, attachment: models.Attachment) -> Iterator[bytes]:
        raise NotImplementedError("S3 storage backend is not implemented yet")

    def delete(self, attachment: models.Attachment) -> None:
        raise NotImplementedError("S3 storage backend is not implemented yet")


def get_storage_backend() -> StorageBackend:
    if settings.STORAGE_BACKEND == "db":
        return DbStorage()
    if settings.STORAGE_BACKEND == "s3":
        return S3Storage()
    raise ValueError(f"Unsupported storage backend: {settings.STORAGE_BACKEND}")
