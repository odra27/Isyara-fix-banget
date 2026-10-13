"""Per-request database access (approved Phase 3 lifecycle).

One connection is opened when a request needs the database and closed when the
request is done. No pool, no shared connection. The DSN is read from DATABASE_URL.
"""
from __future__ import annotations

import os
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass

from app.db.admin import AdminRepository, PostgresAdminRepository
from app.db.chat import ChatRepository, PostgresChatRepository
from app.db.devices import DeviceLookup, PostgresDeviceLookup
from app.db.kiosk import KioskRepository, PostgresKioskRepository
from app.db.logs import MatchingLogWriter, PostgresMatchingLogWriter
from app.db.phrases import PhraseRepository, PostgresPhraseLookup, connect
from app.db.staff import PostgresStaffRepository, StaffRepository
from app.db.students import PostgresStudentRepository, StudentRepository


@dataclass(frozen=True)
class RequestDb:
    devices: DeviceLookup
    phrases: PhraseRepository
    logs: MatchingLogWriter
    admin: AdminRepository | None = None  # admin API only (ADR-040..043)
    staff: StaffRepository | None = None  # staff auth / login only (ADR-047)
    kiosk: KioskRepository | None = None  # kiosk operations (ADR-047 D7–D9)
    students: StudentRepository | None = None  # student login / profile (ADR-051 D2)
    chat: ChatRepository | None = None  # chatbot history (ADR-051 D4)


OpenDb = Callable[[], AbstractAsyncContextManager[RequestDb]]


@asynccontextmanager
async def open_postgres() -> AsyncIterator[RequestDb]:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    conn = await connect(url)
    try:
        yield RequestDb(
            devices=PostgresDeviceLookup(conn),
            phrases=PostgresPhraseLookup(conn),
            logs=PostgresMatchingLogWriter(conn),
            admin=PostgresAdminRepository(conn),
            staff=PostgresStaffRepository(conn),
            kiosk=PostgresKioskRepository(conn),
            students=PostgresStudentRepository(conn),
            chat=PostgresChatRepository(conn),
        )
    finally:
        await conn.close()
