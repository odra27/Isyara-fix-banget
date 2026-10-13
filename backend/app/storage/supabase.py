"""Supabase Storage REST client for the private `sign-references` bucket (ADR-042, ADR-046).

Only three operations exist, all on objects inside the configured bucket:
* upload  — `POST /storage/v1/object/{bucket}/{path}` with `x-upsert: false`
            (Supabase rejects an existing path, so objects are never overwritten);
* sign    — `POST /storage/v1/object/sign/{bucket}/{path}` with `expiresIn` = 3600 s;
* delete  — `DELETE /storage/v1/object/{bucket}/{path}` (cleanup after a failed DB insert).

There is no bucket create/update/public-URL call: bucket provisioning and its private
setting live in the Supabase project, not in the Backend.

Credential: `SUPABASE_SERVICE_ROLE_KEY`, server-side only (ADR-046 §5). The project uses a
new secret API key (`sb_secret_...`), which is sent only in the `apikey` header — no
`Authorization` header is sent to Storage. It goes only to `SUPABASE_URL`, is never logged,
returned or stored, and is excluded from repr.
Errors never carry the key, response bodies or file content; they are raised `from None`.

Timeouts: httpx defaults (5 s per network operation), not a project-wide decision.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from urllib.parse import quote

import httpx

from app.errors import StorageError

ALLOWED_MIME_TYPES: dict[str, str] = {"video/mp4": "mp4", "video/webm": "webm"}  # ADR-046 §2
MAX_REFERENCE_BYTES = 50 * 1024 * 1024  # ADR-046 §3 (50 MB, as 50 MiB)
SIGNED_URL_TTL_S = 3600  # ADR-046 §4

ENV_URL = "SUPABASE_URL"
ENV_SERVICE_KEY = "SUPABASE_SERVICE_ROLE_KEY"
ENV_BUCKET = "SUPABASE_STORAGE_BUCKET"

_UNAVAILABLE = "Storage service unavailable"


class StorageNotConfigured(Exception):
    """Required Storage environment configuration is missing."""


@dataclass(frozen=True)
class StorageConfig:
    url: str
    bucket: str
    service_key: str = field(repr=False)

    @classmethod
    def from_env(cls) -> "StorageConfig":
        url = os.environ.get(ENV_URL, "").strip().rstrip("/")
        key = os.environ.get(ENV_SERVICE_KEY, "").strip()
        bucket = os.environ.get(ENV_BUCKET, "").strip()
        missing = [n for n, v in ((ENV_URL, url), (ENV_SERVICE_KEY, key), (ENV_BUCKET, bucket)) if not v]
        if missing:
            raise StorageNotConfigured("missing: " + ", ".join(missing))  # names only, never values
        if not url.startswith(("https://", "http://")):
            raise StorageNotConfigured(f"{ENV_URL} must be an http(s) URL")
        return cls(url=url, bucket=bucket, service_key=key)


class SupabaseStorage:
    def __init__(self, config: StorageConfig, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._config = config
        self._client = httpx.AsyncClient(
            base_url=f"{config.url}/storage/v1",
            # New Supabase secret keys (`sb_secret_...`) are not JWTs: they go on `apikey`
            # only, never on `Authorization: Bearer` (Supabase API-keys docs).
            headers={"apikey": config.service_key},
            transport=transport,
            follow_redirects=False,
        )

    def __repr__(self) -> str:
        return f"SupabaseStorage(url={self._config.url!r}, bucket={self._config.bucket!r})"

    @classmethod
    def from_env(cls) -> "SupabaseStorage":
        return cls(StorageConfig.from_env())

    @property
    def bucket(self) -> str:
        return self._config.bucket

    def _object(self, path: str) -> str:
        return f"{quote(self._config.bucket, safe='')}/{quote(path, safe='/')}"

    async def upload(self, path: str, data: bytes, content_type: str) -> None:
        try:
            r = await self._client.post(
                f"/object/{self._object(path)}",
                content=data,
                headers={"Content-Type": content_type, "x-upsert": "false"},
            )
        except httpx.HTTPError:
            raise StorageError(_UNAVAILABLE) from None
        if r.status_code != 200:  # incl. "already exists": never overwrite, never retry
            raise StorageError(_UNAVAILABLE)

    async def signed_url(self, path: str, expires_in: int = SIGNED_URL_TTL_S) -> str:
        try:
            r = await self._client.post(f"/object/sign/{self._object(path)}", json={"expiresIn": expires_in})
            signed = r.json().get("signedURL") if r.status_code == 200 else None
        except (httpx.HTTPError, ValueError, AttributeError):
            raise StorageError(_UNAVAILABLE) from None
        if not isinstance(signed, str) or not signed.startswith("/"):
            raise StorageError(_UNAVAILABLE)
        return f"{self._config.url}/storage/v1{signed}"

    async def delete(self, path: str) -> None:
        try:
            r = await self._client.delete(f"/object/{self._object(path)}")
        except httpx.HTTPError:
            raise StorageError(_UNAVAILABLE) from None
        if r.status_code not in (200, 204):
            raise StorageError(_UNAVAILABLE)

    async def aclose(self) -> None:
        await self._client.aclose()
