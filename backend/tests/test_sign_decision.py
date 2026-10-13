import asyncio

import pytest

from app.errors import ModelMappingError
from app.matching.sign import decide_sign_result
from app.modeling.contract import ModelingSignResult
from tests.fixtures import LABEL_05_UUID, default_lookup, modeling_result


def _decide(raw, lookup=None):
    lookup = lookup or default_lookup()
    return asyncio.run(decide_sign_result(ModelingSignResult.model_validate(raw), lookup)), lookup


def test_accept_maps_label_05_to_uuid():
    d, _ = _decide(modeling_result(confidence=0.999, action="accept"))
    assert d.action == "accepted"
    assert d.phrase.id == LABEL_05_UUID
    assert d.model_phrase_id == "label_05"


def test_modeling_confirm_becomes_pending_confirmation_not_confirmed():
    d, _ = _decide(modeling_result(confidence=0.72, action="confirm"))
    assert d.action == "pending_confirmation"
    assert d.phrase.id == LABEL_05_UUID


def test_confidence_exactly_0_85_is_accepted_even_if_modeling_said_confirm():
    # ADR-007: rounding 0.84996 -> 0.8500; Backend decision is authoritative.
    d, _ = _decide(modeling_result(confidence=0.85, action="confirm"))
    assert d.action == "accepted"
    assert d.modeling_action == "confirm"


def test_confidence_exactly_0_60_is_pending_confirmation():
    d, _ = _decide(modeling_result(confidence=0.6, action="confirm"))
    assert d.action == "pending_confirmation"


def test_confidence_below_0_60_on_reject_escalates():
    d, lookup = _decide(
        modeling_result(phrase_id=None, label=None, confidence=0.5999, action="reject", reason="far_from_centroid")
    )
    assert d.action == "escalated_to_jbi"
    assert d.phrase is None
    assert lookup.calls == []


def test_null_phrase_reject_escalates_even_if_rounded_confidence_reaches_0_60():
    d, _ = _decide(modeling_result(phrase_id=None, label=None, confidence=0.6, action="reject", reason=None))
    assert d.action == "escalated_to_jbi"
    assert d.phrase is None


@pytest.mark.parametrize("reason", [None, "too_short", "none_class", "brand_new_reason"])
def test_reject_escalates_regardless_of_reason(reason):
    d, _ = _decide(modeling_result(phrase_id=None, label=None, confidence=0.0, action="reject", reason=reason, top_k=[]))
    assert d.action == "escalated_to_jbi"
    assert d.reason == reason


def test_no_nearest_phrase_fallback_from_topk():
    raw = modeling_result(
        phrase_id=None,
        label=None,
        confidence=0.41,
        action="reject",
        reason="none_class",
        top_k=[{"phraseId": "label_05", "label": "Lagi", "confidence": 0.41}],
    )
    d, lookup = _decide(raw)
    assert d.action == "escalated_to_jbi"
    assert d.phrase is None and d.model_phrase_id is None
    assert lookup.calls == []  # topK never resolved


def test_unknown_phrase_id_raises_mapping_error_without_guessing():
    # label text matches a known phrase, but identity is phraseId only.
    raw = modeling_result(phrase_id="label_99", label="Lagi", confidence=0.95, action="accept")
    with pytest.raises(ModelMappingError) as exc:
        _decide(raw)
    assert exc.value.code == "MODEL_MAPPING_ERROR"


def test_phrases_without_model_phrase_id_do_not_break_mapping():
    d, _ = _decide(modeling_result(phrase_id="label_06", label="Maaf", confidence=0.9, action="accept"))
    assert d.phrase.phrase_text == "Maaf"


# --- Phase 3 active / sign_recognizable policy -----------------------------------------------


def test_recognizable_inactive_phrase_escalates_without_phrase():
    d, lookup = _decide(modeling_result(phrase_id="label_09", label="Saya", confidence=0.97, action="accept"))
    assert d.action == "escalated_to_jbi"
    assert d.phrase is None and d.model_phrase_id is None
    assert lookup.calls == ["label_09"]  # single lookup, no substitute search


def test_non_recognizable_phrase_is_mapping_error_with_http_500():
    raw = modeling_result(phrase_id="label_10", label="Terima kasih", confidence=0.97, action="accept")
    with pytest.raises(ModelMappingError) as exc:
        _decide(raw)
    assert exc.value.code == "MODEL_MAPPING_ERROR" and exc.value.http_status == 500


def test_unknown_phrase_id_is_http_500():
    with pytest.raises(ModelMappingError) as exc:
        _decide(modeling_result(phrase_id="label_12", label="Apa", confidence=0.9, action="accept"))
    assert exc.value.http_status == 500


@pytest.mark.parametrize(
    ("active", "recognizable", "expected"),
    [
        (None, True, "escalated_to_jbi"),  # NULL active: fail-safe, not served
        (True, None, ModelMappingError),  # NULL recognizable: not recognizable
        (False, False, ModelMappingError),  # mismatch dominates
    ],
)
def test_null_or_combined_flags_are_fail_safe(active, recognizable, expected):
    from tests.fixtures import InMemoryPhraseLookup, phrase

    lookup = InMemoryPhraseLookup([phrase(LABEL_05_UUID, "Lagi", "label_05", active=active, recognizable=recognizable)])
    raw = modeling_result(confidence=0.95, action="accept")
    if expected is ModelMappingError:
        with pytest.raises(ModelMappingError):
            _decide(raw, lookup)
    else:
        d, _ = _decide(raw, lookup)
        assert d.action == expected and d.phrase is None


@pytest.mark.parametrize(
    ("confidence", "modeling_action", "expected"),
    [(0.85, "confirm", "accepted"), (0.8499, "confirm", "pending_confirmation"), (0.6, "confirm", "pending_confirmation")],
)
def test_active_recognizable_phrase_uses_confidence_boundaries(confidence, modeling_action, expected):
    d, _ = _decide(modeling_result(confidence=confidence, action=modeling_action))
    assert d.action == expected
    assert d.phrase.id == LABEL_05_UUID and d.phrase.active and d.phrase.sign_recognizable
