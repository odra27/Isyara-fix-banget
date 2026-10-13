"""POST /api/match/sign with the real per-request PostgreSQL connection (DATABASE_URL).

Runs only when BACKEND_TEST_DATABASE_URL is set. Everything is created inside a
unique schema (search_path) that is dropped at the end; Modeling is faked.
"""
import os
import uuid

import pytest

DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")

from pathlib import Path  # noqa: E402

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database/migrations"
ACTIVE = "00000000-0000-0000-0000-0000000d0001"
INACTIVE = "00000000-0000-0000-0000-0000000d0002"


@pytest.fixture(scope="module")
def database_url():
    import psycopg
    from psycopg.conninfo import make_conninfo

    schema = f"p3_{uuid.uuid4().hex[:12]}"
    scoped = make_conninfo(DSN, options=f"-c search_path={schema}")
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(f'create schema "{schema}"')
    try:
        with psycopg.connect(scoped, autocommit=True) as conn:
            for f in sorted(MIGRATIONS.glob("*.sql")):
                conn.execute(f.read_text(encoding="utf-8"))
            conn.execute("insert into institutions (id, name) values ('00000000-0000-0000-0000-00000000a001', 'Test')")
            conn.execute(
                "insert into devices (id, institution_id, label, active) values"
                " (%s, '00000000-0000-0000-0000-00000000a001', 'Kiosk 1', true),"
                " (%s, '00000000-0000-0000-0000-00000000a001', 'Kiosk 2', false)",
                (ACTIVE, INACTIVE),
            )
            conn.execute("update phrases set active = false where model_phrase_id = 'label_06'")
            ids = dict(conn.execute("select model_phrase_id, id::text from phrases").fetchall())
        yield scoped, ids
    finally:
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'drop schema "{schema}" cascade')


def _post(database_url, monkeypatch, result, device=ACTIVE, n_frames=12):
    from fastapi.testclient import TestClient

    from app.main import create_app
    from app.modeling.client import LibraryModelingClient
    from tests.fixtures import sequence_payload
    from tests.test_modeling_client import FakePredictor

    monkeypatch.setenv("DATABASE_URL", database_url)
    app = create_app(modeling_factory=lambda: LibraryModelingClient(FakePredictor(result)))
    with TestClient(app, raise_server_exceptions=False) as c:
        return c.post("/api/match/sign", json={"device_id": device, "sequence": sequence_payload(n_frames), "duration_ms": 900})


def test_seeded_phrase_accepted(database_url, monkeypatch):
    from tests.fixtures import modeling_result

    url, ids = database_url
    r = _post(url, monkeypatch, modeling_result(phrase_id="label_10", label="Terima kasih", confidence=0.93))
    assert r.status_code == 200
    assert r.json() == {"phrase_id": ids["label_10"], "phrase_text": "Terima kasih", "confidence": 0.93, "action": "accepted"}


def test_seeded_phrase_pending(database_url, monkeypatch):
    from tests.fixtures import modeling_result

    url, ids = database_url
    r = _post(url, monkeypatch, modeling_result(phrase_id="label_15", label="Di mana", confidence=0.61, action="confirm"))
    assert r.json() == {"phrase_id": ids["label_15"], "phrase_text": "Di mana", "confidence": 0.61, "action": "pending_confirmation"}


def test_inactive_seeded_phrase_escalates(database_url, monkeypatch):
    from tests.fixtures import modeling_result

    url, _ = database_url
    r = _post(url, monkeypatch, modeling_result(phrase_id="label_06", label="Maaf", confidence=0.97))
    assert r.json() == {"phrase_id": None, "phrase_text": None, "confidence": 0.97, "action": "escalated_to_jbi"}


def test_unseeded_label_is_mapping_error(database_url, monkeypatch):
    from tests.fixtures import modeling_result

    url, _ = database_url
    r = _post(url, monkeypatch, modeling_result(phrase_id="label_99", label="Tidak ada", confidence=0.97))
    assert r.status_code == 500 and r.json()["error"]["code"] == "MODEL_MAPPING_ERROR"


def test_devices_from_db(database_url, monkeypatch):
    from tests.fixtures import modeling_result

    url, _ = database_url
    assert _post(url, monkeypatch, modeling_result(), device=INACTIVE).status_code == 403
    r = _post(url, monkeypatch, modeling_result(), device=str(uuid.uuid4()))
    assert r.status_code == 404 and r.json()["error"]["code"] == "DEVICE_NOT_FOUND"
    import psycopg

    with psycopg.connect(url) as conn:  # request did not create a device
        assert conn.execute("select count(*) from devices").fetchone()[0] == 2


def test_unreachable_database_is_500(monkeypatch):
    from tests.fixtures import modeling_result

    r = _post("postgresql://nobody@127.0.0.1:1/none?connect_timeout=1", monkeypatch, modeling_result())
    assert r.status_code == 500 and r.json() == {"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}}
