"""Supabase JWT verification against the project JWKS (ADR-039 D2–D4, D7, D8, D11).

* Algorithm allowlist: ES256 only. The token header algorithm is checked against
  the allowlist before any key lookup and is never trusted on its own.
* Claims: signature, iss, aud, exp (required), nbf (validated when present), leeway 0.
* JWKS: one PyJWKClient per verifier (per process), JWK Set cache 300 s, HTTP
  timeout 2 s, unknown-kid forced refresh with a 30 s cooldown. These are the
  library's own cache semantics; there is no custom stale-cache fallback. An
  expired cache that cannot be refreshed means no key, hence AUTH_UNAVAILABLE.
* Failure mapping: token problems → Unauthorized (401); JWKS unreachable or
  unusable → AuthUnavailable (503).

`verify()` is synchronous (it may do network I/O) and must be called from a worker
thread, not the event loop. Tokens and claims are never logged or put into
exception messages; exceptions are raised `from None`.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError, PyJWKSetError, PyJWTError

from app.errors import AuthUnavailable, Unauthorized

ALLOWED_ALGORITHMS: tuple[str, ...] = ("ES256",)  # ADR-039 D3
JWKS_CACHE_LIFESPAN_S = 300  # ADR-039 D7
JWKS_TIMEOUT_S = 2  # ADR-039 D7
JWKS_REFRESH_COOLDOWN_S = 30  # ADR-039 D7
LEEWAY_S = 0  # ADR-039 D4
REQUIRED_CLAIMS = ("exp", "iss", "aud")  # ADR-039 D4

# ADR-039 D8: environment variables and current deployment values (public, non-secret).
ENV_JWKS_URL = "SUPABASE_JWKS_URL"
ENV_ISSUER = "SUPABASE_JWT_ISSUER"
ENV_AUDIENCE = "SUPABASE_JWT_AUDIENCE"
DEFAULT_JWKS_URL = "https://qshkdkmevbiaydkicihd.supabase.co/auth/v1/.well-known/jwks.json"
DEFAULT_ISSUER = "https://qshkdkmevbiaydkicihd.supabase.co/auth/v1"
DEFAULT_AUDIENCE = "authenticated"

# PyJWT 2.15.1 raises PyJWKClientError with this message when a kid is not in the
# (possibly refreshed) JWK Set. Any other PyJWKClientError means the JWKS itself is
# unusable. The exact dependency pin plus tests guard this distinction.
_UNKNOWN_KID_MESSAGE_PREFIX = "Unable to find a signing key"

_UNAUTHORIZED = "Authentication required"
_UNAVAILABLE = "Authentication service unavailable"


@dataclass(frozen=True)
class AuthConfig:
    jwks_url: str
    issuer: str
    audience: str

    @classmethod
    def from_env(cls) -> "AuthConfig":
        return cls(
            jwks_url=os.environ.get(ENV_JWKS_URL) or DEFAULT_JWKS_URL,
            issuer=os.environ.get(ENV_ISSUER) or DEFAULT_ISSUER,
            audience=os.environ.get(ENV_AUDIENCE) or DEFAULT_AUDIENCE,
        )


class JwtVerifier:
    def __init__(self, config: AuthConfig) -> None:
        self._config = config
        self._jwks = PyJWKClient(
            config.jwks_url,
            cache_jwk_set=True,
            lifespan=JWKS_CACHE_LIFESPAN_S,
            timeout=JWKS_TIMEOUT_S,
            cooldown_duration=JWKS_REFRESH_COOLDOWN_S,
            cache_keys=False,
        )

    @classmethod
    def from_env(cls) -> "JwtVerifier":
        return cls(AuthConfig.from_env())

    def verify(self, token: str) -> dict[str, Any]:
        """Return verified claims, or raise Unauthorized / AuthUnavailable."""
        try:
            header = jwt.get_unverified_header(token)
        except PyJWTError:
            raise Unauthorized(_UNAUTHORIZED) from None

        if header.get("alg") not in ALLOWED_ALGORITHMS:
            raise Unauthorized(_UNAUTHORIZED)
        kid = header.get("kid")
        if not isinstance(kid, str) or not kid:
            raise Unauthorized(_UNAUTHORIZED)

        try:
            signing_key = self._jwks.get_signing_key(kid)
        except PyJWKClientConnectionError:
            raise AuthUnavailable(_UNAVAILABLE) from None
        except PyJWKClientError as exc:
            if str(exc).startswith(_UNKNOWN_KID_MESSAGE_PREFIX):
                raise Unauthorized(_UNAUTHORIZED) from None
            raise AuthUnavailable(_UNAVAILABLE) from None
        except PyJWKSetError:
            raise AuthUnavailable(_UNAVAILABLE) from None
        except ValueError:
            # Non-JSON JWKS body: PyJWKClient.fetch_data does not wrap json errors.
            raise AuthUnavailable(_UNAVAILABLE) from None

        if signing_key.algorithm_name not in ALLOWED_ALGORITHMS:
            raise Unauthorized(_UNAUTHORIZED)

        try:
            claims = jwt.decode(
                token,
                key=signing_key.key,
                algorithms=list(ALLOWED_ALGORITHMS),
                audience=self._config.audience,
                issuer=self._config.issuer,
                leeway=LEEWAY_S,
                options={"require": list(REQUIRED_CLAIMS)},
            )
        except PyJWTError:
            raise Unauthorized(_UNAUTHORIZED) from None
        return claims
