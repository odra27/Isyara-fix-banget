"""Student login and profile (ADR-051 D2). Mirrors the staff login (ADR-047 D5).

POST /api/student/auth/login
    {nis, password} → exactly one active student profile with an email for that NIS
    → Supabase Auth password grant → verify the issued token (ADR-039 verifier)
    → `app_metadata.role` must be "siswa" and `sub` must equal the profile id.
    Every credential-level failure → 401 INVALID_CREDENTIALS with one generic message.
    Supabase Auth / JWKS unavailable → 503 AUTH_UNAVAILABLE.
    Responses carry `Cache-Control: no-store`. Passwords and tokens are never logged.

POST /api/student/auth/refresh  (ADR-052)
    {refresh_token} → Supabase refresh grant → same response as login, re-checking role + active profile.

GET /api/student/me
    `require_student` → the caller's own profile and school.
"""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator
from starlette.concurrency import run_in_threadpool

from app.auth.staff import subject_uuid
from app.auth.student import StudentPrincipal, is_student, require_student
from app.db.students import StudentProfile
from app.errors import AuthUnavailable, InvalidCredentials, Unauthorized

router = APIRouter()

_INVALID = "Invalid credentials"
_UNAVAILABLE = "Authentication service unavailable"
_NO_STORE = {"Cache-Control": "no-store"}


class StudentLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nis: StrictStr = Field(min_length=1, max_length=30)
    password: StrictStr = Field(min_length=1, max_length=1024)

    @field_validator("nis")
    @classmethod
    def _nis(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("nis must not be blank")
        return v


class InstitutionOut(BaseModel):
    id: UUID
    name: str


class StudentOut(BaseModel):
    id: UUID
    nis: str
    full_name: str
    class_name: str | None
    grade: int | None
    avatar_url: str | None
    institution: InstitutionOut


class StudentLoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    refresh_token: str
    student: StudentOut


def student_out(p: StudentProfile) -> StudentOut:
    return StudentOut(
        id=p.id,
        nis=p.nis,
        full_name=p.full_name,
        class_name=p.class_name,
        grade=p.grade,
        avatar_url=p.avatar_url,
        institution=InstitutionOut(id=p.institution_id, name=p.institution_name),
    )


@router.post("/api/student/auth/login", response_model=StudentLoginResponse)
async def student_login(payload: StudentLoginRequest, request: Request, response: Response) -> StudentLoginResponse:
    auth_client = getattr(request.app.state, "auth_client", None)
    verifier = getattr(request.app.state, "jwt_verifier", None)
    if auth_client is None or verifier is None:
        raise AuthUnavailable(_UNAVAILABLE)

    async with request.app.state.open_db() as db:
        if db.students is None:
            raise RuntimeError("student repository missing")
        targets = await db.students.find_login_targets(payload.nis)
    if len(targets) != 1:
        raise InvalidCredentials(_INVALID)
    target = targets[0]
    if target.profile.active is not True or not target.email:
        raise InvalidCredentials(_INVALID)

    grant = await auth_client.password_grant(target.email, payload.password)

    try:
        claims = await run_in_threadpool(verifier.verify, grant.access_token)
    except Unauthorized:
        # Supabase issued a token our verifier rejects: configuration problem, not the user's.
        raise AuthUnavailable(_UNAVAILABLE) from None
    if not is_student(claims) or subject_uuid(claims) != target.profile.id:
        raise InvalidCredentials(_INVALID)

    response.headers.update(_NO_STORE)
    return StudentLoginResponse(
        access_token=grant.access_token,
        expires_in=grant.expires_in,
        refresh_token=grant.refresh_token,
        student=student_out(target.profile),
    )


class StudentRefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: StrictStr = Field(min_length=1, max_length=4096)


@router.post("/api/student/auth/refresh", response_model=StudentLoginResponse)
async def student_refresh(payload: StudentRefreshRequest, request: Request, response: Response) -> StudentLoginResponse:
    """Exchange a refresh token for a new token pair (ADR-052), so a student who already logged in
    on this device goes straight in. The new token must still be a `siswa` token of an active
    profile; anything else → 401 INVALID_CREDENTIALS (the FE then shows the login form)."""
    auth_client = getattr(request.app.state, "auth_client", None)
    verifier = getattr(request.app.state, "jwt_verifier", None)
    if auth_client is None or verifier is None:
        raise AuthUnavailable(_UNAVAILABLE)

    grant = await auth_client.refresh_grant(payload.refresh_token)
    try:
        claims = await run_in_threadpool(verifier.verify, grant.access_token)
    except Unauthorized:
        raise AuthUnavailable(_UNAVAILABLE) from None
    user_id = subject_uuid(claims)
    if not is_student(claims) or user_id is None:
        raise InvalidCredentials(_INVALID)
    async with request.app.state.open_db() as db:
        if db.students is None:
            raise RuntimeError("student repository missing")
        profile = await db.students.get_profile(user_id)
    if profile is None or profile.active is not True:
        raise InvalidCredentials(_INVALID)

    response.headers.update(_NO_STORE)
    return StudentLoginResponse(
        access_token=grant.access_token,
        expires_in=grant.expires_in,
        refresh_token=grant.refresh_token,
        student=student_out(profile),
    )


@router.get("/api/student/me", response_model=StudentOut)
async def student_me(response: Response, principal: StudentPrincipal = Depends(require_student)) -> StudentOut:
    response.headers.update(_NO_STORE)
    return student_out(principal.profile)
