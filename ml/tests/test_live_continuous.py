"""ContinuousCapture (scripts/live_continuous.py): word / sentence segmentation."""
import importlib.util
import sys

import numpy as np
import pytest

from bisindo.config import ML_ROOT


@pytest.fixture(scope="module")
def CC():
    sys.path.insert(0, str(ML_ROOT / "scripts"))
    spec = importlib.util.spec_from_file_location("live_continuous", ML_ROOT / "scripts" / "live_continuous.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.ContinuousCapture


def run(cc, frames, dt=33):
    """frames: list of (has_hand, moving). Returns list of (event_name, frame_index)."""
    out = []
    for i, (has, moving) in enumerate(frames):
        pts = np.full((21, 2), 0.5 + (0.02 * (i % 2) if moving else 0.0)) if has else None
        for ev in cc.step(i * dt, has, pts, i):
            out.append((ev[0], i))
    return out


def names(evs):
    return [e for e, _ in evs]


def test_two_words_then_sentence_end_by_long_pause(CC, cfg):
    cc = CC(cfg["capture"])
    frames = [(True, True)] * 40 + [(True, False)] * 30 + [(True, True)] * 40 + [(True, False)] * 90
    assert names(run(cc, frames)) == ["word", "word", "sentence_end"]
    assert cc.state == "PAUSE"  # hands still up, waiting


def test_short_hesitation_does_not_split_word(CC, cfg):
    cc = CC(cfg["capture"])
    frames = [(True, True)] * 30 + [(True, False)] * 6 + [(True, True)] * 30 + [(False, False)] * 30
    assert names(run(cc, frames)) == ["word", "sentence_end"]


def test_hands_down_ends_sentence(CC, cfg):
    cc = CC(cfg["capture"])
    evs = run(cc, [(True, True)] * 40 + [(False, False)] * 30)
    assert names(evs) == ["word", "sentence_end"] and cc.state == "IDLE"


def test_detector_flicker_does_not_end_word(CC, cfg):
    cc = CC(cfg["capture"])
    frames = [(True, True)] * 30 + [(False, False)] * 5 + [(True, True)] * 30 + [(False, False)] * 30
    assert names(run(cc, frames)) == ["word", "sentence_end"]


def test_nonstop_motion_is_split_at_max_word(CC, cfg):
    cc = CC(cfg["capture"])
    evs = run(cc, [(True, True)] * 200 + [(False, False)] * 30)
    assert names(evs).count("word") >= 2 and names(evs)[-1] == "sentence_end"
    first = evs[0][1] * 33
    assert abs(first - cfg["capture"]["max_word_ms"]) < 100


def test_short_segment_is_discarded(CC, cfg):
    cc = CC(cfg["capture"])
    evs = run(cc, [(True, True)] * 10 + [(False, False)] * 30)  # ~330 ms, below min_word_ms
    assert "word" not in names(evs) and "discard" in names(evs)


def test_false_start_is_silent(CC, cfg):
    cc = CC(cfg["capture"])
    assert run(cc, [(True, True)] * 4 + [(False, False)] * 30) == [] and cc.state == "IDLE"


def test_next_word_includes_preroll(CC, cfg):
    cc = CC(cfg["capture"])
    frames = [(True, True)] * 40 + [(True, False)] * 30 + [(True, True)] * 40 + [(False, False)] * 30
    words = []
    for i, (has, moving) in enumerate(frames):
        pts = np.full((21, 2), 0.5 + (0.02 * (i % 2) if moving else 0.0)) if has else None
        words += [ev[1] for ev in cc.step(i * 33, has, pts, i) if ev[0] == "word"]
    assert len(words) == 2
    assert words[1][0] < 70  # starts just before movement resumed at frame 70
    assert words[0][-1] < words[1][0]  # no overlap
