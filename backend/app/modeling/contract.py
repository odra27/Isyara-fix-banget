"""Modeling sign-response contract (ADR-005, AGENTS §10).

Matches `Predictor.predict_json` in ml/src/bisindo/predict.py (artifact 20260930-0122, ADR-045). Its optional `audio` field is dropped (ADR-045 §4).

* `phraseId` is the only identity; `label` is informational.
* `confidence` is 0–1, already rounded to 4 decimals by Modeling (ADR-007).
* `action` is advisory — the Backend decision lives in app.matching.decision.
* `reason` is free-form metadata; any string is accepted (no fixed enum).
* `topK` is optional metadata (max 3) and never used for decisions.
* Extra keys (Modeling's `debug`, incl. raw_confidence) are dropped: the Backend must
  not use raw/internal confidence (ADR-007).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ModelingAction = Literal["accept", "confirm", "reject"]


class TopKItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    phraseId: str
    label: str
    confidence: float = Field(ge=0.0, le=1.0, allow_inf_nan=False)


class ModelingSignResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    phraseId: str | None
    label: str | None
    confidence: float = Field(ge=0.0, le=1.0, allow_inf_nan=False)
    action: ModelingAction
    reason: str | None = None
    topK: list[TopKItem] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def _prediction_iff_not_reject(self) -> "ModelingSignResult":
        # Modeling contract: phraseId/label are null exactly when action == "reject".
        if (self.action == "reject") != (self.phraseId is None):
            raise ValueError("phraseId must be null if and only if action is 'reject'")
        return self
