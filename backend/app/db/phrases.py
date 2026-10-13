"""Phrase lookup by phrases.model_phrase_id (psycopg 3, parameterized SQL).

The adapter only reads. It does not commit, create phrases, or fall back to
matching by text/label. Database exceptions propagate unchanged; the API layer
maps unknown failures to INTERNAL_ERROR without exposing details.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from psycopg import AsyncConnection

from app.matching.sign import PhraseLookup, PhraseRecord

_FIND_BY_MODEL_PHRASE_ID = (
    "select id, model_phrase_id, phrase_text, active, sign_recognizable "
    "from phrases where model_phrase_id = %s"
)
# /api/logs FK check (ADR-038 §3): existence only, no active/sign_recognizable filter.
_EXISTS_BY_ID = "select 1 from phrases where id = %s"
# GET /api/phrases (PRD-BE §4.4): active = true only; sign_recognizable is independent
# (ADR-009) and not filtered. NULL active is excluded. No ordering is specified.
_LIST_ACTIVE = "select id, phrase_text, category from phrases where active = true"


@dataclass(frozen=True)
class ActivePhrase:
    id: UUID
    phrase_text: str
    category: str


class PhraseRepository(PhraseLookup, Protocol):
    async def exists_by_id(self, phrase_id: UUID) -> bool: ...

    async def list_active(self) -> list[ActivePhrase]: ...


async def connect(conninfo: str) -> AsyncConnection:
    """Open a connection suitable for Supabase.

    prepare_threshold=None disables server-side prepared statements, which the
    Supavisor transaction pooler does not support; it is harmless on direct or
    session-mode connections. autocommit=True: lookups are single read statements.
    """
    return await AsyncConnection.connect(conninfo, autocommit=True, prepare_threshold=None)


class PostgresPhraseLookup:
    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def find_by_model_phrase_id(self, model_phrase_id: str) -> PhraseRecord | None:
        async with self._conn.cursor() as cur:
            await cur.execute(_FIND_BY_MODEL_PHRASE_ID, (model_phrase_id,))
            row = await cur.fetchone()
        if row is None:
            return None
        pid, mpid, text, active, recognizable = row
        return PhraseRecord(
            id=pid,
            model_phrase_id=mpid,
            phrase_text=text,
            active=active,
            sign_recognizable=recognizable,
        )

    async def exists_by_id(self, phrase_id: UUID) -> bool:
        async with self._conn.cursor() as cur:
            await cur.execute(_EXISTS_BY_ID, (phrase_id,))
            return await cur.fetchone() is not None

    async def list_active(self) -> list[ActivePhrase]:
        async with self._conn.cursor() as cur:
            await cur.execute(_LIST_ACTIVE)
            rows = await cur.fetchall()
        return [ActivePhrase(id=i, phrase_text=t, category=c) for i, t, c in rows]
