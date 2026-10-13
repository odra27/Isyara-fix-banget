"""Shared helpers for student login / chatbot tests (ADR-051). No real keys, tokens or network."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi.testclient import TestClient

from app.chat.model import ChatTurn
from app.db.chat import ChatMessage, ChatSession
from app.db.session import RequestDb
from app.db.students import StudentLoginTarget, StudentProfile
from app.main import create_app
from app.modeling.client import LibraryModelingClient
from tests.admin_support import AdminAuth
from tests.staff_support import PASSWORD, FakeGoTrue
from tests.test_modeling_client import FakePredictor

SCHOOL = UUID("00000000-0000-0000-0000-00000000b001")
SISWA = UUID("00000000-0000-0000-0000-0000000006a1")
SISWA_2 = UUID("00000000-0000-0000-0000-0000000006a2")
SISWA_INACTIVE = UUID("00000000-0000-0000-0000-0000000006a3")


def student(sid: UUID, *, nis: str, full_name="Nadia Putri", active=True) -> StudentProfile:
    return StudentProfile(id=sid, institution_id=SCHOOL, institution_name="SLB Negeri Contoh", nis=nis,
                          full_name=full_name, class_name="5A", grade=5, avatar_url=None, active=active)


def default_students() -> dict[UUID, tuple[str | None, StudentProfile]]:
    return {
        SISWA: ("0012345678@siswa.test", student(SISWA, nis="0012345678")),
        SISWA_2: ("0099999999@siswa.test", student(SISWA_2, nis="0099999999", full_name="Raka")),
        SISWA_INACTIVE: ("0011111111@siswa.test", student(SISWA_INACTIVE, nis="0011111111", active=False)),
    }


class FakeStudentRepo:
    def __init__(self, rows=None) -> None:
        self.rows = rows if rows is not None else default_students()

    async def get_profile(self, student_id: UUID) -> StudentProfile | None:
        row = self.rows.get(student_id)
        return row[1] if row else None

    async def find_login_targets(self, nis: str) -> list[StudentLoginTarget]:
        return [StudentLoginTarget(email=e, profile=p) for e, p in self.rows.values() if p.nis == nis][:2]


class FakeChatRepo:
    """In-memory ChatRepository with the same ownership semantics as Postgres."""

    def __init__(self) -> None:
        self.sessions: dict[UUID, tuple[UUID, ChatSession]] = {}  # id → (student_id, session)
        self.messages: list[ChatMessage] = []
        self._clock = datetime(2026, 10, 13, 8, 0, tzinfo=timezone.utc)

    def _now(self) -> datetime:
        self._clock += timedelta(seconds=1)
        return self._clock

    def _own(self, student_id, session_id):
        row = self.sessions.get(session_id)
        return row[1] if row and row[0] == student_id else None

    async def list_sessions(self, student_id, *, limit, offset):
        own = sorted((s for sid, s in self.sessions.values() if sid == student_id),
                     key=lambda s: (s.updated_at, str(s.id)), reverse=True)
        return own[offset:offset + limit], len(own)

    async def create_session(self, student_id, title):
        now = self._now()
        s = ChatSession(id=uuid.uuid4(), title=title, created_at=now, updated_at=now)
        self.sessions[s.id] = (student_id, s)
        return s

    async def get_session(self, student_id, session_id):
        return self._own(student_id, session_id)

    async def rename_session(self, student_id, session_id, title):
        s = self._own(student_id, session_id)
        if s is None:
            return None
        s = ChatSession(id=s.id, title=title, created_at=s.created_at, updated_at=s.updated_at)
        self.sessions[s.id] = (student_id, s)
        return s

    async def delete_session(self, student_id, session_id):
        if self._own(student_id, session_id) is None:
            return False
        del self.sessions[session_id]
        self.messages = [m for m in self.messages if m.session_id != session_id]
        return True

    async def list_messages(self, session_id, *, limit):
        own = [m for m in self.messages if m.session_id == session_id]
        return own[-limit:]

    async def append_exchange(self, session_id, *, user_content, input_mode, assistant_content, new_title):
        student_id, s = self.sessions[session_id]
        user = ChatMessage(uuid.uuid4(), session_id, "user", user_content, input_mode, self._now())
        bot = ChatMessage(uuid.uuid4(), session_id, "assistant", assistant_content, None, self._now())
        self.messages += [user, bot]
        s = ChatSession(id=s.id, title=new_title or s.title, created_at=s.created_at, updated_at=bot.created_at)
        self.sessions[session_id] = (student_id, s)
        return user, bot, s


class FakeStudentDb:
    def __init__(self) -> None:
        self.students = FakeStudentRepo()
        self.chat = FakeChatRepo()
        self.opened = 0

    @asynccontextmanager
    async def open(self):
        self.opened += 1
        yield RequestDb(devices=None, phrases=None, logs=None, students=self.students, chat=self.chat)


class FakeChatModel:
    name = "openrouter"

    def __init__(self) -> None:
        self.calls: list[list[ChatTurn]] = []
        self.answer = "Siklus air adalah perjalanan air yang terus berulang."
        self.error: Exception | None = None

    async def reply(self, history):
        self.calls.append(list(history))
        if self.error is not None:
            raise self.error
        return self.answer

    async def aclose(self):
        return None


def student_gotrue(auth: AdminAuth) -> FakeGoTrue:
    g = FakeGoTrue(auth)
    g.accounts = {
        "0012345678@siswa.test": (PASSWORD, SISWA, "siswa"),
        "0099999999@siswa.test": (PASSWORD, SISWA_2, "siswa"),
        "0011111111@siswa.test": (PASSWORD, SISWA_INACTIVE, "siswa"),
    }
    return g


def _not_configured():
    raise RuntimeError("not configured in this test")


def student_client(auth: AdminAuth, open_db, *, auth_client_factory=_not_configured, chat_model=None) -> TestClient:
    app = create_app(
        modeling_factory=lambda: LibraryModelingClient(FakePredictor()),
        open_db=open_db,
        jwt_verifier_factory=auth.verifier,
        storage_factory=_not_configured,
        auth_client_factory=auth_client_factory,
        auth_admin_factory=_not_configured,
        chat_model_factory=(lambda: chat_model) if chat_model is not None else _not_configured,
    )
    return TestClient(app, raise_server_exceptions=False)


def student_headers(auth: AdminAuth, sid: UUID, role="siswa", **over) -> dict[str, str]:
    app_metadata = {"provider": "email", "role": role} if role is not None else {"provider": "email"}
    return auth.headers(sub=str(sid), app_metadata=app_metadata, **over)
