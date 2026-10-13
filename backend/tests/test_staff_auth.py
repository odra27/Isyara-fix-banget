"""ADR-047 D2/D3: require_staff, require_institution_admin, current_institution_id, GET /api/me."""
from __future__ import annotations

from uuid import UUID

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth.jwt_verifier import JwtVerifier
from app.auth.staff import (
    STAFF_ROLES,
    StaffPrincipal,
    current_institution_id,
    require_institution_admin,
    require_staff,
    staff_role,
    subject_uuid,
)
from app.errors import BackendError
from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.staff_support import (
    ADMIN,
    INACTIVE,
    INST,
    NO_PROFILE,
    PETUGAS,
    FakeStaffDb,
    staff_client,
    staff_headers,
)


# ---- pure helpers -------------------------------------------------------------------------------

@pytest.mark.parametrize("app_metadata, expected", [
    ({"role": "admin"}, "admin"),
    ({"role": "petugas"}, "petugas"),
    ({"role": "Admin"}, None),
    ({"role": "petugas "}, None),
    ({"role": "dokter"}, None),
    ({"role": ["admin"]}, None),
    ({"role": None}, None),
    ({}, None),
    (None, None),
    ("admin", None),
])
def test_staff_role_exact_values_only(app_metadata, expected):
    assert staff_role({"app_metadata": app_metadata}) == expected


def test_staff_role_ignores_user_metadata():
    assert staff_role({"user_metadata": {"role": "admin"}, "app_metadata": {}}) is None
    assert STAFF_ROLES == ("admin", "petugas")


@pytest.mark.parametrize("sub, ok", [(str(PETUGAS), True), ("not-a-uuid", False), (None, False), (123, False)])
def test_subject_uuid(sub, ok):
    assert (subject_uuid({"sub": sub}) == PETUGAS) if ok else subject_uuid({"sub": sub}) is None


# ---- GET /api/me --------------------------------------------------------------------------------

@pytest.fixture
def db():
    return FakeStaffDb()


@pytest.fixture
def client(admin_auth, db):
    with staff_client(admin_auth, db.open) as c:
        yield c


def test_me_returns_full_profile_for_petugas(client, admin_auth):
    r = client.get("/api/me", headers=staff_headers(admin_auth, PETUGAS))
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"
    assert r.json() == {
        "id": str(PETUGAS),
        "full_name": "dr. Sarah Wijaya",
        "role": "petugas",
        "job_title": "Dokter Umum",
        "nip": "19890512 202012 2 001",
        "unit_kerja": "Poli Umum",
        "shift_schedule": "08:00 - 14:00",
        "avatar_url": None,
        "institution": {"id": str(INST), "name": "Puskesmas Krobokan"},
    }


def test_me_allows_admin(client, admin_auth):
    r = client.get("/api/me", headers=staff_headers(admin_auth, ADMIN, role="admin"))
    assert r.status_code == 200 and r.json()["role"] == "admin"


def test_me_role_comes_from_jwt_not_db_mirror(client, admin_auth):
    # DB mirror says petugas; JWT says admin → JWT wins (ADR-047 D2).
    r = client.get("/api/me", headers=staff_headers(admin_auth, PETUGAS, role="admin"))
    assert r.status_code == 200 and r.json()["role"] == "admin"


