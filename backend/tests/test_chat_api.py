"""ADR-051 D3/D4: /api/chat/* — per-student sessions, model call, atomic history."""
from __future__ import annotations

import uuid

import pytest

from app.errors import ChatModelTimeout, ChatModelUnavailable
from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.staff_support import PETUGAS, staff_headers
from tests.student_support import SISWA, SISWA_2, FakeChatModel, FakeStudentDb, student_client, student_headers


@pytest.fixture
def db():
    return FakeStudentDb()


@pytest.fixture
def model():
    return FakeChatModel()


@pytest.fixture
def client(admin_auth, db, model):
    with student_client(admin_auth, db.open, chat_model=model) as c:
        yield c


@pytest.fixture
def h(admin_auth):
    return student_headers(admin_auth, SISWA)


@pytest.fixture
def h2(admin_auth):
    return student_headers(admin_auth, SISWA_2)


def new_session(c, h, **body):
    r = c.post("/api/chat/sessions", headers=h, json=body or None)
    assert r.status_code == 201, r.text
    return r.json()


def send(c, h, sid, content, mode="text"):
    return c.post(f"/api/chat/sessions/{sid}/messages", headers=h, json={"content": content, "input_mode": mode})


def test_create_and_list_sessions(client, h):
    a = new_session(client, h)
    assert a["title"] == "Percakapan baru"
    b = new_session(client, h, title="  Latihan   pecahan ")
    assert b["title"] == "Latihan pecahan"
    r = client.get("/api/chat/sessions", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2 and [s["id"] for s in data["items"]] == [b["id"], a["id"]]


def test_send_message_stores_exchange_and_names_session(client, h, model):
    s = new_session(client, h)
    r = send(client, h, s["id"], "Jelaskan siklus air", "sign")
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["model"] == "openrouter"
    assert data["user_message"]["role"] == "user" and data["user_message"]["input_mode"] == "sign"
    assert data["assistant_message"] == {**data["assistant_message"], "role": "assistant", "input_mode": None,
                                         "content": model.answer}
    assert data["session"]["title"] == "Jelaskan siklus air"
    assert model.calls[0][-1].content == "Jelaskan siklus air"

    msgs = client.get(f"/api/chat/sessions/{s['id']}/messages", headers=h).json()
    assert [m["role"] for m in msgs["items"]] == ["user", "assistant"]


def test_history_is_sent_as_context_and_title_kept(client, h, model):
    s = new_session(client, h)
    send(client, h, s["id"], "Apa itu persentase?")
    r = send(client, h, s["id"], "Contohnya?")
    assert r.json()["session"]["title"] == "Apa itu persentase?"
    assert [(t.role, t.content) for t in model.calls[1]] == [
        ("user", "Apa itu persentase?"), ("assistant", model.answer), ("user", "Contohnya?")]


def test_explicit_title_is_not_overwritten(client, h):
    s = new_session(client, h, title="PR Matematika")
    assert send(client, h, s["id"], "Berapa 2 + 2?").json()["session"]["title"] == "PR Matematika"


def test_long_question_title_is_trimmed(client, h):
    s = new_session(client, h)
    title = send(client, h, s["id"], "kata " * 40).json()["session"]["title"]
    assert len(title) <= 61 and title.endswith("…")


@pytest.mark.parametrize("err,status,code", [
    (ChatModelUnavailable("x"), 503, "CHAT_MODEL_UNAVAILABLE"),
    (ChatModelTimeout("x"), 504, "CHAT_MODEL_TIMEOUT"),
])
def test_model_failure_stores_nothing(client, h, db, model, err, status, code):
    s = new_session(client, h)
    model.error = err
    r = send(client, h, s["id"], "Halo")
    assert r.status_code == status and r.json()["error"]["code"] == code
    assert db.chat.messages == []


def test_rename_and_delete(client, h):
    s = new_session(client, h)
    r = client.patch(f"/api/chat/sessions/{s['id']}", headers=h, json={"title": "IPA"})
    assert r.status_code == 200 and r.json()["title"] == "IPA"
    send(client, h, s["id"], "Halo")
    assert client.delete(f"/api/chat/sessions/{s['id']}", headers=h).status_code == 204
    assert client.get(f"/api/chat/sessions/{s['id']}/messages", headers=h).status_code == 404


def test_other_students_session_looks_missing(client, h, h2, db):
    s = new_session(client, h)
    send(client, h, s["id"], "Rahasia")
    sid = s["id"]
    for r in (
        client.get(f"/api/chat/sessions/{sid}/messages", headers=h2),
        send(client, h2, sid, "Halo"),
        client.patch(f"/api/chat/sessions/{sid}", headers=h2, json={"title": "x"}),
        client.delete(f"/api/chat/sessions/{sid}", headers=h2),
    ):
        assert r.status_code == 404 and r.json()["error"]["code"] == "CHAT_SESSION_NOT_FOUND"
    assert client.get("/api/chat/sessions", headers=h2).json()["total"] == 0
    assert len(db.chat.messages) == 2


def test_unknown_session(client, h):
    r = send(client, h, uuid.uuid4(), "Halo")
    assert r.status_code == 404


@pytest.mark.parametrize("body", [
    {}, {"content": ""}, {"content": "   "}, {"content": "x" * 1001}, {"content": 5},
    {"content": "Halo", "input_mode": "video"}, {"content": "Halo", "student_id": str(SISWA_2)},
])
def test_send_validation(client, h, model, body):
    s = new_session(client, h)
    r = client.post(f"/api/chat/sessions/{s['id']}/messages", headers=h, json=body)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert model.calls == []


def test_requires_student_token(client, admin_auth):
    assert client.get("/api/chat/sessions").status_code == 401
    r = client.get("/api/chat/sessions", headers=staff_headers(admin_auth, PETUGAS))
    assert r.status_code == 403
