"""Synthetic raw-array fixtures (no video / MediaPipe needed)."""
from __future__ import annotations

import numpy as np

from bisindo.schema import empty_arrays


def make_hand(center, size=0.05, seed=0):
    rng = np.random.default_rng(seed)
    base = rng.normal(0, 1, (21, 3)).astype(np.float32) * size
    base[0] = 0.0
    base[9] = [0.0, -size * 2, 0.0]  # middle MCP above wrist
    return base + np.array([center[0], center[1], 0.0], np.float32)


def make_raw(n=40, width=1280, height=720, moving=True, two_hands=True, still_head=0, still_tail=0,
             hand_gap=None):
    """Signer facing camera: right hand on image-left, left hand on image-right.

    Coordinates are MediaPipe-normalized ([0,1] image).
    """
    total = still_head + n + still_tail
    a = empty_arrays(total)
    a["width"], a["height"], a["mirrored"] = np.int32(width), np.int32(height), np.bool_(False)
    for i in range(total):
        a["t_ms"][i] = i * 33.3
        k = min(max(i - still_head, 0), n - 1)
        phase = k / max(n - 1, 1)
        dy = 0.2 * np.sin(np.pi * phase) if moving else 0.0
        pose = np.zeros((33, 4), np.float32)
        pose[:, 3] = 1.0
        pose[11, :2] = [0.58, 0.45]   # signer's left shoulder -> image right
        pose[12, :2] = [0.42, 0.45]   # signer's right shoulder -> image left
        pose[13, :2] = [0.62, 0.6]
        pose[14, :2] = [0.38, 0.6]
        rw = np.array([0.38, 0.55 - dy])
        lw = np.array([0.62, 0.7])
        pose[16, :2] = rw
        pose[15, :2] = lw
        pose[0, :2] = [0.5, 0.3]
        a["pose"][i] = pose
        a["pose_mask"][i] = True
        # detector order deliberately "wrong" (left hand first) to test slot assignment
        hands = [make_hand(lw, seed=1), make_hand(rw, seed=2)] if two_hands else [make_hand(rw, seed=2)]
        for j, h in enumerate(hands):
            if hand_gap and hand_gap[0] <= i < hand_gap[1]:
                continue
            a["hands"][i, j] = h
            a["hand_mask"][i, j] = True
            a["handedness"][i, j] = 1 if (two_hands and j == 0) else 0
            a["hand_score"][i, j] = 0.9
    return a
