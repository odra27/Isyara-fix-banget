"""AutoCapture (live demo) guard rails, mirroring the kiosk scenarios in PRD §22."""
import importlib.util
from pathlib import Path

import numpy as np
import pytest

from bisindo.config import ML_ROOT


@pytest.fixture(scope="module")
def AutoCapture():
    spec = importlib.util.spec_from_file_location("live_demo", ML_ROOT / "scripts" / "live_demo.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.AutoCapture


def run(ac, frames, dt=33):
    """frames: list of (has_hand, moving). Returns (event, time_ms) of the first event."""
    for i, (has, moving) in enumerate(frames):
        pts = np.full((21, 2), 0.5 + (0.02 * (i % 2) if moving else 0.0)) if has else None
        ev = ac.step(i * dt, has, pts, i)
        if ev:
            return ev, i * dt
    return None, None


def test_false_start_returns_to_idle(AutoCapture, cfg):
    ac = AutoCapture(cfg["capture"])
    ev, _ = run(ac, [(True, True)] * 5 + [(False, False)] * 30)  # hand for ~160 ms
    assert ev is None and ac.state == "IDLE"


def test_short_recording_is_discarded(AutoCapture, cfg):
    ac = AutoCapture(cfg["capture"])
    ev, _ = run(ac, [(True, True)] * 15 + [(False, False)] * 30)  # ~250 ms recording then hand lost
    assert ev == "discard"


def test_flicker_does_not_stop_but_loss_does(AutoCapture, cfg):
    ac = AutoCapture(cfg["capture"])
    frames = [(True, True)] * 40 + [(False, False)] * 6 + [(True, True)] * 40 + [(False, False)] * 30
    ev, t = run(ac, frames)
    assert ev == "process" and t > 86 * 33  # 200 ms flicker ignored; stop after the final loss


def test_natural_pause_does_not_stop(AutoCapture, cfg):
    ac = AutoCapture(cfg["capture"])
    frames = [(True, True)] * 40 + [(True, False)] * 25 + [(True, True)] * 30 + [(True, False)] * 60
    ev, t = run(ac, frames)
    assert ev == "process" and t > 95 * 33  # ~0.8 s pause kept; stops on the final still hold


def test_timeout(AutoCapture, cfg):
    ac = AutoCapture(cfg["capture"])
    ev, t = run(ac, [(True, True)] * 400)
    assert ev == "process" and abs(t - (cfg["capture"]["max_record_ms"] + cfg["capture"]["hand_stable_ms"])) < 100
