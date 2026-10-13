"""Phase 5B admin API against real PostgreSQL (all migrations + seed) with real ADR-039 auth.

Runs only when BACKEND_TEST_DATABASE_URL is set; uses a unique schema dropped at the end.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from tests.admin_support import admin_auth, admin_client  # noqa: F401 (fixture)

DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database/migrations"
INST = "00000000-0000-0000-0000-00000000a001"
D1 = "00000000-0000-0000-0000-0000000d0001"
D2 = "00000000-0000-0000-0000-0000000d0002"
D3 = "00000000-0000-0000-0000-0000000d0003"
T0 = datetime(2026, 9, 1, tzinfo=timezone.utc)


@pytest.fixture
def db_url(monkeypatch):
    import psycopg
    from psycopg.conninfo import make_conninfo

    schema = f"p5b_{uuid.uuid4().hex[:12]}"
    scoped = make_conninfo(DSN, options=f"-c search_path={schema}")
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(f'create schema "{schema}"')
    try:
        with psycopg.connect(scoped, autocommit=True) as conn:
            for f in sorted(MIGRATIONS.glob("*.sql")):
                conn.execute(f.read_text(encoding="utf-8"))
            conn.execute("insert into institutions (id, name) values (%s, 'T')", (INST,))
            # labels chosen so label order differs from id order; D2/D3 share a label (id tie-break)
            conn.execute(
                "insert into devices (id, institution_id, label, active) values"
                " (%s, %s, 'Kiosk B', true), (%s, %s, 'Kiosk A', false), (%s, %s, 'Kiosk A', true)",
                (D1, INST, D2, INST, D3, INST),
            )
            conn.execute("update phrases set active = false where model_phrase_id = 'label_06'")
        monkeypatch.setenv("DATABASE_URL", scoped)
        yield scoped
    finally:
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'drop schema "{schema}" cascade')


@pytest.fixture
def client(admin_auth, db_url):
    from app.db.session import open_postgres

    with admin_client(admin_auth, open_postgres) as c:
        yield c, admin_auth.headers()


def q(url, sql, params=()):
    import psycopg

    with psycopg.connect(url) as c:
        return c.execute(sql, params).fetchall()


# ---- phrases ----------------------------------------------------------------------------------

def test_list_phrases_includes_inactive_ordered_by_text_then_id(client, db_url):
    c, h = client
    b = c.get("/api/admin/phrases", headers=h).json()
    texts = [i["phrase_text"] for i in b["items"]]
    assert b["total"] == 43 and len(texts) == 43  # ADR-045 + ADR-049 vocabulary
    assert texts == sorted(texts)
    assert any(i["phrase_text"] == "Maaf" and i["active"] is False for i in b["items"])
    expected = [str(r[0]) for r in q(db_url, "select id from phrases order by phrase_text, id")]
    assert [i["id"] for i in b["items"]] == expected


def test_phrase_pagination_and_total(client):
    c, h = client
    p1 = c.get("/api/admin/phrases?page=1&page_size=4", headers=h).json()
    p3 = c.get("/api/admin/phrases?page=3&page_size=4", headers=h).json()
    p9 = c.get("/api/admin/phrases?page=12&page_size=4", headers=h).json()
    assert (len(p1["items"]), len(p3["items"]), len(p9["items"])) == (4, 4, 0)
    assert p1["total"] == p3["total"] == p9["total"] == 43


def test_create_phrase_persists_with_read_only_defaults(client, db_url):
    c, h = client
    r = c.post("/api/admin/phrases", json={"phrase_text": "Saya pusing", "category": "Keluhan"}, headers=h)
    assert r.status_code == 201
    row = q(db_url, "select phrase_text, category, active, model_phrase_id, sign_recognizable, language_variant"
                    " from phrases where id = %s", (r.json()["id"],))
    assert row == [("Saya pusing", "Keluhan", True, None, False, "BISINDO-Jakarta")]
    r2 = c.post("/api/admin/phrases", json={"phrase_text": "Nonaktif", "category": "Obat", "active": False},
                headers=h)
    assert r2.status_code == 201 and r2.json()["active"] is False


def test_create_duplicate_text_409_and_no_row(client, db_url):
    c, h = client
    r = c.post("/api/admin/phrases", json={"phrase_text": "Lagi", "category": "Fallback"}, headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"
    assert q(db_url, "select count(*) from phrases where phrase_text = 'Lagi'") == [(1,)]


def test_patch_phrase_fields_and_immutables(client, db_url):
    c, h = client
    pid, mpid = q(db_url, "select id, model_phrase_id from phrases where model_phrase_id = 'label_05'")[0]
    r = c.patch(f"/api/admin/phrases/{pid}", json={"phrase_text": "Lagi (ulang)", "category": "Keluhan"}, headers=h)
    assert r.status_code == 200
    row = q(db_url, "select phrase_text, category, model_phrase_id, sign_recognizable, active, language_variant"
                    " from phrases where id = %s", (pid,))
    assert row == [("Lagi (ulang)", "Keluhan", "label_05", True, True, "BISINDO-Jakarta")]
    assert c.patch(f"/api/admin/phrases/{pid}", json={"model_phrase_id": "label_06"}, headers=h).status_code == 422
    assert q(db_url, "select model_phrase_id from phrases where id = %s", (pid,)) == [(mpid,)]


def test_patch_same_text_on_self_is_allowed_but_other_row_conflicts(client, db_url):
    c, h = client
    pid = q(db_url, "select id from phrases where model_phrase_id = 'label_05'")[0][0]
    assert c.patch(f"/api/admin/phrases/{pid}", json={"phrase_text": "Lagi"}, headers=h).status_code == 200
    r = c.patch(f"/api/admin/phrases/{pid}", json={"phrase_text": "Maaf"}, headers=h)
    assert r.status_code == 409


def test_active_toggle_affects_public_phrase_list(client, db_url):
    c, h = client
    pid = q(db_url, "select id from phrases where model_phrase_id = 'label_10'")[0][0]
    public = lambda: {i["id"] for i in c.get("/api/phrases").json()}  # noqa: E731
    assert str(pid) in public()
    assert c.patch(f"/api/admin/phrases/{pid}", json={"active": False}, headers=h).json()["active"] is False
    assert str(pid) not in public()
    assert c.patch(f"/api/admin/phrases/{pid}", json={"active": True}, headers=h).status_code == 200
    assert str(pid) in public()


def test_patch_missing_phrase_404(client):
    c, h = client
    r = c.patch(f"/api/admin/phrases/{uuid.uuid4()}", json={"active": False}, headers=h)
    assert r.status_code == 404 and r.json()["error"]["code"] == "PHRASE_NOT_FOUND"


def test_model_phrase_id_uniqueness_is_db_enforced_and_repo_never_writes_it(db_url):
    import asyncio

    import psycopg

    from app.db.admin import PostgresAdminRepository

    with pytest.raises(psycopg.errors.UniqueViolation):
        q(db_url, "insert into phrases (phrase_text, category, model_phrase_id) values ('X', 'Obat', 'label_05')")

    async def run():
        conn = await psycopg.AsyncConnection.connect(db_url, autocommit=True)
        try:
            repo = PostgresAdminRepository(conn)
            pid = q(db_url, "select id from phrases where model_phrase_id = 'label_05'")[0][0]
            for bad in ({"model_phrase_id": "label_06"}, {"sign_recognizable": False}, {"language_variant": "x"}, {}):
                with pytest.raises(ValueError):
                    await repo.update_phrase(pid, bad)
        finally:
            await conn.close()

    asyncio.run(run())


# ---- logs -------------------------------------------------------------------------------------

def _seed_logs(db_url):
    import psycopg

    lagi = q(db_url, "select id from phrases where model_phrase_id = 'label_05'")[0][0]
    rows = [
        (D1, "sign_to_text", lagi, 0.9123, "accepted", T0),
        (D1, "sign_to_text", None, 0.5999, "escalated_to_jbi", T0 + timedelta(days=1)),
        (D2, "sign_to_text", lagi, 0.72, "confirmed", T0 + timedelta(days=2)),
        (D2, "speech_to_sign", None, 0.1, "escalated_to_jbi", T0 + timedelta(days=3)),
        (D3, "sign_to_text", lagi, 0.8499, "confirmed", T0 + timedelta(days=3)),  # same created_at as previous
    ]
    with psycopg.connect(db_url, autocommit=True) as c:
        for r in rows:
            c.execute("insert into matching_logs (device_id, direction, predicted_phrase_id, confidence,"
                      " resulted_action, created_at) values (%s,%s,%s,%s,%s,%s)", r)
    return str(lagi)


def test_logs_default_order_desc_with_id_tie_break(client, db_url):
    c, h = client
    _seed_logs(db_url)
    b = c.get("/api/admin/logs", headers=h).json()
    expected = [str(r[0]) for r in q(db_url, "select id from matching_logs order by created_at desc, id desc")]
    assert [i["id"] for i in b["items"]] == expected and b["total"] == 5
    assert {i["confidence"] for i in b["items"]} >= {0.8499, 0.5999, 0.9123}


@pytest.mark.parametrize(("qs", "expected_total"), [
    (f"device_id={D1}", 2),
    ("resulted_action=confirmed", 2),
    ("resulted_action=escalated_to_jbi&direction=speech_to_sign", 1),
    ("direction=sign_to_text", 4),
    ("created_from=2026-09-02T00:00:00Z", 4),  # inclusive
    ("created_to=2026-09-02T00:00:00Z", 2),  # inclusive
    ("created_from=2026-09-02T00:00:00Z&created_to=2026-09-03T00:00:00Z", 2),
    (f"device_id={uuid.uuid4()}", 0),
])
def test_logs_filters(client, db_url, qs, expected_total):
    c, h = client
    _seed_logs(db_url)
    b = c.get(f"/api/admin/logs?{qs}", headers=h).json()
    assert b["total"] == expected_total == len(b["items"])


def test_logs_phrase_filter_and_pagination(client, db_url):
    c, h = client
    lagi = _seed_logs(db_url)
    b = c.get(f"/api/admin/logs?predicted_phrase_id={lagi}&page=2&page_size=2", headers=h).json()
    assert b["total"] == 3 and len(b["items"]) == 1
    assert all(i["predicted_phrase_id"] == lagi for i in b["items"])


# ---- devices ----------------------------------------------------------------------------------

def test_devices_ordered_by_label_then_id_with_expected_fields(client, db_url):
    c, h = client
    b = c.get("/api/admin/devices", headers=h).json()
    expected = [str(r[0]) for r in q(db_url, "select id from devices order by label, id")]
    assert [i["id"] for i in b["items"]] == expected and b["total"] == 3
    assert [i["label"] for i in b["items"]] == ["Kiosk A", "Kiosk A", "Kiosk B"]
    assert all(set(i) == {"id", "institution_id", "label", "active"} for i in b["items"])
    assert c.get("/api/admin/devices?page=2&page_size=2", headers=h).json()["items"][0]["id"] == D1


# ---- ADR-042 migration: one approved reference per phrase -------------------------------------

def test_one_approved_reference_per_phrase_index(db_url):
    import psycopg

    lagi, maaf = [r[0] for r in q(db_url, "select id from phrases where model_phrase_id in ('label_05','label_06')"
                                          " order by model_phrase_id")]
    ins = "insert into sign_references (phrase_id, video_url, approved) values (%s, %s, %s)"
    with psycopg.connect(db_url, autocommit=True) as c:
        c.execute(ins, (lagi, "refs/a", True))
        c.execute(ins, (lagi, "refs/b", False))  # unapproved extra allowed
        c.execute(ins, (lagi, "refs/c", None))
        c.execute(ins, (maaf, "refs/d", True))  # other phrase allowed
        with pytest.raises(psycopg.errors.UniqueViolation):
            c.execute(ins, (lagi, "refs/e", True))
        with pytest.raises(psycopg.errors.UniqueViolation):
            c.execute("update sign_references set approved = true where video_url = 'refs/b'")
    idx = q(db_url, "select indexdef from pg_indexes where indexname = 'sign_references_one_approved_per_phrase_idx'")
    assert len(idx) == 1 and "UNIQUE" in idx[0][0] and "WHERE (approved = true)" in idx[0][0]


# ---- ADR-042/046 reference upload against the real DB (Storage REST mocked) ------------------

def test_reference_upload_persists_approved_row_and_second_is_409(admin_auth, db_url):
    from app.db.session import open_postgres
    from tests.admin_support import FakeStorageServer

    storage = FakeStorageServer()
    pid = q(db_url, "select id from phrases where model_phrase_id = 'label_00'")[0][0]
    mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 32
    with admin_client(admin_auth, open_postgres, storage.factory()) as c:
        h = admin_auth.headers()
        r = c.post(f"/api/admin/phrases/{pid}/references", files=[("file", ("a.mp4", mp4, "video/mp4"))], headers=h)
        assert r.status_code == 201, r.text
        ref = r.json()
        rows = q(db_url, "select id::text, phrase_id::text, video_url, approved, landmark_data, signer_id"
                         " from sign_references where phrase_id = %s", (pid,))
        assert rows == [(ref["id"], str(pid), f"{pid}/{ref['id']}.mp4", True, None, None)]
        assert "token" not in rows[0][2]  # DB stores the object path, never the signed URL

        r2 = c.post(f"/api/admin/phrases/{pid}/references", files=[("file", ("b.mp4", mp4, "video/mp4"))],
                    headers=h)
        assert r2.status_code == 409 and r2.json()["error"]["code"] == "CONFLICT"
        assert len(storage.objects) == 1
        assert q(db_url, "select count(*) from sign_references where phrase_id = %s", (pid,)) == [(1,)]

        missing = c.post(f"/api/admin/phrases/{uuid.uuid4()}/references",
                         files=[("file", ("a.mp4", mp4, "video/mp4"))], headers=h)
        assert missing.status_code == 404 and missing.json()["error"]["code"] == "PHRASE_NOT_FOUND"


def test_reference_insert_hitting_partial_index_is_409_with_cleanup(admin_auth, db_url):
    """Real DB race: the approved row appears after the pre-check, so the partial unique index fires."""
    import psycopg

    from app.db.admin import PostgresAdminRepository
    from app.db.session import open_postgres
    from tests.admin_support import FakeStorageServer

    storage = FakeStorageServer()
    pid = q(db_url, "select id from phrases where model_phrase_id = 'label_01'")[0][0]
    original = PostgresAdminRepository.has_approved_reference

    async def racing_check(self, phrase_id):
        result = await original(self, phrase_id)  # False: nothing approved yet
        with psycopg.connect(db_url, autocommit=True) as other:  # concurrent winner
            other.execute("insert into sign_references (phrase_id, video_url, approved) values (%s, 'winner', true)",
                          (phrase_id,))
        return result

    PostgresAdminRepository.has_approved_reference = racing_check
    try:
        with admin_client(admin_auth, open_postgres, storage.factory()) as c:
            mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 16
            r = c.post(f"/api/admin/phrases/{pid}/references", files=[("file", ("a.mp4", mp4, "video/mp4"))],
                       headers=admin_auth.headers())
    finally:
        PostgresAdminRepository.has_approved_reference = original
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"
    assert [x.method for x in storage.requests] == ["POST", "DELETE"] and storage.objects == {}
    assert q(db_url, "select video_url from sign_references where phrase_id = %s", (pid,)) == [("winner",)]
