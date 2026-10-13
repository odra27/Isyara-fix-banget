import pytest

from app.matching.decision import decide_action


@pytest.mark.parametrize(
    ("confidence", "expected"),
    [
        (0.0, "escalated_to_jbi"),
        (0.59, "escalated_to_jbi"),
        (0.5999, "escalated_to_jbi"),
        (0.6, "pending_confirmation"),
        (0.6000, "pending_confirmation"),
        (0.84, "pending_confirmation"),
        (0.8499, "pending_confirmation"),
        (0.85, "accepted"),
        (0.8500, "accepted"),
        (1.0, "accepted"),
    ],
)
def test_confidence_boundaries(confidence, expected):
    assert decide_action(confidence) == expected


def test_confirmed_is_never_an_inference_outcome():
    outcomes = {decide_action(i / 10000) for i in range(10001)}
    assert outcomes == {"accepted", "pending_confirmation", "escalated_to_jbi"}
    assert "confirmed" not in outcomes


@pytest.mark.parametrize("bad", [-0.0001, 1.0001, float("nan"), float("inf"), True, "0.9", None])
def test_invalid_confidence_raises(bad):
    with pytest.raises(ValueError):
        decide_action(bad)
