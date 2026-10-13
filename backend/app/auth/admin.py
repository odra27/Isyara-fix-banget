"""`require_admin` FastAPI dependency (ADR-039 D1, D5, D6, D9).

Flow: Authorization header → Bearer token → JWT verification (worker thread) →
claims → `app_metadata.role == "admin"` (exact string). `user_metadata` is never
read. Only the Authorization header is accepted: no query, cookie or body tokens.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request
from starlette.concurrency import run_in_threadpool

from app.errors import AuthUnavailable, Forbidden, Unauthorized

_UNAUTHORIZED = "Authentication required"
_FORBIDDEN = "Forbidden"


@dataclass(frozen=True)
class AdminPrincipal:
    subject: str | None


def extract_bearer_token(authorization: str | None) -> str:
    """`Bearer <token>`; scheme case-insensitive, surrounding whitespace ignored."""
    if authorization is None:
        raise Unauthorized(_UNAUTHORIZED)
    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise Unauthorized(_UNAUTHORIZED)
    return parts[1]


def is_admin(claims: dict[str, Any]) -> bool:
    app_metadata = claims.get("app_metadata")
    if not isinstance(app_metadata, dict):
        return False
    role = app_metadata.get("role")
    return isinstance(role, str) and role == "admin"


async def require_admin(request: Request) -> AdminPrincipal:
    token = extract_bearer_token(request.headers.get("authorization"))
    verifier = getattr(request.app.state, "jwt_verifier", None)
    if verifier is None:
        raise AuthUnavailable("Authentication service unavailable")
    claims = await run_in_threadpool(verifier.verify, token)
    if not is_admin(claims):
        raise Forbidden(_FORBIDDEN)
    subject = claims.get("sub")
    return AdminPrincipal(subject=subject if isinstance(subject, str) else None)
