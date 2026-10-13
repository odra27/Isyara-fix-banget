"""Phase 4 against real PostgreSQL (ADR-038): migration, /api/logs, /api/match/sign step 6.

Runs only when BACKEND_TEST_DATABASE_URL is set. Everything lives in a unique
schema (search_path) that is dropped at the end. Modeling is faked.
"""
import os
import uuid
from decimal import Decimal
from pathlib import Path

import pytest

DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database/migrations"
PHASE4 = MIGRATIONS / "20260929010000_phase4_matching_logs_confidence_precision.sql"
ACTIVE = "00000000-0000-0000-0000-0000000d0001"
INACTIVE = "00000000-0000-0000-0000-0000000d0002"


def _columns(conn, schema):
    return conn.execute(
        "select column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default"
        " from information_schema.columns where table_schema = %s and table_name = 'matching_logs'"
        " order by column_name",
        (schema,),
    ).fetchall()


def _constraints(conn, schema):
    return conn.execute(
        "select conname, pg_get_constraintdef(c.oid) from pg_constraint c"
        " join pg_namespace n on n.oid = c.connamespace where n.nspname = %s order by conname",
        (schema,),
    ).fetchall()


def _indexes(conn, schema):
    return conn.execute("select indexname, indexdef from pg_indexes where schemaname = %s order by 1", (schema,)).fetchall()


@pytest.fixture(scope="module")
def env():
    import psycopg
    from psycopg.conninfo import make_conninfo

    schema = f"p4_{uuid.uuid4().hex[:12]}"
    scoped = make_conninfo(DSN, options=f"-c search_path={schema}")
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(f'create schema "{schema}"')
    try:
        with psycopg.connect(scoped, autocommit=True) as conn:
            before = after = None
            for f in sorted(MIGRATIONS.glob("*.sql")):
                if f == PHASE4:
                    before = (_columns(conn, schema), _constraints(conn, schema), _indexes(conn, schema))
                conn.execute(f.read_text(encoding="utf-8"))
                if f == PHASE4:  # isolate the Phase 4 migration from later migrations
                    after = (_columns(conn, schema), _constraints(conn, schema), _indexes(conn, schema))
            conn.execute("insert into institutions (id, name) values ('00000000-0000-0000-0000-00000000a001', 'T')")
            conn.execute(
                "insert into devices (id, institution_id, label, active) values"
                " (%s, '00000000-0000-0000-0000-00000000a001', 'K1', true),"
                " (%s, '00000000-0000-0000-0000-00000000a001', 'K2', false)",
                (ACTIVE, INACTIVE),
            )
            conn.execute("update phrases set active = false where model_phrase_id = 'label_06'")
            ids = dict(conn.execute("select model_phrase_id, id::text from phrases").fetchall())
        yield {"url": scoped, "schema": schema, "ids": ids, "before": before, "after": after}
    finally:
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'drop schema "{schema}" cascade')


@pytest.fixture
def rows(env):
    import psycopg

    def fetch():
        with psycopg.connect(env["url"]) as c:
            return c.execute(
                "select device_id::text, direction, predicted_phrase_id::text, confidence, resulted_action"
                " from matching_logs order by created_at, id"
            ).fetchall()

    with psycopg.connect(env["url"], autocommit=True) as c:
        c.execute("delete from matching_logs")
    return fetch


def _client(env, monkeypatch, result=None):
    from fastapi.testclient import TestClient

    from app.main import create_app
    from app.modeling.client import LibraryModelingClient
    from tests.fixtures import modeling_result
    from tests.test_modeling_client import FakePredictor

    monkeypatch.setenv("DATABASE_URL", env["url"])
    pred = FakePredictor(result if result is not None else modeling_result())
    return TestClient(create_app(modeling_factory=lambda: LibraryModelingClient(pred)), raise_server_exceptions=False)


def _sign(env, monkeypatch, result, device=ACTIVE):
    from tests.fixtures import sequence_payload

    with _client(env, monkeypatch, result) as c:
        return c.post("/api/match/sign", json={"device_id": device, "sequence": sequence_payload(12), "duration_ms": 900})


def _log(env, monkeypatch, **over):
    b = {"device_id": ACTIVE, "direction": "sign_to_text", "predicted_phrase_id": env["ids"]["label_05"],
         "confidence": 0.8499, "resulted_action": "confirmed"}
    b.update(over)
    with _client(env, monkeypatch) as c:
        return c.post("/api/logs", json=b)


# ---- migration ------------------------------------------------------------------------------

def test_confidence_is_numeric_5_4_and_nothing_else_changed(env):
    before_cols, before_cons, before_idx = env["before"]
    after_cols, after_cons, after_idx = env["after"]
    changed = [(b, a) for b, a in zip(before_cols, after_cols) if b != a]
    assert len(before_cols) == len(after_cols) == 7
    assert changed == [
        (("confidence", "numeric", 4, 3, "NO", None), ("confidence", "numeric", 5, 4, "NO", None))
    ]
    assert before_cons == after_cons and before_idx == after_idx


