"""Chatbot endpoints for students (ADR-051 D3, D4). All require `require_student`.

GET    /api/chat/sessions                       own sessions, newest first (ADR-040 Page shape)
POST   /api/chat/sessions                       {title?} → 201 new empty session
PATCH  /api/chat/sessions/{id}                  {title} → renamed session
DELETE /api/chat/sessions/{id}                  → 204 (messages cascade)
GET    /api/chat/sessions/{id}/messages         session + its messages (oldest → newest)
POST   /api/chat/sessions/{id}/messages         {content, input_mode} → 201 {user_message,
                                                assistant_message, session, model}

Send flow: (1) DB: session belongs to caller + recent history → close the connection;
(2) chat model (OpenRouter, or the offline stand-in) answers; (3) DB: user message +
answer + session `updated_at`/title in ONE transaction. If the model fails, nothing is
stored and the FE can resend the same text.

A session of another student answers exactly like a missing one (404
CHAT_SESSION_NOT_FOUND). `student_id` is never accepted from the request.
Only text is stored; `input_mode = "sign"` records that the text came from the sign
recognizer, never the landmarks themselves (ADR-012).
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator

from app.api.admin import Page, PageQuery
from app.auth.student import StudentPrincipal, require_student
from app.chat.model import ChatTurn
from app.db.chat import ChatMessage, ChatRepository, ChatSession
from app.errors import ChatModelUnavailable, ChatSessionNotFound

router = APIRouter()

HISTORY_FOR_MODEL = 20  # last N messages sent to the model as context
MAX_MESSAGES_RETURNED = 200
DEFAULT_TITLE = "Percakapan baru"
TITLE_MAX = 60
_NOT_FOUND = "Chat session not found"


def _chat(db) -> ChatRepository:
    if db.chat is None:  # misconfigured DB bundle → generic 500 INTERNAL_ERROR
        raise RuntimeError("chat repository missing")
    return db.chat


def title_from(text: str) -> str:
    """First line of the first question, trimmed to TITLE_MAX characters on a word boundary."""
    line = " ".join(text.split())
    if len(line) <= TITLE_MAX:
        return line
    cut = line[:TITLE_MAX].rsplit(" ", 1)[0] or line[:TITLE_MAX]
    return cut.rstrip(" ,.;:") + "…"


def _clean_title(v: str | None) -> str | None:
    if v is None:
        return None
    v = " ".join(v.split())
    if not v:
        raise ValueError("title must not be blank")
    return v


class SessionOut(BaseModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    id: UUID
    role: Literal["user", "assistant"]
    content: str
    input_mode: Literal["text", "sign"] | None
    created_at: datetime


def _session(s: ChatSession) -> SessionOut:
    return SessionOut(id=s.id, title=s.title, created_at=s.created_at, updated_at=s.updated_at)


def _message(m: ChatMessage) -> MessageOut:
    return MessageOut(id=m.id, role=m.role, content=m.content, input_mode=m.input_mode, created_at=m.created_at)


class CreateSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: StrictStr | None = Field(default=None, max_length=TITLE_MAX * 2)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        return _clean_title(v)


class RenameSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: StrictStr = Field(min_length=1, max_length=TITLE_MAX * 2)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        return _clean_title(v)  # type: ignore[return-value]


class SendMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: StrictStr = Field(min_length=1, max_length=1000)
    input_mode: Literal["text", "sign"] = "text"

    @field_validator("content")
    @classmethod
    def _content(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("content must not be blank")
        return v


class SessionMessagesOut(BaseModel):
    session: SessionOut
    items: list[MessageOut]


class SendMessageResponse(BaseModel):
    session: SessionOut
    user_message: MessageOut
    assistant_message: MessageOut
    model: Literal["openrouter", "offline"]


@router.get("/api/chat/sessions", response_model=Page[SessionOut])
async def list_sessions(
    request: Request, q: Annotated[PageQuery, Query()], principal: StudentPrincipal = Depends(require_student)
) -> Page[SessionOut]:
    async with request.app.state.open_db() as db:
        rows, total = await _chat(db).list_sessions(principal.user_id, limit=q.page_size, offset=q.offset)
    return Page[SessionOut](items=[_session(r) for r in rows], page=q.page, page_size=q.page_size, total=total)


@router.post("/api/chat/sessions", response_model=SessionOut, status_code=201)
async def create_session(
    request: Request, body: CreateSessionRequest | None = None, principal: StudentPrincipal = Depends(require_student)
) -> SessionOut:
    title = title_from(body.title) if body and body.title else DEFAULT_TITLE
    async with request.app.state.open_db() as db:
        row = await _chat(db).create_session(principal.user_id, title)
    return _session(row)


@router.patch("/api/chat/sessions/{session_id}", response_model=SessionOut)
async def rename_session(
    session_id: UUID, body: RenameSessionRequest, request: Request,
    principal: StudentPrincipal = Depends(require_student),
) -> SessionOut:
    async with request.app.state.open_db() as db:
        row = await _chat(db).rename_session(principal.user_id, session_id, title_from(body.title))
    if row is None:
        raise ChatSessionNotFound(_NOT_FOUND)
    return _session(row)


@router.delete("/api/chat/sessions/{session_id}", status_code=204, response_class=Response)
async def delete_session(
    session_id: UUID, request: Request, principal: StudentPrincipal = Depends(require_student)
) -> Response:
    async with request.app.state.open_db() as db:
        deleted = await _chat(db).delete_session(principal.user_id, session_id)
    if not deleted:
        raise ChatSessionNotFound(_NOT_FOUND)
    return Response(status_code=204)


@router.get("/api/chat/sessions/{session_id}/messages", response_model=SessionMessagesOut)
async def list_messages(
    session_id: UUID, request: Request, principal: StudentPrincipal = Depends(require_student)
) -> SessionMessagesOut:
    async with request.app.state.open_db() as db:
        repo = _chat(db)
        session = await repo.get_session(principal.user_id, session_id)
        if session is None:
            raise ChatSessionNotFound(_NOT_FOUND)
        rows = await repo.list_messages(session_id, limit=MAX_MESSAGES_RETURNED)
    return SessionMessagesOut(session=_session(session), items=[_message(m) for m in rows])


@router.post("/api/chat/sessions/{session_id}/messages", response_model=SendMessageResponse, status_code=201)
async def send_message(
    session_id: UUID, body: SendMessageRequest, request: Request,
    principal: StudentPrincipal = Depends(require_student),
) -> SendMessageResponse:
    model = getattr(request.app.state, "chat_model", None)
    if model is None:
        raise ChatModelUnavailable("Chat model unavailable")

    # 1. ownership + context (connection closed before the slow model call)
    async with request.app.state.open_db() as db:
        repo = _chat(db)
        current = await repo.get_session(principal.user_id, session_id)
        if current is None:
            raise ChatSessionNotFound(_NOT_FOUND)
        history = await repo.list_messages(session_id, limit=HISTORY_FOR_MODEL)

    # 2. model answer
    turns = [ChatTurn(role=m.role, content=m.content) for m in history]  # type: ignore[arg-type]
    turns.append(ChatTurn(role="user", content=body.content))
    answer = await model.reply(turns)

    # 3. persist the exchange atomically; first question names the session
    async with request.app.state.open_db() as db:
        repo = _chat(db)
        if await repo.get_session(principal.user_id, session_id) is None:  # deleted meanwhile
            raise ChatSessionNotFound(_NOT_FOUND)
        # An untitled session is named after its first question; a title the student chose stays.
        new_title = title_from(body.content) if not history and current.title == DEFAULT_TITLE else None
        user, assistant, session = await repo.append_exchange(
            session_id, user_content=body.content, input_mode=body.input_mode,
            assistant_content=answer, new_title=new_title,
        )
    return SendMessageResponse(
        session=_session(session), user_message=_message(user), assistant_message=_message(assistant),
        model=model.name,
    )
