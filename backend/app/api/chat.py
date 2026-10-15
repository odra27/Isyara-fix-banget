"""Chatbot endpoints for students (ADR-051 D3, D4). All require `require_student`.

GET    /api/chat/sessions                       own sessions, newest first (ADR-040 Page shape)
POST   /api/chat/sessions                       {title?} → 201 new empty session
PATCH  /api/chat/sessions/{id}                  {title} → renamed session
DELETE /api/chat/sessions/{id}                  → 204 (messages cascade)
GET    /api/chat/sessions/{id}/messages         session + its messages (oldest → newest) + documents
POST   /api/chat/sessions/{id}/messages         {content, input_mode, video?} → 201 {user_message,
                                                assistant_message, session, model}
POST   /api/chat/sessions/{id}/documents        multipart `file` (text PDF) → 201 document (ADR-053)
GET    /api/chat/documents                      own uploaded documents, newest first (ADR-053)
GET    /api/chat/activity                       counters for the last 7 days (ADR-053)

ADR-053 context: `video = {id, section, t_sec}` makes the Backend add the transcript of that
section (app/learning/catalog.py) to the model prompt; uploaded document text of the session is
added the same way. The FE never sends transcript or document text with a question.

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

from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator, model_validator
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.exceptions import HTTPException

from app.api.admin import Page, PageQuery
from app.auth.student import StudentPrincipal, require_student
from app.chat.documents import MAX_PDF_BYTES, document_context, extract_pdf_text, safe_filename
from app.chat.model import ChatTurn
from app.db.chat import ChatDocument, ChatMessage, ChatRepository, ChatSession
from app.errors import ChatModelUnavailable, ChatSessionNotFound, DocumentInvalid, DocumentTooLarge
from app.learning.catalog import VIDEOS, video_context

router = APIRouter()

HISTORY_FOR_MODEL = 20  # last N messages sent to the model as context
MAX_MESSAGES_RETURNED = 200
DEFAULT_TITLE = "Percakapan baru"
TITLE_MAX = 60
DOCS_FOR_MODEL = 2  # newest uploaded documents of the session sent as context
MAX_DOCS_PER_SESSION = 5
ACTIVITY_DAYS = 7
_NOT_FOUND = "Chat session not found"
_MULTIPART_SLACK_BYTES = 64 * 1024


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
    video_id: str | None = None  # ADR-053 (user rows asked from a video page)
    video_t_sec: int | None = None


class DocumentOut(BaseModel):
    id: UUID
    session_id: UUID
    filename: str
    page_count: int
    char_count: int
    created_at: datetime


class StudentDocumentOut(DocumentOut):
    session_title: str


class ActivityOut(BaseModel):
    days: int
    video_questions: int
    documents: int


def _session(s: ChatSession) -> SessionOut:
    return SessionOut(id=s.id, title=s.title, created_at=s.created_at, updated_at=s.updated_at)


def _message(m: ChatMessage) -> MessageOut:
    return MessageOut(id=m.id, role=m.role, content=m.content, input_mode=m.input_mode, created_at=m.created_at,
                      video_id=m.video_id, video_t_sec=m.video_t_sec)


def _document(d: ChatDocument) -> DocumentOut:
    return DocumentOut(id=d.id, session_id=d.session_id, filename=d.filename, page_count=d.page_count,
                       char_count=d.char_count, created_at=d.created_at)


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


class VideoRef(BaseModel):
    """Where a question was asked from (ADR-053): catalog id + section index + playback second."""

    model_config = ConfigDict(extra="forbid")

    id: StrictStr = Field(min_length=1, max_length=60)
    section: StrictInt = Field(ge=0)
    t_sec: StrictInt = Field(ge=0, le=36000)

    @model_validator(mode="after")
    def _known(self) -> "VideoRef":
        video = VIDEOS.get(self.id)
        if video is None:
            raise ValueError("unknown video id")
        if self.section >= len(video.sections):
            raise ValueError("section out of range")
        return self


class SendMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: StrictStr = Field(min_length=1, max_length=1000)
    input_mode: Literal["text", "sign"] = "text"
    video: VideoRef | None = None

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
    documents: list[DocumentOut] = []


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
        docs = await repo.session_documents(session_id)
    return SessionMessagesOut(session=_session(session), items=[_message(m) for m in rows],
                              documents=[_document(d) for d in docs])


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
        doc_texts = await repo.document_texts(session_id, limit=DOCS_FOR_MODEL)

    # 2. model answer (ADR-053: Backend-built context from the video catalog / session documents)
    context_parts = [c for c in (
        video_context(VIDEOS[body.video.id], body.video.section,
                      body.video.t_sec) if body.video else None,
        document_context(doc_texts),
    ) if c]
    turns = [ChatTurn(role=m.role, content=m.content)
             for m in history]  # type: ignore[arg-type]
    turns.append(ChatTurn(role="user", content=body.content))
    answer = await model.reply(turns, context="\n\n".join(context_parts) or None)

    # 3. persist the exchange atomically; first question names the session
    async with request.app.state.open_db() as db:
        repo = _chat(db)
        # deleted meanwhile
        if await repo.get_session(principal.user_id, session_id) is None:
            raise ChatSessionNotFound(_NOT_FOUND)
        # An untitled session is named after its first question; a title the student chose stays.
        new_title = title_from(
            body.content) if not history and current.title == DEFAULT_TITLE else None
        user, assistant, session = await repo.append_exchange(
            session_id, user_content=body.content, input_mode=body.input_mode,
            assistant_content=answer, new_title=new_title,
            video_id=body.video.id if body.video else None,
            video_t_sec=body.video.t_sec if body.video else None,
        )
    return SendMessageResponse(
        session=_session(session), user_message=_message(user), assistant_message=_message(assistant),
        model=model.name,
    )


# ---------------------------------------------------------------- ADR-053: PDF material


async def _read_pdf_upload(request: Request) -> tuple[bytes, str]:
    """Exactly one multipart `file` part holding a PDF of at most MAX_PDF_BYTES."""
    content_type = request.headers.get("content-type", "")
    if not content_type.lower().startswith("multipart/form-data"):
        raise DocumentInvalid(
            "multipart/form-data with a 'file' part is required")
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > MAX_PDF_BYTES + _MULTIPART_SLACK_BYTES:
        raise DocumentTooLarge("PDF exceeds the maximum size of 5 MB")
    try:
        form = await request.form(max_files=1, max_fields=1)
    except HTTPException:
        raise DocumentInvalid("Malformed multipart body") from None
    try:
        if set(form.keys()) != {"file"} or len(form.getlist("file")) != 1:
            raise DocumentInvalid(
                "Exactly one 'file' part and no other fields allowed")
        upload = form["file"]
        if not isinstance(upload, UploadFile):
            raise DocumentInvalid("'file' must be a file upload")
        data = await upload.read(MAX_PDF_BYTES + 1)
        if not data:
            raise DocumentInvalid("File is empty")
        if len(data) > MAX_PDF_BYTES:
            raise DocumentTooLarge("PDF exceeds the maximum size of 5 MB")
        return data, safe_filename(upload.filename)
    finally:
        await form.close()


@router.post("/api/chat/sessions/{session_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    session_id: UUID, request: Request, principal: StudentPrincipal = Depends(require_student),
) -> DocumentOut:
    async with request.app.state.open_db() as db:  # ownership first: no parsing for foreign sessions
        repo = _chat(db)
        if await repo.get_session(principal.user_id, session_id) is None:
            raise ChatSessionNotFound(_NOT_FOUND)
        if len(await repo.session_documents(session_id)) >= MAX_DOCS_PER_SESSION:
            raise DocumentTooLarge(
                f"A chat can hold at most {MAX_DOCS_PER_SESSION} documents")

    data, filename = await _read_pdf_upload(request)
    # CPU-bound; keep the event loop free
    pdf = await run_in_threadpool(extract_pdf_text, data)
    del data  # the PDF bytes are never stored

    async with request.app.state.open_db() as db:
        repo = _chat(db)
        # deleted meanwhile
        if await repo.get_session(principal.user_id, session_id) is None:
            raise ChatSessionNotFound(_NOT_FOUND)
        doc = await repo.add_document(session_id, filename=filename, page_count=pdf.pages, content=pdf.text)
    return _document(doc)


@router.get("/api/chat/documents")
async def list_documents(
    request: Request, principal: StudentPrincipal = Depends(require_student),
) -> dict[str, list[StudentDocumentOut]]:
    async with request.app.state.open_db() as db:
        rows = await _chat(db).list_documents(principal.user_id, limit=100)
    return {"items": [StudentDocumentOut(**_document(r.document).model_dump(), session_title=r.session_title)
                      for r in rows]}


@router.get("/api/chat/activity", response_model=ActivityOut)
async def activity(
    request: Request, principal: StudentPrincipal = Depends(require_student),
) -> ActivityOut:
    since = datetime.now(timezone.utc) - timedelta(days=ACTIVITY_DAYS)
    async with request.app.state.open_db() as db:
        a = await _chat(db).activity(principal.user_id, since)
    return ActivityOut(days=ACTIVITY_DAYS, video_questions=a.video_questions, documents=a.documents)
