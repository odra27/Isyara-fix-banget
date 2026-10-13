"""Tahap 4 (ADR-047 D3/D4, ADR-048): POST/GET /api/admin/staff with fakes (no DB, no network)."""
from __future__ import annotations

import json
import logging
from dataclasses import replace
from uuid import UUID

import httpx
import psycopg.errors
import pytest

from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.staff_support import (
    ADMIN,
    INACTIVE,
    INST,
    NO_PROFILE,
    PETUGAS,
    FakeAuthAdmin,
    FakeStaffDb,
    FakeStaffRepo,
    default_profiles,
    profile,
    staff_client,
    staff_headers,
)

INST_B = UUID("00000000-0000-0000-0000-00000000b001")
ADMIN_B = UUID("00000000-0000-0000-0000-0000000005b1")
PETUGAS_B = UUID("00000000-0000-0000-0000-0000000005b2")
NEW_PASSWORD = "Pegawai-Baru-2026!"


def _rows():
    rows = default_profiles()
    rows[ADMIN_B] = ("admin-b@puskesmas.test",
                     replace(profile(ADMIN_B, role="admin", username="admin-b", full_name="Admin B"),
                             institution_id=INST_B))
    rows[PETUGAS_B] = ("budi@puskesmas.test",
                       replace(profile(PETUGAS_B, nip="b-nip-1", username="budi", full_name="Budi"),
                               institution_id=INST_B))
    return rows


@pytest.fixture
def repo():
    return FakeStaffRepo(_rows())


@pytest.fixture
def provider():
    return FakeAuthAdmin()


@pytest.fixture
def client(admin_auth, repo, provider):
    with staff_client(admin_auth, FakeStaffDb(repo).open, auth_admin_factory=provider.factory()) as c:
        yield c


def admin_h(auth, staff_id=ADMIN):
    return staff_headers(auth, staff_id, role="admin")


def payload(**over):
    p = {
        "email": "rina@puskesmas.test",
        "password": NEW_PASSWORD,
        "full_name": "Rina Perawat",
        "nip": "19950101 202201 2 003",
        "username": "rina",
        "role": "petugas",
        "unit_kerja": "Poli Umum",
        "job_title": "Perawat",
        "shift_schedule": "08:00 - 14:00",
    }
    p.update(over)
    return {k: v for k, v in p.items() if v is not _OMIT}


_OMIT = object()


# ---- POST /api/admin/staff: success -------------------------------------------------------------

def test_create_staff_success(client, admin_auth, provider, repo):
    r = client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth))
    assert r.status_code == 201, r.text
    data = r.json()
    assert set(data) == {"id", "institution_id", "full_name", "role", "nip", "username", "unit_kerja",
                         "job_title", "shift_schedule", "active", "created_at"}
    assert data["institution_id"] == str(INST)  # the admin's own institution
    assert data["role"] == "petugas" and data["active"] is True
    assert data["nip"] == "19950101 202201 2 003" and data["username"] == "rina"
    assert NEW_PASSWORD not in r.text and "password" not in data
    # Supabase Admin API call: email_confirm + app_metadata.role, service key in apikey only
    req = provider.requests[0]
    assert req.method == "POST" and req.url.path == "/auth/v1/admin/users"
    assert json.loads(req.content) == {"email": "rina@puskesmas.test", "password": NEW_PASSWORD,
                                       "email_confirm": True, "app_metadata": {"role": "petugas"}}
    assert req.headers["apikey"] == FakeAuthAdmin.SERVICE_KEY and "authorization" not in req.headers
    # profile id == auth user id
    assert UUID(data["id"]) in repo.rows and data["id"] in provider.users


def test_create_admin_with_optional_fields_null(client, admin_auth, provider):
    r = client.post("/api/admin/staff", json=payload(role="admin", nip=None, username=None, shift_schedule=_OMIT),
                    headers=admin_h(admin_auth))
    assert r.status_code == 201
    d = r.json()
    assert d["role"] == "admin" and d["nip"] is None and d["username"] is None and d["shift_schedule"] is None
    assert json.loads(provider.requests[0].content)["app_metadata"] == {"role": "admin"}


def test_new_staff_appears_in_list_and_can_use_me(client, admin_auth):
    created = client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth)).json()
    listed = client.get("/api/admin/staff", headers=admin_h(admin_auth)).json()
    assert created["id"] in [i["id"] for i in listed["items"]]
    me = client.get("/api/me", headers=staff_headers(admin_auth, UUID(created["id"])))
    assert me.status_code == 200 and me.json()["full_name"] == "Rina Perawat"


