"""ADR-045 + ADR-049: 43-label vocabulary of artifact 20261006-1528 ↔ Backend `phrases` mapping.

* Static checks: both seed migrations together cover exactly the 32 labels (always run).
* Artifact checks: seeds == label_map ∩ model_info.known_labels (when `bisindo` is installed).
* PostgreSQL checks: after all migrations every artifact label resolves through the real
  phrase lookup + decision logic, with no MODEL_MAPPING_ERROR (when a DB is configured).
"""
import asyncio
import json
import os
import re
from pathlib import Path

import pytest

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database/migrations"
PHASE3 = MIGRATIONS / "20260929000000_phase3_seed_sign_vocabulary.sql"
ADR045 = MIGRATIONS / "20260930000000_adr045_seed_32_label_vocabulary.sql"
ADR049 = MIGRATIONS / "20261006000000_adr049_seed_43_label_vocabulary.sql"
DSN = os.environ.get("BACKEND_TEST_DATABASE_URL")

ALL_IDS = [f"label_{i:02d}" for i in range(43)]
PHASE3_IDS = {"label_05", "label_06", "label_09", "label_10", "label_11", "label_13", "label_15", "label_17",
              "label_24", "label_31"}
# ADR-045 §3 (owner assignment) — do not edit without a new decision.
ADR045_CATEGORIES = {
    "label_00": ("Air", "Fallback"), "label_01": ("Belajar", "Fallback"), "label_02": ("Cari", "Administrasi"),
    "label_03": ("Hari", "Administrasi"), "label_04": ("Ingat", "Fallback"), "label_07": ("Makan", "Fallback"),
    "label_08": ("Motor", "Fallback"), "label_12": ("Apa", "Administrasi"), "label_14": ("Kapan", "Administrasi"),
    "label_16": ("Mengapa", "Administrasi"), "label_18": ("Merah", "Fallback"), "label_19": ("Kuning", "Fallback"),
    "label_20": ("Hijau", "Fallback"), "label_21": ("Hitam", "Fallback"), "label_22": ("Dengar", "Keluhan"),
    "label_23": ("Berangkat", "Administrasi"), "label_25": ("Teman", "Fallback"),
    "label_26": ("Keluarga", "Pendaftaran"), "label_27": ("Rumah", "Fallback"), "label_28": ("Pagi", "Administrasi"),
    "label_29": ("Siang", "Administrasi"), "label_30": ("Sore", "Administrasi"),
}
# ADR-049 §2 — do not edit without a new decision.
ADR049_CATEGORIES = {
    "label_32": ("Apa kabar", "Fallback"), "label_33": ("Baik", "Fallback"), "label_34": ("Berapa", "Administrasi"),
    "label_35": ("Bingung", "Fallback"), "label_36": ("Halo", "Fallback"), "label_37": ("Kamu", "Fallback"),
    "label_38": ("Tidur", "Keluhan"), "label_39": ("Selamat siang", "Fallback"), "label_40": ("Selamat sore", "Fallback"),
    "label_41": ("Selamat pagi", "Fallback"), "label_42": ("Selamat malam", "Fallback"),
}
CATEGORIES = {"Pendaftaran", "Keluhan", "Obat", "Administrasi", "Fallback"}
_ROW = re.compile(
    r"\('(label_\d{2})',\s*'([^']*)',\s*'([^']*)',\s*(true|false),\s*(true|false)\)")


def rows(path):
    return {m: (t, c, a == "true", r == "true") for m, t, c, a, r in _ROW.findall(path.read_text(encoding="utf-8"))}


def test_new_seed_matches_adr045_table_exactly():
    new = rows(ADR045)
    assert {m: (t, c) for m, (t, c, _, _) in new.items()} == ADR045_CATEGORIES
    assert all(active and recog for (_, _, active, recog) in new.values())
    assert {c for (_, c, _, _) in new.values()} <= CATEGORIES
    sql = ADR045.read_text(encoding="utf-8").lower()
    assert "on conflict (model_phrase_id) do nothing" in sql and "update" not in sql and "delete" not in sql


def test_adr049_seed_matches_table_exactly():
    new = rows(ADR049)
    assert {m: (t, c) for m, (t, c, _, _) in new.items()} == ADR049_CATEGORIES
    assert all(active and recog for (_, _, active, recog) in new.values())
    assert {c for (_, c, _, _) in new.values()} <= CATEGORIES
    sql = ADR049.read_text(encoding="utf-8").lower()
    assert "on conflict (model_phrase_id) do nothing" in sql and "update" not in sql and "delete" not in sql


