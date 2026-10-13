"""Admin API (ADR-019, ADR-039, ADR-040, ADR-041, ADR-043).

Every admin endpoint is registered on this router, so `require_admin` (ADR-039)
runs for all of `/api/admin/*` before any request validation or DB access.

Conventions (ADR-040): 422 VALIDATION_ERROR for invalid body/query/path, 409
CONFLICT (generic message), resource-specific 404s, `page`/`page_size`
pagination (1 / 50, max 100, never clamped), `{items, page, page_size, total}`
list shape, fixed server-side ordering, unknown fields rejected.

Reference upload (ADR-042, ADR-046): multipart with exactly one `file` part,
video/mp4 or video/webm (declared type + container signature), ≤ 50 MB. The object
path is generated here; the client cannot name it. No DELETE (ADR-041 §12).

Staff management (ADR-047, ADR-048): POST/GET /api/admin/staff, additionally guarded by
`require_institution_admin` and scoped to the caller's institution.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Generic, Literal, TypeVar
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request
from psycopg.errors import UniqueViolation
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool, StrictStr, field_validator, model_validator
from starlette.datastructures import UploadFile
from starlette.exceptions import HTTPException

from app.api.errors import VALIDATION_ERROR_STATUS
from app.auth.admin import require_admin
from app.auth.staff import StaffPrincipal, require_institution_admin
from app.db.admin import AdminRepository, LogFilters
from app.db.staff import StaffRepository
from app.errors import AuthUnavailable, BackendError, Conflict, PhraseNotFound, StorageError
from app.storage.supabase import ALLOWED_MIME_TYPES, MAX_REFERENCE_BYTES, SIGNED_URL_TTL_S

ADMIN_PREFIX = "/api/admin"

router = APIRouter(prefix=ADMIN_PREFIX, dependencies=[Depends(require_admin)])

# ADR-041 §3: documented project categories (PRD §7, PRD-BE §7), application-level only.
PHRASE_CATEGORIES = ("Pendaftaran", "Keluhan", "Obat", "Administrasi", "Fallback")
Category = Literal["Pendaftaran", "Keluhan", "Obat", "Administrasi", "Fallback"]

_CONFLICT = "Resource conflicts with existing data"

T = TypeVar("T")


# ---- shared models (ADR-040) ------------------------------------------------------------------

class PageQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class Page(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int


def _repo(db) -> AdminRepository:
    if db.admin is None:  # misconfigured DB bundle → generic 500 INTERNAL_ERROR
        raise RuntimeError("admin repository missing")
    return db.admin


# ---- phrases (ADR-041) ------------------------------------------------------------------------

class PhraseOut(BaseModel):
    id: UUID
    phrase_text: str
    category: str
    language_variant: str
    active: bool | None
    model_phrase_id: str | None
    sign_recognizable: bool | None


def _check_text(v: str) -> str:
    if not v.strip():
        raise ValueError("phrase_text must not be blank")
    return v


class PhraseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phrase_text: StrictStr = Field(min_length=1)
    category: Category
    active: StrictBool | None = None  # omitted → schema default

    @field_validator("phrase_text")
    @classmethod
    def _text(cls, v: str) -> str:
        return _check_text(v)

    @model_validator(mode="after")
    def _active_not_null(self) -> "PhraseCreate":
        if "active" in self.model_fields_set and self.active is None:
            raise ValueError("active must not be null")
        return self


class PhrasePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phrase_text: StrictStr | None = Field(default=None, min_length=1)
    category: Category | None = None
    active: StrictBool | None = None

    @model_validator(mode="after")
    def _explicit_non_null_fields(self) -> "PhrasePatch":
        if not self.model_fields_set:
            raise ValueError("at least one of phrase_text, category, active is required")
        for name in self.model_fields_set:
            if getattr(self, name) is None:
                raise ValueError(f"{name} must not be null")
        if self.phrase_text is not None:
            _check_text(self.phrase_text)
        return self

    def changes(self) -> dict:
        return {name: getattr(self, name) for name in self.model_fields_set}


@router.get("/phrases", response_model=Page[PhraseOut])
async def list_phrases(request: Request, q: Annotated[PageQuery, Query()]) -> Page[PhraseOut]:
    async with request.app.state.open_db() as db:
        rows, total = await _repo(db).list_phrases(limit=q.page_size, offset=q.offset)
    return Page[PhraseOut](
        items=[PhraseOut(**vars(r)) for r in rows], page=q.page, page_size=q.page_size, total=total
    )


@router.post("/phrases", response_model=PhraseOut, status_code=201)
async def create_phrase(body: PhraseCreate, request: Request) -> PhraseOut:
    async with request.app.state.open_db() as db:
        repo = _repo(db)
        if await repo.phrase_text_taken(body.phrase_text):
            raise Conflict(_CONFLICT)
        try:
            row = await repo.create_phrase(phrase_text=body.phrase_text, category=body.category, active=body.active)
        except UniqueViolation:
            raise Conflict(_CONFLICT) from None
    return PhraseOut(**vars(row))


@router.patch("/phrases/{phrase_id}", response_model=PhraseOut)
async def update_phrase(phrase_id: UUID, body: PhrasePatch, request: Request) -> PhraseOut:
    async with request.app.state.open_db() as db:
        repo = _repo(db)
        if await repo.get_phrase(phrase_id) is None:
            raise PhraseNotFound("Phrase not found")
        if body.phrase_text is not None and await repo.phrase_text_taken(body.phrase_text, exclude_id=phrase_id):
            raise Conflict(_CONFLICT)
        try:
            row = await repo.update_phrase(phrase_id, body.changes())
        except UniqueViolation:
            raise Conflict(_CONFLICT) from None
    if row is None:  # deleted concurrently
        raise PhraseNotFound("Phrase not found")
    return PhraseOut(**vars(row))


# ---- logs (ADR-043) ---------------------------------------------------------------------------

class LogQuery(PageQuery):
    device_id: UUID | None = None
    predicted_phrase_id: UUID | None = None
    resulted_action: Literal["accepted", "confirmed", "escalated_to_jbi"] | None = None
    direction: Literal["sign_to_text", "speech_to_sign"] | None = None
    created_from: AwareDatetime | None = None  # inclusive
    created_to: AwareDatetime | None = None  # inclusive

    @model_validator(mode="after")
    def _range(self) -> "LogQuery":
        if self.created_from and self.created_to and self.created_from > self.created_to:
            raise ValueError("created_from must not be after created_to")
        return self


class LogOut(BaseModel):
    id: UUID
    device_id: UUID
    direction: str
    predicted_phrase_id: UUID | None
    confidence: float
    resulted_action: str
    created_at: datetime


@router.get("/logs", response_model=Page[LogOut])
async def list_logs(request: Request, q: Annotated[LogQuery, Query()]) -> Page[LogOut]:
    filters = LogFilters(
        device_id=q.device_id,
        predicted_phrase_id=q.predicted_phrase_id,
        resulted_action=q.resulted_action,
        direction=q.direction,
        created_from=q.created_from,
        created_to=q.created_to,
    )
    async with request.app.state.open_db() as db:
        rows, total = await _repo(db).list_logs(filters, limit=q.page_size, offset=q.offset)
    items = [LogOut(**{**vars(r), "confidence": float(r.confidence)}) for r in rows]
    return Page[LogOut](items=items, page=q.page, page_size=q.page_size, total=total)


# ---- devices (ADR-043) ------------------------------------------------------------------------

class DeviceOut(BaseModel):
    id: UUID
    institution_id: UUID
    label: str
    active: bool | None


@router.get("/devices", response_model=Page[DeviceOut])
async def list_devices(request: Request, q: Annotated[PageQuery, Query()]) -> Page[DeviceOut]:
    async with request.app.state.open_db() as db:
        rows, total = await _repo(db).list_devices(limit=q.page_size, offset=q.offset)
    return Page[DeviceOut](
        items=[DeviceOut(**vars(r)) for r in rows], page=q.page, page_size=q.page_size, total=total
    )


# ---- sign references (ADR-042, ADR-046) --------------------------------------------------------

class UploadValidationError(BackendError):
    """Invalid reference upload; mapped to the ADR-040 422 envelope."""

    code = "VALIDATION_ERROR"
    http_status = VALIDATION_ERROR_STATUS


# Multipart overhead allowance for the early Content-Length check; the exact file size is
# always checked after reading.
_MULTIPART_SLACK_BYTES = 64 * 1024


def _container_matches(mime: str, data: bytes) -> bool:
    if mime == "video/mp4":
        return len(data) >= 8 and data[4:8] == b"ftyp"  # ISO BMFF 'ftyp' box
    if mime == "video/webm":
        return data[:4] == b"\x1a\x45\xdf\xa3"  # EBML header
    return False


async def _read_upload(request: Request) -> tuple[bytes, str]:
    content_type = request.headers.get("content-type", "")
    if not content_type.lower().startswith("multipart/form-data"):
        raise UploadValidationError("Invalid request. body: multipart/form-data with a 'file' part is required")
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > MAX_REFERENCE_BYTES + _MULTIPART_SLACK_BYTES:
        raise UploadValidationError("Invalid request. file: exceeds the maximum size of 50 MB")
    try:
        form = await request.form(max_files=1, max_fields=1)
    except HTTPException:
        raise UploadValidationError("Invalid request. body: malformed multipart body") from None
    try:
        keys = set(form.keys())
        if keys != {"file"} or len(form.getlist("file")) != 1:
            # Only one `file` part; any other field (e.g. a path or bucket) is rejected (ADR-040 §9).
            raise UploadValidationError("Invalid request. body: exactly one 'file' part and no other fields allowed")
        upload = form["file"]
        if not isinstance(upload, UploadFile):
            raise UploadValidationError("Invalid request. file: must be a file upload")
        mime = (upload.content_type or "").split(";")[0].strip().lower()
        if mime not in ALLOWED_MIME_TYPES:
            raise UploadValidationError("Invalid request. file: only video/mp4 and video/webm are allowed")
        data = await upload.read(MAX_REFERENCE_BYTES + 1)
        if len(data) > MAX_REFERENCE_BYTES:
            raise UploadValidationError("Invalid request. file: exceeds the maximum size of 50 MB")
        if not data:
            raise UploadValidationError("Invalid request. file: must not be empty")
        if not _container_matches(mime, data):
            raise UploadValidationError("Invalid request. file: content does not match the declared video type")
        return data, mime
    finally:
        await form.close()


class ReferenceOut(BaseModel):
    id: UUID
    phrase_id: UUID
    video_url: str  # object path in the private bucket, not a public URL
    approved: bool | None
    signed_url: str | None
    signed_url_expires_in: int | None


@router.post("/phrases/{phrase_id}/references", response_model=ReferenceOut, status_code=201)
async def upload_reference(phrase_id: UUID, request: Request) -> ReferenceOut:
    data, mime = await _read_upload(request)

    open_db = request.app.state.open_db
    async with open_db() as db:
        repo = _repo(db)
        if await repo.get_phrase(phrase_id) is None:
            raise PhraseNotFound("Phrase not found")
        if await repo.has_approved_reference(phrase_id):
            raise Conflict(_CONFLICT)  # ADR-042 §6: never replace or unapprove silently

    storage = request.app.state.storage
    if storage is None:
        raise StorageError("Storage service unavailable")

    reference_id = uuid4()
    object_path = f"{phrase_id}/{reference_id}.{ALLOWED_MIME_TYPES[mime]}"  # server-generated only
    await storage.upload(object_path, data, mime)
    del data

    try:
        async with open_db() as db:
            row = await _repo(db).insert_approved_reference(
                reference_id=reference_id, phrase_id=phrase_id, video_url=object_path
            )
    except Exception as exc:
        try:  # ADR-042: do not leave an orphan object behind
            await storage.delete(object_path)
        except Exception:
            pass
        if isinstance(exc, UniqueViolation):  # concurrent approved upload won the race
            raise Conflict(_CONFLICT) from None
        raise

    try:
        signed = await storage.signed_url(object_path, SIGNED_URL_TTL_S)
    except StorageError:
        signed = None  # reference is stored; a signed URL can be requested again later
    return ReferenceOut(
        id=row.id,
        phrase_id=row.phrase_id,
        video_url=row.video_url,
        approved=row.approved,
        signed_url=signed,
        signed_url_expires_in=SIGNED_URL_TTL_S if signed else None,
    )


# ---- staff management (ADR-047 D3, D4; ADR-048; Tahap 4) --------------------------------------
#
# Both endpoints run the router-level `require_admin` (ADR-039) AND `require_institution_admin`
# (JWT role admin + own active staff profile). The institution always comes from the caller's
# profile; the body cannot carry `institution_id` (extra="forbid" → 422).
#
# POST flow: validate → NIP/username conflict check → Supabase Auth Admin create user
# (email_confirm, app_metadata.role) → insert staff_profiles. If the insert fails, the just-
# created auth user is deleted again (best effort) so no orphan staff-role account remains.

# Pragmatic shape check only (no new dependency): one "@", no whitespace, dotted domain.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _non_blank(v: str | None, name: str) -> str | None:
    if v is not None and not v.strip():
        raise ValueError(f"{name} must not be blank")
    return v


class StaffCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: StrictStr = Field(min_length=3, max_length=320)
    password: StrictStr = Field(min_length=8, max_length=1024)
    full_name: StrictStr = Field(min_length=1)
    nip: StrictStr | None = Field(default=None, min_length=1, max_length=50)  # staff_profiles varchar(50)
    username: StrictStr | None = Field(default=None, min_length=1, max_length=50)
    role: Literal["admin", "petugas"]
    unit_kerja: StrictStr = Field(min_length=1)
    job_title: StrictStr = Field(min_length=1)
    shift_schedule: StrictStr | None = None

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        if not _EMAIL_RE.match(v):
            raise ValueError("email must be a valid email address")
        return v

    @field_validator("full_name", "unit_kerja", "job_title", "shift_schedule")
    @classmethod
    def _text(cls, v: str | None, info) -> str | None:
        return _non_blank(v, info.field_name)

    @field_validator("nip", "username")
    @classmethod
    def _login_identifier(cls, v: str | None, info) -> str | None:
        _non_blank(v, info.field_name)
        if v is not None and ("@" in v or v != v.strip()):
            # "@" would make the login resolver treat it as an email (ADR-047 D5).
            raise ValueError(f"{info.field_name} must not contain '@' or surrounding whitespace")
        return v

    def login_identifiers(self) -> list[str]:
        return sorted({v for v in (self.nip, self.username) if v is not None})


class StaffOut(BaseModel):
    id: UUID
    institution_id: UUID
    full_name: str
    role: str
    nip: str | None
    username: str | None
    unit_kerja: str
    job_title: str
    shift_schedule: str | None
    active: bool
    created_at: datetime


def _staff_repo(db) -> StaffRepository:
    if db.staff is None:  # misconfigured DB bundle → generic 500 INTERNAL_ERROR
        raise RuntimeError("staff repository missing")
    return db.staff


@router.post("/staff", response_model=StaffOut, status_code=201)
async def create_staff(
    body: StaffCreate, request: Request, principal: StaffPrincipal = Depends(require_institution_admin)
) -> StaffOut:
    provisioning = getattr(request.app.state, "auth_admin", None)
    if provisioning is None:
        raise AuthUnavailable("Authentication service unavailable")

    open_db = request.app.state.open_db
    async with open_db() as db:
        if await _staff_repo(db).login_identifiers_taken(body.login_identifiers()):
            raise Conflict(_CONFLICT)

    user_id = await provisioning.create_user(email=body.email, password=body.password, role=body.role)

    try:
        async with open_db() as db:
            row = await _staff_repo(db).create_profile(
                staff_id=user_id,
                institution_id=principal.institution_id,  # never from the request (ADR-047 D3)
                full_name=body.full_name,
                role=body.role,  # DB mirror of app_metadata.role (ADR-047 D2)
                nip=body.nip,
                username=body.username,
                unit_kerja=body.unit_kerja,
                job_title=body.job_title,
                shift_schedule=body.shift_schedule,
            )
    except Exception as exc:
        try:  # roll back the auth user created above
            await provisioning.delete_user(user_id)
        except Exception:
            pass
        if isinstance(exc, UniqueViolation):  # concurrent request took the NIP/username
            raise Conflict(_CONFLICT) from None
        raise
    return StaffOut(**vars(row))


@router.get("/staff", response_model=Page[StaffOut])
async def list_staff(
    request: Request,
    q: Annotated[PageQuery, Query()],
    principal: StaffPrincipal = Depends(require_institution_admin),
) -> Page[StaffOut]:
    async with request.app.state.open_db() as db:
        rows, total = await _staff_repo(db).list_by_institution(
            principal.institution_id, limit=q.page_size, offset=q.offset  # caller's own institution only
        )
    return Page[StaffOut](
        items=[StaffOut(**vars(r)) for r in rows], page=q.page, page_size=q.page_size, total=total
    )