def test_password_not_logged(client, admin_auth, caplog):
    caplog.set_level(logging.DEBUG)
    client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth))
    client.post("/api/admin/staff", json=payload(extra="x"), headers=admin_h(admin_auth))
    assert NEW_PASSWORD not in caplog.text
    assert FakeAuthAdmin.SERVICE_KEY not in caplog.text


# ---- authorization ------------------------------------------------------------------------------

@pytest.mark.parametrize("method", ["post", "get"])
def test_petugas_is_forbidden(client, admin_auth, provider, method):
    kw = {"json": payload()} if method == "post" else {}
    r = getattr(client, method)("/api/admin/staff", headers=staff_headers(admin_auth, PETUGAS), **kw)
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    assert provider.requests == []


@pytest.mark.parametrize("method", ["post", "get"])
def test_without_token_is_401(client, method):
    kw = {"json": payload()} if method == "post" else {}
    r = getattr(client, method)("/api/admin/staff", **kw)
    assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("staff_id", [INACTIVE, NO_PROFILE])
def test_admin_jwt_without_active_profile_is_forbidden(client, admin_auth, provider, staff_id):
    r = client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth, staff_id))
    assert r.status_code == 403
    assert client.get("/api/admin/staff", headers=admin_h(admin_auth, staff_id)).status_code == 403
    assert provider.requests == []


def test_petugas_profile_with_admin_jwt_role_is_allowed_by_jwt(client, admin_auth):
    """Role source is the JWT (ADR-047 D2), not the DB mirror."""
    r = client.get("/api/admin/staff", headers=staff_headers(admin_auth, PETUGAS, role="admin"))
    assert r.status_code == 200


# ---- multi-tenant bound -------------------------------------------------------------------------

def test_institution_id_in_body_is_rejected(client, admin_auth, provider):
    r = client.post("/api/admin/staff", json=payload(institution_id=str(INST_B)), headers=admin_h(admin_auth))
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert provider.requests == []


def test_admin_b_creates_staff_in_institution_b(client, admin_auth):
    r = client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth, ADMIN_B))
    assert r.status_code == 201 and r.json()["institution_id"] == str(INST_B)


def test_list_is_isolated_per_institution(client, admin_auth):
    a = client.get("/api/admin/staff", headers=admin_h(admin_auth)).json()
    b = client.get("/api/admin/staff", headers=admin_h(admin_auth, ADMIN_B)).json()
    a_ids = {i["id"] for i in a["items"]}
    b_ids = {i["id"] for i in b["items"]}
    assert a_ids == {str(PETUGAS), str(ADMIN), str(INACTIVE)} and a["total"] == 3
    assert b_ids == {str(ADMIN_B), str(PETUGAS_B)} and b["total"] == 2
    assert all(i["institution_id"] == str(INST) for i in a["items"])
    # a query parameter cannot switch institution
    c = client.get(f"/api/admin/staff?institution_id={INST_B}", headers=admin_h(admin_auth))
    assert c.status_code == 422


def test_list_shape_order_and_pagination(client, admin_auth):
    r = client.get("/api/admin/staff", headers=admin_h(admin_auth)).json()
    assert set(r) == {"items", "page", "page_size", "total"} and (r["page"], r["page_size"]) == (1, 50)
    names = [i["full_name"] for i in r["items"]]
    assert names == sorted(names)
    p2 = client.get("/api/admin/staff?page=2&page_size=2", headers=admin_h(admin_auth)).json()
    assert len(p2["items"]) == 1 and p2["total"] == 3 and p2["items"][0]["full_name"] == names[2]
    assert "password" not in json.dumps(r) and "email" not in json.dumps(r)


@pytest.mark.parametrize("query", ["page=0", "page_size=0", "page_size=101", "page=x"])
def test_list_invalid_pagination(client, admin_auth, query):
    assert client.get(f"/api/admin/staff?{query}", headers=admin_h(admin_auth)).status_code == 422


# ---- conflicts ----------------------------------------------------------------------------------

@pytest.mark.parametrize("over", [
    {"nip": "19890512 202012 2 001"},  # existing NIP
    {"username": "sarah"},  # existing username
    {"username": "b-nip-1"},  # existing NIP (other institution) reused as username
    {"nip": "budi"},  # existing username reused as NIP
])
def test_duplicate_nip_or_username_is_409(client, admin_auth, provider, over):
    r = client.post("/api/admin/staff", json=payload(**over), headers=admin_h(admin_auth))
    assert r.status_code == 409 and r.json() == {
        "error": {"code": "CONFLICT", "message": "Resource conflicts with existing data"}}
    assert provider.requests == []  # no auth user created