def test_seeds_cover_exactly_43_labels_without_overlap():
    old, mid, new = rows(PHASE3), rows(ADR045), rows(ADR049)
    assert set(old) == PHASE3_IDS and not (set(old) & set(
        mid)) and not ((set(old) | set(mid)) & set(new))
    assert sorted(set(old) | set(mid) | set(new)) == ALL_IDS


def _artifact():
    config = pytest.importorskip("bisindo.config")
    art = config.ML_ROOT / "artifacts"
    label_map = json.loads(
        (art / "label_map.json").read_text(encoding="utf-8"))
    info = json.loads((art / "model_info.json").read_text(encoding="utf-8"))
    version = json.loads(
        (art / "version.json").read_text(encoding="utf-8"))["version"]
    return label_map, info, version


def test_seeds_equal_adopted_artifact_vocabulary():
    label_map, info, version = _artifact()
    assert version == "20261006-1528" and info["n_known"] == 43 and info["none_index"] == 43
    artifact = {label_map[str(i)]["phraseId"]: label_map[str(
        i)]["text"] for i in info["known_labels"]}
    seeded = {m: t for m, (t, *_) in {**rows(PHASE3), **
                                      rows(ADR045), **rows(ADR049)}.items()}
    # no orphan label, no seed row outside the artifact, exact text
    assert seeded == artifact


def test_predictor_vocabulary_matches_seeds():
    predict = pytest.importorskip("bisindo.predict")
    p = predict.Predictor()
    vocab = {v["phraseId"]: v["text"] for v in p.vocabulary()}
    seeded = {m: t for m, (t, *_) in {**rows(PHASE3), **
                                      rows(ADR045), **rows(ADR049)}.items()}
    assert vocab == seeded and len(vocab) == 43


@pytest.mark.skipif(not DSN, reason="BACKEND_TEST_DATABASE_URL not set")
def test_all_43_labels_resolve_in_database_without_mapping_error():
    import uuid

    import psycopg
    from psycopg.conninfo import make_conninfo

    from app.db.phrases import PostgresPhraseLookup
    from app.matching.sign import decide_sign_result
    from app.modeling.contract import ModelingSignResult

    schema = f"v32_{uuid.uuid4().hex[:12]}"
    scoped = make_conninfo(DSN, options=f"-c search_path={schema}")
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(f'create schema "{schema}"')
    try:
        with psycopg.connect(scoped, autocommit=True) as conn:
            for f in sorted(MIGRATIONS.glob("*.sql")):
                conn.execute(f.read_text(encoding="utf-8"))
            for f in sorted(MIGRATIONS.glob("*seed*.sql")):  # idempotency: re-run seeds
                conn.execute(f.read_text(encoding="utf-8"))
            db_rows = conn.execute(
                "select model_phrase_id, phrase_text, category, active, sign_recognizable, language_variant"
                " from phrases order by model_phrase_id"
            ).fetchall()
            dup = conn.execute("select model_phrase_id from phrases where model_phrase_id is not null"
                               " group by 1 having count(*) > 1").fetchall()
        assert [r[0] for r in db_rows] == ALL_IDS and dup == []
        assert all(r[3] is True and r[4] is True and r[5]
                   == "BISINDO-Jakarta" for r in db_rows)
        expected = {**{m: (t, c) for m, (t, c, _, _) in rows(PHASE3).items()},
                    **ADR045_CATEGORIES, **ADR049_CATEGORIES}
        assert {r[0]: (r[1], r[2]) for r in db_rows} == expected

        async def resolve_all():
            conn = await psycopg.AsyncConnection.connect(scoped, autocommit=True, prepare_threshold=None)
            try:
                lookup = PostgresPhraseLookup(conn)
                out = {}
                for mid in ALL_IDS:
                    result = ModelingSignResult.model_validate(
                        {"phraseId": mid, "label": expected[mid][0], "confidence": 0.95, "action": "accept",
                         # extra field ignored
                         "reason": None, "topK": [], "audio": f"audio/{mid}.wav"}
                    )
                    # raises MODEL_MAPPING_ERROR on failure
                    d = await decide_sign_result(result, lookup)
                    out[mid] = (d.action, d.phrase.phrase_text,
                                d.phrase.model_phrase_id)
                return out
            finally:
                await conn.close()

        resolved = asyncio.run(resolve_all())
        assert resolved == {
            m: ("accepted", expected[m][0], m) for m in ALL_IDS}
    finally:
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'drop schema "{schema}" cascade')
