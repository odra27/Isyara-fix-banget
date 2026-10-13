"""Student profile data access (ADR-051 D2). psycopg 3, parameterized SQL, read-only.

* `get_profile` loads the caller's own profile joined with its institution.
* `find_login_targets` resolves a NIS (exact match after trimming) to student accounts
  plus the Supabase Auth email used for the password grant. The caller treats anything
  other than exactly one match as a credential failure.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from psycopg import AsyncConnection

_COLS = (
    "s.id, s.institution_id, i.name, s.nis, s.full_name, s.class_name, s.grade, s.avatar_url, s.active"
)
_FROM = "from student_profiles s join institutions i on i.id = s.institution_id"


@dataclass(frozen=True)
class StudentProfile:
    id: UUID
    institution_id: UUID
    institution_name: str
    nis: str
    full_name: str
    class_name: str | None
    grade: int | None
    avatar_url: str | None
    active: bool


@dataclass(frozen=True)
class StudentLoginTarget:
    email: str | None
    profile: StudentProfile


class StudentRepository(Protocol):
    async def get_profile(self, student_id: UUID) -> StudentProfile | None: ...
    async def find_login_targets(self, nis: str) -> list[StudentLoginTarget]: ...


class PostgresStudentRepository:
    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def get_profile(self, student_id: UUID) -> StudentProfile | None:
        async with self._conn.cursor() as cur:
            await cur.execute(f"select {_COLS} {_FROM} where s.id = %s", (student_id,))
            row = await cur.fetchone()
        return StudentProfile(*row) if row else None

    async def find_login_targets(self, nis: str) -> list[StudentLoginTarget]:
        async with self._conn.cursor() as cur:
            await cur.execute(
                f"select u.email, {_COLS} {_FROM} join auth.users u on u.id = s.id where s.nis = %s limit 2",
                (nis,),
            )
            rows = await cur.fetchall()
        return [StudentLoginTarget(email=r[0], profile=StudentProfile(*r[1:])) for r in rows]
