"""Helpers for route-level tests: fake Modeling (no ONNX) and in-memory DB."""
from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import UUID

from fastapi.testclient import TestClient

from app.db.devices import DeviceRecord
from app.db.session import RequestDb
from app.main import create_app
from app.modeling.client import LibraryModelingClient
from tests.fixtures import default_lookup, modeling_result, sequence_payload
from tests.test_modeling_client import FakePredictor

ACTIVE_DEVICE = UUID("00000000-0000-0000-0000-00000000d001")
INACTIVE_DEVICE = UUID("00000000-0000-0000-0000-00000000d002")
UNKNOWN_DEVICE = UUID("00000000-0000-0000-0000-00000000d999")


class InMemoryDevices:
    def __init__(self, rows: dict[UUID, bool | None]) -> None:
        self._rows = rows
        self.calls: list[UUID] = []

    async def find_by_id(self, device_id: UUID) -> DeviceRecord | None:
        self.calls.append(device_id)
        return DeviceRecord(id=device_id, active=self._rows[device_id]) if device_id in self._rows else None


class FakeLogs:
    """Records matching_logs inserts; optionally fails every insert."""

    def __init__(self, fail: Exception | None = None) -> None:
        self.rows: list[dict] = []
        self.fail = fail
        self.attempts = 0

    async def insert(self, **row) -> None:
        self.attempts += 1
        if self.fail:
            raise self.fail
        self.rows.append(row)


class FakeDb:
    def __init__(self, *, phrases=None, devices=None, logs=None, fail: Exception | None = None) -> None:
        self.phrases = phrases or default_lookup()
        self.devices = devices or InMemoryDevices({ACTIVE_DEVICE: True, INACTIVE_DEVICE: False})
        self.logs = logs or FakeLogs()
        self.fail = fail
        self.opened = 0
        self.closed = 0

    @asynccontextmanager
    async def open(self):
        if self.fail:
            raise self.fail
        self.opened += 1
        try:
            yield RequestDb(devices=self.devices, phrases=self.phrases, logs=self.logs)
        finally:
            self.closed += 1


def body(*, device_id=ACTIVE_DEVICE, n_frames=12, duration_ms=1200) -> dict:
    return {"device_id": str(device_id), "sequence": sequence_payload(n_frames), "duration_ms": duration_ms}


def client_for(predictor: FakePredictor | None = None, *, db: FakeDb | None = None, timeout_s: float = 3.0,
               modeling_factory=None):
    predictor = predictor if predictor is not None else FakePredictor(modeling_result())
    db = db or FakeDb()
    factory = modeling_factory or (lambda: LibraryModelingClient(predictor, timeout_s=timeout_s))
    app = create_app(modeling_factory=factory, open_db=db.open)
    return TestClient(app, raise_server_exceptions=False), predictor, db
