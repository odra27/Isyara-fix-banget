"""ADR-051 D3: OpenRouter client + offline stand-in. httpx.MockTransport only, no network."""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.chat.model import (
    SYSTEM_PROMPT,
    ChatTurn,
    OfflineChatModel,
    OpenRouterChatModel,
    OpenRouterConfig,
    chat_model_from_env,
    clean_reply,
)
from app.errors import ChatModelTimeout, ChatModelUnavailable

KEY = "sk-or-TESTONLY-not-a-real-key"


def run(coro):
    return asyncio.run(coro)


def model_with(handler, **cfg):
    return OpenRouterChatModel(OpenRouterConfig(api_key=KEY, **cfg), transport=httpx.MockTransport(handler))


def ok(content):
    return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})


def test_env_without_key_is_offline(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    m = chat_model_from_env()
    assert isinstance(m, OfflineChatModel) and m.name == "offline"
    assert "belum tersambung" in run(m.reply([ChatTurn("user", "Halo")]))


def test_env_with_key(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", KEY)
    monkeypatch.setenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")
    monkeypatch.setenv("OPENROUTER_TIMEOUT_S", "abc")
    m = chat_model_from_env()
    assert isinstance(m, OpenRouterChatModel) and KEY not in repr(m)
    cfg = OpenRouterConfig.from_env()
    assert cfg.model == "google/gemini-2.0-flash-001" and cfg.timeout_s == 25.0 and KEY not in repr(cfg)


def test_request_shape_and_reply():
    seen = []

    def handler(req):
        seen.append(req)
        return ok("**Siklus air** adalah perjalanan air.\n\n\n\n- menguap")

    m = model_with(handler, model="x/y")
    out = run(m.reply([ChatTurn("user", "Jelaskan siklus air")]))
    assert out == "Siklus air adalah perjalanan air.\n\nmenguap"
    req = seen[0]
    assert req.url.path.endswith("/chat/completions")
    assert req.headers["authorization"] == f"Bearer {KEY}"
    body = json.loads(req.content)
    assert body["model"] == "x/y"
    assert body["messages"][0] == {"role": "system", "content": SYSTEM_PROMPT}
    assert body["messages"][1] == {"role": "user", "content": "Jelaskan siklus air"}


@pytest.mark.parametrize("resp", [
    httpx.Response(401, json={"error": "bad key"}),
    httpx.Response(500),
    httpx.Response(200, content=b"not json"),
    httpx.Response(200, json={"choices": []}),
    httpx.Response(200, json={"choices": [{"message": {"content": None}}]}),
    ok("   "),
])
def test_unusable_answers_are_unavailable(resp):
    with pytest.raises(ChatModelUnavailable) as e:
        run(model_with(lambda req: resp).reply([ChatTurn("user", "Halo")]))
    assert KEY not in str(e.value)


def test_network_error_and_timeout():
    def boom(req):
        raise httpx.ConnectError("down")

    def slow(req):
        raise httpx.ReadTimeout("slow")

    with pytest.raises(ChatModelUnavailable):
        run(model_with(boom).reply([ChatTurn("user", "Halo")]))
    with pytest.raises(ChatModelTimeout):
        run(model_with(slow).reply([ChatTurn("user", "Halo")]))


def test_clean_reply_caps_length():
    assert len(clean_reply("kata " * 1000)) <= 2001
