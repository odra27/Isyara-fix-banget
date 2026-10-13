"""Tahap 4 admin staff management against real PostgreSQL (all migrations) with real ADR-039 auth.

Runs only when BACKEND_TEST_DATABASE_URL is set; unique schema, dropped at the end. The fake
Supabase Admin API also inserts the created user into `auth.users` (the conftest stand-in),
as real Supabase would, so the `staff_profiles.id` FK is exercised for real.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest

from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.staff_support import FakeAuthAdmin, staff_client, staff_headers

DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database/migrations"
INST_A = uuid.UUID("00000000-0000-0000-0000-00000000a001")
INST_B = uuid.UUID("00000000-0000-0000-0000-00000000b001")


class SyncedAuthAdmin(FakeAuthAdmin):
    def __init__(self, dsn: str, *, write_auth_users: bool = True) -> None:
        super().__init__()
        self.dsn = dsn
        self.write_auth_users = write_auth_users
        self.created_ids: list[uuid.UUID] = []

    def handler(self, request):
        import psycopg

        response = super().handler(request)
        if request.method == "POST" and response.status_code == 200:
            uid = uuid.UUID(response.json()["id"])
            self.created_ids.append(uid)
            if self.write_auth_users:
                with psycopg.connect(self.dsn, autocommit=True) as conn:
                    conn.execute("insert into auth.users (id, email) values (%s, %s)", (uid, response.json()["email"]))
        if request.method == "DELETE" and response.status_code == 200:
            with psycopg.connect(self.dsn, autocommit=True) as conn:
                conn.execute("delete from auth.users where id = %s", (request.url.path.rsplit("/", 1)[-1],))
        return response


@pytest.fixture
def env(monkeypatch):
    import psycopg
    from psycopg.conninfo import make_conninfo

    schema = f"astaff_{uuid.uuid4().hex[:12]}"
    scoped = make_conninfo(DSN, options=f"-c search_path={schema}")
    tag = uuid.uuid4().hex[:8]
    ids = {k: uuid.uuid4() for k in ("admin_a", "petugas_a", "admin_b", "petugas_b")}
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(f'create schema "{schema}"')
        for k, i in ids.items():
            admin.execute("insert into auth.users (id, email) values (%s, %s)", (i, f"{k}-{tag}@test.invalid"))
    providers: list[SyncedAuthAdmin] = []
    try:
        with psycopg.connect(scoped, autocommit=True) as conn:
            for f in sorted(MIGRATIONS.glob("*.sql")):
                conn.execute(f.read_text(encoding="utf-8"))
            conn.execute("insert into institutions (id, name) values (%s, 'Puskesmas A'), (%s, 'Puskesmas B')",
                         (INST_A, INST_B))
            for key, inst, role, nip, username, name in [
                ("admin_a", INST_A, "admin", None, f"adm-a-{tag}", "Admin A"),
                ("petugas_a", INST_A, "petugas", f"nip-a-{tag}", f"sarah-{tag}", "dr. Sarah"),
                ("admin_b", INST_B, "admin", None, f"adm-b-{tag}", "Admin B"),
                ("petugas_b", INST_B, "petugas", f"nip-b-{tag}", f"budi-{tag}", "Budi"),
            ]:
                conn.execute(
                    "insert into staff_profiles (id, institution_id, nip, username, full_name, role, unit_kerja,"
                    " job_title) values (%s, %s, %s, %s, %s, %s, 'Poli Umum', 'Dokter')",
                    (ids[key], inst, nip, username, name, role),
                )
        monkeypatch.setenv("DATABASE_URL", scoped)
        yield {"url": scoped, "tag": tag, "ids": ids, "providers": providers}
    finally:
        created = [i for p in providers for i in p.created_ids]
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'drop schema "{schema}" cascade')
            admin.execute("delete from auth.users where id = any(%s)", (list(ids.values()) + created,))


def _client(admin_auth, env, **kw):
    from app.db.session import open_postgres

    provider = SyncedAuthAdmin(DSN, **kw)
    env["providers"].append(provider)
    return staff_client(admin_auth, open_postgres, auth_admin_factory=provider.factory()), provider


def _payload(tag, **over):
    p = {"email": f"rina-{tag}@test.invalid", "password": "Pegawai-Baru-2026!", "full_name": "Rina",
         "nip": f"nip-new-{tag}", "username": f"rina-{tag}", "role": "petugas", "unit_kerja": "Poli Umum",
         "job_title": "Perawat", "shift_schedule": "08:00 - 14:00"}
    p.update(over)
    return p


def test_create_staff_persists_in_admins_institution(admin_auth, env):
    import psycopg

    c, provider = _client(admin_auth, env)
    with c:
        r = c.post("/api/admin/staff", json=_payload(env["tag"]),
                   headers=staff_headers(admin_auth, env["ids"]["admin_a"], role="admin"))
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["institution_id"] == str(INST_A) and d["active"] is True and d["created_at"]
    assert "Pegawai-Baru-2026!" not in r.text
    with psycopg.connect(env["url"]) as conn:
        row = conn.execute("select institution_id, role, active from staff_profiles where id = %s",
                           (d["id"],)).fetchone()
    assert row == (INST_A, "petugas", True)


def test_list_is_isolated_between_institutions(admin_auth, env):
    c, _ = _client(admin_auth, env)
    ids = env["ids"]
    with c:
        a = c.get("/api/admin/staff", headers=staff_headers(admin_auth, ids["admin_a"], role="admin")).json()
        b = c.get("/api/admin/staff", headers=staff_headers(admin_auth, ids["admin_b"], role="admin")).json()
    assert {i["id"] for i in a["items"]} == {str(ids["admin_a"]), str(ids["petugas_a"])} and a["total"] == 2
    assert {i["id"] for i in b["items"]} == {str(ids["admin_b"]), str(ids["petugas_b"])} and b["total"] == 2
    assert [i["full_name"] for i in a["items"]] == ["Admin A", "dr. Sarah"]  # full_name, id ordering


@pytest.mark.parametrize("field, value_key", [("nip", "nip-a"), ("username", "sarah"), ("nip", "budi"),
                                               ("username", "nip-b")])
def test_duplicate_identifiers_are_409(admin_auth, env, field, value_key):
    c, provider = _client(admin_auth, env)
    with c:
        r = c.post("/api/admin/staff", json=_payload(env["tag"], **{field: f"{value_key}-{env['tag']}"}),
                   headers=staff_headers(admin_auth, env["ids"]["admin_a"], role="admin"))
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"
    assert provider.requests == []


def test_petugas_is_forbidden(admin_auth, env):
    c, provider = _client(admin_auth, env)
    with c:
        h = staff_headers(admin_auth, env["ids"]["petugas_a"])
        assert c.post("/api/admin/staff", json=_payload(env["tag"]), headers=h).status_code == 403
        assert c.get("/api/admin/staff", headers=h).status_code == 403
    assert provider.requests == []


def test_failed_profile_insert_deletes_the_auth_user(admin_auth, env):
    """auth.users row missing → real FK violation on insert → rollback DELETE is sent."""
    c, provider = _client(admin_auth, env, write_auth_users=False)
    with c:
        r = c.post("/api/admin/staff", json=_payload(env["tag"]),
                   headers=staff_headers(admin_auth, env["ids"]["admin_a"], role="admin"))
    assert r.status_code == 500
    assert provider.deleted == [str(provider.created_ids[0])] and provider.users == {}
