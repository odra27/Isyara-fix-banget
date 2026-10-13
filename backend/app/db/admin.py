"""Admin data access (ADR-040, ADR-041, ADR-043). psycopg 3, parameterized SQL, no ORM.

* Ordering is fixed server-side (no client sorting): phrases `phrase_text, id`;
  logs `created_at desc, id desc`; devices `label, id`.
* Every list returns (rows, total) with the same WHERE clause.
* Filter SQL is built only from fixed column names; values are always parameters.
* Phrase writes touch only `phrase_text`, `category`, `active`. `model_phrase_id`,
  `sign_recognizable` and `language_variant` are never written here (ADR-041).
* Database exceptions propagate; the route layer maps UniqueViolation → 409.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Protocol
from uuid import UUID

from psycopg import AsyncConnection

_PHRASE_COLS = "id, phrase_text, category, language_variant, active, model_phrase_id, sign_recognizable"
_LOG_COLS = "id, device_id, direction, predicted_phrase_id, confidence, resulted_action, created_at"
_DEVICE_COLS = "id, institution_id, label, active"

# Only these phrase columns may ever be written by admin (ADR-041 §2, §3, §5).
WRITABLE_PHRASE_FIELDS = ("phrase_text", "category", "active")


@dataclass(frozen=True)
class AdminPhrase:
    id: UUID
    phrase_text: str
    category: str
    language_variant: str
    active: bool | None
    model_phrase_id: str | None
    sign_recognizable: bool | None


@dataclass(frozen=True)
class AdminLog:
    id: UUID
    device_id: UUID
    direction: str
    predicted_phrase_id: UUID | None
    confidence: Decimal
    resulted_action: str
    created_at: datetime


@dataclass(frozen=True)
class AdminDevice:
    id: UUID
    institution_id: UUID
    label: str
    active: bool | None


@dataclass(frozen=True)
class AdminReference:
    id: UUID
    phrase_id: UUID
    video_url: str  # Storage object path inside the private bucket (ADR-042 §8)
    approved: bool | None


@dataclass(frozen=True)
class LogFilters:
    device_id: UUID | None = None
    predicted_phrase_id: UUID | None = None
    resulted_action: str | None = None
    direction: str | None = None
    created_from: datetime | None = None  # inclusive
    created_to: datetime | None = None  # inclusive


class AdminRepository(Protocol):
    async def list_phrases(self, *, limit: int, offset: int) -> tuple[list[AdminPhrase], int]: ...
    async def get_phrase(self, phrase_id: UUID) -> AdminPhrase | None: ...
    async def phrase_text_taken(self, phrase_text: str, *, exclude_id: UUID | None = None) -> bool: ...
    async def create_phrase(self, *, phrase_text: str, category: str, active: bool | None) -> AdminPhrase: ...
    async def update_phrase(self, phrase_id: UUID, changes: dict[str, Any]) -> AdminPhrase | None: ...
    async def list_logs(self, filters: LogFilters, *, limit: int, offset: int) -> tuple[list[AdminLog], int]: ...
    async def list_devices(self, *, limit: int, offset: int) -> tuple[list[AdminDevice], int]: ...
    async def has_approved_reference(self, phrase_id: UUID) -> bool: ...
    async def insert_approved_reference(self, *, reference_id: UUID, phrase_id: UUID, video_url: str) -> AdminReference: ...


class PostgresAdminRepository:
    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def _page(self, sql: str, count_sql: str, params: tuple, limit: int, offset: int):
        async with self._conn.cursor() as cur:
            await cur.execute(count_sql, params)
            total = (await cur.fetchone())[0]
            await cur.execute(sql + " limit %s offset %s", (*params, limit, offset))
            rows = await cur.fetchall()
        return rows, int(total)

    # ---- phrases ----------------------------------------------------------------------------
    async def list_phrases(self, *, limit: int, offset: int) -> tuple[list[AdminPhrase], int]:
        rows, total = await self._page(
            f"select {_PHRASE_COLS} from phrases order by phrase_text asc, id asc",
            "select count(*) from phrases",
            (),
            limit,
            offset,
        )
        return [AdminPhrase(*r) for r in rows], total

    async def get_phrase(self, phrase_id: UUID) -> AdminPhrase | None:
        async with self._conn.cursor() as cur:
            await cur.execute(f"select {_PHRASE_COLS} from phrases where id = %s", (phrase_id,))
            row = await cur.fetchone()
        return AdminPhrase(*row) if row else None

    async def phrase_text_taken(self, phrase_text: str, *, exclude_id: UUID | None = None) -> bool:
        async with self._conn.cursor() as cur:
            if exclude_id is None:
                await cur.execute("select 1 from phrases where phrase_text = %s limit 1", (phrase_text,))
            else:
                await cur.execute(
                    "select 1 from phrases where phrase_text = %s and id <> %s limit 1", (phrase_text, exclude_id)
                )
            return await cur.fetchone() is not None

    async def create_phrase(self, *, phrase_text: str, category: str, active: bool | None) -> AdminPhrase:
        async with self._conn.cursor() as cur:
            if active is None:  # omitted → schema default (active default true)
                await cur.execute(
                    f"insert into phrases (phrase_text, category) values (%s, %s) returning {_PHRASE_COLS}",
                    (phrase_text, category),
                )
            else:
                await cur.execute(
                    f"insert into phrases (phrase_text, category, active) values (%s, %s, %s) returning {_PHRASE_COLS}",
                    (phrase_text, category, active),
                )
            return AdminPhrase(*(await cur.fetchone()))

    async def update_phrase(self, phrase_id: UUID, changes: dict[str, Any]) -> AdminPhrase | None:
        cols = [c for c in WRITABLE_PHRASE_FIELDS if c in changes]
        if len(cols) != len(changes) or not cols:
            raise ValueError("only writable phrase fields may be updated")
        assignments = ", ".join(f"{c} = %s" for c in cols)  # names from the fixed allowlist only
        async with self._conn.cursor() as cur:
            await cur.execute(
                f"update phrases set {assignments} where id = %s returning {_PHRASE_COLS}",
                (*[changes[c] for c in cols], phrase_id),
            )
            row = await cur.fetchone()
        return AdminPhrase(*row) if row else None

    # ---- logs -------------------------------------------------------------------------------
    async def list_logs(self, filters: LogFilters, *, limit: int, offset: int) -> tuple[list[AdminLog], int]:
        clauses: list[str] = []
        params: list[Any] = []
        for column in ("device_id", "predicted_phrase_id", "resulted_action", "direction"):
            value = getattr(filters, column)
            if value is not None:
                clauses.append(f"{column} = %s")
                params.append(value)
        if filters.created_from is not None:
            clauses.append("created_at >= %s")
            params.append(filters.created_from)
        if filters.created_to is not None:
            clauses.append("created_at <= %s")
            params.append(filters.created_to)
        where = (" where " + " and ".join(clauses)) if clauses else ""
        rows, total = await self._page(
            f"select {_LOG_COLS} from matching_logs{where} order by created_at desc, id desc",
            f"select count(*) from matching_logs{where}",
            tuple(params),
            limit,
            offset,
        )
        return [AdminLog(*r) for r in rows], total

    # ---- sign references (ADR-042) ------------------------------------------------------------
    async def has_approved_reference(self, phrase_id: UUID) -> bool:
        async with self._conn.cursor() as cur:
            await cur.execute(
                "select 1 from sign_references where phrase_id = %s and approved = true limit 1", (phrase_id,)
            )
            return await cur.fetchone() is not None

    async def insert_approved_reference(self, *, reference_id: UUID, phrase_id: UUID, video_url: str) -> AdminReference:
        # landmark_data and signer_id stay NULL (ADR-042 §12, §14). The partial unique index
        # rejects a second approved reference (UniqueViolation → 409 in the route).
        async with self._conn.cursor() as cur:
            await cur.execute(
                "insert into sign_references (id, phrase_id, video_url, approved) values (%s, %s, %s, true)"
                " returning id, phrase_id, video_url, approved",
                (reference_id, phrase_id, video_url),
            )
            return AdminReference(*(await cur.fetchone()))

    # ---- devices ----------------------------------------------------------------------------
    async def list_devices(self, *, limit: int, offset: int) -> tuple[list[AdminDevice], int]:
        rows, total = await self._page(
            f"select {_DEVICE_COLS} from devices order by label asc, id asc",
            "select count(*) from devices",
            (),
            limit,
            offset,
        )
        return [AdminDevice(*r) for r in rows], total
