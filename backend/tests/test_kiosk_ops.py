"""Tahap 5 (ADR-047 D6–D9): heartbeat/status, call-jbi, demo queue, staff logs — fakes, no DB."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.api import kiosk as kiosk_api
from app.db.kiosk import ONLINE_WINDOW_S, JbiDispatch, KioskDevice, StaffLog
from app.db.session import RequestDb
from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.staff_support import INACTIVE, INST, PETUGAS, FakeStaffRepo, default_profiles, profile, staff_client, \
    staff_headers

INST_B = UUID("00000000-0000-0000-0000-00000000b001")
PETUGAS_B = UUID("00000000-0000-0000-0000-0000000005b2")
DEV_A = UUID("00000000-0000-0000-0000-0000000d0001")
DEV_A_OFF = UUID("00000000-0000-0000-0000-0000000d0002")
DEV_B = UUID("00000000-0000-0000-0000-0000000d00b1")
UNKNOWN = UUID("00000000-0000-0000-0000-0000000d0999")
T0 = datetime(2026, 10, 2, 8, 0, tzinfo=timezone.utc)


class FakeKiosk:
    """In-memory KioskRepository with a controllable clock (same 90 s rule as the SQL)."""

    def __init__(self) -> None:
        self.now = T0
        self.devices = {
            DEV_A: {"institution_id": INST, "active": True, "last": None},
            DEV_A_OFF: {"institution_id": INST, "active": False, "last": None},
            DEV_B: {"institution_id": INST_B, "active": True, "last": None},
        }
        self.dispatches: list[JbiDispatch] = []
        self.logs: list[StaffLog] = []
        self.fail_dispatch: Exception | None = None

    async def get_device(self, device_id):
        d = self.devices.get(device_id)
        if d is None:
            return None
        online = d["last"] is not None and self.now - d["last"] < timedelta(seconds=ONLINE_WINDOW_S)
        return KioskDevice(id=device_id, institution_id=d["institution_id"], active=d["active"],
                           last_heartbeat_at=d["last"], online=online)

    async def record_heartbeat(self, device_id):
        self.devices[device_id]["last"] = self.now

    async def create_jbi_dispatch(self, *, institution_id, device_id, staff_id, notes):
        if self.fail_dispatch:
            raise self.fail_dispatch
        row = JbiDispatch(id=uuid4(), institution_id=institution_id, device_id=device_id, staff_id=staff_id,
                          notes=notes, status="requested", created_at=self.now)
        self.dispatches.append(row)
        self.logs.append(StaffLog(id=uuid4(), device_id=device_id, direction="speech_to_sign",
                                  predicted_phrase_id=None, confidence=Decimal("0.0000"),
                                  resulted_action="escalated_to_jbi", staff_id=staff_id, created_at=self.now))
        return row

    async def list_staff_logs(self, institution_id, *, device_id, resulted_action, limit, offset):
        rows = [r for r in self.logs if self.devices[r.device_id]["institution_id"] == institution_id
                and (device_id is None or r.device_id == device_id)
                and (resulted_action is None or r.resulted_action == resulted_action)]
        rows.sort(key=lambda r: (r.created_at, str(r.id)), reverse=True)
        return rows[offset:offset + limit], len(rows)


class FakeDb:
    def __init__(self, kiosk: FakeKiosk, staff: FakeStaffRepo) -> None:
        self.kiosk, self.staff = kiosk, staff

    @asynccontextmanager
    async def open(self):
        yield RequestDb(devices=None, phrases=None, logs=None, staff=self.staff, kiosk=self.kiosk)


@pytest.fixture
def kiosk():
    return FakeKiosk()


@pytest.fixture
def client(admin_auth, kiosk):
    rows = default_profiles()
    rows[PETUGAS_B] = ("budi@x.test", replace(profile(PETUGAS_B, username="budi"), institution_id=INST_B))
    with staff_client(admin_auth, FakeDb(kiosk, FakeStaffRepo(rows)).open) as c:
        yield c


def h(auth, staff_id=PETUGAS, role="petugas"):
    return staff_headers(auth, staff_id, role=role)


# ---- heartbeat & status -------------------------------------------------------------------------

def test_heartbeat_turns_offline_into_online(client, admin_auth, kiosk):
    s = client.get(f"/api/devices/{DEV_A}/status", headers=h(admin_auth))
    assert s.status_code == 200 and s.json() == {"device_id": str(DEV_A), "status": "offline",
                                                 "last_heartbeat_at": None}
    r = client.post(f"/api/devices/{DEV_A}/heartbeat")  # no auth needed
    assert r.status_code == 204 and r.content == b""
    s = client.get(f"/api/devices/{DEV_A}/status", headers=h(admin_auth)).json()
    assert s["status"] == "online" and s["last_heartbeat_at"].startswith("2026-10-02T08:00:00")


@pytest.mark.parametrize("age_s, expected", [(0, "online"), (89, "online"), (89.999, "online"),
                                             (90, "offline"), (91, "offline"), (3600, "offline")])
def test_status_90_second_window(client, admin_auth, kiosk, age_s, expected):
    client.post(f"/api/devices/{DEV_A}/heartbeat")
    kiosk.now = T0 + timedelta(seconds=age_s)
    assert client.get(f"/api/devices/{DEV_A}/status", headers=h(admin_auth)).json()["status"] == expected


def test_heartbeat_unknown_device_is_404(client):
    r = client.post(f"/api/devices/{UNKNOWN}/heartbeat")
    assert r.status_code == 404 and r.json()["error"]["code"] == "DEVICE_NOT_FOUND"


def test_heartbeat_inactive_device_is_403_and_not_recorded(client, kiosk):
    r = client.post(f"/api/devices/{DEV_A_OFF}/heartbeat")
    assert r.status_code == 403 and r.json()["error"]["code"] == "DEVICE_INACTIVE"
    assert kiosk.devices[DEV_A_OFF]["last"] is None


def test_heartbeat_invalid_uuid_is_422(client):
    r = client.post("/api/devices/not-a-uuid/heartbeat")
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_status_requires_staff(client, admin_auth):
    assert client.get(f"/api/devices/{DEV_A}/status").status_code == 401
    assert client.get(f"/api/devices/{DEV_A}/status", headers=h(admin_auth, INACTIVE)).status_code == 403


def test_status_of_other_institution_device_is_404(client, admin_auth):
    r = client.get(f"/api/devices/{DEV_B}/status", headers=h(admin_auth))
    assert r.status_code == 404 and r.json()["error"]["code"] == "DEVICE_NOT_FOUND"
    assert client.get(f"/api/devices/{DEV_B}/status", headers=h(admin_auth, PETUGAS_B)).status_code == 200


# ---- call-jbi -----------------------------------------------------------------------------------

def test_call_jbi_writes_dispatch_and_audit_log(client, admin_auth, kiosk):
    r = client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_A), "notes": "Pasien butuh JBI"},
                    headers=h(admin_auth))
    assert r.status_code == 201, r.text
    d = r.json()
    assert set(d) == {"id", "institution_id", "device_id", "staff_id", "notes", "status", "created_at"}
    assert (d["institution_id"], d["device_id"], d["staff_id"], d["status"]) == (
        str(INST), str(DEV_A), str(PETUGAS), "requested")
    assert len(kiosk.dispatches) == 1 and len(kiosk.logs) == 1
    log = kiosk.logs[0]
    assert (log.direction, log.confidence, log.resulted_action, log.staff_id, log.predicted_phrase_id) == (
        "speech_to_sign", Decimal("0.0000"), "escalated_to_jbi", PETUGAS, None)


def test_call_jbi_notes_optional(client, admin_auth):
    r = client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_A)}, headers=h(admin_auth))
    assert r.status_code == 201 and r.json()["notes"] is None


def test_call_jbi_cross_institution_is_404_and_writes_nothing(client, admin_auth, kiosk):
    r = client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_B)}, headers=h(admin_auth))
    assert r.status_code == 404 and r.json()["error"]["code"] == "DEVICE_NOT_FOUND"
    assert kiosk.dispatches == [] and kiosk.logs == []


def test_call_jbi_unknown_and_inactive_device(client, admin_auth, kiosk):
    assert client.post("/api/kiosk/call-jbi", json={"device_id": str(UNKNOWN)},
                       headers=h(admin_auth)).status_code == 404
    r = client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_A_OFF)}, headers=h(admin_auth))
    assert r.status_code == 403 and r.json()["error"]["code"] == "DEVICE_INACTIVE"
    assert kiosk.dispatches == []


@pytest.mark.parametrize("headers_fn, status", [
    (lambda a: {}, 401),
    (lambda a: h(a, INACTIVE), 403),
    (lambda a: staff_headers(a, PETUGAS, role=None), 403),
])
def test_call_jbi_requires_active_staff(client, admin_auth, kiosk, headers_fn, status):
    r = client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_A)}, headers=headers_fn(admin_auth))
    assert r.status_code == status and kiosk.dispatches == []


def test_call_jbi_admin_is_allowed(client, admin_auth):
    from tests.staff_support import ADMIN

    assert client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_A)},
                       headers=h(admin_auth, ADMIN, "admin")).status_code == 201


@pytest.mark.parametrize("body", [
    {},
    {"device_id": "nope"},
    {"device_id": str(DEV_A), "notes": "x" * 501},
    {"device_id": str(DEV_A), "notes": 5},
    {"device_id": str(DEV_A), "institution_id": str(INST_B)},
    {"device_id": str(DEV_A), "staff_id": str(PETUGAS_B)},
    {"device_id": str(DEV_A), "status": "completed"},
])
def test_call_jbi_validation(client, admin_auth, kiosk, body):
    r = client.post("/api/kiosk/call-jbi", json=body, headers=h(admin_auth))
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert kiosk.dispatches == []


def test_call_jbi_notes_at_limit_and_not_logged(client, admin_auth, caplog):
    caplog.set_level(logging.DEBUG)
    notes = "N" * 499 + "!"
    assert client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_A), "notes": notes},
                       headers=h(admin_auth)).status_code == 201
    assert notes not in caplog.text


def test_call_jbi_db_failure_is_500(client, admin_auth, kiosk):
    kiosk.fail_dispatch = RuntimeError("db down")
    r = client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_A)}, headers=h(admin_auth))
    assert r.status_code == 500 and r.json()["error"]["code"] == "INTERNAL_ERROR"


# ---- demo queue ---------------------------------------------------------------------------------

def test_queue_current(client, admin_auth, monkeypatch):
    monkeypatch.setattr(kiosk_api, "today_wib", lambda: date(2025, 5, 26))
    r = client.get(f"/api/kiosk/queue/current?device_id={DEV_A}", headers=h(admin_auth))
    assert r.status_code == 200
    assert r.json() == {"device_id": str(DEV_A), "queue_number": "Pasien 001",
                        "patient_identifier": "20250526001", "category": "Pengunjung Baru"}


def test_queue_date_uses_wib(monkeypatch):
    class FakeDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 10, 1, 18, 30, tzinfo=timezone.utc).astimezone(tz)  # 01:30 WIB on Oct 2

    monkeypatch.setattr(kiosk_api, "datetime", FakeDatetime)
    assert kiosk_api.today_wib() == date(2026, 10, 2)


def test_queue_guards(client, admin_auth):
    assert client.get(f"/api/kiosk/queue/current?device_id={DEV_A}").status_code == 401
    assert client.get(f"/api/kiosk/queue/current?device_id={DEV_B}", headers=h(admin_auth)).status_code == 404
    assert client.get("/api/kiosk/queue/current", headers=h(admin_auth)).status_code == 422
    assert client.get(f"/api/kiosk/queue/current?device_id={DEV_A}&x=1", headers=h(admin_auth)).status_code == 422


# ---- staff logs ---------------------------------------------------------------------------------

def _seed_logs(kiosk):
    def add(dev, action, minutes, staff=None):
        kiosk.logs.append(StaffLog(id=uuid4(), device_id=dev, direction="sign_to_text", predicted_phrase_id=None,
                                   confidence=Decimal("0.9100"), resulted_action=action, staff_id=staff,
                                   created_at=T0 + timedelta(minutes=minutes)))
    add(DEV_A, "accepted", 1)
    add(DEV_A, "escalated_to_jbi", 2, PETUGAS)
    add(DEV_A_OFF, "confirmed", 3)
    add(DEV_B, "accepted", 4)
    add(DEV_B, "escalated_to_jbi", 5, PETUGAS_B)


def test_staff_logs_are_institution_scoped(client, admin_auth, kiosk):
    _seed_logs(kiosk)
    a = client.get("/api/staff/logs", headers=h(admin_auth)).json()
    b = client.get("/api/staff/logs", headers=h(admin_auth, PETUGAS_B)).json()
    assert a["total"] == 3 and {i["device_id"] for i in a["items"]} == {str(DEV_A), str(DEV_A_OFF)}
    assert b["total"] == 2 and {i["device_id"] for i in b["items"]} == {str(DEV_B)}
    assert [i["created_at"] for i in a["items"]] == sorted((i["created_at"] for i in a["items"]), reverse=True)
    assert set(a["items"][0]) == {"id", "device_id", "direction", "predicted_phrase_id", "confidence",
                                  "resulted_action", "staff_id", "created_at"}


def test_staff_logs_filters_and_pagination(client, admin_auth, kiosk):
    _seed_logs(kiosk)
    r = client.get(f"/api/staff/logs?device_id={DEV_A}&resulted_action=escalated_to_jbi", headers=h(admin_auth))
    assert r.json()["total"] == 1 and r.json()["items"][0]["staff_id"] == str(PETUGAS)
    # filtering by another institution's device yields nothing, not that device's logs
    assert client.get(f"/api/staff/logs?device_id={DEV_B}", headers=h(admin_auth)).json()["total"] == 0
    p = client.get("/api/staff/logs?page=2&page_size=2", headers=h(admin_auth)).json()
    assert (p["page"], p["page_size"], p["total"], len(p["items"])) == (2, 2, 3, 1)


@pytest.mark.parametrize("query", ["page=0", "page_size=101", "resulted_action=pending_confirmation",
                                   "device_id=x", f"institution_id={INST_B}"])
def test_staff_logs_invalid_query(client, admin_auth, query):
    assert client.get(f"/api/staff/logs?{query}", headers=h(admin_auth)).status_code == 422


def test_staff_logs_require_staff(client, admin_auth):
    assert client.get("/api/staff/logs").status_code == 401
    assert client.get("/api/staff/logs", headers=h(admin_auth, INACTIVE)).status_code == 403


def test_jbi_call_shows_up_in_staff_logs(client, admin_auth):
    client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_A)}, headers=h(admin_auth))
    items = client.get("/api/staff/logs?resulted_action=escalated_to_jbi", headers=h(admin_auth)).json()["items"]
    assert len(items) == 1 and items[0]["confidence"] == 0.0 and items[0]["direction"] == "speech_to_sign"


# ---- match/text stays unimplemented (decision J / ADR-044) --------------------------------------

def test_match_text_is_not_exposed(client):
    assert client.post("/api/match/text", json={"device_id": str(DEV_A), "utterance": "x"}).status_code in (404, 405)
