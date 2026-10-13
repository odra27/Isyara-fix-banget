"""Chatbot model client (ADR-051 D3).

`chat_model_from_env()` picks the implementation:

    OPENROUTER_API_KEY set   → OpenRouterChatModel (OpenAI-compatible `POST /chat/completions`)
    OPENROUTER_API_KEY unset → OfflineChatModel (fixed, honest "belum tersambung" reply), so the
                               whole chat flow (history, FE animation) works without a key.

Other settings (all optional):
    OPENROUTER_MODEL      default "openrouter/auto" (choose a concrete model later, ADR-051 D3)
    OPENROUTER_BASE_URL   default https://openrouter.ai/api/v1
    OPENROUTER_TIMEOUT_S  default 25 (seconds, total per request)
    OPENROUTER_SITE_URL   optional HTTP-Referer header (OpenRouter app attribution)

Mapping (OpenRouter): timeout → ChatModelTimeout (504); network error, non-200, malformed
or empty answer → ChatModelUnavailable (503). The key and the response body are never
logged, stored or put into exception messages. Only the conversation TEXT is sent; no
landmarks, audio or video ever leave the backend (ADR-012).
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Literal, Protocol

import httpx

from app.errors import ChatModelTimeout, ChatModelUnavailable

ENV_KEY = "OPENROUTER_API_KEY"
ENV_MODEL = "OPENROUTER_MODEL"
ENV_BASE_URL = "OPENROUTER_BASE_URL"
ENV_TIMEOUT = "OPENROUTER_TIMEOUT_S"
ENV_SITE_URL = "OPENROUTER_SITE_URL"

DEFAULT_MODEL = "openrouter/auto"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_TIMEOUT_S = 25.0
MAX_REPLY_CHARS = 2000
MAX_TOKENS = 400

_UNAVAILABLE = "Chat model unavailable"
_TIMEOUT = "Chat model timed out"

# The answer is shown as text AND as a BISINDO sign animation, word by word, so it must be
# short, plain and free of formatting.
SYSTEM_PROMPT = (
    "Kamu adalah ISYARA, asisten belajar untuk siswa Tuli di Indonesia (SD sampai SMA). "
    "Jawab dalam Bahasa Indonesia yang sederhana, ramah, dan jelas. "
    "Gunakan kalimat pendek. Jawaban paling banyak 4 kalimat atau sekitar 60 kata, "
    "karena jawabanmu akan diperagakan sebagai animasi bahasa isyarat BISINDO kata demi kata. "
    "Jangan memakai markdown, tabel, daftar bertanda, emoji, atau simbol khusus. "
    "Bila pertanyaan kurang jelas, minta siswa menjelaskan lagi dengan sopan. "
    "Fokus pada materi pelajaran sekolah. Bila pertanyaan tidak pantas atau berbahaya, tolak dengan sopan "
    "dan arahkan kembali ke kegiatan belajar. Jangan meminta data pribadi siswa."
)

Role = Literal["user", "assistant"]


@dataclass(frozen=True)
class ChatTurn:
    role: Role
    content: str


class ChatModel(Protocol):
    name: str  # "openrouter" | "offline" (reported to the FE)

    async def reply(self, history: list[ChatTurn]) -> str: ...
    async def aclose(self) -> None: ...


_MD = re.compile(r"(\*\*|__|`+|^[ \t]*#+[ \t]*|^[ \t]*[-*•][ \t]+)", re.MULTILINE)


def clean_reply(text: str) -> str:
    """Strip light markdown the model may still produce; collapse blank lines; cap length."""
    text = _MD.sub("", text).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    if len(text) > MAX_REPLY_CHARS:
        text = text[:MAX_REPLY_CHARS].rsplit(" ", 1)[0].rstrip() + "…"
    return text


class OfflineChatModel:
    """Used while no OpenRouter key is configured. Never pretends to know the answer."""

    name = "offline"

    async def reply(self, history: list[ChatTurn]) -> str:
        return (
            "Halo! Aku ISYARA. Saat ini aku belum tersambung ke model AI, jadi belum bisa menjawab pertanyaanmu. "
            "Pertanyaanmu sudah tersimpan di riwayat. Coba lagi nanti, ya."
        )

    async def aclose(self) -> None:
        return None


@dataclass(frozen=True)
class OpenRouterConfig:
    api_key: str = field(repr=False)
    model: str = DEFAULT_MODEL
    base_url: str = DEFAULT_BASE_URL
    timeout_s: float = DEFAULT_TIMEOUT_S
    site_url: str | None = None

    @classmethod
    def from_env(cls) -> "OpenRouterConfig | None":
        key = os.environ.get(ENV_KEY, "").strip()
        if not key:
            return None
        try:
            timeout = float(os.environ.get(ENV_TIMEOUT, "") or DEFAULT_TIMEOUT_S)
        except ValueError:
            timeout = DEFAULT_TIMEOUT_S
        return cls(
            api_key=key,
            model=os.environ.get(ENV_MODEL, "").strip() or DEFAULT_MODEL,
            base_url=(os.environ.get(ENV_BASE_URL, "").strip() or DEFAULT_BASE_URL).rstrip("/"),
            timeout_s=timeout if timeout > 0 else DEFAULT_TIMEOUT_S,
            site_url=os.environ.get(ENV_SITE_URL, "").strip() or None,
        )


class OpenRouterChatModel:
    name = "openrouter"

    def __init__(self, config: OpenRouterConfig, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._config = config
        headers = {"Authorization": f"Bearer {config.api_key}", "X-Title": "ISYARA"}
        if config.site_url:
            headers["HTTP-Referer"] = config.site_url
        self._client = httpx.AsyncClient(
            base_url=config.base_url,
            headers=headers,
            timeout=httpx.Timeout(config.timeout_s),
            transport=transport,
            follow_redirects=False,
        )

    def __repr__(self) -> str:
        return f"OpenRouterChatModel(model={self._config.model!r})"

    async def reply(self, history: list[ChatTurn]) -> str:
        payload = {
            "model": self._config.model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}]
            + [{"role": t.role, "content": t.content} for t in history],
            "max_tokens": MAX_TOKENS,
            "temperature": 0.4,
        }
        try:
            r = await self._client.post("/chat/completions", json=payload)
        except httpx.TimeoutException:
            raise ChatModelTimeout(_TIMEOUT) from None
        except httpx.HTTPError:
            raise ChatModelUnavailable(_UNAVAILABLE) from None
        if r.status_code != 200:
            raise ChatModelUnavailable(_UNAVAILABLE)
        try:
            content = r.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError):
            raise ChatModelUnavailable(_UNAVAILABLE) from None
        if not isinstance(content, str) or not (text := clean_reply(content)):
            raise ChatModelUnavailable(_UNAVAILABLE)
        return text

    async def aclose(self) -> None:
        await self._client.aclose()


def chat_model_from_env() -> ChatModel:
    config = OpenRouterConfig.from_env()
    return OpenRouterChatModel(config) if config else OfflineChatModel()
