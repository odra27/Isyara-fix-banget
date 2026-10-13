"""ADR-039 contract tests: Supabase JWT admin authentication & authorization.

Real PyJWT + PyJWKClient against a local JWKS server (127.0.0.1) with ephemeral
EC P-256 keys. The admin probe route exists only in these tests; it is mounted
with the production admin router's prefix and dependencies.
"""
import logging
import time

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import APIRouter
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.api import admin as admin_api
from app.auth.admin import AdminPrincipal, require_admin
from app.auth.jwt_verifier import (
    ALLOWED_ALGORITHMS,
    DEFAULT_AUDIENCE,
    DEFAULT_ISSUER,
    DEFAULT_JWKS_URL,
    JWKS_CACHE_LIFESPAN_S,
    JWKS_REFRESH_COOLDOWN_S,
    JWKS_TIMEOUT_S,
    LEEWAY_S,
    AuthConfig,
    JwtVerifier,
)
from app.errors import AuthUnavailable, Unauthorized
from app.main import create_app
from app.modeling.client import LibraryModelingClient
from tests.api_support import FakeDb, body
from tests.auth_support import (
    DROP,
    TEST_AUDIENCE,
    TEST_ISSUER,
    claims,
    hs256_token,
    jwk_for,
    new_ec_key,
    raw_token,
    sign,
)
from tests.test_modeling_client import FakePredictor

PROBE = "/api/admin/__test_probe__"
KID = "test-kid-1"


@pytest.fixture
def key():
    return new_ec_key()


@pytest.fixture
def verifier(jwks_server, key):
    jwks_server.keys = [jwk_for(key, KID)]
    return JwtVerifier(AuthConfig(jwks_url=jwks_server.url, issuer=TEST_ISSUER, audience=TEST_AUDIENCE))


def make_client(verifier_factory):
    app = create_app(
        modeling_factory=lambda: LibraryModelingClient(FakePredictor()),
        open_db=FakeDb().open,
        jwt_verifier_factory=verifier_factory,
    )
    # Test-only route, mounted like a real admin endpoint (same prefix + dependencies).
    probe_router = APIRouter(
        prefix=admin_api.router.prefix, dependencies=admin_api.router.dependencies)

    @probe_router.get("/__test_probe__")
    async def _probe():
        return {"ok": True}

    app.include_router(probe_router)
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def client(verifier):
    with make_client(lambda: verifier) as c:
        yield c


def call(client, token=None, header=None):
    headers = {}
    if header is not None:
        headers["Authorization"] = header
    elif token is not None:
        headers["Authorization"] = f"Bearer {token}"
    return client.get(PROBE, headers=headers)


def assert_401(r, token=None):
    assert r.status_code == 401, r.text
    assert r.json() == {"error": {"code": "UNAUTHORIZED",
                                  "message": "Authentication required"}}
    assert r.headers.get("www-authenticate") == "Bearer"
    if token:
        assert token not in r.text and token not in str(r.headers)


def assert_403(r):
    assert r.status_code == 403, r.text
    assert r.json() == {"error": {"code": "FORBIDDEN", "message": "Forbidden"}}
    assert "www-authenticate" not in r.headers


def assert_503(r):
    assert r.status_code == 503, r.text
    assert r.json() == {"error": {"code": "AUTH_UNAVAILABLE",
                                  "message": "Authentication service unavailable"}}
    assert "www-authenticate" not in r.headers


# ---- configuration / constants (ADR-039 D3, D4, D7, D8) ----------------------------------------

def test_adr_constants():
    assert ALLOWED_ALGORITHMS == ("ES256",)
    assert (JWKS_CACHE_LIFESPAN_S, JWKS_TIMEOUT_S,
            JWKS_REFRESH_COOLDOWN_S, LEEWAY_S) == (300, 2, 30, 0)


def test_pyjwkclient_configured_per_adr(verifier):
    c = verifier._jwks
    assert (c.jwk_set_cache.lifespan, c.timeout,
            c.cooldown_duration) == (300, 2, 30)