def test_duplicate_email_is_409(client, admin_auth, provider):
    provider.emails.add("rina@puskesmas.test")
    r = client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth))
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"
    assert "rina@puskesmas.test" not in r.text


def test_insert_race_conflict_rolls_back_auth_user(client, admin_auth, provider, repo):
    repo.fail_create = psycopg.errors.UniqueViolation("dup")
    r = client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth))
    assert r.status_code == 409
    assert provider.users == {} and len(provider.deleted) == 1


def test_insert_failure_rolls_back_auth_user_and_is_500(client, admin_auth, provider, repo):
    repo.fail_create = RuntimeError("db down")
    r = client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth))
    assert r.status_code == 500 and r.json()["error"]["code"] == "INTERNAL_ERROR"
    assert provider.users == {} and len(provider.deleted) == 1


def test_rollback_failure_does_not_mask_original_error(client, admin_auth, provider, repo):
    repo.fail_create = psycopg.errors.UniqueViolation("dup")
    provider.fail_delete = True
    assert client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth)).status_code == 409


# ---- Supabase Admin API failures ----------------------------------------------------------------

def test_weak_password_from_supabase_is_422(client, admin_auth, provider, repo):
    provider.status, provider.error_code = 422, "weak_password"
    r = client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth))
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert NEW_PASSWORD not in r.text


@pytest.mark.parametrize("status, code", [(500, None), (503, None), (429, None), (401, None), (403, None),
                                          (422, "validation_failed"), (400, None)])
def test_supabase_errors_are_503(client, admin_auth, provider, repo, status, code):
    provider.status, provider.error_code = status, code
    before = len(repo.rows)
    r = client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth))
    assert r.status_code == 503 and r.json()["error"]["code"] == "AUTH_UNAVAILABLE"
    assert len(repo.rows) == before


def test_supabase_network_error_is_503(client, admin_auth, provider):
    provider.raise_error = httpx.ConnectError("down")
    assert client.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth)).status_code == 503


def test_provisioning_not_configured_is_503(admin_auth, repo):
    with staff_client(admin_auth, FakeStaffDb(repo).open) as c:
        r = c.post("/api/admin/staff", json=payload(), headers=admin_h(admin_auth))
        assert r.status_code == 503 and r.json()["error"]["code"] == "AUTH_UNAVAILABLE"
        assert c.get("/api/admin/staff", headers=admin_h(admin_auth)).status_code == 200  # list needs no provider


def test_admin_config_from_env(monkeypatch):
    from app.provisioning.supabase_admin import SupabaseAdminConfig, SupabaseAdminNotConfigured

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(SupabaseAdminNotConfigured):
        SupabaseAdminConfig.from_env()
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co/")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", FakeAuthAdmin.SERVICE_KEY)
    cfg = SupabaseAdminConfig.from_env()
    assert cfg.url == "https://x.supabase.co" and FakeAuthAdmin.SERVICE_KEY not in repr(cfg)


# ---- validation ---------------------------------------------------------------------------------

@pytest.mark.parametrize("over", [
    {"email": "not-an-email"},
    {"email": "a@b"},
    {"email": "a b@c.de"},
    {"email": _OMIT},
    {"password": "short7!"},
    {"password": "x" * 1025},
    {"password": _OMIT},
    {"full_name": ""},
    {"full_name": "   "},
    {"role": "dokter"},
    {"role": "Admin"},
    {"role": _OMIT},
    {"unit_kerja": _OMIT},
    {"job_title": " "},
    {"nip": ""},
    {"nip": "x" * 51},
    {"username": "a@b.c"},
    {"username": " rina"},
    {"shift_schedule": ""},
    {"active": False},
    {"avatar_url": "https://x"},
    {"nip": 123},
])
def test_validation_errors(client, admin_auth, provider, over):
    r = client.post("/api/admin/staff", json=payload(**over), headers=admin_h(admin_auth))
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert NEW_PASSWORD not in r.text
    assert provider.requests == []


# ---- Admin API headers by key format ------------------------------------------------------------

def test_auth_headers_by_key_format():
    from app.provisioning.supabase_admin import auth_headers

    new = "sb_secret_TESTONLY-abc"
    assert auth_headers(new) == {"apikey": new}  # new keys are not JWTs: apikey only
    legacy = "eyJhbGciOiJIUzI1NiJ9.TESTONLY.sig"
    assert auth_headers(legacy) == {"apikey": legacy, "Authorization": f"Bearer {legacy}"}
