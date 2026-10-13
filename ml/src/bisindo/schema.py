"""Shared landmark schema (training cache + the input contract of Predictor.predict_json).

JSON form (what the frontend must send, via the backend, to the model):
    Sequence { frames: Frame[], mirrored: bool, width: int, height: int }
    Frame    { t_ms, hands: [{landmarks: [21][3], handedness: "Left"|"Right", score}], pose: [33][4] | null }

Landmarks are MediaPipe *normalized image* coordinates (x, y in [0,1], z relative).
`width`/`height` of the source image are needed to undo the aspect ratio.

Array (cache .npz) form, F = frame count:
    t_ms        [F]          float32
    hands       [F, 2, 21, 3] float32   (detector slot order, zeros if absent)
    hand_mask   [F, 2]       bool
    handedness  [F, 2]       int8      (0=Left, 1=Right, -1=absent; MediaPipe label)
    hand_score  [F, 2]       float32
    pose        [F, 33, 4]   float32   (x, y, z, visibility; zeros if absent)
    pose_mask   [F]          bool
    width, height, mirrored   scalars
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field, field_validator

N_HAND = 21
N_POSE = 33


class Hand(BaseModel):
    landmarks: list[list[float]] = Field(..., description="21 x [x, y, z]")
    handedness: Literal["Left", "Right"] = "Right"
    score: float = 1.0

    @field_validator("landmarks")
    @classmethod
    def _check(cls, v):
        if len(v) != N_HAND or any(len(p) != 3 for p in v):
            raise ValueError("hand landmarks must be 21 x 3")
        return v


class Frame(BaseModel):
    t_ms: float
    hands: list[Hand] = Field(default_factory=list, max_length=2)
    pose: list[list[float]] | None = None

    @field_validator("pose")
    @classmethod
    def _check_pose(cls, v):
        if v is not None and (len(v) != N_POSE or any(len(p) not in (3, 4) for p in v)):
            raise ValueError("pose must be 33 x [x, y, z(, visibility)]")
        return v


class Sequence(BaseModel):
    frames: list[Frame]
    mirrored: bool = False
    width: int = 1280
    height: int = 720


def empty_arrays(n: int) -> dict[str, np.ndarray]:
    return {
        "t_ms": np.zeros(n, np.float32),
        "hands": np.zeros((n, 2, N_HAND, 3), np.float32),
        "hand_mask": np.zeros((n, 2), bool),
        "handedness": np.full((n, 2), -1, np.int8),
        "hand_score": np.zeros((n, 2), np.float32),
        "pose": np.zeros((n, N_POSE, 4), np.float32),
        "pose_mask": np.zeros(n, bool),
    }


def sequence_to_arrays(seq: Sequence) -> dict[str, np.ndarray]:
    a = empty_arrays(len(seq.frames))
    for i, fr in enumerate(seq.frames):
        a["t_ms"][i] = fr.t_ms
        for j, h in enumerate(fr.hands[:2]):
            a["hands"][i, j] = np.asarray(h.landmarks, np.float32)
            a["hand_mask"][i, j] = True
            a["handedness"][i, j] = 0 if h.handedness == "Left" else 1
            a["hand_score"][i, j] = h.score
        if fr.pose is not None:
            p = np.asarray(fr.pose, np.float32)
            a["pose"][i, :, : p.shape[1]] = p
            if p.shape[1] == 3:
                a["pose"][i, :, 3] = 1.0
            a["pose_mask"][i] = True
    a["width"] = np.int32(seq.width)
    a["height"] = np.int32(seq.height)
    a["mirrored"] = np.bool_(seq.mirrored)
    return a


def arrays_to_sequence(a: dict) -> Sequence:
    frames = []
    for i in range(len(a["t_ms"])):
        hands = [
            Hand(
                landmarks=a["hands"][i, j].tolist(),
                handedness="Left" if a["handedness"][i, j] == 0 else "Right",
                score=float(a["hand_score"][i, j]),
            )
            for j in range(2)
            if a["hand_mask"][i, j]
        ]
        pose = a["pose"][i].tolist() if a["pose_mask"][i] else None
        frames.append(Frame(t_ms=float(a["t_ms"][i]), hands=hands, pose=pose))
    return Sequence(
        frames=frames, mirrored=bool(a["mirrored"]), width=int(a["width"]), height=int(a["height"])
    )


def save_npz(path: Path, a: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, **a)


def load_npz(path: Path) -> dict[str, np.ndarray]:
    with np.load(path) as z:
        return {k: z[k] for k in z.files}