def test_config_from_env_and_deployment_defaults(monkeypatch):
    for k in ("SUPABASE_JWKS_URL", "SUPABASE_JWT_ISSUER", "SUPABASE_JWT_AUDIENCE"):
        monkeypatch.delenv(k, raising=False)
    assert AuthConfig.from_env() == AuthConfig(
        DEFAULT_JWKS_URL, DEFAULT_ISSUER, DEFAULT_AUDIENCE)
    assert DEFAULT_ISSUER == "https://qshkdkmevbiaydkicihd.supabase.co/auth/v1"
    assert DEFAULT_JWKS_URL == DEFAULT_ISSUER + \
        "/.well-known/jwks.json" and DEFAULT_AUDIENCE == "authenticated"
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://x.invalid/jwks.json")
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", "https://x.invalid/auth/v1")
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "aud-x")
    assert AuthConfig.from_env() == AuthConfig(
        "https://x.invalid/jwks.json", "https://x.invalid/auth/v1", "aud-x")


def test_verifier_construction_does_no_network(jwks_server):
    JwtVerifier(AuthConfig(jwks_server.url, TEST_ISSUER, TEST_AUDIENCE))
    assert jwks_server.requests == 0


# ---- success (1–5) ------------------------------------------------------------------------------

def test_valid_admin_token_is_authenticated(client, key):
    r = call(client, sign(key, KID, claims()))
    assert r.status_code == 200 and r.json() == {"ok": True}


def test_bearer_scheme_case_insensitive_and_whitespace(client, key):
    t = sign(key, KID, claims())
    for header in (f"bearer {t}", f"BEARER {t}", f"  Bearer   {t}  "):
        assert call(client, header=header).status_code == 200


def test_valid_nbf_in_past_accepted(client, key):
    assert call(client, sign(key, KID, claims(
        nbf=int(time.time()) - 5))).status_code == 200


def test_audience_as_list_containing_authenticated_accepted(client, key):
    assert call(client, sign(key, KID, claims(
        aud=["authenticated", "other"]))).status_code == 200


# ---- authentication failures (6–15) → 401 ------------------------------------------------------

def test_no_authorization_header(client):
    assert_401(call(client))


@pytest.mark.parametrize("header", ["", "Bearer", "Bearer ", "Bearer a b", "Token abc", "Basic dXNlcjpwYXNz", "abc"])
def test_malformed_or_wrong_scheme(client, header):
    assert_401(call(client, header=header))


def test_token_in_query_or_cookie_not_accepted(client, key):
    t = sign(key, KID, claims())
    assert_401(client.get(PROBE, params={"access_token": t, "token": t}))
    client.cookies.set("access_token", t)
    try:
        assert_401(client.get(PROBE))
    finally:
        client.cookies.clear()


def test_invalid_signature(client, key):
    other = new_ec_key()
    assert_401(call(client, sign(other, KID, claims())))


@pytest.mark.parametrize("mutate", [
    pytest.param(lambda c: c.update(exp=int(time.time()) - 1), id="expired"),
    pytest.param(lambda c: c.pop("exp"), id="missing exp"),
    pytest.param(lambda c: c.update(
        iss="https://evil.invalid/auth/v1"), id="wrong issuer"),
    pytest.param(lambda c: c.pop("iss"), id="missing issuer"),
    pytest.param(lambda c: c.update(aud="anon"), id="wrong audience (anon)"),
    pytest.param(lambda c: c.pop("aud"), id="missing audience"),
    pytest.param(lambda c: c.update(
        nbf=int(time.time()) + 60), id="nbf in future"),
    pytest.param(lambda c: c.update(exp="tomorrow"), id="non-numeric exp"),
])
def test_claim_failures(client, key, mutate):
    c = claims()
    mutate(c)
    t = sign(key, KID, c)
    assert_401(call(client, t), t)


