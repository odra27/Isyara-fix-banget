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
    OPENROUTER_API_KEYS   optional comma-separated backup keys (ADR-053): when a key answers
                          401/402/403/429 the same request is retried with the next key
    OPENROUTER_FALLBACK_MODELS  optional comma-separated backup models: tried in order (with all
                          keys) when the main model gives no usable answer

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
ENV_KEYS = "OPENROUTER_API_KEYS"  # ADR-053: comma-separated backup keys
# comma-separated backup models, tried after OPENROUTER_MODEL
ENV_MODELS = "OPENROUTER_FALLBACK_MODELS"

DEFAULT_MODEL = "openrouter/auto"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_TIMEOUT_S = 25.0
MAX_REPLY_CHARS = 2000
# room for "explain the PDF + solve its exercises" answers (~500 tokens seen)
MAX_TOKENS = 900
# 401 invalid key, 402 out of credit, 403 key blocked/limit, 429 rate limited → next key.
_TRY_NEXT_KEY = frozenset({401, 402, 403, 429})

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

    async def reply(self, history: list[ChatTurn],
                    *, context: str | None = None) -> str: ...

    async def aclose(self) -> None: ...


_MD = re.compile(
    r"(\*\*|__|`+|^[ \t]*#+[ \t]*|^[ \t]*[-*•][ \t]+)", re.MULTILINE)


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

    async def reply(self, history: list[ChatTurn], *, context: str | None = None) -> str:
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
    # ADR-053: optional backup keys, tried in order when a key is rate limited, out of credit
    # or rejected. Never logged (repr=False).
    extra_keys: tuple[str, ...] = field(default=(), repr=False)

    # Optional backup models, tried in order when the main model gives no usable answer.
    extra_models: tuple[str, ...] = ()

    @property
    def keys(self) -> tuple[str, ...]:
        return (self.api_key, *self.extra_keys)

    @property
    def models(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys((self.model, *self.extra_models)))

    @classmethod
    def from_env(cls) -> "OpenRouterConfig | None":
        primary = os.environ.get(ENV_KEY, "").strip()
        extra = [k.strip() for k in os.environ.get(
            ENV_KEYS, "").replace("\n", ",").split(",") if k.strip()]
        # de-duplicated, order kept
        keys = list(dict.fromkeys([k for k in [primary, *extra] if k]))
        if not keys:
            return None
        try:
            timeout = float(os.environ.get(ENV_TIMEOUT, "")
                            or DEFAULT_TIMEOUT_S)
        except ValueError:
            timeout = DEFAULT_TIMEOUT_S
        extra_models = tuple(m.strip() for m in os.environ.get(
            ENV_MODELS, "").split(",") if m.strip())
        return cls(
            api_key=keys[0],
            extra_keys=tuple(keys[1:]),
            extra_models=extra_models,
            model=os.environ.get(ENV_MODEL, "").strip() or DEFAULT_MODEL,
            base_url=(os.environ.get(ENV_BASE_URL, "").strip()
                      or DEFAULT_BASE_URL).rstrip("/"),
            timeout_s=timeout if timeout > 0 else DEFAULT_TIMEOUT_S,
            site_url=os.environ.get(ENV_SITE_URL, "").strip() or None,
        )


class OpenRouterChatModel:
    name = "openrouter"

    def __init__(self, config: OpenRouterConfig, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._config = config
        # Authorization is set per request: a different key may be used for a retry.
        headers = {"X-Title": "ISYARA"}
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

    async def reply(self, history: list[ChatTurn], *, context: str | None = None) -> str:
        # `context` (ADR-053): video transcript slice and/or uploaded document text, built by the
        # Backend. It goes in a second system message so the base instructions stay first.
        system = [{"role": "system", "content": SYSTEM_PROMPT}]
        if context:
            system.append({"role": "system", "content": context})
        payload = {
            "model": self._config.model,
            "messages": system + [{"role": t.role, "content": t.content} for t in history],
            "max_tokens": MAX_TOKENS,
            "temperature": 0.4,
            # The free Nemotron models "think" first by default; the hidden reasoning used up the
            # whole token budget and the visible answer came back empty (finish_reason=length).
            # Answers here are short and plain, so reasoning is switched off (OpenRouter ignores
            # this for models without reasoning).
            "reasoning": {"enabled": False},
        }
        # Each model is tried with every key (next key on 401/402/403/429). If the model still
        # gives no usable answer (limit on all keys, 4xx/5xx, empty reply), the backup model is
        # tried. Timeouts and network errors stop immediately: the time budget is spent / the
        # network is down for every model alike.
        for model in self._config.models:
            payload["model"] = model
            r = None
            for key in self._config.keys:
                try:
                    r = await self._client.post(
                        "/chat/completions", json=payload, headers={"Authorization": f"Bearer {key}"})
                except httpx.TimeoutException:
                    raise ChatModelTimeout(_TIMEOUT) from None
                except httpx.HTTPError:
                    raise ChatModelUnavailable(_UNAVAILABLE) from None
                if r.status_code not in _TRY_NEXT_KEY:
                    break
            if r is None or r.status_code != 200:
                continue
            try:
                content = r.json()["choices"][0]["message"]["content"]
            except (ValueError, KeyError, IndexError, TypeError):
                continue
            if isinstance(content, str) and (text := clean_reply(content)):
                return text
        raise ChatModelUnavailable(_UNAVAILABLE)

    async def aclose(self) -> None:
        await self._client.aclose()


def chat_model_from_env() -> ChatModel:
    config = OpenRouterConfig.from_env()
    return OpenRouterChatModel(config) if config else OfflineChatModel()
