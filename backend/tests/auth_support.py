"""Test-only auth fixtures (ADR-039). No real Supabase keys or tokens.

* Ephemeral EC P-256 keys generated per test session.
* A local JWKS HTTP server on 127.0.0.1 (no internet), whose keys, status, body
  and delay can be changed per test, and which counts requests.
* A controllable clock patched into PyJWT's JWKS modules only (not global `time`).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from jwt.algorithms import ECAlgorithm, RSAAlgorithm

TEST_ISSUER = "https://test-project.invalid/auth/v1"
TEST_AUDIENCE = "authenticated"


def new_ec_key():
    return ec.generate_private_key(ec.SECP256R1())


def jwk_for(private_key, kid: str, alg: str = "ES256") -> dict[str, Any]:
    public = private_key.public_key()
    if isinstance(private_key, rsa.RSAPrivateKey):
        d = RSAAlgorithm.to_jwk(public, as_dict=True)
    else:
        d = ECAlgorithm.to_jwk(public, as_dict=True)
    d.update({"kid": kid, "alg": alg, "use": "sig"})
    return d


def claims(**over) -> dict[str, Any]:
    now = int(time.time())
    c = {
        "iss": TEST_ISSUER,
        "aud": TEST_AUDIENCE,
        "sub": "00000000-0000-0000-0000-0000000000aa",
        "role": "authenticated",
        "iat": now,
        "exp": now + 300,
        "app_metadata": {"provider": "email", "role": "admin"},
        "user_metadata": {},
    }
    for k, v in over.items():
        if v is _DROP:
            c.pop(k, None)
        else:
            c[k] = v
    return c


_DROP = object()
DROP = _DROP


def sign(private_key, kid: str, payload: dict[str, Any], alg: str = "ES256") -> str:
    return jwt.encode(payload, private_key, algorithm=alg, headers={"kid": kid})


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def raw_token(header: dict[str, Any], payload: dict[str, Any], signature: bytes = b"") -> str:
    h = _b64(json.dumps(header, separators=(",", ":")).encode())
    p = _b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{h}.{p}.{_b64(signature)}"


def hs256_token(secret: bytes, header: dict[str, Any], payload: dict[str, Any]) -> str:
    h = _b64(json.dumps(header, separators=(",", ":")).encode())
    p = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret, f"{h}.{p}".encode(), hashlib.sha256).digest()
    return f"{h}.{p}.{_b64(sig)}"


class JwksServer:
    def __init__(self) -> None:
        self.keys: list[dict[str, Any]] = []
        self.status = 200
        self.raw_body: bytes | None = None
        self.delay_s = 0.0
        self.requests = 0
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                outer.requests += 1
                if outer.delay_s:
                    time.sleep(outer.delay_s)
                body = outer.raw_body if outer.raw_body is not None else json.dumps({"keys": outer.keys}).encode()
                try:
                    self.send_response(outer.status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            def log_message(self, *args):
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._server.daemon_threads = True
        self.url = f"http://127.0.0.1:{self._server.server_address[1]}/auth/v1/.well-known/jwks.json"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def monotonic(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture
def jwks_server():
    s = JwksServer()
    yield s
    s.close()


@pytest.fixture
def fake_clock(monkeypatch):
    """Patch the clock used by PyJWT's JWKS cache/cooldown only."""
    import types

    import jwt.api_jwk
    import jwt.jwk_set_cache
    import jwt.jwks_client

    clock = FakeClock()
    fake_time = types.SimpleNamespace(monotonic=clock.monotonic, time=time.time, sleep=time.sleep)
    for mod in (jwt.jwks_client, jwt.jwk_set_cache, jwt.api_jwk):
        monkeypatch.setattr(mod, "time", fake_time)
    return clock
