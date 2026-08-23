"""Provider-neutral object storage for large, publicly playable media."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import BinaryIO
from urllib.parse import quote

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import AppSettings, get_app_settings


_MULTIPART_CHUNK_BYTES = 8 * 1024 * 1024


class StorageConfigurationError(RuntimeError):
    """Object storage was used without its environment configuration."""


class ObjectNotFoundError(FileNotFoundError):
    """The requested storage key does not exist."""


@dataclass(frozen=True)
class StoredObject:
    size_bytes: int
    content_type: str | None
    etag: str
    metadata: dict[str, str]


class ObjectStorage:
    """The storage boundary used by application services.

    Callers deal only in opaque keys and public URLs. The S3-compatible
    implementation, bucket name, credentials, and endpoint stop here.
    """

    def __init__(
        self,
        *,
        client,
        bucket: str,
        public_base_url: str,
        transfer_config: TransferConfig | None = None,
    ) -> None:
        self._client = client
        self._bucket = bucket
        self._public_base_url = public_base_url.rstrip("/")
        self._transfer_config = transfer_config or TransferConfig(
            multipart_threshold=_MULTIPART_CHUNK_BYTES,
            multipart_chunksize=_MULTIPART_CHUNK_BYTES,
            max_concurrency=4,
            use_threads=True,
        )

    @classmethod
    def from_settings(cls, settings: AppSettings) -> "ObjectStorage":
        values = {
            "R2_ENDPOINT": settings.R2_ENDPOINT,
            "R2_BUCKET": settings.R2_BUCKET,
            "R2_ACCESS_KEY_ID": settings.R2_ACCESS_KEY_ID,
            "R2_SECRET_ACCESS_KEY": settings.R2_SECRET_ACCESS_KEY,
            "R2_PUBLIC_BASE_URL": settings.R2_PUBLIC_BASE_URL,
        }
        missing = [name for name, value in values.items() if not value.strip()]
        if missing:
            raise StorageConfigurationError(
                "Object storage is not configured; missing " + ", ".join(missing) + "."
            )
        client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT.rstrip("/"),
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
            config=Config(
                signature_version="s3v4",
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
                retries={"max_attempts": 4, "mode": "standard"},
                s3={"addressing_style": "path"},
            ),
        )
        return cls(
            client=client,
            bucket=settings.R2_BUCKET,
            public_base_url=settings.R2_PUBLIC_BASE_URL,
        )

    def put_object(self, key: str, fileobj: BinaryIO, *, content_type: str) -> None:
        """Upload bounded ancillary media, such as an 8 MB cover image."""
        fileobj.seek(0)
        try:
            self._client.upload_fileobj(
                fileobj,
                self._bucket,
                key,
                ExtraArgs={
                    "ContentType": content_type,
                    "CacheControl": "public, max-age=31536000, immutable",
                },
                Config=self._transfer_config,
            )
        finally:
            fileobj.seek(0)

    def presign_put(
        self,
        key: str,
        *,
        content_type: str,
        content_length: int,
        content_md5: str,
        sha256: str,
        duration_seconds: str,
        expires_seconds: int,
    ) -> tuple[str, dict[str, str]]:
        """Grant one exact, first-write-only PUT without proxying its bytes."""
        cache_control = "public, max-age=31536000, immutable"
        headers = {
            "Content-Type": content_type,
            "Content-MD5": content_md5,
            "Cache-Control": cache_control,
            "If-None-Match": "*",
            "x-amz-meta-sha256": sha256,
            "x-amz-meta-duration-seconds": duration_seconds,
        }
        url = self._client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self._bucket,
                "Key": key,
                "ContentType": content_type,
                "ContentLength": content_length,
                "ContentMD5": content_md5,
                "CacheControl": cache_control,
                "IfNoneMatch": "*",
                "Metadata": {
                    "sha256": sha256,
                    "duration-seconds": duration_seconds,
                },
            },
            ExpiresIn=expires_seconds,
            HttpMethod="PUT",
        )
        return url, headers

    def head_object(self, key: str) -> StoredObject:
        try:
            result = self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise ObjectNotFoundError(key) from exc
            raise
        return StoredObject(
            size_bytes=int(result["ContentLength"]),
            content_type=result.get("ContentType"),
            etag=str(result.get("ETag", "")).strip('"').lower(),
            metadata={str(key): str(value) for key, value in result.get("Metadata", {}).items()},
        )

    def delete_object(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def public_url(self, key: str) -> str:
        return self._public_base_url + "/" + quote(key, safe="/")


@lru_cache
def get_object_storage() -> ObjectStorage:
    return ObjectStorage.from_settings(get_app_settings())
