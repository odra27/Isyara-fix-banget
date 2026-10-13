"""Kiosk operations & staff session endpoints (ADR-047 D3, D6–D9; ADR-048; Tahap 5).

POST /api/devices/{device_id}/heartbeat  public (kiosk has no login, ADR-047 D7 / decision H)
    UUID path → device exists (404 DEVICE_NOT_FOUND) → active (403 DEVICE_INACTIVE)
    → last_heartbeat_at = now() → 204.
GET  /api/devices/{device_id}/status     require_staff, caller's institution only
    computed status: online iff now - last_heartbeat_at < 90 s (ADR-047 D8).
POST /api/kiosk/call-jbi                 require_staff, device must be in caller's institution
    → jbi_dispatches row + matching_logs audit row (one transaction) → 201.
GET  /api/kiosk/queue/current            require_staff, device in caller's institution
    ephemeral demo queue token (ADR-047 D6): computed from today's date (WIB), nothing stored.
GET  /api/staff/logs                     require_staff, logs of devices in caller's institution.

A device of another institution answers exactly like a missing device (404
DEVICE_NOT_FOUND), so its existence is not revealed. `institution_id` is never accepted
from the request (ADR-047 D3).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictStr

from app.api.admin import Page, PageQuery
from app.auth.staff import StaffPrincipal, require_staff
from app.db.kiosk import KioskDevice, KioskRepository
from app.errors import DeviceInactive, DeviceNotFound

router = APIRouter()

WIB = timezone(timedelta(hours=7))  # Puskesmas local time for the demo queue date

_NOT_FOUND = "Device not found"
_INACTIVE = "Device is not active"


def _kiosk(db) -> KioskRepository:
    if db.kiosk is None:  # misconfigured DB bundle → generic 500 INTERNAL_ERROR
        raise RuntimeError("kiosk repository missing")
    return db.kiosk


def _own_device(device: KioskDevice | None, principal: StaffPrincipal) -> KioskDevice:
    if device is None or device.institution_id != principal.institution_id:
        raise DeviceNotFound(_NOT_FOUND)
    return device


# ---- heartbeat & status (ADR-047 D8) ----------------------------------------------------------

@router.post("/api/devices/{device_id}/heartbeat", status_code=204, response_class=Response)
async def heartbeat(device_id: UUID, request: Request) -> Response:
    async with request.app.state.open_db() as db:
        repo = _kiosk(db)
        device = await repo.get_device(device_id)
        if device is None:
            raise DeviceNotFound(_NOT_FOUND)
        if device.active is not True:
            raise DeviceInactive(_INACTIVE)
        await repo.record_heartbeat(device_id)
    return Response(status_code=204)


class DeviceStatusOut(BaseModel):
    device_id: UUID
    status: Literal["online", "offline"]
    last_heartbeat_at: datetime | None


@router.get("/api/devices/{device_id}/status", response_model=DeviceStatusOut)
async def device_status(
    device_id: UUID, request: Request, principal: StaffPrincipal = Depends(require_staff)
) -> DeviceStatusOut:
    async with request.app.state.open_db() as db:
        device = _own_device(await _kiosk(db).get_device(device_id), principal)
    return DeviceStatusOut(
        device_id=device.id,
        status="online" if device.online else "offline",
        last_heartbeat_at=device.last_heartbeat_at,
    )


# ---- JBI call (ADR-047 D9) --------------------------------------------------------------------

class CallJbiRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device_id: UUID
    notes: StrictStr | None = Field(default=None, max_length=500)


class JbiDispatchOut(BaseModel):
    id: UUID
    institution_id: UUID
    device_id: UUID
    staff_id: UUID
    notes: str | None
    status: str
    created_at: datetime


@router.post("/api/kiosk/call-jbi", response_model=JbiDispatchOut, status_code=201)
async def call_jbi(
    body: CallJbiRequest, request: Request, principal: StaffPrincipal = Depends(require_staff)
) -> JbiDispatchOut:
    async with request.app.state.open_db() as db:
        repo = _kiosk(db)
        device = _own_device(await repo.get_device(body.device_id), principal)
        if device.active is not True:
            raise DeviceInactive(_INACTIVE)
        row = await repo.create_jbi_dispatch(
            institution_id=principal.institution_id,
            device_id=device.id,
            staff_id=principal.user_id,
            notes=body.notes,
        )
    return JbiDispatchOut(**vars(row))


# ---- ephemeral demo queue (ADR-047 D6) --------------------------------------------------------

class QueueOut(BaseModel):
    device_id: UUID
    queue_number: str
    patient_identifier: str
    category: Literal["Pengunjung Baru"]


def today_wib() -> date:
    return datetime.now(WIB).date()


def demo_queue_token(device_id: UUID, today: date) -> QueueOut:
    """Deterministic demo token. No patient data exists or is stored: there is no queue
    state, so the current number is always the first of the day for this device."""
    seq = 1
    return QueueOut(
        device_id=device_id,
        queue_number=f"Pasien {seq:03d}",
        patient_identifier=f"{today:%Y%m%d}{seq:03d}",
        category="Pengunjung Baru",
    )


class QueueQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device_id: UUID


@router.get("/api/kiosk/queue/current", response_model=QueueOut)
async def current_queue(
    request: Request, q: Annotated[QueueQuery, Query()], principal: StaffPrincipal = Depends(require_staff)
) -> QueueOut:
    async with request.app.state.open_db() as db:
        device = _own_device(await _kiosk(db).get_device(q.device_id), principal)
    return demo_queue_token(device.id, today_wib())


# ---- staff logs -------------------------------------------------------------------------------

class StaffLogQuery(PageQuery):
    device_id: UUID | None = None
    resulted_action: Literal["accepted", "confirmed", "escalated_to_jbi"] | None = None


class StaffLogOut(BaseModel):
    id: UUID
    device_id: UUID
    direction: str
    predicted_phrase_id: UUID | None
    confidence: float
    resulted_action: str
    staff_id: UUID | None
    created_at: datetime


@router.get("/api/staff/logs", response_model=Page[StaffLogOut])
async def staff_logs(
    request: Request, q: Annotated[StaffLogQuery, Query()], principal: StaffPrincipal = Depends(require_staff)
) -> Page[StaffLogOut]:
    async with request.app.state.open_db() as db:
        rows, total = await _kiosk(db).list_staff_logs(
            principal.institution_id,
            device_id=q.device_id,
            resulted_action=q.resulted_action,
            limit=q.page_size,
            offset=q.offset,
        )
    items = [StaffLogOut(**{**vars(r), "confidence": float(r.confidence)}) for r in rows]
    return Page[StaffLogOut](items=items, page=q.page, page_size=q.page_size, total=total)
