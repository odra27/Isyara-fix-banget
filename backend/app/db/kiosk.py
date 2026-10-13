"""Kiosk operations data access (ADR-047 D7, D8, D9; ADR-048). psycopg 3, parameterized SQL.

* Heartbeat: `devices.last_heartbeat_at = now()` (database clock).
* Status is computed, never stored (ADR-047 D8): online iff `now() - last_heartbeat_at < 90 s`,
  evaluated by the database, so heartbeat writes and status reads use the same clock.
* JBI call: one `jbi_dispatches` row and one `matching_logs` audit row, in ONE transaction.
* Staff logs: `matching_logs` joined to `devices` and filtered by the caller's institution.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol
from uuid import UUID

from psycopg import AsyncConnection

ONLINE_WINDOW_S = 90  # ADR-047 D8

_LOG_COLS = "l.id, l.device_id, l.direction, l.predicted_phrase_id, l.confidence, l.resulted_action, l.staff_id, l.created_at"
_DISPATCH_COLS = "id, institution_id, device_id, staff_id, notes, status, created_at"


@dataclass(frozen=True)
class KioskDevice:
    id: UUID
    institution_id: UUID
    active: bool | None
    last_heartbeat_at: datetime | None
    online: bool


@dataclass(frozen=True)
class JbiDispatch:
    id: UUID
    institution_id: UUID
    device_id: UUID
    staff_id: UUID
    notes: str | None
    status: str
    created_at: datetime


@dataclass(frozen=True)
class StaffLog:
    id: UUID
    device_id: UUID
    direction: str
    predicted_phrase_id: UUID | None
    confidence: Decimal
    resulted_action: str
    staff_id: UUID | None
    created_at: datetime


class KioskRepository(Protocol):
    async def get_device(self, device_id: UUID) -> KioskDevice | None: ...
    async def record_heartbeat(self, device_id: UUID) -> None: ...
    async def create_jbi_dispatch(self, *, institution_id: UUID, device_id: UUID, staff_id: UUID,
                                  notes: str | None) -> JbiDispatch: ...
    async def list_staff_logs(self, institution_id: UUID, *, device_id: UUID | None, resulted_action: str | None,
                              limit: int, offset: int) -> tuple[list[StaffLog], int]: ...


class PostgresKioskRepository:
    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def get_device(self, device_id: UUID) -> KioskDevice | None:
        async with self._conn.cursor() as cur:
            await cur.execute(
                "select id, institution_id, active, last_heartbeat_at,"
                " coalesce(now() - last_heartbeat_at < make_interval(secs => %s), false)"
                " from devices where id = %s",
                (ONLINE_WINDOW_S, device_id),
            )
            row = await cur.fetchone()
        return KioskDevice(*row) if row else None

    async def record_heartbeat(self, device_id: UUID) -> None:
        async with self._conn.cursor() as cur:
            await cur.execute("update devices set last_heartbeat_at = now() where id = %s", (device_id,))

    async def create_jbi_dispatch(self, *, institution_id: UUID, device_id: UUID, staff_id: UUID,
                                  notes: str | None) -> JbiDispatch:
        async with self._conn.transaction():
            async with self._conn.cursor() as cur:
                await cur.execute(
                    "insert into jbi_dispatches (institution_id, device_id, staff_id, notes, status)"
                    f" values (%s, %s, %s, %s, 'requested') returning {_DISPATCH_COLS}",
                    (institution_id, device_id, staff_id, notes),
                )
                dispatch = JbiDispatch(*(await cur.fetchone()))
                # Audit row (ADR-047 D9). Metadata only: notes are never copied into the log.
                await cur.execute(
                    "insert into matching_logs (device_id, direction, predicted_phrase_id, confidence,"
                    " resulted_action, staff_id) values (%s, 'speech_to_sign', null, 0.0, 'escalated_to_jbi', %s)",
                    (device_id, staff_id),
                )
        return dispatch

    async def list_staff_logs(self, institution_id: UUID, *, device_id: UUID | None, resulted_action: str | None,
                              limit: int, offset: int) -> tuple[list[StaffLog], int]:
        clauses = ["d.institution_id = %s"]
        params: list = [institution_id]
        if device_id is not None:
            clauses.append("l.device_id = %s")
            params.append(device_id)
        if resulted_action is not None:
            clauses.append("l.resulted_action = %s")
            params.append(resulted_action)
        where = " where " + " and ".join(clauses)
        base = "from matching_logs l join devices d on d.id = l.device_id"
        async with self._conn.cursor() as cur:
            await cur.execute(f"select count(*) {base}{where}", tuple(params))
            total = (await cur.fetchone())[0]
            await cur.execute(
                f"select {_LOG_COLS} {base}{where} order by l.created_at desc, l.id desc limit %s offset %s",
                (*params, limit, offset),
            )
            rows = await cur.fetchall()
        return [StaffLog(*r) for r in rows], int(total)
