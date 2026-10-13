import pytest
from pydantic import ValidationError

from app.modeling.contract import ModelingSignResult
from tests.fixtures import modeling_result


def test_accept_response_parses():
    r = ModelingSignResult.model_validate(modeling_result())
    assert (r.phraseId, r.label, r.confidence, r.action, r.reason) == ("label_05", "Lagi", 0.999, "accept", None)
    assert r.topK[0].phraseId == "label_05"


def test_reject_with_null_phrase_and_empty_topk():
    r = ModelingSignResult.model_validate(
        modeling_result(phrase_id=None, label=None, confidence=0.0, action="reject", reason="too_short", top_k=[])
    )
    assert r.phraseId is None and r.label is None and r.topK == []


def test_unknown_reason_is_kept_as_metadata():
    r = ModelingSignResult.model_validate(
        modeling_result(phrase_id=None, label=None, confidence=0.2, action="reject", reason="some_future_reason")
    )
    assert r.reason == "some_future_reason"


def test_topk_optional_and_debug_dropped():
    raw = modeling_result(extra={"debug": {"raw_confidence": 0.9}})
    raw.pop("topK")
    r = ModelingSignResult.model_validate(raw)
    assert r.topK == []
    assert "debug" not in r.model_dump()


@pytest.mark.parametrize(
    "raw",
    [
        pytest.param(modeling_result(action="maybe"), id="unknown action"),
        pytest.param(modeling_result(confidence=1.5), id="confidence > 1"),
        pytest.param(modeling_result(confidence=-0.1), id="confidence < 0"),
        pytest.param(modeling_result(phrase_id=None, label=None, action="accept"), id="accept without phraseId"),
        pytest.param(modeling_result(action="reject"), id="reject with phraseId"),
        pytest.param(modeling_result(top_k=[{"phraseId": "label_05", "label": "Lagi", "confidence": 0.1}] * 4), id="topK > 3"),
    ],
)
def test_contract_violations_rejected(raw):
    with pytest.raises(ValidationError):
        ModelingSignResult.model_validate(raw)
