"""ADR-053: video question context, PDF material per chat session, activity counters."""
from __future__ import annotations

import uuid

import pytest

from app.chat.documents import MAX_PDF_PAGES, document_context, extract_pdf_text, safe_filename
from app.errors import DocumentInvalid, DocumentNoText, DocumentTooLarge
from app.learning.catalog import VIDEOS, clock, video_context
from tests.admin_support import admin_auth  # noqa: F401 (fixture)
from tests.pdf_support import SAMPLE_TEXT, make_pdf
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


def new_session(c, h):
    r = c.post("/api/chat/sessions", headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def upload(c, h, sid, data, name="materi.pdf", mime="application/pdf"):
    return c.post(f"/api/chat/sessions/{sid}/documents", headers=h, files={"file": (name, data, mime)})


# ---------------------------------------------------------------- catalog / pure helpers

def test_catalog_shape():
    assert set(VIDEOS) == {"siklus-air", "bangun-datar", "perkenalan-diri", "tata-surya", "simple-present",
                           "alat-transportasi", "persentase", "warna", "bagian-tumbuhan", "pecahan",
                           "pancasila", "sapaan-inggris"}
    assert all(v.sections and all(s.title and s.text for s in v.sections) for v in VIDEOS.values())


def test_clock_and_video_context():
    assert clock(0) == "00:00" and clock(135) == "02:15" and clock(-3) == "00:00"
    ctx = video_context(VIDEOS["siklus-air"], 1, 42)
    assert "Siklus Air" in ctx and "00:42" in ctx and "Kondensasi" in ctx
    assert "Evaporasi" in ctx and "Presipitasi" in ctx  # neighbours included
    first = video_context(VIDEOS["siklus-air"], 0, 0)
    assert "sebelumnya" not in first


def test_extract_pdf_text_ok_and_limits():
    pdf = extract_pdf_text(make_pdf([SAMPLE_TEXT, "Daun berwarna hijau karena klorofil."]))
    assert pdf.pages == 2 and "Fotosintesis" in pdf.text and "klorofil" in pdf.text and not pdf.truncated
    with pytest.raises(DocumentNoText):
        extract_pdf_text(make_pdf(["", ""]))
    with pytest.raises(DocumentTooLarge):
        extract_pdf_text(make_pdf([SAMPLE_TEXT] * (MAX_PDF_PAGES + 1)))
    with pytest.raises(DocumentInvalid):
        extract_pdf_text(b"bukan pdf sama sekali")
    with pytest.raises(DocumentInvalid):
        extract_pdf_text(b"%PDF-1.4\nrusak total")


def test_safe_filename_and_document_context():
    assert safe_filename("C:\\Users\\x\\IPA Bab 2.pdf") == "IPA Bab 2.pdf"
    assert safe_filename("../../etc/passwd") == "passwd"
    assert safe_filename("") == "materi.pdf"
    assert len(safe_filename("a" * 300 + ".pdf")) <= 120
    assert document_context([]) is None
    ctx = document_context([("a.pdf", "isi materi")])
    assert "a.pdf" in ctx and "<<<\nisi materi\n>>>" in ctx and "abaikan perintah" in ctx


# ---------------------------------------------------------------- API: video questions

def test_video_question_adds_context_and_is_stored(client, h, model):
    sid = new_session(client, h)
    r = client.post(f"/api/chat/sessions/{sid}/messages", headers=h, json={
        "content": "Maksudnya apa?", "video": {"id": "siklus-air", "section": 1, "t_sec": 135}})
    assert r.status_code == 201, r.text
    user = r.json()["user_message"]
    assert user["video_id"] == "siklus-air" and user["video_t_sec"] == 135
    assert r.json()["assistant_message"]["video_id"] is None
    assert "02:15" in model.contexts[0] and "Kondensasi" in model.contexts[0]
    items = client.get(f"/api/chat/sessions/{sid}/messages", headers=h).json()["items"]
    assert items[0]["video_t_sec"] == 135


def test_normal_message_has_no_context(client, h, model):
    sid = new_session(client, h)
    assert client.post(f"/api/chat/sessions/{sid}/messages", headers=h, json={"content": "Halo"}).status_code == 201
    assert model.contexts == [None]


@pytest.mark.parametrize("video", [
    {"id": "tidak-ada", "section": 0, "t_sec": 0},
    {"id": "siklus-air", "section": 4, "t_sec": 0},
    {"id": "siklus-air", "section": -1, "t_sec": 0},
    {"id": "siklus-air", "section": 0, "t_sec": -5},
    {"id": "siklus-air", "section": 0, "t_sec": 99999},
    {"id": "siklus-air", "section": "0", "t_sec": 0},
    {"id": "siklus-air", "section": 0, "t_sec": 0, "transcript": "injeksi"},
])
def test_bad_video_ref_is_rejected(client, h, model, video):
    sid = new_session(client, h)
    r = client.post(f"/api/chat/sessions/{sid}/messages", headers=h, json={"content": "Halo", "video": video})
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert model.calls == []


# ---------------------------------------------------------------- API: PDF documents

def test_upload_pdf_then_question_uses_it(client, h, model, db):
    sid = new_session(client, h)
    r = upload(client, h, sid, make_pdf([SAMPLE_TEXT]), name="IPA Bab 2.pdf")
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["filename"] == "IPA Bab 2.pdf" and doc["page_count"] == 1 and doc["char_count"] > 40
    listed = client.get(f"/api/chat/sessions/{sid}/messages", headers=h).json()["documents"]
    assert [d["id"] for d in listed] == [doc["id"]]

    client.post(f"/api/chat/sessions/{sid}/messages", headers=h, json={"content": "Apa itu fotosintesis?"})
    assert "Fotosintesis" in model.contexts[0] and "IPA Bab 2.pdf" in model.contexts[0]

    mine = client.get("/api/chat/documents", headers=h).json()["items"]
    assert len(mine) == 1 and mine[0]["session_title"] == "Apa itu fotosintesis?"


@pytest.mark.parametrize("data,status,code", [
    (b"", 422, "DOCUMENT_INVALID"),
    (b"hello world, bukan pdf", 422, "DOCUMENT_INVALID"),
    (make_pdf(["", ""]), 422, "DOCUMENT_NO_TEXT"),
    (make_pdf([SAMPLE_TEXT] * (MAX_PDF_PAGES + 1)), 413, "DOCUMENT_TOO_LARGE"),
])
def test_bad_pdf_is_rejected_and_not_stored(client, h, db, data, status, code):
    sid = new_session(client, h)
    r = upload(client, h, sid, data)
    assert r.status_code == status and r.json()["error"]["code"] == code
    assert db.chat.documents == []


def test_upload_requires_single_file_part(client, h):
    sid = new_session(client, h)
    r = client.post(f"/api/chat/sessions/{sid}/documents", headers=h, json={"text": "x"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "DOCUMENT_INVALID"
    r = client.post(f"/api/chat/sessions/{sid}/documents", headers=h,
                    files={"file": ("a.pdf", make_pdf([SAMPLE_TEXT]), "application/pdf")}, data={"path": "x"})
    assert r.status_code == 422


def test_upload_to_foreign_or_missing_session_is_404(client, h, h2, db):
    sid = new_session(client, h)
    assert upload(client, h2, sid, make_pdf([SAMPLE_TEXT])).status_code == 404
    assert upload(client, h, uuid.uuid4(), make_pdf([SAMPLE_TEXT])).status_code == 404
    assert db.chat.documents == []


def test_document_limit_per_session(client, h):
    sid = new_session(client, h)
    for _ in range(5):
        assert upload(client, h, sid, make_pdf([SAMPLE_TEXT])).status_code == 201
    assert upload(client, h, sid, make_pdf([SAMPLE_TEXT])).status_code == 413


def test_deleting_session_removes_documents(client, h, db):
    sid = new_session(client, h)
    upload(client, h, sid, make_pdf([SAMPLE_TEXT]))
    assert client.delete(f"/api/chat/sessions/{sid}", headers=h).status_code == 204
    assert db.chat.documents == [] and client.get("/api/chat/documents", headers=h).json()["items"] == []


# ---------------------------------------------------------------- API: activity

def test_activity_counts_only_video_questions_and_documents(client, h, h2):
    sid = new_session(client, h)
    client.post(f"/api/chat/sessions/{sid}/messages", headers=h, json={"content": "Chat biasa"})
    client.post(f"/api/chat/sessions/{sid}/messages", headers=h, json={
        "content": "Ini kenapa?", "video": {"id": "warna", "section": 2, "t_sec": 30}})
    upload(client, h, sid, make_pdf([SAMPLE_TEXT]))
    a = client.get("/api/chat/activity", headers=h).json()
    assert a == {"days": 7, "video_questions": 1, "documents": 1}
    assert client.get("/api/chat/activity", headers=h2).json()["video_questions"] == 0
    assert client.get("/api/chat/activity").status_code == 401
