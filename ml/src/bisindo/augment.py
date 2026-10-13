"""Task 4: augmentation + synthetic "none" sequences.

Operates on normalized, trimmed sequences (output of features.preprocess).
"""
from __future__ import annotations

import numpy as np

from .features import resample

# Positions of L/R pairs inside the selected pose_points list are computed at runtime.
_POSE_PAIRS = [(11, 12), (13, 14), (15, 16), (23, 24)]


def _pose_swap_index(pose_points: list[int]) -> np.ndarray:
    idx = list(range(len(pose_points)))
    pos = {p: i for i, p in enumerate(pose_points)}
    for l, r in _POSE_PAIRS:
        if l in pos and r in pos:
            idx[pos[l]], idx[pos[r]] = pos[r], pos[l]
    return np.array(idx)


def _full_swap_index() -> np.ndarray:
    idx = np.arange(33)
    for l, r in _POSE_PAIRS:
        idx[l], idx[r] = r, l
    return idx


def mirror(c: dict, pose_points: list[int]) -> dict:
    """Horizontal flip in body coordinates + swap right/left hand slots and pose sides."""
    out = dict(c)
    h = c["hands"][:, ::-1].copy()
    h[..., 0] *= -1
    out["hands"] = h
    out["hmask"] = c["hmask"][:, ::-1].copy()
    p = c["pose"][:, _pose_swap_index(pose_points)].copy()
    p[..., 0] *= -1
    out["pose"] = p
    pf = c["pose_full"][:, _full_swap_index()].copy()
    pf[..., 0] *= -1
    out["pose_full"] = pf
    out["hands"][~out["hmask"]] = 0.0
    return out


def affine(c: dict, rng: np.random.Generator, acfg: dict) -> dict:
    th = np.deg2rad(rng.uniform(-acfg["rotate_deg"], acfg["rotate_deg"]))
    s = rng.uniform(*acfg["scale"])
    R = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]], np.float32) * s
    t = rng.uniform(-acfg["shift"], acfg["shift"], size=2).astype(np.float32)
    out = dict(c)
    h = c["hands"].copy()
    h[..., :2] = h[..., :2] @ R.T + t
    h[..., 2] *= s
    h[~c["hmask"]] = 0.0
    out["hands"] = h
    out["pose"] = c["pose"] @ R.T + t
    out["pose_full"] = c["pose_full"] @ R.T + t
    return out


def _take(c: dict, idx: np.ndarray) -> dict:
    return {k: v[idx] for k, v in c.items()}