# ---- /api/logs --------------------------------------------------------------------------------

def test_logs_persist_four_decimals_exactly(env, monkeypatch, rows):
    assert _log(env, monkeypatch, confidence=0.8499).status_code == 204
    assert _log(env, monkeypatch, confidence=0.5999, resulted_action="escalated_to_jbi").status_code == 204
    assert [(r[3], r[4]) for r in rows()] == [(Decimal("0.8499"), "confirmed"), (Decimal("0.5999"), "escalated_to_jbi")]


def test_logs_null_phrase_and_inactive_phrase_accepted(env, monkeypatch, rows):
    assert _log(env, monkeypatch, resulted_action="escalated_to_jbi", predicted_phrase_id=None, confidence=0).status_code == 204
    assert _log(env, monkeypatch, predicted_phrase_id=env["ids"]["label_06"]).status_code == 204  # inactive phrase
    assert [r[2] for r in rows()] == [None, env["ids"]["label_06"]]


def test_logs_errors_and_order_against_db(env, monkeypatch, rows):
    missing = str(uuid.uuid4())
    r = _log(env, monkeypatch, device_id=str(uuid.uuid4()), predicted_phrase_id=missing)
    assert r.status_code == 404 and r.json()["error"]["code"] == "DEVICE_NOT_FOUND"
    r = _log(env, monkeypatch, device_id=INACTIVE, predicted_phrase_id=missing)
    assert r.status_code == 403 and r.json()["error"]["code"] == "DEVICE_INACTIVE"
    r = _log(env, monkeypatch, predicted_phrase_id=missing)
    assert r.status_code == 404 and r.json()["error"]["code"] == "PHRASE_NOT_FOUND"
    assert _log(env, monkeypatch, resulted_action="accepted").status_code == 422
    assert rows() == []


def test_logs_duplicates_are_separate_rows(env, monkeypatch, rows):
    for _ in range(2):
        assert _log(env, monkeypatch, resulted_action="escalated_to_jbi").status_code == 204
    assert len(rows()) == 2


# ---- /api/match/sign step 6 -------------------------------------------------------------------

def test_sign_accepted_row(env, monkeypatch, rows):
    from tests.fixtures import modeling_result

    r = _sign(env, monkeypatch, modeling_result(phrase_id="label_10", label="Terima kasih", confidence=0.8501, action="accept"))
    assert r.status_code == 200 and r.json()["action"] == "accepted"
    assert rows() == [(ACTIVE, "sign_to_text", env["ids"]["label_10"], Decimal("0.8501"), "accepted")]


def test_sign_escalated_rows_and_pending_none(env, monkeypatch, rows):
    from tests.fixtures import modeling_result

    reject = modeling_result(phrase_id=None, label=None, confidence=0.5999, action="reject", reason="x", top_k=[])
    assert _sign(env, monkeypatch, reject).json()["action"] == "escalated_to_jbi"
    inactive = modeling_result(phrase_id="label_06", label="Maaf", confidence=0.97)
    assert _sign(env, monkeypatch, inactive).json()["phrase_id"] is None
    pending = modeling_result(phrase_id="label_15", label="Di mana", confidence=0.8499, action="confirm")
    assert _sign(env, monkeypatch, pending).json()["action"] == "pending_confirmation"
    assert rows() == [
        (ACTIVE, "sign_to_text", None, Decimal("0.5999"), "escalated_to_jbi"),
        (ACTIVE, "sign_to_text", None, Decimal("0.9700"), "escalated_to_jbi"),  # OI-1: null, not label_06
    ]


def test_sign_errors_write_no_row(env, monkeypatch, rows):
    from tests.fixtures import modeling_result

    assert _sign(env, monkeypatch, modeling_result(), device=INACTIVE).status_code == 403
    assert _sign(env, monkeypatch, modeling_result(phrase_id="label_99", label="Tidak ada", confidence=0.95)).status_code == 500
    assert rows() == []


def test_sign_real_insert_failure_is_fail_open(env, monkeypatch, rows):
    import psycopg

    from tests.fixtures import modeling_result

    with psycopg.connect(env["url"], autocommit=True) as c:
        c.execute(
            "create function fail_log_insert() returns trigger language plpgsql as"
            " $$ begin raise exception 'forced failure secret-detail'; end $$"
        )
        c.execute("create trigger fail_log before insert on matching_logs for each row execute function fail_log_insert()")
    try:
        r = _sign(env, monkeypatch, modeling_result(confidence=0.9123))
        assert r.status_code == 200
        assert r.json() == {"phrase_id": env["ids"]["label_05"], "phrase_text": "Lagi", "confidence": 0.9123, "action": "accepted"}
        assert "secret-detail" not in r.text
        r = _log(env, monkeypatch)  # /api/logs is NOT fail-open
        assert r.status_code == 500 and r.json() == {"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}}
    finally:
        with psycopg.connect(env["url"], autocommit=True) as c:
            c.execute("drop trigger fail_log on matching_logs")
            c.execute("drop function fail_log_insert()")
    assert rows() == []
