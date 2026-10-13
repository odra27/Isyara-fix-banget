"""Backend confidence decision (ADR-006, ADR-007, AGENTS §12/§13).

Thresholds are fixed constants, not runtime configuration (AGENTS §12).
Decisions use the confidence exactly as returned by Modeling (4 decimals).
`confirmed` is never an inference outcome: it only exists after explicit user
confirmation (ADR-027) and is not produced here.
"""
from __future__ import annotations

import math
from typing import Literal

ACCEPT_THRESHOLD = 0.85
CONFIRM_THRESHOLD = 0.60

SignDecisionAction = Literal["accepted", "pending_confirmation", "escalated_to_jbi"]


def decide_action(confidence: float) -> SignDecisionAction:
    if (
        isinstance(confidence, bool)
        or not isinstance(confidence, (int, float))
        or not math.isfinite(confidence)
        or not 0.0 <= confidence <= 1.0
    ):
        raise ValueError("confidence must be a finite number in [0, 1]")
    if confidence >= ACCEPT_THRESHOLD:
        return "accepted"
    if confidence >= CONFIRM_THRESHOLD:
        return "pending_confirmation"
    return "escalated_to_jbi"
