"""Student authorization dependency (ADR-051 D2; same JWT verification as ADR-039).

Flow for `require_student`:
    Authorization: Bearer <JWT> → ADR-039 verification (worker thread)
    → `app_metadata.role` == "siswa" (exact string; `user_metadata` never read)
    → `sub` is a UUID
    → caller's own `student_profiles` row exists and `active = true`
    → StudentPrincipal.

Staff tokens (role admin/petugas) are rejected here, and student tokens are rejected by
`require_staff` / `require_admin`, so the two account types never cross.

Errors: token problems → 401 UNAUTHORIZED; valid token but wrong role, or missing/inactive
profile → 403 FORBIDDEN; JWKS unavailable → 503 AUTH_UNAVAILABLE.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import Request

from app.auth.staff import subject_uuid, verify_bearer
from app.db.students import StudentProfile
from app.errors import Forbidden, Unauthorized

STUDENT_ROLE = "siswa"  # ADR-051 D2


@dataclass(frozen=True)
class StudentPrincipal:
    user_id: UUID
    profile: StudentProfile


def is_student(claims: dict[str, Any]) -> bool:
    app_metadata = claims.get("app_metadata")
    return isinstance(app_metadata, dict) and app_metadata.get("role") == STUDENT_ROLE


async def require_student(request: Request) -> StudentPrincipal:
    claims = await verify_bearer(request)
    if not is_student(claims):
        raise Forbidden("Forbidden")
    user_id = subject_uuid(claims)
    if user_id is None:
        raise Unauthorized("Authentication required")
    async with request.app.state.open_db() as db:
        if db.students is None:  # misconfigured DB bundle → generic 500 INTERNAL_ERROR
            raise RuntimeError("student repository missing")
        profile = await db.students.get_profile(user_id)
    if profile is None or profile.active is not True:
        raise Forbidden("Forbidden")
    return StudentPrincipal(user_id=user_id, profile=profile)
