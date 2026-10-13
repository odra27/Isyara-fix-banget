"""Task 4: feature pipeline. Pure numpy functions, shared by training and inference.

Inference path:
    raw arrays --canonicalize--> interpolate_gaps --> normalize --> trim --> resample(T) --> to_features
Training path inserts augmentation (augment.py) between trim and resample.

Hand slots after canonicalization: slot 0 = signer's RIGHT hand, slot 1 = signer's LEFT hand.
Slots are assigned from the nearest pose wrist, not from MediaPipe's handedness label
(that label depends on whether the image is mirrored).
"""
from __future__ import annotations

import numpy as np

# MediaPipe Pose indices
P_NOSE, P_LSH, P_RSH, P_LEL, P_REL, P_LWR, P_RWR = 0, 11, 12, 13, 14, 15, 16
POSE_LR_PAIRS = [(11, 12), (13, 14), (15, 16), (23, 24)]
WRIST, MIDDLE_MCP = 0, 9


# --------------------------------------------------------------------------- canonicalize
def canonicalize(a: dict, pose_points: list[int]) -> dict:
    """Aspect-correct coords, undo mirroring, assign hands to (right, left) slots.

    Returns dict(hands[F,2,21,3], hmask[F,2], pose[F,P,2], pmask[F]).
    Units: image-height units (x multiplied by width/height).
    """
    aspect = float(a["width"]) / float(a["height"]) if float(a["height"]) > 0 else 16 / 9
    hands = a["hands"].astype(np.float32).copy()
    hmask = a["hand_mask"].astype(bool).copy()
    pose = a["pose"][..., :3].astype(np.float32).copy()
    pmask = a["pose_mask"].astype(bool).copy()

    hands[..., 0] *= aspect
    hands[..., 2] *= aspect
    pose[..., 0] *= aspect

    if bool(a.get("mirrored", False)):
        hands[..., 0] = aspect - hands[..., 0]
        pose[..., 0] = aspect - pose[..., 0]
        for l, r in POSE_LR_PAIRS:
            pose[:, [l, r]] = pose[:, [r, l]]

    F = hands.shape[0]
    out_h = np.zeros_like(hands)
    out_m = np.zeros_like(hmask)
    for i in range(F):
        idx = [j for j in range(2) if hmask[i, j]]
        if not idx:
            continue
        wr = hands[i, idx, WRIST, :2]  # [n,2]
        if pmask[i]:
            targets = np.stack([pose[i, P_RWR, :2], pose[i, P_LWR, :2]])  # slot0=R, slot1=L
            d = np.linalg.norm(wr[:, None, :] - targets[None], axis=-1)  # [n,2]
            if len(idx) == 2:
                slots = [0, 1] if d[0, 0] + d[1, 1] <= d[0, 1] + d[1, 0] else [1, 0]
            else:
                slots = [int(np.argmin(d[0]))]
        else:
            # Fallback: camera faces the signer, so the signer's right hand is on image-left.
            if len(idx) == 2:
                slots = [0, 1] if wr[0, 0] <= wr[1, 0] else [1, 0]
            else:
                slots = [0]
        for j, s in zip(idx, slots):
            out_h[i, s] = hands[i, j]
            out_m[i, s] = True

    pp = pose[:, pose_points, :2]
    return {"hands": out_h, "hmask": out_m, "pose": pp, "pose_full": pose[..., :2], "pmask": pmask}


# --------------------------------------------------------------------------- gaps
def _interp_runs(values: np.ndarray, mask: np.ndarray, max_gap: int) -> tuple[np.ndarray, np.ndarray]:
    """Linearly fill interior gaps of length <= max_gap. values [F,...], mask [F]."""
    values, mask = values.copy(), mask.copy()
    F = len(mask)
    i = 0
    while i < F:
        if mask[i]:
            i += 1
            continue
        j = i
        while j < F and not mask[j]:
            j += 1
        if i > 0 and j < F and (j - i) <= max_gap:
            a, b = values[i - 1], values[j]
            for k in range(i, j):
                w = (k - i + 1) / (j - i + 1)
                values[k] = (1 - w) * a + w * b
            mask[i:j] = True
        i = j
    return values, mask


