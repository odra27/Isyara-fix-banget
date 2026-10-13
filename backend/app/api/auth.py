"""Staff login and profile (ADR-047 D2, D3, D5; ADR-048).

POST /api/auth/login
    {identifier, password} → resolve identifier (email / NIP / username) to exactly one
    active staff profile with an email → Supabase Auth password grant → verify the issued
    access token with the ADR-039 verifier → role from its `app_metadata.role`.
    Every credential-level failure (unknown or ambiguous identifier, inactive profile,
    wrong password, account without a staff role) → 401 INVALID_CREDENTIALS with one
    generic message. Supabase Auth / JWKS unavailable → 503 AUTH_UNAVAILABLE.
    Responses carry `Cache-Control: no-store`. Passwords and tokens are never logged.

GET /api/me
    `require_staff` → the caller's own profile and institution. `role` is the JWT role.
"""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator
from starlette.concurrency import run_in_threadpool

from app.auth.staff import StaffPrincipal, require_staff, staff_role, subject_uuid
from app.errors import AuthUnavailable, InvalidCredentials, Unauthorized

router = APIRouter()

_INVALID = "Invalid credentials"
_UNAVAILABLE = "Authentication service unavailable"
_NO_STORE = {"Cache-Control": "no-store"}

StaffRole = Literal["admin", "petugas"]


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identifier: StrictStr = Field(min_length=1, max_length=320)
    password: StrictStr = Field(min_length=1, max_length=1024)

    @field_validator("identifier")
    @classmethod
    def _identifier(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("identifier must not be blank")
        return v


class LoginUser(BaseModel):
    id: UUID
    full_name: str
    role: StaffRole
    nip: str | None


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    refresh_token: str
    user: LoginUser


class InstitutionOut(BaseModel):
    id: UUID
    name: str


class MeResponse(BaseModel):
    id: UUID
    full_name: str
    role: StaffRole
    job_title: str
    nip: str | None
    unit_kerja: str
    shift_schedule: str | None
    avatar_url: str | None
    institution: InstitutionOut


@router.post("/api/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, response: Response) -> LoginResponse:
    auth_client = getattr(request.app.state, "auth_client", None)
    verifier = getattr(request.app.state, "jwt_verifier", None)
    if auth_client is None or verifier is None:
        raise AuthUnavailable(_UNAVAILABLE)

    async with request.app.state.open_db() as db:
        if db.staff is None:
            raise RuntimeError("staff repository missing")
        targets = await db.staff.find_login_targets(payload.identifier)
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
    role = staff_role(claims)
    if role is None or subject_uuid(claims) != target.profile.id:
        raise InvalidCredentials(_INVALID)

    response.headers.update(_NO_STORE)
    return LoginResponse(
        access_token=grant.access_token,
        expires_in=grant.expires_in,
        refresh_token=grant.refresh_token,
        user=LoginUser(id=target.profile.id, full_name=target.profile.full_name, role=role, nip=target.profile.nip),
    )


@router.get("/api/me", response_model=MeResponse)
async def me(response: Response, principal: StaffPrincipal = Depends(require_staff)) -> MeResponse:
    p = principal.profile
    response.headers.update(_NO_STORE)
    return MeResponse(
        id=p.id,
        full_name=p.full_name,
        role=principal.role,
        job_title=p.job_title,
        nip=p.nip,
        unit_kerja=p.unit_kerja,
        shift_schedule=p.shift_schedule,
        avatar_url=p.avatar_url,
        institution=InstitutionOut(id=p.institution_id, name=p.institution_name),
    )