def test_me_without_token_is_401(client):
    r = client.get("/api/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"
    assert r.headers["www-authenticate"] == "Bearer"


def test_me_invalid_token_is_401(client):
    r = client.get("/api/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401


def test_me_expired_token_is_401(client, admin_auth):
    r = client.get("/api/me", headers=staff_headers(admin_auth, PETUGAS, exp=1))
    assert r.status_code == 401


@pytest.mark.parametrize("role", [None, "dokter", "authenticated"])
def test_me_without_staff_role_is_403(client, admin_auth, role, db):
    r = client.get("/api/me", headers=staff_headers(admin_auth, PETUGAS, role=role))
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    assert db.opened == 0  # role is checked before any DB access


def test_me_role_only_in_user_metadata_is_403(client, admin_auth):
    h = admin_auth.headers(sub=str(PETUGAS), app_metadata={"provider": "email"}, user_metadata={"role": "petugas"})
    assert client.get("/api/me", headers=h).status_code == 403


def test_me_inactive_profile_is_403(client, admin_auth):
    r = client.get("/api/me", headers=staff_headers(admin_auth, INACTIVE))
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"


def test_me_missing_profile_is_403(client, admin_auth):
    assert client.get("/api/me", headers=staff_headers(admin_auth, NO_PROFILE)).status_code == 403


def test_me_non_uuid_subject_is_401(client, admin_auth):
    r = client.get("/api/me", headers=admin_auth.headers(sub="abc", app_metadata={"role": "petugas"}))
    assert r.status_code == 401


def test_me_auth_unavailable_is_503(admin_auth, db):
    def boom() -> JwtVerifier:
        raise RuntimeError("no verifier")

    from app.main import create_app
    from app.modeling.client import LibraryModelingClient
    from tests.test_modeling_client import FakePredictor

    app = create_app(modeling_factory=lambda: LibraryModelingClient(FakePredictor()), open_db=db.open,
                     jwt_verifier_factory=boom)
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/api/me", headers=staff_headers(admin_auth, PETUGAS))
    assert r.status_code == 503 and r.json()["error"]["code"] == "AUTH_UNAVAILABLE"


def test_me_jwks_down_is_503(client, admin_auth, jwks_server):
    jwks_server.status = 500
    r = client.get("/api/me", headers=staff_headers(admin_auth, PETUGAS))
    assert r.status_code == 503


# ---- require_institution_admin / current_institution_id (petugas vs admin guard) ----------------

def _guard_app(admin_auth, db) -> TestClient:
    app = FastAPI()
    app.state.jwt_verifier = admin_auth.verifier()
    app.state.open_db = db.open

    @app.exception_handler(BackendError)
    async def _h(_r, exc):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=exc.http_status, content={"code": exc.code}, headers=exc.headers)

    @app.get("/staff-only")
    async def staff_only(p: StaffPrincipal = Depends(require_staff)):
        return {"role": p.role}

    @app.get("/admin-only")
    async def admin_only(p: StaffPrincipal = Depends(require_institution_admin)):
        return {"role": p.role}

    @app.get("/institution")
    async def institution(inst: UUID = Depends(current_institution_id)):
        return {"institution_id": str(inst)}

    return TestClient(app, raise_server_exceptions=False)


def test_petugas_can_use_staff_endpoint_but_not_admin_endpoint(admin_auth, db):
    c = _guard_app(admin_auth, db)
    h = staff_headers(admin_auth, PETUGAS)
    assert c.get("/staff-only", headers=h).json() == {"role": "petugas"}
    r = c.get("/admin-only", headers=h)
    assert r.status_code == 403 and r.json() == {"code": "FORBIDDEN"}


def test_admin_can_use_both(admin_auth, db):
    c = _guard_app(admin_auth, db)
    h = staff_headers(admin_auth, ADMIN, role="admin")
    assert c.get("/staff-only", headers=h).status_code == 200
    assert c.get("/admin-only", headers=h).json() == {"role": "admin"}


def test_inactive_admin_is_denied(admin_auth, db):
    c = _guard_app(admin_auth, db)
    assert c.get("/admin-only", headers=staff_headers(admin_auth, INACTIVE, role="admin")).status_code == 403


def test_institution_comes_from_profile_not_request(admin_auth, db):
    c = _guard_app(admin_auth, db)
    other = "00000000-0000-0000-0000-00000000ffff"
    r = c.get(f"/institution?institution_id={other}", headers={**staff_headers(admin_auth, PETUGAS),
                                                                 "X-Institution-Id": other})
    assert r.json() == {"institution_id": str(INST)}


def test_existing_admin_api_still_uses_require_admin_without_profile(admin_auth, db):
    """ADR-039 /api/admin/* is unchanged: a petugas JWT is still 403 there."""
    with staff_client(admin_auth, db.open) as c:
        r = c.get("/api/admin/devices", headers=staff_headers(admin_auth, PETUGAS))
    assert r.status_code == 403
