"""ADR-051 student login + chatbot history against real PostgreSQL (all migrations).

Runs only when BACKEND_TEST_DATABASE_URL is set; uses a unique schema dropped at the end.
`auth.users` is the test stand-in from conftest.py (or the real one on Supabase).
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest

from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.staff_support import PASSWORD, FakeGoTrue
from tests.student_support import FakeChatModel, student_client, student_headers

DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database/migrations"
SCHOOL = uuid.UUID("00000000-0000-0000-0000-00000000b001")


@pytest.fixture
def ids():
    return {k: uuid.uuid4() for k in ("a", "b", "inactive")}


@pytest.fixture
def db_url(monkeypatch, ids):
    import psycopg
    from psycopg.conninfo import make_conninfo

    schema = f"siswa_{uuid.uuid4().hex[:12]}"
    scoped = make_conninfo(DSN, options=f"-c search_path={schema}")
    tag = uuid.uuid4().hex[:8]
    emails = {k: f"{k}-{tag}@siswa.test" for k in ids}
    nis = {k: f"{k}{tag}" for k in ids}
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(f'create schema "{schema}"')
        for k, i in ids.items():
            admin.execute("insert into auth.users (id, email) values (%s, %s)", (i, emails[k]))
    try:
        with psycopg.connect(scoped, autocommit=True) as conn:
            for f in sorted(MIGRATIONS.glob("*.sql")):
                conn.execute(f.read_text(encoding="utf-8"))
            conn.execute("insert into institutions (id, name) values (%s, 'SLB Negeri Contoh')", (SCHOOL,))
            for k, active in (("a", True), ("b", True), ("inactive", False)):
                conn.execute(
                    "insert into student_profiles (id, institution_id, nis, full_name, class_name, grade, active)"
                    " values (%s, %s, %s, %s, '5A', 5, %s)",
                    (ids[k], SCHOOL, nis[k], f"Siswa {k}", active),
                )
        monkeypatch.setenv("DATABASE_URL", scoped)
        yield {"url": scoped, "emails": emails, "nis": nis}
    finally:
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'drop schema "{schema}" cascade')
            admin.execute("delete from auth.users where id = any(%s)", (list(ids.values()),))


@pytest.fixture
def setup(admin_auth, db_url, ids):
    from app.db.session import open_postgres

    gotrue = FakeGoTrue(admin_auth)
    gotrue.accounts = {db_url["emails"][k]: (PASSWORD, ids[k], "siswa") for k in ids}
    model = FakeChatModel()
    with student_client(admin_auth, open_postgres, auth_client_factory=gotrue.factory(), chat_model=model) as c:
        yield c, db_url, ids, model


def test_login_by_nis(setup):
    c, db, ids, _ = setup
    r = c.post("/api/student/auth/login", json={"nis": db["nis"]["a"], "password": PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["student"]["id"] == str(ids["a"])
    token = r.json()["access_token"]
    me = c.get("/api/student/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["institution"]["name"] == "SLB Negeri Contoh"
    bad = c.post("/api/student/auth/login", json={"nis": db["nis"]["inactive"], "password": PASSWORD})
    assert bad.status_code == 401


def test_chat_history_roundtrip_and_isolation(setup, admin_auth):
    c, _, ids, model = setup
    ha = student_headers(admin_auth, ids["a"])
    hb = student_headers(admin_auth, ids["b"])
    s = c.post("/api/chat/sessions", headers=ha).json()
    r1 = c.post(f"/api/chat/sessions/{s['id']}/messages", headers=ha, json={"content": "Jelaskan siklus air", "input_mode": "sign"})
    assert r1.status_code == 201, r1.text
    assert r1.json()["session"]["title"] == "Jelaskan siklus air"
    c.post(f"/api/chat/sessions/{s['id']}/messages", headers=ha, json={"content": "Contohnya?"})
    assert [t.content for t in model.calls[1]] == ["Jelaskan siklus air", model.answer, "Contohnya?"]

    msgs = c.get(f"/api/chat/sessions/{s['id']}/messages", headers=ha).json()["items"]
    assert [(m["role"], m["input_mode"]) for m in msgs] == [
        ("user", "sign"), ("assistant", None), ("user", "text"), ("assistant", None)]

    listing = c.get("/api/chat/sessions", headers=ha).json()
    assert listing["total"] == 1 and listing["items"][0]["id"] == s["id"]
    assert c.get("/api/chat/sessions", headers=hb).json()["total"] == 0
    assert c.get(f"/api/chat/sessions/{s['id']}/messages", headers=hb).status_code == 404
    assert c.delete(f"/api/chat/sessions/{s['id']}", headers=hb).status_code == 404

    assert c.patch(f"/api/chat/sessions/{s['id']}", headers=ha, json={"title": "IPA"}).json()["title"] == "IPA"
    assert c.delete(f"/api/chat/sessions/{s['id']}", headers=ha).status_code == 204
    assert c.get("/api/chat/sessions", headers=ha).json()["total"] == 0