def test_leeway_is_zero(client, key):
    assert_401(call(client, sign(key, KID, claims(exp=int(time.time()) - 1))))


# ---- authorization failures (16–20) → 403 -------------------------------------------------------

@pytest.mark.parametrize("app_metadata", [
    pytest.param(DROP, id="no app_metadata"),
    pytest.param({"provider": "email"}, id="no role"),
    pytest.param({"role": "authenticated"}, id="non-admin role"),
    pytest.param({"role": "Admin"}, id="wrong case"),
    pytest.param({"role": " admin"}, id="padded"),
    pytest.param({"role": ["admin"]}, id="list role"),
    pytest.param({"role": True}, id="bool role"),
    pytest.param({"role": None}, id="null role"),
    pytest.param("admin", id="app_metadata not object"),
])
def test_non_admin_is_403(client, key, app_metadata):
    assert_403(call(client, sign(key, KID, claims(app_metadata=app_metadata))))


def test_user_metadata_admin_only_is_403(client, key):
    t = sign(key, KID, claims(app_metadata={
             "provider": "email"}, user_metadata={"role": "admin"}))
    assert_403(call(client, t))


def test_top_level_role_claim_is_not_admin(client, key):
    assert_403(call(client, sign(key, KID, claims(role="admin", app_metadata={}))))


# ---- security (28–32) ---------------------------------------------------------------------------

def test_tampered_app_metadata_role_is_401(client, key):
    t = sign(key, KID, claims(app_metadata={"role": "user"}))
    h, _, s = t.split(".")
    import base64
    import json

    forged_payload = claims(app_metadata={"role": "admin"})
    p = base64.urlsafe_b64encode(json.dumps(
        forged_payload).encode()).rstrip(b"=").decode()
    forged = f"{h}.{p}.{s}"
    assert_401(call(client, forged), forged)


def test_hs256_token_rejected_including_public_key_confusion(client, key, jwks_server):
    import json

    public_jwk_bytes = json.dumps(jwks_server.keys[0]).encode()
    for secret in (b"secret", public_jwk_bytes):
        t = hs256_token(
            secret, {"alg": "HS256", "typ": "JWT", "kid": KID}, claims())
        assert_401(call(client, t), t)


def test_none_algorithm_rejected(client):
    t = raw_token({"alg": "none", "typ": "JWT", "kid": KID}, claims())
    assert_401(call(client, t), t)


def test_other_asymmetric_algorithms_rejected(client, jwks_server):
    rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwks_server.keys.append(jwk_for(rsa_key, "rsa-kid", alg="RS256"))
    t = sign(rsa_key, "rsa-kid", claims(), alg="RS256")
    assert_401(call(client, t), t)


def test_es256_header_but_kid_points_to_rsa_key_rejected(client, jwks_server, key):
    rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwks_server.keys = [jwk_for(rsa_key, KID, alg="RS256")]
    t = sign(key, KID, claims())
    assert_401(call(client, t), t)


@pytest.mark.parametrize("token", ["abc", "a.b", "a.b.c", "....", "eyJhbGciOiJFUzI1NiJ9.e30."])
def test_malformed_jwt_rejected(client, token):
    assert_401(call(client, token))


def test_missing_kid_rejected(client, key):
    import jwt as pyjwt

    t = pyjwt.encode(claims(), key, algorithm="ES256")
    assert_401(call(client, t), t)


def test_token_never_in_response_or_logs(client, key, caplog):
    for t in (sign(key, KID, claims()), sign(key, KID, claims(app_metadata={})), sign(new_ec_key(), KID, claims()),
              sign(key, KID, claims(exp=1))):
        with caplog.at_level(logging.DEBUG):
            r = call(client, t)
        assert t not in r.text and t not in str(r.headers)
        assert t not in caplog.text and t.split(".")[1] not in caplog.text


