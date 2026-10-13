"""Staff profile data access (ADR-047, ADR-048). psycopg 3, parameterized SQL, read-only.

* `get_profile` loads the caller's own profile joined with its institution (ADR-047 D2, D3).
* `find_login_targets` resolves a login identifier to staff accounts (ADR-047 D5):
  an identifier containing "@" is an email, matched case-insensitively against
  `auth.users.email`; anything else is matched exactly against `staff_profiles.nip`
  or `staff_profiles.username`. All matches are returned; the caller treats anything
  other than exactly one match as a credential failure.
* `staff_profiles.role` is returned only as the DB mirror; authorization never uses it.
* Admin staff management (Tahap 4): identifier conflict check, profile insert, and an
  institution-scoped list (ADR-047 D3; ADR-040 pagination/order).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from psycopg import AsyncConnection

_PROFILE_COLS = (
    "s.id, s.institution_id, i.name, s.nip, s.username, s.full_name, s.role, s.unit_kerja,"
    " s.job_title, s.shift_schedule, s.avatar_url, s.active"
)
_FROM = "from staff_profiles s join institutions i on i.id = s.institution_id"


@dataclass(frozen=True)
class StaffProfile:
    id: UUID
    institution_id: UUID
    institution_name: str
    nip: str | None
    username: str | None
    full_name: str
    role: str  # DB mirror of app_metadata.role (ADR-047 D2); never used for authorization
    unit_kerja: str
    job_title: str
    shift_schedule: str | None
    avatar_url: str | None
    active: bool


@dataclass(frozen=True)
class LoginTarget:
    email: str | None
    profile: StaffProfile


def is_email_identifier(identifier: str) -> bool:
    return "@" in identifier


@dataclass(frozen=True)
class AdminStaff:
    """Staff row as returned by the admin staff API (no email, no avatar, no secrets)."""

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


_ADMIN_STAFF_COLS = (
    "id, institution_id, full_name, role, nip, username, unit_kerja, job_title, shift_schedule, active, created_at"
)


class StaffRepository(Protocol):
    async def get_profile(self, staff_id: UUID) -> StaffProfile | None: ...
    async def find_login_targets(self, identifier: str) -> list[LoginTarget]: ...
    async def login_identifiers_taken(self, values: list[str]) -> bool: ...
    async def create_profile(self, *, staff_id: UUID, institution_id: UUID, full_name: str, role: str,
                             nip: str | None, username: str | None, unit_kerja: str, job_title: str,
                             shift_schedule: str | None) -> AdminStaff: ...
    async def list_by_institution(self, institution_id: UUID, *, limit: int,
                                  offset: int) -> tuple[list[AdminStaff], int]: ...


class PostgresStaffRepository:
    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def get_profile(self, staff_id: UUID) -> StaffProfile | None:
        async with self._conn.cursor() as cur:
            await cur.execute(f"select {_PROFILE_COLS} {_FROM} where s.id = %s", (staff_id,))
            row = await cur.fetchone()
        return StaffProfile(*row) if row else None

    async def find_login_targets(self, identifier: str) -> list[LoginTarget]:
        base = f"select u.email, {_PROFILE_COLS} {_FROM} join auth.users u on u.id = s.id"
        async with self._conn.cursor() as cur:
            if is_email_identifier(identifier):
                await cur.execute(f"{base} where lower(u.email) = lower(%s) limit 2", (identifier,))
            else:
                await cur.execute(f"{base} where s.nip = %s or s.username = %s limit 2", (identifier, identifier))
            rows = await cur.fetchall()
        return [LoginTarget(email=r[0], profile=StaffProfile(*r[1:])) for r in rows]

    # ---- admin staff management --------------------------------------------------------------
    async def login_identifiers_taken(self, values: list[str]) -> bool:
        """True if any value is already used as a NIP or a username (by anyone, any institution).

        Checked across both columns so a new NIP can never equal an existing username (or
        vice versa), which would make the login resolver ambiguous (ADR-047 D5).
        """
        if not values:
            return False
        async with self._conn.cursor() as cur:
            await cur.execute(
                "select 1 from staff_profiles where nip = any(%s) or username = any(%s) limit 1", (values, values)
            )
            return await cur.fetchone() is not None

    async def create_profile(self, *, staff_id: UUID, institution_id: UUID, full_name: str, role: str,
                             nip: str | None, username: str | None, unit_kerja: str, job_title: str,
                             shift_schedule: str | None) -> AdminStaff:
        # active / created_at: schema defaults (true / now()). UniqueViolation propagates (→ 409).
        async with self._conn.cursor() as cur:
            await cur.execute(
                "insert into staff_profiles (id, institution_id, full_name, role, nip, username, unit_kerja,"
                f" job_title, shift_schedule) values (%s, %s, %s, %s, %s, %s, %s, %s, %s) returning {_ADMIN_STAFF_COLS}",
                (staff_id, institution_id, full_name, role, nip, username, unit_kerja, job_title, shift_schedule),
            )
            return AdminStaff(*(await cur.fetchone()))

    async def list_by_institution(self, institution_id: UUID, *, limit: int,
                                  offset: int) -> tuple[list[AdminStaff], int]:
        # ADR-040 §8: fixed ordering full_name, then id.
        async with self._conn.cursor() as cur:
            await cur.execute("select count(*) from staff_profiles where institution_id = %s", (institution_id,))
            total = (await cur.fetchone())[0]
            await cur.execute(
                f"select {_ADMIN_STAFF_COLS} from staff_profiles where institution_id = %s"
                " order by full_name asc, id asc limit %s offset %s",
                (institution_id, limit, offset),
            )
            rows = await cur.fetchall()
        return [AdminStaff(*r) for r in rows], int(total)
