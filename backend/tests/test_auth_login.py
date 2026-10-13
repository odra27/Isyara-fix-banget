"""ADR-047 D5: POST /api/auth/login (email / NIP / username → Supabase Auth password grant)."""
from __future__ import annotations

import json
import logging

import httpx
import pytest

from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.auth_support import DROP
from tests.staff_support import (
    ADMIN,
    ANON_KEY,
    PASSWORD,
    PETUGAS,
    FakeGoTrue,
    FakeStaffDb,
    FakeStaffRepo,
    default_profiles,
    profile,
    staff_client,
)

INVALID = {"error": {"code": "INVALID_CREDENTIALS", "message": "Invalid credentials"}}


@pytest.fixture
def gotrue(admin_auth):
    return FakeGoTrue(admin_auth)


@pytest.fixture
def db():
    return FakeStaffDb()


@pytest.fixture
def client(admin_auth, db, gotrue):
    with staff_client(admin_auth, db.open, gotrue.factory()) as c:
        yield c


def login(c, identifier, password=PASSWORD, **extra):
    return c.post("/api/auth/login", json={"identifier": identifier, "password": password, **extra})


def _assert_success(r, user_id, role, full_name, nip):
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    data = r.json()
    assert set(data) == {"access_token", "token_type", "expires_in", "refresh_token", "user"}
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 3600
    assert data["refresh_token"] == "refresh-TESTONLY"
    assert data["access_token"].count(".") == 2
    assert data["user"] == {"id": str(user_id), "full_name": full_name, "role": role, "nip": nip}
    return data


# ---- success paths ------------------------------------------------------------------------------

def test_login_with_email(client, gotrue):
    r = login(client, "sarah@puskesmas.test")
    _assert_success(r, PETUGAS, "petugas", "dr. Sarah Wijaya", "19890512 202012 2 001")
    sent = json.loads(gotrue.requests[0].content)
    assert sent == {"email": "sarah@puskesmas.test", "password": PASSWORD}


def test_login_with_email_is_case_insensitive_and_trimmed(client, gotrue):
    r = login(client, "  Sarah@Puskesmas.TEST ")
    assert r.status_code == 200
    assert json.loads(gotrue.requests[0].content)["email"] == "sarah@puskesmas.test"  # resolved DB email


def test_login_with_nip_resolves_email(client, gotrue):
    r = login(client, "19890512 202012 2 001")
    _assert_success(r, PETUGAS, "petugas", "dr. Sarah Wijaya", "19890512 202012 2 001")
    assert json.loads(gotrue.requests[0].content)["email"] == "sarah@puskesmas.test"


def test_login_with_username_resolves_email(client, gotrue):
    r = login(client, "admin")
    _assert_success(r, ADMIN, "admin", "Admin TU", "19800101 200001 1 001")
    assert json.loads(gotrue.requests[0].content)["email"] == "admin@puskesmas.test"


def test_issued_token_works_for_api_me(client):
    token = login(client, "sarah").json()["access_token"]
    r = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["id"] == str(PETUGAS)


def test_supabase_request_shape(client, gotrue):
    login(client, "sarah")
    req = gotrue.requests[0]
    assert req.method == "POST"
    assert req.url.path == "/auth/v1/token"
    assert req.url.params["grant_type"] == "password"
    assert req.headers["apikey"] == ANON_KEY
    assert "authorization" not in req.headers


# ---- generic 401 INVALID_CREDENTIALS ------------------------------------------------------------

def test_wrong_password(client):
    r = login(client, "sarah", password="wrong")
    assert r.status_code == 401 and r.json() == INVALID


@pytest.mark.parametrize("identifier", ["nobody@puskesmas.test", "999999", "ghost"])
def test_unknown_identifier_never_calls_supabase(client, gotrue, identifier):
    r = login(client, identifier)
    assert r.status_code == 401 and r.json() == INVALID
    assert gotrue.requests == []


def test_inactive_staff_never_calls_supabase(client, gotrue):
    for identifier in ("lama@puskesmas.test", "111", "lama"):
        r = login(client, identifier)
        assert r.status_code == 401 and r.json() == INVALID
    assert gotrue.requests == []


def test_ambiguous_identifier_is_rejected(admin_auth, gotrue):
    rows = default_profiles()
    # one user's NIP equals another user's username
    rows[ADMIN] = ("admin@puskesmas.test", profile(ADMIN, role="admin", nip="sarah", username="admin"))
    with staff_client(admin_auth, FakeStaffDb(FakeStaffRepo(rows)).open, gotrue.factory()) as c:
        r = login(c, "sarah")
    assert r.status_code == 401 and r.json() == INVALID
    assert gotrue.requests == []


def test_profile_without_email_is_rejected(admin_auth, gotrue):
    rows = {PETUGAS: (None, profile(PETUGAS, username="sarah"))}
    with staff_client(admin_auth, FakeStaffDb(FakeStaffRepo(rows)).open, gotrue.factory()) as c:
        assert login(c, "sarah").json() == INVALID