def interpolate_gaps(c: dict, max_gap: int) -> dict:
    c = dict(c)
    hands, hmask = c["hands"].copy(), c["hmask"].copy()
    for s in range(2):
        hands[:, s], hmask[:, s] = _interp_runs(hands[:, s], hmask[:, s], max_gap)
    # Pose: fill every gap (edges by nearest valid frame).
    pose, pfull, pmask = c["pose"].copy(), c["pose_full"].copy(), c["pmask"]
    if pmask.any() and not pmask.all():
        valid = np.flatnonzero(pmask)
        for arr in (pose, pfull):
            flat = arr.reshape(len(arr), -1)
            for d in range(flat.shape[1]):
                flat[:, d] = np.interp(np.arange(len(arr)), valid, flat[valid, d])
    c.update(hands=hands, hmask=hmask, pose=pose, pose_full=pfull, pmask=pmask | pmask.any())
    return c


# --------------------------------------------------------------------------- normalize
def body_frame(c: dict) -> tuple[np.ndarray, float]:
    """Sequence-level origin (shoulder center) and scale (shoulder width)."""
    pm = c["pmask"]
    if pm.any():
        pf = c["pose_full"][pm]
        center = (pf[:, P_LSH] + pf[:, P_RSH]) / 2
        width = np.linalg.norm(pf[:, P_LSH] - pf[:, P_RSH], axis=-1)
        origin = np.median(center, axis=0)
        scale = float(np.median(width))
        if scale > 1e-4:
            return origin.astype(np.float32), scale
    # Fallback: hands only.
    hm = c["hmask"]
    if hm.any():
        pts = c["hands"][hm]  # [n,21,3]
        origin = np.median(pts[:, WRIST, :2], axis=0)
        palm = np.linalg.norm(pts[:, MIDDLE_MCP] - pts[:, WRIST], axis=-1)
        return origin.astype(np.float32), float(max(np.median(palm) * 3.0, 1e-3))
    return np.zeros(2, np.float32), 1.0


def normalize(c: dict) -> dict:
    origin, scale = body_frame(c)
    c = dict(c)
    h = c["hands"].copy()
    h[..., :2] = (h[..., :2] - origin) / scale
    h[..., 2] = h[..., 2] / scale
    h[~c["hmask"]] = 0.0
    c["hands"] = h
    c["pose"] = (c["pose"] - origin) / scale
    c["pose_full"] = (c["pose_full"] - origin) / scale
    return c


# --------------------------------------------------------------------------- trim
def motion_energy(c: dict) -> np.ndarray:
    """Per-frame mean displacement of present hand points (shoulder units)."""
    h, m = c["hands"][..., :2], c["hmask"]
    F = len(m)
    e = np.zeros(F, np.float32)
    for t in range(1, F):
        both = m[t] & m[t - 1]
        if both.any():
            e[t] = float(np.linalg.norm(h[t, both] - h[t - 1, both], axis=-1).mean())
    return e


def _smooth(x: np.ndarray, w: int) -> np.ndarray:
    if w <= 1 or len(x) < w:
        return x
    return np.convolve(x, np.ones(w) / w, mode="same")


def mask_resting(c: dict, rest_y: float | None) -> dict:
    """Hide hands hanging at rest (wrist below `rest_y` shoulder-widths under the shoulder line).

    Some recordings keep resting hands in frame, others don't; masking makes them consistent.
    """
    if rest_y is None:
        return c
    c = dict(c)
    rest = c["hmask"] & (c["hands"][:, :, WRIST, 1] > rest_y)
    if rest.any():
        m = c["hmask"] & ~rest
        h = c["hands"].copy()
        h[~m] = 0.0
        c.update(hmask=m, hands=h)
    return c


def trim(c: dict, tcfg: dict) -> dict:
    """Drop leading/trailing frames without hands, then cap still runs at the ends.

    Held (static) handshapes in the middle are never removed.
    """
    if not tcfg.get("enabled", True):
        return c
    F = len(c["hmask"])
    anyh = c["hmask"].any(1)
    if not anyh.any():
        return c
    pad = tcfg["pad_frames"]
    s = max(int(np.argmax(anyh)) - pad, 0)
    e = min(F - int(np.argmax(anyh[::-1])) + pad, F)

    energy = _smooth(motion_energy(c), tcfg["smooth_window"])
    moving = energy > tcfg["motion_threshold"]
    keep_still = tcfg.get("max_still_edge_frames", 10)
    idx = np.flatnonzero(moving[s:e])
    if len(idx):
        first, last = s + idx[0], s + idx[-1]
        s = max(s, first - keep_still)
        e = min(e, last + 1 + keep_still)
    if e - s < tcfg["min_keep_frames"]:
        return c
    return slice_seq(c, s, e)


