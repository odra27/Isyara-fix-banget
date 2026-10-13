import pytest
from pydantic import ValidationError

from app.modeling.sequence import SignSequence
from tests.fixtures import deep, hand, pose, sequence_payload


def test_valid_sequence_accepted_and_values_unchanged():
    payload = sequence_payload()
    seq = SignSequence.model_validate(payload)
    assert len(seq.frames) == 12
    assert seq.frames[0].hands == []
    assert seq.frames[-1].pose is None
    # validation only: no normalization / transformation of values
    assert seq.model_dump(mode="python") == payload


def _invalid(mutate):
    p = deep(sequence_payload())
    mutate(p)
    with pytest.raises(ValidationError):
        SignSequence.model_validate(p)


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda p: p.pop("frames"), id="missing frames"),
        pytest.param(lambda p: p.pop("mirrored"), id="missing mirrored"),
        pytest.param(lambda p: p.pop("width"), id="missing width"),
        pytest.param(lambda p: p.update(width=0), id="width zero"),
        pytest.param(lambda p: p.update(height=-1), id="height negative"),
        pytest.param(lambda p: p.update(width=960.5), id="width not int"),
        pytest.param(lambda p: p.update(mirrored="no"), id="mirrored not bool"),
        pytest.param(lambda p: p["frames"][1].pop("t_ms"), id="missing t_ms"),
        pytest.param(lambda p: p["frames"][1].pop("hands"), id="missing hands key"),
        pytest.param(lambda p: p["frames"][1].pop("pose"), id="missing pose key"),
        pytest.param(lambda p: p["frames"][1].update(hands=[hand(), hand(), hand()]), id="three hands"),
        pytest.param(lambda p: p["frames"][1]["hands"][0]["landmarks"].pop(), id="20 hand landmarks"),
        pytest.param(lambda p: p["frames"][1]["hands"][0]["landmarks"][0].pop(), id="hand point 2d"),
        pytest.param(lambda p: p["frames"][1]["hands"][0].update(handedness="Both"), id="bad handedness"),
        pytest.param(lambda p: p["frames"][1]["hands"][0].pop("score"), id="missing score"),
        pytest.param(lambda p: p["frames"][1].update(pose=pose()[:32]), id="32 pose points"),
        pytest.param(lambda p: p["frames"][1].update(pose=[[0.1, 0.2]] * 33), id="pose 33x2"),
        pytest.param(lambda p: p["frames"][1].update(pose=pose(3)[:16] + pose(4)[:17]), id="pose mixed width"),
        pytest.param(lambda p: p["frames"][2].update(t_ms=0.0), id="t_ms decreasing"),
    ],
)
def test_invalid_sequence_rejected(mutate):
    _invalid(mutate)


def test_t_ms_equal_is_allowed_monotonic():
    p = deep(sequence_payload(3))
    p["frames"][2]["t_ms"] = p["frames"][1]["t_ms"]
    SignSequence.model_validate(p)


def test_empty_frames_is_structurally_valid():
    # Too-short handling belongs to Modeling (reason=too_short), not Backend validation.
    SignSequence.model_validate({"frames": [], "mirrored": True, "width": 1, "height": 1})
