"""POST /api/match/sign (ADR-016, ADR-037).

Order (ADR-037 + ADR-038 §5): request validation → device lookup + active check
→ frame limit → Modeling → phrase lookup / business decision → best-effort log
insert of the final inference event → response. The sequence reaches Modeling
only after the first three steps pass.

The route holds no business rules of its own: confidence decision and phrase
policy live in app.matching.sign.decide_sign_result. The request body is never
logged or stored (ADR-012).
"""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, StrictInt

from app.errors import DeviceInactive, DeviceNotFound, ModelingUnavailable, PayloadTooLarge
from app.matching.sign import decide_sign_result
from app.modeling.client import ModelingClient
from app.modeling.sequence import SignSequence

MIN_DURATION_MS = 500  # SYSTEM_DESIGN.md §4.2, ADR-037

router = APIRouter()


class MatchSignRequest(BaseModel):
    device_id: UUID
    sequence: SignSequence
    duration_ms: StrictInt = Field(ge=MIN_DURATION_MS)


class MatchSignResponse(BaseModel):
    phrase_id: UUID | None
    phrase_text: str | None
    confidence: float
    action: Literal["accepted", "pending_confirmation", "escalated_to_jbi"]


@router.post("/api/match/sign", response_model=MatchSignResponse)
async def match_sign(body: MatchSignRequest, request: Request) -> MatchSignResponse:
    state = request.app.state
    modeling: ModelingClient | None = state.modeling

    async with state.open_db() as db:
        device = await db.devices.find_by_id(body.device_id)
        if device is None:
            raise DeviceNotFound("Device not found")
        if device.active is not True:
            raise DeviceInactive("Device is not active")

        if modeling is None:
            raise ModelingUnavailable("Modeling is not available")
        n_frames = len(body.sequence.frames)
        if n_frames > modeling.max_frames:
            raise PayloadTooLarge(
                f"sequence has {n_frames} frames (max {modeling.max_frames})")

        result = await modeling.match_sign(body.sequence)
        decision = await decide_sign_result(result, db.phrases)
        phrase = decision.phrase

        # Step 6 (ADR-038 §5, §6, §15): best-effort persistence of the final inference
        # event. pending_confirmation is never stored. predicted_phrase_id mirrors the
        # response phrase_id (null for inactive/unusable phrases, OI-1). Fail-open: any
        # failure is ignored silently so the response is unchanged and no details leak.
        if decision.action in ("accepted", "escalated_to_jbi"):
            try:
                await db.logs.insert(
                    device_id=body.device_id,
                    direction="sign_to_text",
                    predicted_phrase_id=phrase.id if phrase else None,
                    confidence=decision.confidence,
                    resulted_action=decision.action,
                )
            except Exception:
                pass

    return MatchSignResponse(
        phrase_id=phrase.id if phrase else None,
        phrase_text=phrase.phrase_text if phrase else None,
        confidence=decision.confidence,
        action=decision.action,
    )