def slice_seq(c: dict, s: int, e: int) -> dict:
    out = dict(c)
    for k in ("hands", "hmask", "pose", "pose_full", "pmask"):
        out[k] = c[k][s:e]
    return out


# --------------------------------------------------------------------------- resample
def resample(c: dict, T: int, positions: np.ndarray | None = None) -> dict:
    """Resample to T frames. `positions` (len T, in [0, F-1]) allows time warping."""
    F = len(c["hmask"])
    if positions is None:
        positions = np.linspace(0, F - 1, T) if F > 1 else np.zeros(T)
    i0 = np.clip(np.floor(positions).astype(int), 0, F - 1)
    i1 = np.clip(i0 + 1, 0, F - 1)
    w = (positions - i0).astype(np.float32)
    near = np.where(w < 0.5, i0, i1)

    hm = c["hmask"]
    hands = c["hands"]
    out_m = hm[near]
    both = hm[i0] & hm[i1]
    lerp = (1 - w)[:, None, None, None] * hands[i0] + w[:, None, None, None] * hands[i1]
    out_h = np.where(both[..., None, None], lerp, hands[near])
    out_h[~out_m] = 0.0

    def lerp_arr(x):
        ww = w.reshape(-1, *([1] * (x.ndim - 1)))
        return (1 - ww) * x[i0] + ww * x[i1]

    return {
        "hands": out_h.astype(np.float32),
        "hmask": out_m,
        "pose": lerp_arr(c["pose"]).astype(np.float32),
        "pose_full": lerp_arr(c["pose_full"]).astype(np.float32),
        "pmask": c["pmask"][near],
    }


# --------------------------------------------------------------------------- features
VEL_SCALE = 10.0


def feature_dim(fcfg: dict) -> int:
    P = len(fcfg["pose_points"])
    d = 84 + 120 + 2
    if fcfg["use_pose"]:
        d += 2 * P
    if fcfg["use_velocity"]:
        d += 84 + (2 * P if fcfg["use_pose"] else 0)
    return d


def to_features(r: dict, fcfg: dict) -> np.ndarray:
    """[T, D] float32 from a resampled sequence."""
    h, m = r["hands"], r["hmask"]
    T = len(m)
    glob = h[..., :2].reshape(T, -1)  # 84
    rel = h - h[:, :, WRIST:WRIST + 1]
    palm = np.linalg.norm(h[:, :, MIDDLE_MCP] - h[:, :, WRIST], axis=-1)  # [T,2]
    palm = np.where(palm > 1e-4, palm, 1.0)
    local = rel[:, :, 1:] / palm[:, :, None, None]
    local[~m] = 0.0
    local = local.reshape(T, -1)  # 120
    parts = [glob, local, m.astype(np.float32)]
    pose = r["pose"].reshape(T, -1)
    if fcfg["use_pose"]:
        parts.append(pose)
    if fcfg["use_velocity"]:
        vg = np.zeros_like(glob)
        vg[1:] = glob[1:] - glob[:-1]
        valid = np.repeat(m[1:] & m[:-1], 42, axis=1)
        vg[1:] *= valid
        parts.append(vg * VEL_SCALE)
        if fcfg["use_pose"]:
            vp = np.zeros_like(pose)
            vp[1:] = pose[1:] - pose[:-1]
            parts.append(vp * VEL_SCALE)
    x = np.concatenate(parts, axis=1).astype(np.float32)
    return np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)


# --------------------------------------------------------------------------- convenience
def preprocess(a: dict, fcfg: dict) -> dict:
    """raw arrays -> normalized, trimmed variable-length sequence (cacheable)."""
    c = canonicalize(a, fcfg["pose_points"])
    c = interpolate_gaps(c, fcfg["max_gap_frames"])
    c = normalize(c)
    c = mask_resting(c, fcfg.get("rest_mask_y"))
    return trim(c, fcfg["trim"])


def featurize(a: dict, fcfg: dict) -> np.ndarray:
    """raw arrays -> [T, D] (inference path, no augmentation)."""
    return to_features(resample(preprocess(a, fcfg), fcfg["T"]), fcfg)
