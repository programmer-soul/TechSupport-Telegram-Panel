import os
import uuid
from pathlib import Path

import aiofiles

from app.core.config import get_settings

settings = get_settings()


class StorageError(RuntimeError):
    pass


def _make_key(filename: str | None) -> str:
    ext = ""
    if filename and "." in filename:
        ext = "." + filename.rsplit(".", 1)[-1]
    return f"{uuid.uuid4().hex}{ext}"


class LocalStorage:
    def __init__(self, base_path: str) -> None:
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def save(self, data: bytes, filename: str | None) -> tuple[str, str]:
        key = _make_key(filename)
        path = self.base_path / key
        async with aiofiles.open(path, "wb") as f:
            await f.write(data)
        return str(path), f"{settings.storage_public_base_url}/{key}"


class S3Storage:
    def __init__(self) -> None:
        import boto3

        if not settings.s3_bucket or not settings.s3_access_key or not settings.s3_secret_key:
            raise StorageError("S3 is not configured")
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )
        self.bucket = settings.s3_bucket

    async def save(self, data: bytes, filename: str | None) -> tuple[str, str]:
        key = _make_key(filename)
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)
        if settings.s3_endpoint_url:
            url = f"{settings.s3_endpoint_url}/{self.bucket}/{key}"
        else:
            url = f"https://{self.bucket}.s3.amazonaws.com/{key}"
        return key, url


def get_storage():
    backend = settings.storage_backend.lower()
    if backend == "s3":
        return S3Storage()
    return LocalStorage(settings.storage_local_path)
