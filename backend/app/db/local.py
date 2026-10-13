"""In-memory database for local development (LOCAL_DEV_DB=1).

Lets the kiosk run end-to-end (FE → /api/match/sign → Modeling) without Supabase.
Data comes from the same seed migrations as production (Database/migrations), so
phrase ids, texts and categories match the real vocabulary. Nothing is persisted:
matching_logs live in process memory and disappear on restart.

Only the repositories the public kiosk endpoints need are provided (devices, phrases,
logs). Staff/admin/kiosk-ops repositories are None, so login & dashboard endpoints
still require a real database. Never enable this in production.
"""
from __future__ import annotations

import re
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from app.db.devices import DeviceRecord
from app.db.phrases import ActivePhrase
from app.db.session import RequestDb
from app.matching.sign import PhraseRecord

# Fixed id so the frontend can hard-code it in .env.local (VITE_DEVICE_ID).
LOCAL_DEVICE_ID = UUID("00000000-0000-4000-8000-00000000d001")

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "Database" / "migrations"
SEED_FILES = (
    "20260929000000_phase3_seed_sign_vocabulary.sql",
    "20260930000000_adr045_seed_32_label_vocabulary.sql",
    "20261006000000_adr049_seed_43_label_vocabulary.sql",
)
# ('label_10', 'Terima kasih', 'Fallback', true, true)
_ROW = re.compile(r"\(\s*'(label_\d+)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'(\w+)'\s*,\s*(true|false)\s*,\s*(true|false)\s*\)")
_NS = UUID("6f1d3c2a-8a0e-4c39-9d43-0d5e0c1a7b10")


@dataclass(frozen=True)
class LoggedEvent:
    device_id: UUID
    direction: str
    predicted_phrase_id: UUID | None
    confidence: float
    resulted_action: str
    created_at: datetime


def load_seed_phrases(migrations_dir: Path = MIGRATIONS_DIR) -> list[PhraseRecord]:
    rows: dict[str, PhraseRecord] = {}
    for name in SEED_FILES:
        sql = (migrations_dir / name).read_text(encoding="utf-8")
        for mpid, text, _cat, active, recog in _ROW.findall(sql):
            rows.setdefault(mpid, PhraseRecord(
                id=uuid.uuid5(_NS, mpid),  # stable across restarts
                model_phrase_id=mpid,
                phrase_text=text.replace("''", "'"),
                active=active == "true",
                sign_recognizable=recog == "true",
            ))
    return list(rows.values())


def _categories(migrations_dir: Path = MIGRATIONS_DIR) -> dict[str, str]:
    out: dict[str, str] = {}
    for name in SEED_FILES:
        for mpid, _t, cat, _a, _r in _ROW.findall((migrations_dir / name).read_text(encoding="utf-8")):
            out.setdefault(mpid, cat)
    return out


@dataclass
class LocalStore:
    phrases: list[PhraseRecord]
    categories: dict[str, str]
    devices: dict[UUID, DeviceRecord] = field(default_factory=lambda: {LOCAL_DEVICE_ID: DeviceRecord(LOCAL_DEVICE_ID, True)})
    logs: list[LoggedEvent] = field(default_factory=list)

    @classmethod
    def from_migrations(cls, migrations_dir: Path = MIGRATIONS_DIR) -> "LocalStore":
        return cls(phrases=load_seed_phrases(migrations_dir), categories=_categories(migrations_dir))


class _Devices:
    def __init__(self, store: LocalStore) -> None:
        self._s = store

    async def find_by_id(self, device_id: UUID) -> DeviceRecord | None:
        return self._s.devices.get(device_id)


class _Phrases:
    def __init__(self, store: LocalStore) -> None:
        self._s = store

    async def find_by_model_phrase_id(self, model_phrase_id: str) -> PhraseRecord | None:
        return next((p for p in self._s.phrases if p.model_phrase_id == model_phrase_id), None)

    async def exists_by_id(self, phrase_id: UUID) -> bool:
        return any(p.id == phrase_id for p in self._s.phrases)

    async def list_active(self) -> list[ActivePhrase]:
        return [
            ActivePhrase(id=p.id, phrase_text=p.phrase_text, category=self._s.categories.get(p.model_phrase_id or "", "Fallback"))
            for p in self._s.phrases
            if p.active is True
        ]


class _Logs:
    def __init__(self, store: LocalStore) -> None:
        self._s = store

    async def insert(self, *, device_id, direction, predicted_phrase_id, confidence, resulted_action) -> None:
        self._s.logs.append(LoggedEvent(device_id, direction, predicted_phrase_id, float(confidence),
                                        resulted_action, datetime.now(timezone.utc)))
        del self._s.logs[:-500]  # bounded


def make_open_local(store: LocalStore | None = None):
    store = store or LocalStore.from_migrations()

    @asynccontextmanager
    async def open_local() -> AsyncIterator[RequestDb]:
        yield RequestDb(devices=_Devices(store), phrases=_Phrases(store), logs=_Logs(store))

    open_local.store = store  # type: ignore[attr-defined]
    return open_local
