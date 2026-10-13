"""Phase 3 vocabulary seed: matches the approved category mapping and the Modeling artifact.

* Static checks parse the seed migration (always run).
* Artifact checks compare against ml/artifacts (run when `bisindo` is installed).
* PostgreSQL checks apply both migrations in a rolled-back transaction
  (run when BACKEND_TEST_DATABASE_URL is set).
"""
import asyncio
import json
import os
import re
from pathlib import Path

import pytest

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database/migrations"
SCHEMA = MIGRATIONS / "20260928000000_phase1_core_schema.sql"
SEED = MIGRATIONS / "20260929000000_phase3_seed_sign_vocabulary.sql"
DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")

# Explicit product/vocabulary-owner decision (2026-09-29). Do not edit without a new decision.
APPROVED = {
    "label_05": ("Lagi", "Fallback"),
    "label_06": ("Maaf", "Fallback"),
    "label_09": ("Saya", "Pendaftaran"),
    "label_10": ("Terima kasih", "Fallback"),
    "label_11": ("Tuli", "Pendaftaran"),
    "label_13": ("Siapa", "Pendaftaran"),
    "label_15": ("Di mana", "Administrasi"),
    "label_17": ("Bagaimana", "Obat"),
    "label_24": ("Datang", "Pendaftaran"),
    "label_31": ("Malam", "Obat"),
}
APPROVED_CATEGORIES = {"Pendaftaran", "Keluhan", "Obat", "Administrasi", "Fallback"}

_ROW = re.compile(r"\('(label_\d{2})',\s*'([^']*)',\s*'([^']*)',\s*(true|false),\s*(true|false)\)")


def _seed_rows():
    return [(m, t, c, a == "true", r == "true") for m, t, c, a, r in _ROW.findall(SEED.read_text(encoding="utf-8"))]


def test_seed_matches_approved_mapping_exactly():
    rows = _seed_rows()
    assert len(rows) == 10
    assert {m: (t, c) for m, t, c, _, _ in rows} == APPROVED
    assert all(active and recognizable for *_, active, recognizable in rows)
    assert {c for _, _, c, _, _ in rows} <= APPROVED_CATEGORIES


def test_seed_is_idempotent_and_non_overwriting():
    sql = SEED.read_text(encoding="utf-8").lower()
    assert "on conflict (model_phrase_id) do nothing" in sql
    assert "update" not in sql and "delete" not in sql


def test_phase3_seed_is_subset_of_adopted_artifact():
    # Since ADR-045 the artifact recognizes 32 labels; the Phase 3 rows must be an exact
    # subset (same phraseId → text). The full 32-label check lives in test_vocabulary_32.py.
    config = pytest.importorskip("bisindo.config")
    art = config.ML_ROOT / "artifacts"
    label_map = json.loads((art / "label_map.json").read_text(encoding="utf-8"))
    info = json.loads((art / "model_info.json").read_text(encoding="utf-8"))
    assert json.loads((art / "version.json").read_text(encoding="utf-8"))["version"] == "20261006-1528"

    recognizable = {label_map[str(i)]["phraseId"]: label_map[str(i)]["text"] for i in info["known_labels"]}
    seeded = {m: t for m, t, *_ in _seed_rows()}
    assert seeded.items() <= recognizable.items()  # phrase_text comes from label_map, keyed by phraseId


@pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")
def test_seed_against_postgres():
    import psycopg

    from app.db.phrases import PostgresPhraseLookup

    async def run():
        conn = await psycopg.AsyncConnection.connect(DSN, prepare_threshold=None)
        try:
            async with conn.cursor() as cur:
                await cur.execute(SCHEMA.read_text(encoding="utf-8"))
                await cur.execute(SEED.read_text(encoding="utf-8"))
                await cur.execute("update phrases set active = false where model_phrase_id = 'label_06'")
                await cur.execute(SEED.read_text(encoding="utf-8"))  # re-run
                await cur.execute(
                    "select model_phrase_id, phrase_text, category, active, sign_recognizable, language_variant"
                    " from phrases order by model_phrase_id"
                )
                rows = await cur.fetchall()
            assert len(rows) == 10  # no duplicates
            assert {m: (t, c) for m, t, c, *_ in rows} == APPROVED
            assert all(lv == "BISINDO-Jakarta" and r is True for *_, r, lv in rows)
            assert {m: a for m, _, _, a, _, _ in rows}["label_06"] is False  # re-run did not overwrite

            rec = await PostgresPhraseLookup(conn).find_by_model_phrase_id("label_05")
            assert rec.phrase_text == "Lagi" and rec.active and rec.sign_recognizable
        finally:
            await conn.rollback()
            await conn.close()

    asyncio.run(run())
