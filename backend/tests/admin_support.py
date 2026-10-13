"""Shared helpers for Phase 5B admin API tests (real ADR-039 auth, local JWKS)."""
from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient

from app.auth.jwt_verifier import AuthConfig, JwtVerifier
from app.db.session import RequestDb
from app.main import create_app
from app.modeling.client import LibraryModelingClient
from tests.auth_support import TEST_AUDIENCE, TEST_ISSUER, claims, jwk_for, new_ec_key, sign
from tests.test_modeling_client import FakePredictor

KID = "admin-test-kid"


class AdminAuth:
    def __init__(self, jwks_server) -> None:
        self.key = new_ec_key()
        jwks_server.keys = [jwk_for(self.key, KID)]
        self.url = jwks_server.url

    def verifier(self) -> JwtVerifier:
        return JwtVerifier(AuthConfig(self.url, TEST_ISSUER, TEST_AUDIENCE))

    def headers(self, **claim_overrides) -> dict[str, str]:
        return {"Authorization": f"Bearer {sign(self.key, KID, claims(**claim_overrides))}"}

    def non_admin_headers(self) -> dict[str, str]:
        return self.headers(app_metadata={"provider": "email"})


@pytest.fixture
def admin_auth(jwks_server):
    return AdminAuth(jwks_server)


def _no_storage():
    raise RuntimeError("storage not configured in this test")


def admin_client(auth: AdminAuth, open_db, storage_factory=_no_storage) -> TestClient:
    app = create_app(
        modeling_factory=lambda: LibraryModelingClient(FakePredictor()),
        open_db=open_db,
        jwt_verifier_factory=auth.verifier,
        storage_factory=storage_factory,
    )
    return TestClient(app, raise_server_exceptions=False)


class FakeStorageServer:
    """httpx.MockTransport stand-in for the Supabase Storage REST API (no network)."""

    SERVICE_KEY = "sb_secret_TESTONLY-not-a-real-key-9f3a"  # fake, format-only

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.requests: list = []
        self.fail_upload = False
        self.fail_sign = False
        self.fail_delete = False

    def handler(self, request):
        import httpx

        self.requests.append(request)
        path = request.url.path
        if request.method == "POST" and path.startswith("/storage/v1/object/sign/"):
            if self.fail_sign:
                return httpx.Response(500, json={"error": "boom"})
            obj = path.removeprefix("/storage/v1/object/sign/")
            import json as _json

            ttl = _json.loads(request.content)["expiresIn"]
            return httpx.Response(200, json={"signedURL": f"/object/sign/{obj}?token=signed-token&ttl={ttl}"})
        if request.method == "POST" and path.startswith("/storage/v1/object/"):
            if self.fail_upload:
                return httpx.Response(500, json={"error": "internal"})
            obj = path.removeprefix("/storage/v1/object/")
            if obj in self.objects and request.headers.get("x-upsert") != "true":
                return httpx.Response(400, json={"statusCode": "409", "error": "Duplicate"})
            self.objects[obj] = request.content
            return httpx.Response(200, json={"Key": obj})
        if request.method == "DELETE" and path.startswith("/storage/v1/object/"):
            if self.fail_delete:
                return httpx.Response(500)
            self.objects.pop(path.removeprefix("/storage/v1/object/"), None)
            return httpx.Response(200, json={"message": "deleted"})
        return httpx.Response(404)

    def factory(self, url: str = "https://storage.test.invalid", bucket: str = "sign-references"):
        import httpx

        from app.storage.supabase import StorageConfig, SupabaseStorage

        cfg = StorageConfig(url=url, bucket=bucket, service_key=self.SERVICE_KEY)
        return lambda: SupabaseStorage(cfg, transport=httpx.MockTransport(self.handler))


class FakeAdminDb:
    """open_db stand-in yielding only an admin repository; counts opens."""

    def __init__(self, repo) -> None:
        self.repo = repo
        self.opened = 0

    @asynccontextmanager
    async def open(self):
        self.opened += 1
        yield RequestDb(devices=None, phrases=None, logs=None, admin=self.repo)
