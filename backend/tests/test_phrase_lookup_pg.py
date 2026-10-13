"""PostgresPhraseLookup against a real PostgreSQL.

Runs only when BACKEND_TEST_DATABASE_URL points to an empty, disposable database.
The Phase 1 migration and fixtures are applied inside one transaction that is
always rolled back, so the database is left unchanged.
"""
import asyncio
import os
from pathlib import Path
from uuid import UUID

import pytest

from app.db import phrases as db_phrases
from app.db.phrases import PostgresPhraseLookup
from app.matching.sign import decide_sign_result
from app.modeling.contract import ModelingSignResult
from tests.fixtures import modeling_result

MIGRATION = Path(__file__).resolve().parents[2] / "Database/migrations/20260928000000_phase1_core_schema.sql"
DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")

U05 = UUID("00000000-0000-0000-0000-00000000f005")
U09 = UUID("00000000-0000-0000-0000-00000000f009")
U10 = UUID("00000000-0000-0000-0000-00000000f010")


def test_connect_disables_prepared_statements(monkeypatch):
    seen = {}

    async def fake_connect(conninfo, **kwargs):
        seen.update(conninfo=conninfo, **kwargs)
        return "conn"

    monkeypatch.setattr(db_phrases.AsyncConnection, "connect", fake_connect)
    assert asyncio.run(db_phrases.connect("postgresql://example.invalid/db")) == "conn"
    assert seen["prepare_threshold"] is None and seen["autocommit"] is True


@pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")
def test_lookup_and_policy_against_postgres():
    import psycopg

    async def run():
        conn = await psycopg.AsyncConnection.connect(DSN, prepare_threshold=None)  # transactional
        try:
            async with conn.cursor() as cur:
                await cur.execute(MIGRATION.read_text(encoding="utf-8"))
                await cur.execute(
                    "insert into phrases (id, phrase_text, category, model_phrase_id, sign_recognizable, active) values"
                    " (%s, 'Lagi', 'Test', 'label_05', true, true),"
                    " (%s, 'Saya', 'Test', 'label_09', true, false),"
                    " (%s, 'Terima kasih', 'Test', 'label_10', false, true)",
                    (U05, U09, U10),
                )
                await cur.execute("insert into phrases (phrase_text, category) values ('Domain only', 'Test')")
            lookup = PostgresPhraseLookup(conn)

            rec = await lookup.find_by_model_phrase_id("label_05")
            assert (rec.id, rec.model_phrase_id, rec.phrase_text, rec.active, rec.sign_recognizable) == (
                U05, "label_05", "Lagi", True, True
            )
            assert await lookup.find_by_model_phrase_id("label_99") is None
            assert await lookup.find_by_model_phrase_id("Lagi") is None  # text is never identity
            # parameterized: an injection attempt is just an unknown id
            assert await lookup.find_by_model_phrase_id("x' or '1'='1") is None

            async def decide(**kw):
                return await decide_sign_result(ModelingSignResult.model_validate(modeling_result(**kw)), lookup)

            d = await decide(confidence=0.85, action="confirm")
            assert d.action == "accepted" and d.phrase.id == U05
            d = await decide(confidence=0.6, action="confirm")
            assert d.action == "pending_confirmation" and d.phrase.id == U05
            d = await decide(phrase_id="label_09", label="Saya", confidence=0.95)
            assert d.action == "escalated_to_jbi" and d.phrase is None
            from app.errors import ModelMappingError

            with pytest.raises(ModelMappingError):
                await decide(phrase_id="label_10", label="Terima kasih", confidence=0.95)
            with pytest.raises(ModelMappingError):
                await decide(phrase_id="label_99", label="Lagi", confidence=0.95)
        finally:
            await conn.rollback()
            await conn.close()

    asyncio.run(run())
