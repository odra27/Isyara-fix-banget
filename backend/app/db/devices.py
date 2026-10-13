"""Device lookup by devices.id (psycopg 3, parameterized SQL, read-only).

Never creates devices (AGENTS §22). Database exceptions propagate unchanged.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from psycopg import AsyncConnection

_FIND_BY_ID = "select id, active from devices where id = %s"


@dataclass(frozen=True)
class DeviceRecord:
    id: UUID
    active: bool | None


class DeviceLookup(Protocol):
    async def find_by_id(self, device_id: UUID) -> DeviceRecord | None: ...


class PostgresDeviceLookup:
    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def find_by_id(self, device_id: UUID) -> DeviceRecord | None:
        async with self._conn.cursor() as cur:
            await cur.execute(_FIND_BY_ID, (device_id,))
            row = await cur.fetchone()
        return None if row is None else DeviceRecord(id=row[0], active=row[1])
