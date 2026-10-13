"""Predictor contract tests. Skipped until artifacts/ is built (python -m bisindo.export)."""
import json
import time
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError

from bisindo.config import ML_ROOT
from bisindo.schema import arrays_to_sequence
from helpers import make_raw

ART = ML_ROOT / "artifacts"
pytestmark = pytest.mark.skipif(not (ART / "model.onnx").exists(), reason="artifacts not built")


@pytest.fixture(scope="module")
def p():
    from bisindo.predict import Predictor
    return Predictor()


def _payload(n=40):
    return arrays_to_sequence(make_raw(n=n)).model_dump(mode="json")


def test_vocabulary_has_names(p):
    v = p.vocabulary()
    assert len(v) == p.K > 0
    assert all(x["text"] and not x["text"].startswith("label_") for x in v)
    assert "Terima kasih" in [x["text"] for x in v]


def test_output_contract_dict_and_json(p):
    for payload in (_payload(), json.dumps(_payload())):
        r = p.predict_json(payload)
        assert set(r) >= {"phraseId", "label", "confidence", "action", "reason", "topK"}
        assert r["action"] in {"accept", "confirm", "reject"}
        assert 0.0 <= r["confidence"] <= 1.0
        if r["action"] == "reject":
            assert r["phraseId"] is None and r["label"] is None
        assert len(r["topK"]) == 3 and all({"phraseId", "label", "confidence"} <= set(t) for t in r["topK"])


def test_malformed_payload_raises(p):
    with pytest.raises(ValidationError):
        p.predict_json({"frames": [{"t_ms": 0, "hands": [{"landmarks": [[0, 0]]}]}]})
    with pytest.raises(ValidationError):
        p.predict_json({"nope": 1})


def test_too_short_is_rejected_without_inference(p):
    r = p.predict_json(_payload(n=3))
    assert r["action"] == "reject" and r["reason"] == "too_short"


def test_too_many_frames_raises(p):
    pl = _payload(n=5)
    pl["frames"] = pl["frames"] * 200
    with pytest.raises(ValueError, match="max"):
        p.predict_json(pl)


def _label(f: Path) -> int:
    return int(f.stem.split("_label")[1].split("_")[0])


def test_demo_words_accepted_and_other_words_rejected(p):
    from bisindo.schema import load_npz

    lm = ML_ROOT / "data" / "landmarks"
    if not lm.exists():
        pytest.skip("landmark cache missing")
    known = set(p.labels)
    demo = [f for f in sorted(lm.glob("signer3_label*_sample1.npz")) if _label(f) in known]
    other = [f for f in sorted(lm.glob("signer3_label*_sample1.npz")) if _label(f) not in known][:5]
    assert demo
    # a full-vocabulary model (all 32 words) has no out-of-vocabulary dataset words to reject
    assert other or known >= {_label(f) for f in lm.glob("signer3_label*_sample1.npz")}
    t0 = time.perf_counter()
    for f in demo:
        a = load_npz(f)
        r = p.predict_arrays(a)
        assert r["action"] == "accept" and r["phraseId"] == p.label_map[str(_label(f))]["phraseId"], f.stem
        r2 = p.predict_sequence(arrays_to_sequence(a))  # schema round trip = same answer
        assert abs(r2["confidence"] - r["confidence"]) < 1e-3
    for f in other:
        assert p.predict_arrays(load_npz(f))["action"] == "reject", f.stem
    # non-sign movement must still be rejected
    rng = np.random.default_rng(0)
    a = load_npz(demo[0])
    a["hands"] = (a["hands"] + rng.normal(0, 0.05, a["hands"].shape)).astype(a["hands"].dtype)
    a["hands"] = a["hands"][rng.permutation(len(a["hands"]))]
    assert p.predict_arrays(a)["action"] != "accept"
    per = (time.perf_counter() - t0) / (2 * len(demo) + len(other)) * 1000
    assert per < 100, f"{per:.1f} ms per sequence"


def test_every_word_has_audio(p):
    import wave

    if not p.audio:
        pytest.skip("artifacts/audio missing (scripts/generate_audio.ps1)")
    for v in p.vocabulary():
        rel = p.audio.get(v["phraseId"])
        assert rel, v
        with wave.open(str(ART / rel)) as w:
            assert w.getnframes() / w.getframerate() > 0.3
