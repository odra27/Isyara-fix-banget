"""Shared helpers for staff auth / login tests (ADR-047). No real Supabase keys or tokens.

* FakeStaffRepo: in-memory StaffRepository with the same identifier semantics as Postgres.
* FakeGoTrue: httpx.MockTransport stand-in for `POST /auth/v1/token?grant_type=password`,
  issuing ES256 tokens signed by the test JWKS key (so the real ADR-039 verifier runs).
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from uuid import UUID

import httpx
from fastapi.testclient import TestClient

from app.auth.supabase_auth import SupabaseAuthClient, SupabaseAuthConfig
from app.db.session import RequestDb
from app.db.staff import LoginTarget, StaffProfile, is_email_identifier
from app.main import create_app
from app.modeling.client import LibraryModelingClient
from tests.admin_support import KID, AdminAuth
from tests.auth_support import DROP, claims, sign
from tests.test_modeling_client import FakePredictor

INST = UUID("00000000-0000-0000-0000-00000000a001")
PETUGAS = UUID("00000000-0000-0000-0000-0000000005a1")
ADMIN = UUID("00000000-0000-0000-0000-0000000005a2")
INACTIVE = UUID("00000000-0000-0000-0000-0000000005a3")
NO_PROFILE = UUID("00000000-0000-0000-0000-0000000005a9")

ANON_KEY = "sb_publishable_TESTONLY-not-a-real-key-71c2"  # fake, format-only
PASSWORD = "S3cret-test-password!"


def profile(staff_id: UUID, *, role="petugas", active=True, nip=None, username=None, full_name="dr. Sarah Wijaya"):
    return StaffProfile(
        id=staff_id, institution_id=INST, institution_name="Puskesmas Krobokan", nip=nip, username=username,
        full_name=full_name, role=role, unit_kerja="Poli Umum", job_title="Dokter Umum",
        shift_schedule="08:00 - 14:00", avatar_url=None, active=active,
    )


def default_profiles() -> dict[UUID, tuple[str | None, StaffProfile]]:
    return {
        PETUGAS: ("sarah@puskesmas.test", profile(PETUGAS, nip="19890512 202012 2 001", username="sarah")),
        ADMIN: ("admin@puskesmas.test", profile(ADMIN, role="admin", nip="19800101 200001 1 001",
                                                username="admin", full_name="Admin TU")),
        INACTIVE: ("lama@puskesmas.test", profile(INACTIVE, active=False, nip="111", username="lama")),
    }


class FakeStaffRepo:
    def __init__(self, rows=None) -> None:
        self.rows: dict[UUID, tuple[str | None, StaffProfile]] = rows if rows is not None else default_profiles()
        self.lookups: list[str] = []
        self.created_at: dict = {}
        self.fail_create: Exception | None = None

    async def get_profile(self, staff_id: UUID) -> StaffProfile | None:
        row = self.rows.get(staff_id)
        return row[1] if row else None

    async def find_login_targets(self, identifier: str) -> list[LoginTarget]:
        self.lookups.append(identifier)
        out = []
        for email, p in self.rows.values():
            if is_email_identifier(identifier):
                hit = email is not None and email.lower() == identifier.lower()
            else:
                hit = identifier in (p.nip, p.username)
            if hit:
                out.append(LoginTarget(email=email, profile=p))
        return out[:2]

    # ---- admin staff management -------------------------------------------------------------
    async def login_identifiers_taken(self, values):
        used = {v for _, p in self.rows.values() for v in (p.nip, p.username) if v is not None}
        return any(v in used for v in values)

    async def create_profile(self, *, staff_id, institution_id, full_name, role, nip, username, unit_kerja,
                             job_title, shift_schedule):
        from datetime import datetime, timezone

        if self.fail_create is not None:
            raise self.fail_create
        p = StaffProfile(id=staff_id, institution_id=institution_id, institution_name="?", nip=nip,
                         username=username, full_name=full_name, role=role, unit_kerja=unit_kerja,
                         job_title=job_title, shift_schedule=shift_schedule, avatar_url=None, active=True)
        self.rows[staff_id] = (None, p)
        self.created_at[staff_id] = datetime(2026, 10, 2, tzinfo=timezone.utc)
        return self._admin_row(p)

    async def list_by_institution(self, institution_id, *, limit, offset):
        rows = sorted((p for _, p in self.rows.values() if p.institution_id == institution_id),
                      key=lambda p: (p.full_name, str(p.id)))
        return [self._admin_row(p) for p in rows[offset:offset + limit]], len(rows)

    def _admin_row(self, p):
        from datetime import datetime, timezone

        from app.db.staff import AdminStaff

        created = self.created_at.get(p.id, datetime(2026, 1, 1, tzinfo=timezone.utc))
        return AdminStaff(id=p.id, institution_id=p.institution_id, full_name=p.full_name, role=p.role, nip=p.nip,
                          username=p.username, unit_kerja=p.unit_kerja, job_title=p.job_title,
                          shift_schedule=p.shift_schedule, active=p.active, created_at=created)


class FakeStaffDb:
    def __init__(self, repo: FakeStaffRepo | None = None) -> None:
        self.repo = repo or FakeStaffRepo()
        self.opened = 0

    @asynccontextmanager
    async def open(self):
        self.opened += 1
        yield RequestDb(devices=None, phrases=None, logs=None, staff=self.repo)


class FakeGoTrue:
    """Accounts: email → (password, user_id, app_metadata.role or DROP)."""

    def __init__(self, auth: AdminAuth) -> None:
        self.auth = auth
        self.accounts = {
            "sarah@puskesmas.test": (PASSWORD, PETUGAS, "petugas"),
            "admin@puskesmas.test": (PASSWORD, ADMIN, "admin"),
            "lama@puskesmas.test": (PASSWORD, INACTIVE, "petugas"),
        }
        self.requests: list[httpx.Request] = []
        self.status: int | None = None  # force a status
        self.body: bytes | None = None  # force a raw body (with status 200)
        self.raise_error: Exception | None = None
        self.token_claims: dict = {}  # extra claim overrides for issued tokens

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.raise_error is not None:
            raise self.raise_error
        if self.status is not None:
            return httpx.Response(self.status, json={"error": "forced"})
        if self.body is not None:
            return httpx.Response(200, content=self.body)
        data = json.loads(request.content)
        if request.url.params.get("grant_type") == "refresh_token":
            # refresh-<email> → that account (test-only token format); anything else is revoked.
            token = data.get("refresh_token", "")
            email = token.removeprefix("refresh-") if token.startswith("refresh-") else None
            data = {"email": email, "password": self.accounts.get(email, (None,))[0]}
        account = self.accounts.get(data.get("email"))
        if account is None or account[0] != data.get("password"):
            return httpx.Response(400, json={"error": "invalid_grant", "error_description": "Invalid login credentials"})
        _, user_id, role = account
        app_metadata = {"provider": "email"} if role is DROP else {"provider": "email", "role": role}
        token = sign(self.auth.key, KID, claims(sub=str(user_id), app_metadata=app_metadata, **self.token_claims))
        return httpx.Response(200, json={
            "access_token": token, "token_type": "bearer", "expires_in": 3600, "expires_at": 1,
            "refresh_token": "refresh-TESTONLY", "user": {"id": str(user_id)},
        })

    def factory(self, url: str = "https://auth.test.invalid"):
        cfg = SupabaseAuthConfig(url=url, anon_key=ANON_KEY)
        return lambda: SupabaseAuthClient(cfg, transport=httpx.MockTransport(self.handler))


def staff_headers(auth: AdminAuth, staff_id: UUID, role="petugas", **over) -> dict[str, str]:
    app_metadata = {"provider": "email", "role": role} if role is not None else {"provider": "email"}
    return auth.headers(sub=str(staff_id), app_metadata=app_metadata, **over)


class FakeAuthAdmin:
    """httpx.MockTransport stand-in for the Supabase Auth Admin API (`/auth/v1/admin/users`)."""

    SERVICE_KEY = "sb_secret_TESTONLY-not-a-real-key-4d8e"  # fake, format-only

    def __init__(self) -> None:
        self.users: dict[str, dict] = {}  # id → created user payload
        self.emails: set[str] = set()
        self.requests: list[httpx.Request] = []
        self.status: int | None = None
        self.error_code: str | None = None
        self.raise_error: Exception | None = None
        self.fail_delete = False
        self.deleted: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        import uuid as _uuid

        self.requests.append(request)
        if self.raise_error is not None:
            raise self.raise_error
        if request.method == "POST" and request.url.path == "/auth/v1/admin/users":
            if self.status is not None:
                return httpx.Response(self.status, json={"code": self.status, "error_code": self.error_code,
                                                         "msg": "forced"})
            data = json.loads(request.content)
            if data["email"].lower() in self.emails:
                return httpx.Response(422, json={"code": 422, "error_code": "email_exists", "msg": "exists"})
            uid = str(_uuid.uuid4())
            self.users[uid] = data
            self.emails.add(data["email"].lower())
            return httpx.Response(200, json={"id": uid, "email": data["email"], "app_metadata": data["app_metadata"]})
        if request.method == "DELETE" and request.url.path.startswith("/auth/v1/admin/users/"):
            uid = request.url.path.rsplit("/", 1)[-1]
            if self.fail_delete:
                return httpx.Response(500)
            self.deleted.append(uid)
            user = self.users.pop(uid, None)
            if user:
                self.emails.discard(user["email"].lower())
            return httpx.Response(200, json={})
        return httpx.Response(404)

    def factory(self, url: str = "https://auth.test.invalid"):
        from app.provisioning.supabase_admin import SupabaseAdminClient, SupabaseAdminConfig

        cfg = SupabaseAdminConfig(url=url, service_key=self.SERVICE_KEY)
        return lambda: SupabaseAdminClient(cfg, transport=httpx.MockTransport(self.handler))


def _not_configured():
    raise RuntimeError("not configured in this test")


def staff_client(auth: AdminAuth, open_db, auth_client_factory=_not_configured,
                 auth_admin_factory=_not_configured) -> TestClient:
    app = create_app(
        modeling_factory=lambda: LibraryModelingClient(FakePredictor()),
        open_db=open_db,
        jwt_verifier_factory=auth.verifier,
        storage_factory=_not_configured,
        auth_client_factory=auth_client_factory,
        auth_admin_factory=auth_admin_factory,
    )
    return TestClient(app, raise_server_exceptions=False)