def test_exceptions_do_not_chain_token_details(verifier):
    t = sign(new_ec_key(), KID, claims())
    with pytest.raises(Unauthorized) as exc:
        verifier.verify(t)
    assert exc.value.__cause__ is None and exc.value.__suppress_context__ is True
    assert t not in str(exc.value)


# ---- JWKS behavior (21–27) ----------------------------------------------------------------------

def test_cached_jwks_reused_while_valid(verifier, key, jwks_server, fake_clock):
    t = sign(key, KID, claims())
    for _ in range(5):
        verifier.verify(t)
        fake_clock.advance(50)  # 200 s total < 300 s lifespan
    assert jwks_server.requests == 1


def test_cache_expiry_refetches(verifier, key, jwks_server, fake_clock):
    t = sign(key, KID, claims())
    verifier.verify(t)
    fake_clock.advance(301)
    verifier.verify(t)
    assert jwks_server.requests == 2


def test_unknown_kid_triggers_refresh_after_cooldown_and_new_key_works(verifier, key, jwks_server, fake_clock):
    # initial fetch starts the 30 s cooldown
    verifier.verify(sign(key, KID, claims()))
    new_key = new_ec_key()
    jwks_server.keys = [jwk_for(key, KID), jwk_for(new_key, "rotated-kid")]
    t_new = sign(new_key, "rotated-kid", claims())
    with pytest.raises(Unauthorized):
        verifier.verify(t_new)  # within cooldown: no forced refresh
    assert jwks_server.requests == 1
    fake_clock.advance(31)
    # forced refresh finds it
    assert verifier.verify(t_new)["app_metadata"]["role"] == "admin"
    assert jwks_server.requests == 2


def test_unknown_kid_refresh_is_rate_limited(verifier, key, jwks_server, fake_clock):
    verifier.verify(sign(key, KID, claims()))
    fake_clock.advance(31)
    for i in range(20):
        with pytest.raises(Unauthorized):
            verifier.verify(sign(new_ec_key(), f"random-{i}", claims()))
    assert jwks_server.requests == 2  # exactly one forced refresh, then cooldown
    fake_clock.advance(31)
    with pytest.raises(Unauthorized):
        verifier.verify(sign(new_ec_key(), "random-x", claims()))
    assert jwks_server.requests == 3


def test_unknown_kid_still_missing_after_refresh_is_401(client, jwks_server, key):
    t = sign(new_ec_key(), "never-published", claims())
    assert_401(call(client, t), t)


def test_expired_cache_and_jwks_unavailable_is_503_no_stale_fallback(verifier, key, jwks_server, fake_clock):
    t = sign(key, KID, claims())
    verifier.verify(t)
    fake_clock.advance(301)
    jwks_server.status = 500
    with pytest.raises(AuthUnavailable):
        verifier.verify(t)


def test_jwks_unreachable_on_cold_start_is_503(key):
    v = JwtVerifier(AuthConfig("http://127.0.0.1:1/jwks.json",
                    TEST_ISSUER, TEST_AUDIENCE))
    with make_client(lambda: v) as c:
        assert_503(call(c, sign(key, KID, claims())))


def test_valid_cache_survives_jwks_outage(verifier, key, jwks_server, fake_clock):
    t = sign(key, KID, claims())
    verifier.verify(t)
    jwks_server.status = 500
    fake_clock.advance(299)
    assert verifier.verify(t)["iss"] == TEST_ISSUER


def test_unknown_kid_refresh_failing_is_503(verifier, key, jwks_server, fake_clock):
    verifier.verify(sign(key, KID, claims()))
    fake_clock.advance(31)
    jwks_server.status = 503
    with pytest.raises(AuthUnavailable):
        verifier.verify(sign(new_ec_key(), "rotated", claims()))


