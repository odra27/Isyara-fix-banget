"""GET /api/phrases against real PostgreSQL with all migrations + seed.

Runs only when BACKEND_TEST_DATABASE_URL is set; uses a unique schema that is dropped.
"""
import os
import uuid
from pathlib import Path

import pytest

DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database/migrations"


@pytest.fixture(scope="module")
def url():
    import psycopg
    from psycopg.conninfo import make_conninfo

    schema = f"ph_{uuid.uuid4().hex[:12]}"
    scoped = make_conninfo(DSN, options=f"-c search_path={schema}")
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(f'create schema "{schema}"')
    try:
        with psycopg.connect(scoped, autocommit=True) as conn:
            for f in sorted(MIGRATIONS.glob("*.sql")):
                conn.execute(f.read_text(encoding="utf-8"))
            conn.execute("update phrases set active = false where model_phrase_id = 'label_06'")
            conn.execute("update phrases set active = null where model_phrase_id = 'label_09'")
            conn.execute(
                "insert into phrases (phrase_text, category, active, sign_recognizable) values"
                " ('Domain only', 'Keluhan', true, false), ('Inactive domain', 'Obat', false, false)"
            )
        yield scoped
    finally:
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'drop schema "{schema}" cascade')


def test_only_active_true_phrases_with_prd_fields(url, monkeypatch):
    import psycopg
    from fastapi.testclient import TestClient

    from app.main import create_app
    from app.modeling.client import LibraryModelingClient
    from tests.test_modeling_client import FakePredictor

    monkeypatch.setenv("DATABASE_URL", url)
    app = create_app(modeling_factory=lambda: LibraryModelingClient(FakePredictor()))
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/api/phrases")
    assert r.status_code == 200
    items = r.json()
    assert all(set(i) == {"id", "phrase_text", "category"} for i in items)
    texts = {i["phrase_text"] for i in items}
    # 43 seeded (ADR-045 + ADR-049) - Maaf (false) - Saya (NULL) + 1 active domain phrase (sign_recognizable=false)
    assert len(items) == 42
    assert "Domain only" in texts and "Maaf" not in texts and "Saya" not in texts and "Inactive domain" not in texts
    with psycopg.connect(url) as conn:
        expected = {str(i) for (i,) in conn.execute("select id from phrases where active = true").fetchall()}
    assert {i["id"] for i in items} == expected
    assert "label_" not in r.text
