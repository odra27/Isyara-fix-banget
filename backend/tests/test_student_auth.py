"""ADR-051 D2: POST /api/student/auth/login (NIS → Supabase Auth password grant), GET /api/student/me."""
from __future__ import annotations

import json
import logging

import pytest

from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.staff_support import PASSWORD, PETUGAS, staff_headers
from tests.student_support import (
    SISWA,
    SISWA_INACTIVE,
    FakeStudentDb,
    student_client,
    student_gotrue,
    student_headers,
)

INVALID = {"error": {"code": "INVALID_CREDENTIALS", "message": "Invalid credentials"}}


@pytest.fixture
def gotrue(admin_auth):
    return student_gotrue(admin_auth)


@pytest.fixture
def db():
    return FakeStudentDb()


@pytest.fixture
def client(admin_auth, db, gotrue):
    with student_client(admin_auth, db.open, auth_client_factory=gotrue.factory()) as c:
        yield c


def login(c, nis, password=PASSWORD, **extra):
    return c.post("/api/student/auth/login", json={"nis": nis, "password": password, **extra})


def test_login_with_nis(client, gotrue):
    r = login(client, " 0012345678 ")
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    data = r.json()
    assert data["token_type"] == "bearer" and data["expires_in"] == 3600
    assert data["student"] == {
        "id": str(SISWA), "nis": "0012345678", "full_name": "Nadia Putri", "class_name": "5A", "grade": 5,
        "avatar_url": None, "institution": {"id": "00000000-0000-0000-0000-00000000b001", "name": "SLB Negeri Contoh"},
    }
    assert json.loads(gotrue.requests[0].content) == {"email": "0012345678@siswa.test", "password": PASSWORD}


def test_issued_token_works_for_me(client):
    token = login(client, "0012345678").json()["access_token"]
    r = client.get("/api/student/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["nis"] == "0012345678"
    assert r.headers["cache-control"] == "no-store"


def test_wrong_password(client):
    assert login(client, "0012345678", password="salah").json() == INVALID


@pytest.mark.parametrize("nis", ["404", "0012345678x"])
def test_unknown_nis_never_calls_supabase(client, gotrue, nis):
    r = login(client, nis)
    assert r.status_code == 401 and r.json() == INVALID
    assert gotrue.requests == []


def test_inactive_student_never_calls_supabase(client, gotrue):
    assert login(client, "0011111111").json() == INVALID
    assert gotrue.requests == []


@pytest.mark.parametrize("role", ["petugas", "admin", "Siswa", None])
def test_account_without_student_role_is_rejected(client, gotrue, role):
    gotrue.accounts["0012345678@siswa.test"] = (PASSWORD, SISWA, role) if role else (PASSWORD, SISWA, "x")
    assert login(client, "0012345678").json() == INVALID


def test_token_subject_must_match_profile(client, gotrue):
    gotrue.accounts["0012345678@siswa.test"] = (PASSWORD, SISWA_INACTIVE, "siswa")
    assert login(client, "0012345678").json() == INVALID


def test_missing_auth_config_is_503(admin_auth, db):
    with student_client(admin_auth, db.open) as c:
        r = login(c, "0012345678")
    assert r.status_code == 503 and r.json()["error"]["code"] == "AUTH_UNAVAILABLE"


@pytest.mark.parametrize("payload", [
    {}, {"nis": "0012345678"}, {"password": PASSWORD}, {"nis": "  ", "password": PASSWORD},
    {"nis": 12345678, "password": PASSWORD}, {"nis": "0012345678", "password": ""},
    {"nis": "x" * 31, "password": PASSWORD}, {"nis": "0012345678", "password": PASSWORD, "role": "admin"},
])
def test_validation(client, gotrue, payload):
    r = client.post("/api/student/auth/login", json=payload)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert gotrue.requests == []


def test_password_never_echoed_or_logged(client, caplog):
    caplog.set_level(logging.DEBUG)
    secret = "Unique-Student-Pass-5521"
    assert secret not in login(client, "0012345678", password=secret).text
    assert secret not in caplog.text


# ---- /api/student/me authorization -----------------------------------------------------------

def test_me_requires_token(client):
    assert client.get("/api/student/me").status_code == 401


def test_me_rejects_staff_token(client, admin_auth):
    r = client.get("/api/student/me", headers=staff_headers(admin_auth, PETUGAS))
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"


def test_me_rejects_inactive_student(client, admin_auth):
    assert client.get("/api/student/me", headers=student_headers(admin_auth, SISWA_INACTIVE)).status_code == 403


def test_student_token_cannot_use_staff_endpoints(client, admin_auth):
    r = client.get("/api/me", headers=student_headers(admin_auth, SISWA))
    assert r.status_code == 403


# ---- POST /api/student/auth/refresh (ADR-052) ----------------------------------------------------

def refresh(c, token):
    return c.post("/api/student/auth/refresh", json={"refresh_token": token})


def test_refresh_returns_new_tokens_and_profile(client, gotrue):
    r = refresh(client, "refresh-0012345678@siswa.test")
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    data = r.json()
    assert data["student"]["nis"] == "0012345678" and data["access_token"].count(".") == 2
    req = gotrue.requests[0]
    assert req.url.params["grant_type"] == "refresh_token"
    assert json.loads(req.content) == {"refresh_token": "refresh-0012345678@siswa.test"}
    me = client.get("/api/student/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200


def test_refresh_with_revoked_token(client):
    r = refresh(client, "revoked")
    assert r.status_code == 401 and r.json() == INVALID


def test_refresh_rejects_inactive_student(client):
    assert refresh(client, "refresh-0011111111@siswa.test").json() == INVALID


def test_refresh_rejects_non_student_role(client, gotrue):
    gotrue.accounts["0012345678@siswa.test"] = (PASSWORD, SISWA, "petugas")
    assert refresh(client, "refresh-0012345678@siswa.test").json() == INVALID


@pytest.mark.parametrize("status", [500, 503])
def test_refresh_supabase_unavailable(client, gotrue, status):
    gotrue.status = status
    assert refresh(client, "refresh-0012345678@siswa.test").status_code == 503


@pytest.mark.parametrize("payload", [{}, {"refresh_token": ""}, {"refresh_token": 5}, {"refresh_token": "x", "nis": "1"}])
def test_refresh_validation(client, gotrue, payload):
    r = client.post("/api/student/auth/refresh", json=payload)
    assert r.status_code == 422
    assert gotrue.requests == []