def test_jwks_timeout_is_2_seconds_and_503(jwks_server, key):
    jwks_server.keys = [jwk_for(key, KID)]
    jwks_server.delay_s = 4
    v = JwtVerifier(AuthConfig(jwks_server.url, TEST_ISSUER, TEST_AUDIENCE))
    with make_client(lambda: v) as c:
        t0 = time.monotonic()
        r = call(c, sign(key, KID, claims()))
        elapsed = time.monotonic() - t0
    assert_503(r)
    assert 1.8 <= elapsed < 3.5, elapsed


@pytest.mark.parametrize("raw", [b"not json", b"[]", b"{}", b'{"keys": []}', b'{"keys": [{"kty": "nope"}]}'])
def test_invalid_jwks_response_is_503(jwks_server, key, raw):
    jwks_server.raw_body = raw
    v = JwtVerifier(AuthConfig(jwks_server.url, TEST_ISSUER, TEST_AUDIENCE))
    with make_client(lambda: v) as c:
        assert_503(call(c, sign(key, KID, claims())))


def test_jwks_with_only_symmetric_key_cannot_be_used(jwks_server):
    jwks_server.keys = [{"kty": "oct", "k": "c2VjcmV0",
                         "kid": KID, "alg": "HS256", "use": "sig"}]
    v = JwtVerifier(AuthConfig(jwks_server.url, TEST_ISSUER, TEST_AUDIENCE))
    t = hs256_token(b"secret", {"alg": "HS256",
                    "typ": "JWT", "kid": KID}, claims())
    with make_client(lambda: v) as c:
        assert_401(call(c, t), t)
        # even an ES256-labelled token cannot use a symmetric JWK
        t2 = raw_token({"alg": "ES256", "kid": KID}, claims(), b"x" * 64)
        assert_401(call(c, t2), t2)


def test_verifier_factory_failure_is_503(key):
    def boom():
        raise RuntimeError("bad config")

    with make_client(boom) as c:
        assert_503(call(c, sign(key, KID, claims())))


def test_jwks_verified_off_event_loop(client, key, monkeypatch):
    import threading

    seen = {}
    original = JwtVerifier.verify

    def spy(self, token):
        seen["thread"] = threading.current_thread().name
        return original(self, token)

    monkeypatch.setattr(JwtVerifier, "verify", spy)
    assert call(client, sign(key, KID, claims())).status_code == 200
    assert seen["thread"] != threading.main_thread().name


# ---- route boundary -----------------------------------------------------------------------------

def _mounted_routers(app):
    """FastAPI 0.141 mounts included routers lazily; return (router, [(method, full_path)])."""
    out = []
    for entry in app.routes:
        router = getattr(entry, "original_router", None)
        assert router is not None, f"unexpected top-level route {entry!r}"
        # APIRouter.add_api_route already prepends the router prefix to route.path.
        paths = [(sorted(r.methods)[0], r.path)
                 for r in router.routes if isinstance(r, APIRoute)]
        out.append((router, paths))
    return out


def test_admin_router_is_mounted_and_enforces_require_admin():
    assert admin_api.router.prefix == "/api/admin"
    assert [d.dependency for d in admin_api.router.dependencies] == [
        require_admin]
    app = create_app(modeling_factory=lambda: LibraryModelingClient(
        FakePredictor()), open_db=FakeDb().open)
    mounted = _mounted_routers(app)
    assert any(router is admin_api.router for router, _ in mounted)
    # No /api/admin path may live on a router without require_admin.
    for router, paths in mounted:
        if any(p.startswith("/api/admin") for _, p in paths):
            assert router is admin_api.router, paths