@pytest.mark.parametrize("role", [DROP, "dokter", "Admin"])
def test_account_without_staff_role_is_rejected(client, gotrue, role):
    gotrue.accounts["sarah@puskesmas.test"] = (PASSWORD, PETUGAS, role)
    r = login(client, "sarah")
    assert r.status_code == 401 and r.json() == INVALID


def test_token_subject_must_match_resolved_profile(client, gotrue):
    gotrue.accounts["sarah@puskesmas.test"] = (PASSWORD, ADMIN, "petugas")
    assert login(client, "sarah").json() == INVALID


@pytest.mark.parametrize("status", [400, 401, 403, 422])
def test_supabase_credential_statuses_map_to_invalid_credentials(client, gotrue, status):
    gotrue.status = status
    r = login(client, "sarah")
    assert r.status_code == 401 and r.json() == INVALID


def test_all_credential_failures_share_one_body(client, gotrue):
    bodies = {json.dumps(login(client, i, password=p).json(), sort_keys=True)
              for i, p in [("sarah", "wrong"), ("ghost", PASSWORD), ("lama", PASSWORD), ("x@y.z", "q")]}
    assert len(bodies) == 1
    r = login(client, "ghost")
    assert "www-authenticate" not in r.headers


# ---- 503 AUTH_UNAVAILABLE -----------------------------------------------------------------------

@pytest.mark.parametrize("status", [429, 500, 502, 503])
def test_supabase_unavailable_statuses(client, gotrue, status):
    gotrue.status = status
    r = login(client, "sarah")
    assert r.status_code == 503 and r.json()["error"]["code"] == "AUTH_UNAVAILABLE"


@pytest.mark.parametrize("exc", [httpx.ConnectError("down"), httpx.ReadTimeout("slow")])
def test_supabase_network_errors(client, gotrue, exc):
    gotrue.raise_error = exc
    assert login(client, "sarah").status_code == 503


@pytest.mark.parametrize("body", [b"not json", b"{}", b'{"access_token": "", "refresh_token": "r", "expires_in": 1}',
                                  b'{"access_token": "a", "refresh_token": "r", "expires_in": "3600"}',
                                  b'{"access_token": "a", "refresh_token": "r", "expires_in": true}',
                                  b'[]'])
def test_supabase_malformed_success_body(client, gotrue, body):
    gotrue.body = body
    assert login(client, "sarah").status_code == 503


def test_token_rejected_by_verifier_is_503_not_user_error(client, gotrue):
    gotrue.token_claims = {"iss": "https://other-project.invalid/auth/v1"}
    r = login(client, "sarah")
    assert r.status_code == 503 and r.json()["error"]["code"] == "AUTH_UNAVAILABLE"


def test_missing_auth_config_is_503(admin_auth, db):
    with staff_client(admin_auth, db.open) as c:  # auth client factory raises
        r = login(c, "sarah")
    assert r.status_code == 503 and r.json()["error"]["code"] == "AUTH_UNAVAILABLE"
    assert db.opened == 0


def test_auth_config_from_env(monkeypatch):
    from app.auth.supabase_auth import SupabaseAuthConfig, SupabaseAuthNotConfigured

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    with pytest.raises(SupabaseAuthNotConfigured) as e:
        SupabaseAuthConfig.from_env()
    assert "SUPABASE_ANON_KEY" in str(e.value)
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co/")
    monkeypatch.setenv("SUPABASE_ANON_KEY", ANON_KEY)
    cfg = SupabaseAuthConfig.from_env()
    assert cfg.url == "https://x.supabase.co" and ANON_KEY not in repr(cfg)


# ---- validation & privacy -----------------------------------------------------------------------

@pytest.mark.parametrize("payload", [
    {},
    {"identifier": "sarah"},
    {"password": PASSWORD},
    {"identifier": "", "password": PASSWORD},
    {"identifier": "   ", "password": PASSWORD},
    {"identifier": "sarah", "password": ""},
    {"identifier": 123, "password": PASSWORD},
    {"identifier": "sarah", "password": PASSWORD, "role": "admin"},
    {"identifier": "x" * 321, "password": PASSWORD},
])
def test_validation_errors(client, gotrue, payload):
    r = client.post("/api/auth/login", json=payload)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert gotrue.requests == []


def test_password_never_echoed_or_logged(client, caplog):
    caplog.set_level(logging.DEBUG)
    secret = "Very-Unique-Pass-9137"
    bodies = [login(client, "sarah", password=secret).text,
              client.post("/api/auth/login", json={"identifier": "sarah", "password": secret, "x": 1}).text,
              login(client, "ghost", password=secret).text]
    for text in bodies:
        assert secret not in text
    assert secret not in caplog.text
    ok = login(client, "sarah")
    assert ok.json()["access_token"] not in caplog.text
