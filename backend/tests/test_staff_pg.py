"""ADR-047/048 staff auth against real PostgreSQL (all migrations) with real ADR-039 verification.

Runs only when BACKEND_TEST_DATABASE_URL is set; uses a unique schema dropped at the end.
`auth.users` is the test stand-in from conftest.py (or the real one on Supabase).
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest

from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.staff_support import PASSWORD, FakeGoTrue, staff_client, staff_headers

DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database/migrations"
INST = uuid.UUID("00000000-0000-0000-0000-00000000a001")


@pytest.fixture
def ids():
    # unique per test: auth.users is shared across test schemas
    return {k: uuid.uuid4() for k in ("petugas", "admin", "inactive")}


@pytest.fixture
def db_url(monkeypatch, ids):
    import psycopg
    from psycopg.conninfo import make_conninfo

    schema = f"staff_{uuid.uuid4().hex[:12]}"
    scoped = make_conninfo(DSN, options=f"-c search_path={schema}")
    tag = uuid.uuid4().hex[:8]
    emails = {k: f"{k}-{tag}@puskesmas.test" for k in ids}
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(f'create schema "{schema}"')
        for k, i in ids.items():
            admin.execute("insert into auth.users (id, email) values (%s, %s)", (i, emails[k]))
    try:
        with psycopg.connect(scoped, autocommit=True) as conn:
            for f in sorted(MIGRATIONS.glob("*.sql")):
                conn.execute(f.read_text(encoding="utf-8"))
            conn.execute("insert into institutions (id, name) values (%s, 'Puskesmas Krobokan')", (INST,))
            rows = [
                (ids["petugas"], f"nip-{tag}", f"sarah-{tag}", "dr. Sarah Wijaya", "petugas", True),
                (ids["admin"], None, f"admin-{tag}", "Admin TU", "admin", True),
                (ids["inactive"], f"old-{tag}", None, "Pegawai Lama", "petugas", False),
            ]
            for sid, nip, username, name, role, active in rows:
                conn.execute(
                    "insert into staff_profiles (id, institution_id, nip, username, full_name, role, unit_kerja,"
                    " job_title, shift_schedule, active) values (%s, %s, %s, %s, %s, %s, 'Poli Umum',"
                    " 'Dokter Umum', '08:00 - 14:00', %s)",
                    (sid, INST, nip, username, name, role, active),
                )
        monkeypatch.setenv("DATABASE_URL", scoped)
        yield {"url": scoped, "tag": tag, "emails": emails}
    finally:
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'drop schema "{schema}" cascade')
            admin.execute("delete from auth.users where id = any(%s)", (list(ids.values()),))


@pytest.fixture
def setup(admin_auth, db_url, ids):
    from app.db.session import open_postgres

    gotrue = FakeGoTrue(admin_auth)
    gotrue.accounts = {
        db_url["emails"]["petugas"]: (PASSWORD, ids["petugas"], "petugas"),
        db_url["emails"]["admin"]: (PASSWORD, ids["admin"], "admin"),
        db_url["emails"]["inactive"]: (PASSWORD, ids["inactive"], "petugas"),
    }
    with staff_client(admin_auth, open_postgres, gotrue.factory()) as c:
        yield c, gotrue, db_url, ids


def _login(c, identifier, password=PASSWORD):
    return c.post("/api/auth/login", json={"identifier": identifier, "password": password})


def test_login_via_email_nip_and_username(setup):
    c, gotrue, db, ids = setup
    tag = db["tag"]
    for identifier, expected in [
        (db["emails"]["petugas"].upper(), ids["petugas"]),
        (f"nip-{tag}", ids["petugas"]),
        (f"sarah-{tag}", ids["petugas"]),
        (f"admin-{tag}", ids["admin"]),
    ]:
        r = _login(c, identifier)
        assert r.status_code == 200, (identifier, r.text)
        assert r.json()["user"]["id"] == str(expected)
    assert r.json()["user"] == {"id": str(ids["admin"]), "full_name": "Admin TU", "role": "admin", "nip": None}


def test_login_failures_are_generic(setup):
    c, gotrue, db, _ = setup
    for identifier, password in [(f"sarah-{db['tag']}", "wrong"), ("ghost", PASSWORD), (f"old-{db['tag']}", PASSWORD)]:
        r = _login(c, identifier, password)
        assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_me_reads_profile_and_institution(setup, admin_auth):
    c, _, db, ids = setup
    token = _login(c, f"sarah-{db['tag']}").json()["access_token"]
    r = c.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json() == {
        "id": str(ids["petugas"]), "full_name": "dr. Sarah Wijaya", "role": "petugas", "job_title": "Dokter Umum",
        "nip": f"nip-{db['tag']}", "unit_kerja": "Poli Umum", "shift_schedule": "08:00 - 14:00",
        "avatar_url": None, "institution": {"id": str(INST), "name": "Puskesmas Krobokan"},
    }


def test_runtime_active_check_takes_effect_immediately(setup, admin_auth):
    import psycopg

    c, _, db, ids = setup
    h = staff_headers(admin_auth, ids["petugas"])
    assert c.get("/api/me", headers=h).status_code == 200
    with psycopg.connect(db["url"], autocommit=True) as conn:
        conn.execute("update staff_profiles set active = false where id = %s", (ids["petugas"],))
    assert c.get("/api/me", headers=h).status_code == 403  # same, still-valid JWT


def test_inactive_and_unknown_profiles_are_forbidden(setup, admin_auth):
    c, _, _, ids = setup
    assert c.get("/api/me", headers=staff_headers(admin_auth, ids["inactive"])).status_code == 403
    assert c.get("/api/me", headers=staff_headers(admin_auth, uuid.uuid4())).status_code == 403