def test_exact_production_route_surface():
    app = create_app(modeling_factory=lambda: LibraryModelingClient(
        FakePredictor()), open_db=FakeDb().open)
    all_paths = sorted(p for _, paths in _mounted_routers(app) for p in paths)
    # Phase 5B admin endpoints (ADR-041/042/043/046); no admin DELETE. Staff login/profile (ADR-047).
    # Student login/profile + chatbot (ADR-051); the only DELETE is a student's own chat session.
    assert all_paths == [
        ("DELETE", "/api/chat/sessions/{session_id}"),
        ("GET", "/api/admin/devices"),
        ("GET", "/api/admin/logs"),
        ("GET", "/api/admin/phrases"),
        ("GET", "/api/admin/staff"),
        ("GET", "/api/chat/sessions"),
        ("GET", "/api/chat/sessions/{session_id}/messages"),
        ("GET", "/api/devices/{device_id}/status"),
        ("GET", "/api/health"),
        ("GET", "/api/kiosk/queue/current"),
        ("GET", "/api/me"),
        ("GET", "/api/phrases"),
        ("GET", "/api/staff/logs"),
        ("GET", "/api/student/me"),
        ("PATCH", "/api/admin/phrases/{phrase_id}"),
        ("PATCH", "/api/chat/sessions/{session_id}"),
        ("POST", "/api/admin/phrases"),
        ("POST", "/api/admin/phrases/{phrase_id}/references"),
        ("POST", "/api/admin/staff"),
        ("POST", "/api/auth/login"),
        ("POST", "/api/chat/sessions"),
        ("POST", "/api/chat/sessions/{session_id}/messages"),
        ("POST", "/api/devices/{device_id}/heartbeat"),
        ("POST", "/api/kiosk/call-jbi"),
        ("POST", "/api/logs"),
        ("POST", "/api/match/sign"),
        ("POST", "/api/student/auth/login"),
        ("POST", "/api/student/auth/refresh"),
    ]


def test_no_auth_bypass_or_service_role_in_source():
    from pathlib import Path

    app_dir = Path(__file__).resolve().parents[1].joinpath("app")
    files = {p: p.read_text().lower() for p in app_dir.rglob("*.py")}
    everything = "\n".join(files.values())
    for needle in ("disable_auth", "skip_jwt", "verify_signature\": false", "verify_signature=false", "hs256\"",
                   "user_metadata\")"):
        assert needle not in everything, needle
    # ADR-046 §5 + ADR-047 D4: the service-role key is allowed ONLY in the server-side Storage
    # client and the staff-provisioning client, never in authentication/authorization code
    # (ADR-039 D2).
    storage_dir = app_dir / "storage"
    provisioning = app_dir / "provisioning" / "supabase_admin.py"
    for path, src in files.items():
        if storage_dir not in path.parents and path != provisioning:
            assert "service_role" not in src and "supabase_service" not in src, path
    for path in (app_dir / "auth").rglob("*.py"):
        assert "provisioning" not in files[path], path
    for path in (app_dir / "auth").rglob("*.py"):
        assert "storage" not in files[path], path


# ---- public endpoint regression (33–35) ---------------------------------------------------------

def test_public_endpoints_need_no_jwt_even_when_auth_unavailable():
    def boom():
        raise RuntimeError("auth down")

    from tests.fixtures import modeling_result

    db = FakeDb()
    app = create_app(
        modeling_factory=lambda: LibraryModelingClient(
            FakePredictor(modeling_result())),
        open_db=db.open,
        jwt_verifier_factory=boom,
    )

    class Phrases:
        async def list_active(self):
            return []

    with TestClient(app, raise_server_exceptions=False) as c:
        assert c.post("/api/match/sign", json=body()).status_code == 200
        from tests.api_support import ACTIVE_DEVICE

        log = {"device_id": str(ACTIVE_DEVICE), "direction": "sign_to_text", "predicted_phrase_id": None,
               "confidence": 0.1, "resulted_action": "escalated_to_jbi"}
        assert c.post("/api/logs", json=log).status_code == 204
    app2 = create_app(modeling_factory=lambda: LibraryModelingClient(FakePredictor()),
                      open_db=FakeDb(phrases=Phrases()).open, jwt_verifier_factory=boom)
    with TestClient(app2, raise_server_exceptions=False) as c:
        r = c.get("/api/phrases")
        assert r.status_code == 200 and "www-authenticate" not in r.headers


def test_principal_type():
    assert AdminPrincipal(subject="x").subject == "x"
