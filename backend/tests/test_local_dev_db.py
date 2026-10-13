"""LOCAL_DEV_DB mode: seed parsing + end-to-end /api/match/sign with the real model."""
import glob
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db.local import LOCAL_DEVICE_ID, load_seed_phrases, make_open_local
from app.errors import ModelingUnavailable
from app.main import create_app

ML_DIR = Path(__file__).resolve().parents[2] / "ml"


def test_seed_has_32_recognizable_active_phrases():
    rows = load_seed_phrases()
    assert len(rows) == 43  # ADR-045 + ADR-049
    assert all(r.active and r.sign_recognizable for r in rows)
    by_id = {r.model_phrase_id: r for r in rows}
    assert by_id["label_10"].phrase_text == "Terima kasih"
    assert load_seed_phrases()[0].id == rows[0].id  # stable UUIDs


def test_phrases_and_logs_endpoints_work_without_postgres():
    open_db = make_open_local()

    def no_model():
        raise ModelingUnavailable("not needed")

    app = create_app(modeling_factory=no_model, open_db=open_db)
    with TestClient(app) as c:
        phrases = c.get("/api/phrases").json()
        assert len(phrases) == 43
        terima = next(p for p in phrases if p["phrase_text"] == "Terima kasih")
        r = c.post("/api/logs", json={"device_id": str(LOCAL_DEVICE_ID), "direction": "sign_to_text",
                                      "predicted_phrase_id": terima["id"], "confidence": 0.7,
                                      "resulted_action": "confirmed"})
        assert r.status_code == 204
    assert len(open_db.store.logs) == 1


def _real_payload(npz: str) -> dict:
    from bisindo.schema import arrays_to_sequence, load_npz

    seq = arrays_to_sequence(load_npz(Path(npz))).model_dump(mode="json")
    for f in seq["frames"]:  # backend contract: pose key required, rows of one width
        f.setdefault("pose", None)
    dur = int(seq["frames"][-1]["t_ms"] - seq["frames"][0]["t_ms"])
    return {"device_id": str(LOCAL_DEVICE_ID), "sequence": seq, "duration_ms": max(500, dur)}


@pytest.mark.parametrize("npz", sorted(glob.glob(str(ML_DIR / "data/landmarks/signer*_label10_sample1.npz"))))
def test_terima_kasih_end_to_end(npz):
    pytest.importorskip("bisindo.predict")
    app = create_app(open_db=make_open_local())
    with TestClient(app) as c:
        assert c.get("/api/health").json()["modeling"] == "loaded"
        r = c.post("/api/match/sign", json=_real_payload(npz))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["phrase_text"] == "Terima kasih" and body["action"] == "accepted"
