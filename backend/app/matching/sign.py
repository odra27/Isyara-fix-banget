"""Sign result → Backend decision + domain phrase (ADR-008, ADR-016, AGENTS §14/§15/§35).

Rules:
* Modeling `reject` (valid inference, no prediction) → escalated_to_jbi, no phrase,
  no phrase lookup. topK is never used to fabricate a phrase.
* Otherwise the Backend decision is taken from the returned confidence and wins
  over Modeling's advisory `action` (e.g. confirm at 0.8500 → accepted, ADR-007).
  A confidence below 0.60 escalates without a lookup.
* Lookup is ONLY via phrases.model_phrase_id (approved Phase 3 policy):
    not found                         → MODEL_MAPPING_ERROR
    sign_recognizable is not true     → MODEL_MAPPING_ERROR
    recognizable but active is not true → escalated_to_jbi, phrase=None
    recognizable and active           → confidence decision
  NULL flags are treated as "not true" (fail-safe). No substitute phrase, ever.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from app.errors import ModelMappingError
from app.matching.decision import SignDecisionAction, decide_action
from app.modeling.contract import ModelingAction, ModelingSignResult


@dataclass(frozen=True)
class PhraseRecord:
    id: UUID
    model_phrase_id: str | None
    phrase_text: str
    active: bool | None
    sign_recognizable: bool | None


class PhraseLookup(Protocol):
    async def find_by_model_phrase_id(self, model_phrase_id: str) -> PhraseRecord | None:
        """Return the phrase whose phrases.model_phrase_id equals the argument, or None."""
        ...


@dataclass(frozen=True)
class SignMatchDecision:
    action: SignDecisionAction
    confidence: float
    phrase: PhraseRecord | None
    model_phrase_id: str | None
    modeling_action: ModelingAction  # advisory, kept for observability only
    reason: str | None  # metadata only


def _escalate(result: ModelingSignResult) -> SignMatchDecision:
    return SignMatchDecision(
        action="escalated_to_jbi",
        confidence=result.confidence,
        phrase=None,
        model_phrase_id=None,
        modeling_action=result.action,
        reason=result.reason,
    )


async def decide_sign_result(result: ModelingSignResult, lookup: PhraseLookup) -> SignMatchDecision:
    if result.action == "reject":
        return _escalate(result)

    action = decide_action(result.confidence)
    if action == "escalated_to_jbi":
        return _escalate(result)

    assert result.phraseId is not None  # guaranteed by ModelingSignResult for non-reject
    phrase = await lookup.find_by_model_phrase_id(result.phraseId)
    if phrase is None:
        raise ModelMappingError(f"Modeling phraseId {result.phraseId!r} has no matching phrase")
    if phrase.sign_recognizable is not True:
        raise ModelMappingError(f"Modeling phraseId {result.phraseId!r} maps to a non-recognizable phrase")
    if phrase.active is not True:
        return _escalate(result)

    return SignMatchDecision(
        action=action,
        confidence=result.confidence,
        phrase=phrase,
        model_phrase_id=result.phraseId,
        modeling_action=result.action,
        reason=result.reason,
    )
