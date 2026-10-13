"""Tahap 5 kiosk operations against real PostgreSQL (all migrations) with real ADR-039 auth.

Runs only when BACKEND_TEST_DATABASE_URL is set; unique schema, dropped at the end.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest

from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.staff_support import staff_client, staff_headers

DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database/migrations"
INST_A = uuid.UUID("00000000-0000-0000-0000-00000000a001")
INST_B = uuid.UUID("00000000-0000-0000-0000-00000000b001")
DEV_A = uuid.UUID("00000000-0000-0000-0000-0000000d0001")
DEV_A_OFF = uuid.UUID("00000000-0000-0000-0000-0000000d0002")
DEV_B = uuid.UUID("00000000-0000-0000-0000-0000000d00b1")


@pytest.fixture
def env(monkeypatch):
    import psycopg
    from psycopg.conninfo import make_conninfo

    schema = f"kiosk_{uuid.uuid4().hex[:12]}"
    scoped = make_conninfo(DSN, options=f"-c search_path={schema}")
    staff = {"a": uuid.uuid4(), "b": uuid.uuid4()}
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(f'create schema "{schema}"')
        for i in staff.values():
            admin.execute("insert into auth.users (id) values (%s)", (i,))
    try:
        with psycopg.connect(scoped, autocommit=True) as conn:
            for f in sorted(MIGRATIONS.glob("*.sql")):
                conn.execute(f.read_text(encoding="utf-8"))
            conn.execute("insert into institutions (id, name) values (%s, 'A'), (%s, 'B')", (INST_A, INST_B))
            conn.execute(
                "insert into devices (id, institution_id, label, active) values"
                " (%s, %s, 'Kiosk A', true), (%s, %s, 'Kiosk A2', false), (%s, %s, 'Kiosk B', true)",
                (DEV_A, INST_A, DEV_A_OFF, INST_A, DEV_B, INST_B),
            )
            for key, inst in (("a", INST_A), ("b", INST_B)):
                conn.execute(
                    "insert into staff_profiles (id, institution_id, full_name, role, unit_kerja, job_title)"
                    " values (%s, %s, %s, 'petugas', 'Poli Umum', 'Dokter')",
                    (staff[key], inst, f"Petugas {key.upper()}"),
                )
        monkeypatch.setenv("DATABASE_URL", scoped)
        yield {"url": scoped, "staff": staff}
    finally:
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'drop schema "{schema}" cascade')
            admin.execute("delete from auth.users where id = any(%s)", (list(staff.values()),))


@pytest.fixture
def client(admin_auth, env):
    from app.db.session import open_postgres

    with staff_client(admin_auth, open_postgres) as c:
        yield c


def _sql(env, query, params=()):
    import psycopg

    with psycopg.connect(env["url"], autocommit=True) as conn:
        cur = conn.execute(query, params)
        return cur.fetchall() if cur.description else None


def test_heartbeat_updates_db_clock_and_status_goes_online(client, admin_auth, env):
    h = staff_headers(admin_auth, env["staff"]["a"])
    assert client.get(f"/api/devices/{DEV_A}/status", headers=h).json()["status"] == "offline"
    assert client.post(f"/api/devices/{DEV_A}/heartbeat").status_code == 204
    (last,), = _sql(env, "select last_heartbeat_at from devices where id = %s", (DEV_A,))
    assert last is not None
    s = client.get(f"/api/devices/{DEV_A}/status", headers=h).json()
    assert s["status"] == "online" and s["last_heartbeat_at"] is not None


@pytest.mark.parametrize("age_s, expected", [(60, "online"), (89, "online"), (91, "offline"), (600, "offline")])
def test_status_window_uses_database_time(client, admin_auth, env, age_s, expected):
    _sql(env, "update devices set last_heartbeat_at = now() - make_interval(secs => %s) where id = %s",
         (age_s, DEV_A))
    r = client.get(f"/api/devices/{DEV_A}/status", headers=staff_headers(admin_auth, env["staff"]["a"]))
    assert r.json()["status"] == expected


def test_heartbeat_inactive_and_unknown(client, env):
    assert client.post(f"/api/devices/{DEV_A_OFF}/heartbeat").status_code == 403
    assert client.post(f"/api/devices/{uuid.uuid4()}/heartbeat").status_code == 404
    assert _sql(env, "select last_heartbeat_at from devices where id = %s", (DEV_A_OFF,)) == [(None,)]


def test_call_jbi_writes_dispatch_and_matching_log(client, admin_auth, env):
    sid = env["staff"]["a"]
    r = client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_A), "notes": "butuh JBI"},
                    headers=staff_headers(admin_auth, sid))
    assert r.status_code == 201, r.text
    d = r.json()
    assert _sql(env, "select institution_id, device_id, staff_id, notes, status from jbi_dispatches") == [
        (INST_A, DEV_A, sid, "butuh JBI", "requested")]
    rows = _sql(env, "select device_id, direction, predicted_phrase_id, confidence, resulted_action, staff_id"
                     " from matching_logs")
    assert len(rows) == 1
    dev, direction, phrase, conf, action, staff_id = rows[0]
    assert (dev, direction, phrase, float(conf), action, staff_id) == (
        DEV_A, "speech_to_sign", None, 0.0, "escalated_to_jbi", sid)
    assert d["id"] == str(_sql(env, "select id from jbi_dispatches")[0][0])


def test_call_jbi_for_other_institution_device_is_404_and_writes_nothing(client, admin_auth, env):
    r = client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_B)},
                    headers=staff_headers(admin_auth, env["staff"]["a"]))
    assert r.status_code == 404 and r.json()["error"]["code"] == "DEVICE_NOT_FOUND"
    assert _sql(env, "select count(*) from jbi_dispatches") == [(0,)]
    assert _sql(env, "select count(*) from matching_logs") == [(0,)]


def test_call_jbi_is_atomic(client, admin_auth, env):
    """If the audit-log insert fails, the dispatch row is rolled back too."""
    _sql(env, "create function fail_log() returns trigger language plpgsql as"
              " $$ begin raise exception 'log insert blocked'; end $$")
    _sql(env, "create trigger block_logs before insert on matching_logs for each row execute function fail_log()")
    r = client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_A)},
                    headers=staff_headers(admin_auth, env["staff"]["a"]))
    assert r.status_code == 500
    assert _sql(env, "select count(*) from jbi_dispatches") == [(0,)]


def test_staff_logs_isolated_by_device_institution(client, admin_auth, env):
    a, b = env["staff"]["a"], env["staff"]["b"]
    _sql(env, "insert into matching_logs (device_id, direction, confidence, resulted_action) values"
              " (%s, 'sign_to_text', 0.91, 'accepted'), (%s, 'sign_to_text', 0.7, 'confirmed'),"
              " (%s, 'sign_to_text', 0.95, 'accepted')", (DEV_A, DEV_A_OFF, DEV_B))
    client.post("/api/kiosk/call-jbi", json={"device_id": str(DEV_B)}, headers=staff_headers(admin_auth, b))
    ra = client.get("/api/staff/logs", headers=staff_headers(admin_auth, a)).json()
    rb = client.get("/api/staff/logs", headers=staff_headers(admin_auth, b)).json()
    assert ra["total"] == 2 and {i["device_id"] for i in ra["items"]} == {str(DEV_A), str(DEV_A_OFF)}
    assert rb["total"] == 2 and {i["device_id"] for i in rb["items"]} == {str(DEV_B)}
    jbi = client.get("/api/staff/logs?resulted_action=escalated_to_jbi", headers=staff_headers(admin_auth, b)).json()
    assert jbi["total"] == 1 and jbi["items"][0]["staff_id"] == str(b)
    other = client.get(f"/api/staff/logs?device_id={DEV_B}", headers=staff_headers(admin_auth, a)).json()
    assert other["total"] == 0 and other["items"] == []


def test_queue_current_needs_own_device(client, admin_auth, env):
    h = staff_headers(admin_auth, env["staff"]["a"])
    r = client.get(f"/api/kiosk/queue/current?device_id={DEV_A}", headers=h)
    assert r.status_code == 200 and r.json()["queue_number"] == "Pasien 001"
    assert client.get(f"/api/kiosk/queue/current?device_id={DEV_B}", headers=h).status_code == 404
