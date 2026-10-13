"""Canonical sign `Sequence` request schema (ADR-004, AGENTS §9/§32).

Mirrors ml/src/bisindo/schema.py (Modeling artifact 20260930-0122, ADR-045; schema unchanged since 20260928-1331) and applies the
Backend's contract rules on top. Validation only: values are passed through
unchanged — no normalization, coordinate changes, interpolation or preprocessing.

Stricter than the Modeling schema where the approved contract says so:
  * every field listed in the canonical contract is a required key
    (Modeling has defaults for mirrored/width/height/handedness/score/hands/pose);
  * `hands: []` must be sent explicitly for frames without hands;
  * `pose` key is required; value is 33 x 3 or 33 x 4, or null (Modeling schema);
  * one pose frame uses a single row width (3 or 4) — Modeling stacks the rows
    into one array, so mixed widths would fail inside Modeling;
  * width/height are integers > 0;
  * t_ms is monotonic (non-decreasing).

The frame-count limit is enforced by the Modeling client against the Predictor's
configured maximum (not hardcoded here) because ADR-015 maps it to 413, not 422.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, StrictBool, StrictInt, field_validator, model_validator

N_HAND_LANDMARKS = 21
N_POSE_LANDMARKS = 33
MAX_HANDS = 2


class Hand(BaseModel):
    landmarks: list[list[float]]
    handedness: Literal["Left", "Right"]
    score: float

    @field_validator("landmarks")
    @classmethod
    def _landmarks_21x3(cls, v: list[list[float]]) -> list[list[float]]:
        if len(v) != N_HAND_LANDMARKS or any(len(p) != 3 for p in v):
            raise ValueError("hand landmarks must be 21 x 3")
        return v


class Frame(BaseModel):
    t_ms: float
    hands: list[Hand] = Field(max_length=MAX_HANDS)
    pose: list[list[float]] | None

    @field_validator("pose")
    @classmethod
    def _pose_shape(cls, v: list[list[float]] | None) -> list[list[float]] | None:
        if v is None:
            return v
        widths = {len(p) for p in v}
        if len(v) != N_POSE_LANDMARKS or len(widths) != 1 or not widths <= {3, 4}:
            raise ValueError("pose must be 33 x 3 or 33 x 4")
        return v


class SignSequence(BaseModel):
    frames: list[Frame]
    mirrored: StrictBool
    width: StrictInt = Field(gt=0)
    height: StrictInt = Field(gt=0)

    @model_validator(mode="after")
    def _t_ms_monotonic(self) -> "SignSequence":
        for prev, cur in zip(self.frames, self.frames[1:]):
            if cur.t_ms < prev.t_ms:
                raise ValueError("frame t_ms must be monotonic (non-decreasing)")
        return self
