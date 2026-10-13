"""Supabase Auth Admin API client for staff provisioning (ADR-047 D4).

Server-side only. Uses `SUPABASE_SERVICE_ROLE_KEY` — sent on `apikey`; additionally on
`Authorization: Bearer` only when it is a legacy JWT key (see `auth_headers`) — to:

* create   — `POST /auth/v1/admin/users` with `email`, `password`, `email_confirm: true`
             and `app_metadata: {"role": <admin|petugas>}`;
* delete   — `DELETE /auth/v1/admin/users/{id}`, used ONLY to roll back a user this
             process just created when the `staff_profiles` insert fails, so no orphan
             account with a staff role is left behind.

This module never authorizes a request (ADR-039 D2, D11) and lives outside `app/auth`.
The key, the password and response bodies are never logged, returned, stored or put in
exception messages; exceptions are raised `from None`. Timeout: httpx default (5 s).

Mapping for create:
    200 / 201 with a UUID `id`                     → that UUID
    422 / 409 with error_code `email_exists` / `user_already_exists` → Conflict (409)
    422 with error_code `weak_password`            → WeakPassword (422 VALIDATION_ERROR)
    anything else (other 4xx, 5xx, network, malformed body) → AuthUnavailable (503)
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from uuid import UUID

import httpx

from app.errors import AuthUnavailable, BackendError, Conflict

ENV_URL = "SUPABASE_URL"
ENV_SERVICE_KEY = "SUPABASE_SERVICE_ROLE_KEY"

_EMAIL_TAKEN_CODES = frozenset({"email_exists", "user_already_exists"})
_UNAVAILABLE = "Authentication service unavailable"
_CONFLICT = "Resource conflicts with existing data"


class WeakPassword(BackendError):
    """Supabase Auth rejected the password under the project password policy."""

    code = "VALIDATION_ERROR"
    http_status = 422


class SupabaseAdminNotConfigured(Exception):
    """Required Supabase Admin API environment configuration is missing."""


@dataclass(frozen=True)
class SupabaseAdminConfig:
    url: str
    service_key: str = field(repr=False)

    @classmethod
    def from_env(cls) -> "SupabaseAdminConfig":
        url = os.environ.get(ENV_URL, "").strip().rstrip("/")
        key = os.environ.get(ENV_SERVICE_KEY, "").strip()
        missing = [n for n, v in ((ENV_URL, url), (ENV_SERVICE_KEY, key)) if not v]
        if missing:
            raise SupabaseAdminNotConfigured("missing: " + ", ".join(missing))  # names only
        if not url.startswith(("https://", "http://")):
            raise SupabaseAdminNotConfigured(f"{ENV_URL} must be an http(s) URL")
        return cls(url=url, service_key=key)


class SupabaseAdminClient:
    def __init__(self, config: SupabaseAdminConfig, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._config = config
        self._client = httpx.AsyncClient(
            base_url=f"{config.url}/auth/v1/admin",
            headers=auth_headers(config.service_key),
            transport=transport,
            follow_redirects=False,
        )

    def __repr__(self) -> str:
        return f"SupabaseAdminClient(url={self._config.url!r})"

    @classmethod
    def from_env(cls) -> "SupabaseAdminClient":
        return cls(SupabaseAdminConfig.from_env())

    async def create_user(self, *, email: str, password: str, role: str) -> UUID:
        try:
            r = await self._client.post(
                "/users",
                json={"email": email, "password": password, "email_confirm": True, "app_metadata": {"role": role}},
            )
        except httpx.HTTPError:
            raise AuthUnavailable(_UNAVAILABLE) from None
        if r.status_code in (409, 422):
            code = _error_code(r)
            if code in _EMAIL_TAKEN_CODES:
                raise Conflict(_CONFLICT)
            if code == "weak_password":
                raise WeakPassword("Invalid request. password: rejected by the password policy")
            raise AuthUnavailable(_UNAVAILABLE)
        if r.status_code not in (200, 201):
            raise AuthUnavailable(_UNAVAILABLE)
        try:
            return UUID(r.json()["id"])
        except (ValueError, KeyError, TypeError, AttributeError):
            raise AuthUnavailable(_UNAVAILABLE) from None

    async def delete_user(self, user_id: UUID) -> None:
        try:
            r = await self._client.delete(f"/users/{user_id}")
        except httpx.HTTPError:
            raise AuthUnavailable(_UNAVAILABLE) from None
        if r.status_code not in (200, 204):
            raise AuthUnavailable(_UNAVAILABLE)

    async def aclose(self) -> None:
        await self._client.aclose()


def auth_headers(service_key: str) -> dict[str, str]:
    """`apikey` always; `Authorization: Bearer` only for a legacy JWT `service_role` key.

    New `sb_secret_...` keys are not JWTs: Supabase documents them as `apikey`-only, and a
    component that verifies the Bearer value as a JWT rejects them. Legacy keys are JWTs
    (they start with "eyJ") and are accepted on both headers.
    """
    headers = {"apikey": service_key}
    if service_key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {service_key}"
    return headers


def _error_code(r: httpx.Response) -> str | None:
    try:
        data = r.json()
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    code = data.get("error_code") or data.get("code")
    return code if isinstance(code, str) else None
