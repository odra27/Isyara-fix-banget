"""Chatbot history data access (ADR-051 D4). psycopg 3, parameterized SQL.

Every query that touches a session is scoped by `student_id`, so one student can never
read, write or delete another student's conversation: a foreign session behaves exactly
like a missing one. Only text is stored (no landmarks / audio / video, ADR-012).

`append_exchange` writes the user message, the assistant reply and the session's
`updated_at` (and title, for the first message) in ONE transaction, so history never
contains a question without its answer.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from psycopg import AsyncConnection

_SESSION_COLS = "id, title, created_at, updated_at"
_MESSAGE_COLS = "id, session_id, role, content, input_mode, created_at, video_id, video_t_sec"
_DOC_COLS = "id, session_id, filename, page_count, char_count, created_at"


@dataclass(frozen=True)
class ChatSession:
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class ChatMessage:
    id: UUID
    session_id: UUID
    role: str  # 'user' | 'assistant'
    content: str
    input_mode: str | None  # 'text' | 'sign' for user rows, None for assistant rows
    created_at: datetime
    video_id: str | None = None  # ADR-053: user question asked while watching this video
    video_t_sec: int | None = None  # ... at this playback second


@dataclass(frozen=True)
class ChatDocument:
    """Metadata of an uploaded PDF (ADR-053). The text itself is only read for the model."""

    id: UUID
    session_id: UUID
    filename: str
    page_count: int
    char_count: int
    created_at: datetime


@dataclass(frozen=True)
class StudentDocument:
    document: ChatDocument
    session_title: str


@dataclass(frozen=True)
class ChatActivity:
    video_questions: int  # user questions asked from a video page
    documents: int  # PDFs uploaded


class ChatRepository(Protocol):
    async def list_sessions(self, student_id: UUID, *, limit: int,
                            offset: int) -> tuple[list[ChatSession], int]: ...

    async def create_session(self, student_id: UUID,
                             title: str) -> ChatSession: ...

    async def get_session(self, student_id: UUID,
                          session_id: UUID) -> ChatSession | None: ...

    async def rename_session(
        self, student_id: UUID, session_id: UUID, title: str) -> ChatSession | None: ...

    async def delete_session(self, student_id: UUID,
                             session_id: UUID) -> bool: ...

    async def list_messages(self, session_id: UUID, *,
                            limit: int) -> list[ChatMessage]: ...

    async def append_exchange(self, session_id: UUID, *, user_content: str, input_mode: str,
                              assistant_content: str, new_title: str | None,
                              video_id: str | None = None, video_t_sec: int | None = None,
                              ) -> tuple[ChatMessage, ChatMessage, ChatSession]: ...

    async def add_document(self, session_id: UUID, *, filename: str, page_count: int,
                           content: str) -> ChatDocument: ...

    async def session_documents(
        self, session_id: UUID) -> list[ChatDocument]: ...

    async def document_texts(self, session_id: UUID, *,
                             limit: int) -> list[tuple[str, str]]: ...

    async def list_documents(self, student_id: UUID, *,
                             limit: int) -> list[StudentDocument]: ...
    async def activity(self, student_id: UUID,
                       since: datetime) -> ChatActivity: ...


class PostgresChatRepository:
    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    async def list_sessions(self, student_id: UUID, *, limit: int, offset: int) -> tuple[list[ChatSession], int]:
        async with self._conn.cursor() as cur:
            await cur.execute("select count(*) from chat_sessions where student_id = %s", (student_id,))
            total = (await cur.fetchone())[0]
            await cur.execute(
                f"select {_SESSION_COLS} from chat_sessions where student_id = %s"
                " order by updated_at desc, id desc limit %s offset %s",
                (student_id, limit, offset),
            )
            rows = await cur.fetchall()
        return [ChatSession(*r) for r in rows], int(total)

    async def create_session(self, student_id: UUID, title: str) -> ChatSession:
        async with self._conn.cursor() as cur:
            await cur.execute(
                f"insert into chat_sessions (student_id, title) values (%s, %s) returning {_SESSION_COLS}",
                (student_id, title),
            )
            return ChatSession(*(await cur.fetchone()))

    async def get_session(self, student_id: UUID, session_id: UUID) -> ChatSession | None:
        async with self._conn.cursor() as cur:
            await cur.execute(
                f"select {_SESSION_COLS} from chat_sessions where id = %s and student_id = %s",
                (session_id, student_id),
            )
            row = await cur.fetchone()
        return ChatSession(*row) if row else None

    async def rename_session(self, student_id: UUID, session_id: UUID, title: str) -> ChatSession | None:
        async with self._conn.cursor() as cur:
            await cur.execute(
                f"update chat_sessions set title = %s where id = %s and student_id = %s returning {_SESSION_COLS}",
                (title, session_id, student_id),
            )
            row = await cur.fetchone()
        return ChatSession(*row) if row else None

    async def delete_session(self, student_id: UUID, session_id: UUID) -> bool:
        # chat_messages rows go with it (ON DELETE CASCADE).
        async with self._conn.cursor() as cur:
            await cur.execute("delete from chat_sessions where id = %s and student_id = %s", (session_id, student_id))
            return cur.rowcount == 1

    async def list_messages(self, session_id: UUID, *, limit: int) -> list[ChatMessage]:
        # Latest `limit` messages, returned oldest → newest.
        async with self._conn.cursor() as cur:
            await cur.execute(
                f"select {_MESSAGE_COLS} from (select {_MESSAGE_COLS} from chat_messages where session_id = %s"
                " order by created_at desc, id desc limit %s) m order by created_at asc, id asc",
                (session_id, limit),
            )
            rows = await cur.fetchall()
        return [ChatMessage(*r) for r in rows]

    async def append_exchange(self, session_id: UUID, *, user_content: str, input_mode: str,
                              assistant_content: str, new_title: str | None,
                              video_id: str | None = None, video_t_sec: int | None = None,
                              ) -> tuple[ChatMessage, ChatMessage, ChatSession]:
        async with self._conn.transaction():
            async with self._conn.cursor() as cur:
                await cur.execute(
                    "insert into chat_messages (session_id, role, content, input_mode, video_id, video_t_sec)"
                    f" values (%s, 'user', %s, %s, %s, %s) returning {_MESSAGE_COLS}",
                    (session_id, user_content, input_mode, video_id, video_t_sec),
                )
                user = ChatMessage(*(await cur.fetchone()))
                await cur.execute(
                    "insert into chat_messages (session_id, role, content, input_mode)"
                    f" values (%s, 'assistant', %s, null) returning {_MESSAGE_COLS}",
                    (session_id, assistant_content),
                )
                assistant = ChatMessage(*(await cur.fetchone()))
                await cur.execute(
                    "update chat_sessions set updated_at = now(), title = coalesce(%s, title)"
                    f" where id = %s returning {_SESSION_COLS}",
                    (new_title, session_id),
                )
                session = ChatSession(*(await cur.fetchone()))
        return user, assistant, session

    # ---- ADR-053: uploaded PDFs (text only) and activity counters ---------------------

    async def add_document(self, session_id: UUID, *, filename: str, page_count: int,
                           content: str) -> ChatDocument:
        async with self._conn.transaction():
            async with self._conn.cursor() as cur:
                await cur.execute(
                    "insert into chat_documents (session_id, filename, page_count, content)"
                    " values (%s, %s, %s, %s)"
                    " returning id, session_id, filename, page_count, length(content), created_at",
                    (session_id, filename, page_count, content),
                )
                doc = ChatDocument(*(await cur.fetchone()))
                await cur.execute("update chat_sessions set updated_at = now() where id = %s", (session_id,))
        return doc

    async def session_documents(self, session_id: UUID) -> list[ChatDocument]:
        async with self._conn.cursor() as cur:
            await cur.execute(
                "select id, session_id, filename, page_count, length(content), created_at"
                " from chat_documents where session_id = %s order by created_at asc, id asc",
                (session_id,),
            )
            rows = await cur.fetchall()
        return [ChatDocument(*r) for r in rows]

    async def document_texts(self, session_id: UUID, *, limit: int) -> list[tuple[str, str]]:
        # Newest first: the most recent upload gets the context budget first.
        async with self._conn.cursor() as cur:
            await cur.execute(
                "select filename, content from chat_documents where session_id = %s"
                " order by created_at desc, id desc limit %s",
                (session_id, limit),
            )
            rows = await cur.fetchall()
        return [(r[0], r[1]) for r in rows]

    async def list_documents(self, student_id: UUID, *, limit: int) -> list[StudentDocument]:
        async with self._conn.cursor() as cur:
            await cur.execute(
                "select d.id, d.session_id, d.filename, d.page_count, length(d.content), d.created_at, s.title"
                " from chat_documents d join chat_sessions s on s.id = d.session_id"
                " where s.student_id = %s order by d.created_at desc, d.id desc limit %s",
                (student_id, limit),
            )
            rows = await cur.fetchall()
        return [StudentDocument(ChatDocument(*r[:6]), r[6]) for r in rows]

    async def activity(self, student_id: UUID, since: datetime) -> ChatActivity:
        async with self._conn.cursor() as cur:
            await cur.execute(
                "select"
                " (select count(*) from chat_messages m join chat_sessions s on s.id = m.session_id"
                "   where s.student_id = %s and m.role = 'user' and m.video_id is not null and m.created_at >= %s),"
                " (select count(*) from chat_documents d join chat_sessions s on s.id = d.session_id"
                "   where s.student_id = %s and d.created_at >= %s)",
                (student_id, since, student_id, since),
            )
            q, d = await cur.fetchone()
        return ChatActivity(video_questions=int(q), documents=int(d))
