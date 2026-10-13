"""Staff authorization dependencies (ADR-047 D2, D3; ADR-039 D2–D7, D11).

Flow for `require_staff`:
    Authorization: Bearer <JWT> → ADR-039 verification (worker thread)
    → `app_metadata.role` ∈ {"admin", "petugas"} (exact strings; `user_metadata` never read)
    → `sub` is a UUID
    → caller's own `staff_profiles` row exists and `active = true` (runtime check)
    → StaffPrincipal (role from the JWT, institution from the profile).

`require_institution_admin` additionally requires role "admin". It is for the new
staff-management endpoints only; the existing `/api/admin/*` endpoints keep
`require_admin` (ADR-039, unscoped, no profile check) unchanged.

Errors: token problems → 401 UNAUTHORIZED; valid token but wrong/missing role, or
missing/inactive profile → 403 FORBIDDEN; JWKS unavailable → 503 AUTH_UNAVAILABLE.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import Depends, Request
from starlette.concurrency import run_in_threadpool

from app.auth.admin import extract_bearer_token
from app.db.staff import StaffProfile
from app.errors import AuthUnavailable, Forbidden, Unauthorized

STAFF_ROLES: tuple[str, ...] = ("admin", "petugas")  # ADR-047 D2

_UNAUTHORIZED = "Authentication required"
_FORBIDDEN = "Forbidden"


@dataclass(frozen=True)
class StaffPrincipal:
    user_id: UUID
    role: str  # from the verified JWT (ADR-047 D2)
    profile: StaffProfile

    @property
    def institution_id(self) -> UUID:
        return self.profile.institution_id


def staff_role(claims: dict[str, Any]) -> str | None:
    """`app_metadata.role` if it is exactly one of STAFF_ROLES, else None."""
    app_metadata = claims.get("app_metadata")
    if not isinstance(app_metadata, dict):
        return None
    role = app_metadata.get("role")
    return role if isinstance(role, str) and role in STAFF_ROLES else None


def subject_uuid(claims: dict[str, Any]) -> UUID | None:
    sub = claims.get("sub")
    if not isinstance(sub, str):
        return None
    try:
        return UUID(sub)
    except ValueError:
        return None


async def verify_bearer(request: Request) -> dict[str, Any]:
    token = extract_bearer_token(request.headers.get("authorization"))
    verifier = getattr(request.app.state, "jwt_verifier", None)
    if verifier is None:
        raise AuthUnavailable("Authentication service unavailable")
    return await run_in_threadpool(verifier.verify, token)


async def require_staff(request: Request) -> StaffPrincipal:
    claims = await verify_bearer(request)
    role = staff_role(claims)
    if role is None:
        raise Forbidden(_FORBIDDEN)
    user_id = subject_uuid(claims)
    if user_id is None:  # invalid required claim (ADR-039 D6)
        raise Unauthorized(_UNAUTHORIZED)
    async with request.app.state.open_db() as db:
        if db.staff is None:  # misconfigured DB bundle → generic 500 INTERNAL_ERROR
            raise RuntimeError("staff repository missing")
        profile = await db.staff.get_profile(user_id)
    if profile is None or profile.active is not True:
        raise Forbidden(_FORBIDDEN)
    return StaffPrincipal(user_id=user_id, role=role, profile=profile)


async def require_institution_admin(principal: StaffPrincipal = Depends(require_staff)) -> StaffPrincipal:
    if principal.role != "admin":
        raise Forbidden(_FORBIDDEN)
    return principal


async def current_institution_id(principal: StaffPrincipal = Depends(require_staff)) -> UUID:
    """Caller's institution, always from their own profile — never from the request (ADR-047 D3)."""
    return principal.institution_id
