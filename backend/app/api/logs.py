"""POST /api/logs (ADR-038 §3, §4, §15 OI-2).

Records a client-reported final user action. Structural validation only: no
threshold decision, no inference, no action conversion, no deduplication.

Order (OI-2): request validation → device lookup → device active check →
phrase lookup → insert. Success: 204 No Content.
"""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field, StrictFloat, field_validator, model_validator

from app.errors import DeviceInactive, DeviceNotFound, PhraseNotFound

router = APIRouter()


class LogRequest(BaseModel):
    device_id: UUID
    direction: Literal["sign_to_text", "speech_to_sign"]
    predicted_phrase_id: UUID | None
    confidence: StrictFloat = Field(ge=0.0, le=1.0, allow_inf_nan=False)
    resulted_action: Literal["confirmed", "escalated_to_jbi"]

    @field_validator("direction")
    @classmethod
    def _sign_to_text_only(cls, v: str) -> str:
        if v == "speech_to_sign":
            raise ValueError("speech_to_sign is not supported yet")
        return v

    @model_validator(mode="after")
    def _confirmed_needs_phrase(self) -> "LogRequest":
        if self.resulted_action == "confirmed" and self.predicted_phrase_id is None:
            raise ValueError("predicted_phrase_id is required for confirmed")
        return self


@router.post("/api/logs", status_code=204, response_class=Response)
async def create_log(body: LogRequest, request: Request) -> Response:
    async with request.app.state.open_db() as db:
        device = await db.devices.find_by_id(body.device_id)
        if device is None:
            raise DeviceNotFound("Device not found")
        if device.active is not True:
            raise DeviceInactive("Device is not active")

        if body.predicted_phrase_id is not None and not await db.phrases.exists_by_id(body.predicted_phrase_id):
            raise PhraseNotFound("Phrase not found")

        await db.logs.insert(
            device_id=body.device_id,
            direction="sign_to_text",
            predicted_phrase_id=body.predicted_phrase_id,
            confidence=body.confidence,
            resulted_action=body.resulted_action,
        )
    return Response(status_code=204)