def temporal(c: dict, rng: np.random.Generator, acfg: dict) -> dict:
    F = len(c["hmask"])
    idx = np.arange(F)
    # random crop at start / end
    k = int(F * acfg["crop_max_ratio"])
    if k > 0 and F > 12:
        s = rng.integers(0, k + 1)
        e = F - rng.integers(0, k + 1)
        idx = idx[s:e]
    # "mid-air" crop: continuous signing starts / ends a word with the hands already up, so drop the
    # rise from and return to rest (a larger fraction at each end), keeping the core of the sign.
    if acfg.get("midair_p", 0) > 0 and len(idx) > 16 and rng.random() < acfg["midair_p"]:
        lo, hi = acfg.get("midair_crop", [0.1, 0.35])
        n = len(idx)
        s = int(n * rng.uniform(lo, hi))
        e = n - int(n * rng.uniform(lo, hi))
        if e - s >= max(12, int(0.3 * n)):
            idx = idx[s:e]
    # frame drop
    if acfg["frame_drop_p"] > 0 and len(idx) > 12:
        keep = rng.random(len(idx)) > acfg["frame_drop_p"]
        keep[0] = keep[-1] = True
        idx = idx[keep]
    # hold padding (auto-capture stops after a still hold)
    hp = acfg.get("hold_pad_max", 0)
    if hp:
        pre = np.full(rng.integers(0, hp + 1) // 2, idx[0])
        post = np.full(rng.integers(0, hp + 1), idx[-1])
        idx = np.concatenate([pre, idx, post])
    return _take(c, idx)


def hand_dropout(c: dict, rng: np.random.Generator, p: float) -> dict:
    if rng.random() >= p:
        return c
    out = dict(c)
    m = c["hmask"].copy()
    F = len(m)
    L = int(rng.integers(2, 7))
    if F <= L:
        return c
    s = int(rng.integers(0, F - L))
    m[s:s + L, int(rng.integers(0, 2))] = False
    h = c["hands"].copy()
    h[~m] = 0.0
    out.update(hmask=m, hands=h)
    return out


def noise(c: dict, rng: np.random.Generator, std: float) -> dict:
    out = dict(c)
    h = c["hands"] + rng.normal(0, std, c["hands"].shape).astype(np.float32)
    h[~c["hmask"]] = 0.0
    out["hands"] = h
    out["pose"] = c["pose"] + rng.normal(0, std, c["pose"].shape).astype(np.float32)
    return out


def warp_positions(F: int, T: int, rng: np.random.Generator, strength: float) -> np.ndarray:
    """Monotone nonuniform sampling positions in [0, F-1]."""
    if F <= 1:
        return np.zeros(T)
    speed = 1 + rng.uniform(-strength, strength, size=4)
    knots = np.interp(np.linspace(0, 3, T), np.arange(4), speed)
    cum = np.cumsum(knots)
    cum = (cum - cum[0]) / (cum[-1] - cum[0])
    return cum * (F - 1)


def augment_and_resample(c: dict, rng: np.random.Generator, acfg: dict, fcfg: dict) -> dict:
    if not acfg.get("enabled", True):
        return resample(c, fcfg["T"])
    if rng.random() < acfg["mirror_p"]:
        c = mirror(c, fcfg["pose_points"])
    c = affine(c, rng, acfg)
    c = temporal(c, rng, acfg)
    c = hand_dropout(c, rng, acfg["hand_dropout_p"])
    c = noise(c, rng, acfg["noise_std"])
    pos = warp_positions(len(c["hmask"]), fcfg["T"], rng, acfg["time_warp"])
    return resample(c, fcfg["T"], pos)


# --------------------------------------------------------------------------- synthetic "none"
def synth_none(pool: list[dict], labels: np.ndarray, rng: np.random.Generator, kind_p=None) -> dict:
    """Out-of-vocabulary movement built from real sequences.

    kinds: still hold of a random frame / splice of two different signs / rigid random trajectory.
    kind_p: optional sampling weights for the 3 kinds (default uniform).
    """
    kind = rng.integers(0, 3) if kind_p is None else int(rng.choice(3, p=np.asarray(kind_p) / np.sum(kind_p)))
    a = pool[rng.integers(len(pool))]
    F = len(a["hmask"])
    if kind == 0:  # still: one frame held with slight drift
        n = int(rng.integers(20, 60))
        f = int(rng.integers(F))
        c = _take(a, np.full(n, f))
        drift = np.cumsum(rng.normal(0, 0.004, (n, 1, 1, 3)), axis=0).astype(np.float32)
        h = c["hands"] + drift
        h[~c["hmask"]] = 0.0
        c["hands"] = h
        return c
    if kind == 1:  # splice of two different labels
        la = labels[rng.integers(len(pool))]
        for _ in range(10):
            j = rng.integers(len(pool))
            if labels[j] != la:
                break
        b = pool[j]
        ia = np.arange(0, max(F // 2, 1))
        Fb = len(b["hmask"])
        ib = np.arange(Fb // 2, Fb)
        return {k: np.concatenate([a[k][ia], b[k][ib]]) for k in a}
    # rigid random trajectory of a random handshape
    n = int(rng.integers(25, 70))
    f = int(rng.integers(F))
    c = _take(a, np.full(n, f))
    t = np.linspace(0, 1, n)[:, None]
    path = np.zeros((n, 2), np.float32)
    for _ in range(3):
        amp = rng.uniform(0.05, 0.5, 2)
        fr = rng.uniform(0.5, 2.5, 2)
        ph = rng.uniform(0, 2 * np.pi, 2)
        path += (amp * np.sin(2 * np.pi * fr * t + ph)).astype(np.float32)
    h = c["hands"].copy()
    h[..., :2] += path[:, None, None, :]
    h[~c["hmask"]] = 0.0
    c["hands"] = h
    return c
