"""Supabase Auth password grant over httpx (ADR-047 D5).

One call: `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` with `{email, password}`,
authenticated with `SUPABASE_ANON_KEY` in the `apikey` header only (works for both the
legacy anon JWT and the new `sb_publishable_...` key format). No SDK dependency.

Mapping:
    200 with access_token / refresh_token / expires_in → TokenGrant
    400 / 401 / 403 / 422 (bad credentials, unconfirmed or banned user) → InvalidCredentials
    anything else (429, 5xx, network error, timeout, malformed body)   → AuthUnavailable

The password, the key and the response body are never logged, stored, put into
exception messages or included in repr. Exceptions are raised `from None`.
Timeout: httpx default (5 s per network operation).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

import httpx

from app.errors import AuthUnavailable, InvalidCredentials

ENV_URL = "SUPABASE_URL"
ENV_ANON_KEY = "SUPABASE_ANON_KEY"

_CREDENTIAL_FAILURE_STATUSES = frozenset({400, 401, 403, 422})
_INVALID = "Invalid credentials"
_UNAVAILABLE = "Authentication service unavailable"


class SupabaseAuthNotConfigured(Exception):
    """Required Supabase Auth environment configuration is missing."""


@dataclass(frozen=True)
class SupabaseAuthConfig:
    url: str
    anon_key: str = field(repr=False)

    @classmethod
    def from_env(cls) -> "SupabaseAuthConfig":
        url = os.environ.get(ENV_URL, "").strip().rstrip("/")
        key = os.environ.get(ENV_ANON_KEY, "").strip()
        missing = [n for n, v in ((ENV_URL, url), (ENV_ANON_KEY, key)) if not v]
        if missing:
            raise SupabaseAuthNotConfigured("missing: " + ", ".join(missing))  # names only
        if not url.startswith(("https://", "http://")):
            raise SupabaseAuthNotConfigured(f"{ENV_URL} must be an http(s) URL")
        return cls(url=url, anon_key=key)


@dataclass(frozen=True)
class TokenGrant:
    access_token: str = field(repr=False)
    refresh_token: str = field(repr=False)
    expires_in: int


class SupabaseAuthClient:
    def __init__(self, config: SupabaseAuthConfig, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._config = config
        self._client = httpx.AsyncClient(
            base_url=f"{config.url}/auth/v1",
            headers={"apikey": config.anon_key},
            transport=transport,
            follow_redirects=False,
        )

    def __repr__(self) -> str:
        return f"SupabaseAuthClient(url={self._config.url!r})"

    @classmethod
    def from_env(cls) -> "SupabaseAuthClient":
        return cls(SupabaseAuthConfig.from_env())

    async def password_grant(self, email: str, password: str) -> TokenGrant:
        try:
            r = await self._client.post(
                "/token", params={"grant_type": "password"}, json={"email": email, "password": password}
            )
        except httpx.HTTPError:
            raise AuthUnavailable(_UNAVAILABLE) from None
        if r.status_code in _CREDENTIAL_FAILURE_STATUSES:
            raise InvalidCredentials(_INVALID)
        if r.status_code != 200:
            raise AuthUnavailable(_UNAVAILABLE)
        try:
            data = r.json()
            access, refresh, expires = data["access_token"], data["refresh_token"], data["expires_in"]
        except (ValueError, KeyError, TypeError):
            raise AuthUnavailable(_UNAVAILABLE) from None
        if not (isinstance(access, str) and access and isinstance(refresh, str) and refresh):
            raise AuthUnavailable(_UNAVAILABLE)
        if isinstance(expires, bool) or not isinstance(expires, int) or expires <= 0:
            raise AuthUnavailable(_UNAVAILABLE)
        return TokenGrant(access_token=access, refresh_token=refresh, expires_in=expires)

    async def aclose(self) -> None:
        await self._client.aclose()
