"""scripts/export_skeleton.py: anatomical hand sides + mirrored display coordinates."""
from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import numpy as np
import pytest

from helpers import make_raw

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "export_skeleton.py"
_spec = importlib.util.spec_from_file_location("export_skeleton", SCRIPT)
es = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(es)

RW_X, LW_X = 0.38, 0.62  # make_raw: signer's right wrist on image-left, left wrist on image-right


def wrist_x(frames, side):
    return np.array([f["hands"][side][0][0] for f in frames if f["hands"][side] is not None])


def test_sides_from_pose_not_handedness_label():
    a = make_raw()  # detector slot 0 = LEFT hand but labelled "Right" by handedness
    frames = es.build_frames(a)
    assert all(f["hands"]["right"] is not None and f["hands"]["left"] is not None for f in frames)
    # mirrored display: x' = 1 - x
    assert np.allclose(wrist_x(frames, "right"), 1 - RW_X, atol=1e-3)
    assert np.allclose(wrist_x(frames, "left"), 1 - LW_X, atol=1e-3)
    # after mirroring the signer's right hand is on screen-right
    assert wrist_x(frames, "right").mean() > wrist_x(frames, "left").mean()


def test_detector_slot_swap_mid_clip_is_stable():
    a = make_raw(n=40)
    for k in ("hands", "hand_mask", "handedness", "hand_score"):
        a[k][20:] = a[k][20:, ::-1].copy()
    frames = es.build_frames(a)
    assert np.allclose(wrist_x(frames, "right"), 1 - RW_X, atol=1e-3)
    assert np.allclose(wrist_x(frames, "left"), 1 - LW_X, atol=1e-3)


def test_mirrored_input_gives_same_output():
    a = make_raw()
    b = {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in a.items()}
    b["hands"][..., 0] = np.where(b["hand_mask"][..., None], 1 - b["hands"][..., 0], 0)
    b["pose"][..., 0] = 1 - b["pose"][..., 0]
    for l, r in [(11, 12), (13, 14), (15, 16), (23, 24)]:
        b["pose"][:, [l, r]] = b["pose"][:, [r, l]]
    b["mirrored"] = np.bool_(True)
    fa, fb = es.build_frames(a), es.build_frames(b)
    assert np.allclose(wrist_x(fa, "right"), wrist_x(fb, "right"), atol=1e-4)
    assert np.allclose(wrist_x(fa, "left"), wrist_x(fb, "left"), atol=1e-4)


def test_fallback_without_pose_uses_image_position():
    a = make_raw()
    a["pose_mask"][:] = False
    frames = es.build_frames(a)
    assert all(f["pose"] is None for f in frames)
    assert np.allclose(wrist_x(frames, "right"), 1 - RW_X, atol=1e-3)


def test_single_hand_and_gaps_have_null_side():
    a = make_raw(two_hands=False, hand_gap=(10, 14))
    frames = es.build_frames(a)
    assert all(f["hands"]["left"] is None for f in frames)
    assert any(f["hands"]["right"] is None for f in frames)  # gap kept as null, not invented
    assert np.allclose(wrist_x(frames, "right"), 1 - RW_X, atol=1e-3)


def test_pose_labels_are_anatomical_after_mirror():
    frames = es.build_frames(make_raw())
    names = es.POSE_NAMES
    p = np.array(frames[0]["pose"])
    assert p.shape == (len(names), 2)
    # signer's right wrist (pose 16, image x 0.38) is drawn on screen-right after mirroring
    assert p[names.index("r_wrist"), 0] == pytest.approx(1 - RW_X, abs=1e-3)
    assert p[names.index("r_shoulder"), 0] > p[names.index("l_shoulder"), 0]


def test_export_json_contract(tmp_path, monkeypatch):
    a = make_raw()
    npz = tmp_path / "signer9_label10_sample1.npz"
    np.savez(npz, **a)
    out = es.export(npz, 10, "Terima kasih", tmp_path)
    d = json.loads(out.read_text(encoding="utf-8"))
    assert d["mirrored"] is True and d["handSide"] == "anatomical"
    assert d["posePoints"] == es.POSE_POINTS and len(d["poseNames"]) == len(es.POSE_POINTS)
    f = d["frames"]
    assert all(set(x["hands"]) == {"right", "left"} for x in f)
    assert all(f[i]["t"] < f[i + 1]["t"] for i in range(len(f) - 1))
    vals = [c for x in f for pts in x["hands"].values() if pts for p in pts for c in p]
    assert vals and not any(math.isnan(c) for c in vals)


def test_preview_renders(tmp_path):
    pytest.importorskip("cv2")
    import cv2

    a = make_raw()
    npz = tmp_path / "signer9_label10_sample1.npz"
    np.savez(npz, **a)
    out = es.export(npz, 10, "Terima kasih", tmp_path)
    png = es.render_preview(json.loads(out.read_text(encoding="utf-8")), tmp_path / "p.png")
    img = cv2.imread(str(png))
    assert img is not None and img.shape[1] == 4 * 320 and img.shape[0] == 3 * 180 + 28
