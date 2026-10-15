"""GET /api/phrases (SYSTEM_DESIGN.md §4.2, AGENTS §23). Public, read-only, no auth.

Returns only phrases with active = true, exposing exactly the PRD fields:
id (phrases.id UUID), phrase_text, category. No model_phrase_id, flags,
language_variant or reference data. sign_recognizable is not a filter (ADR-009).
Database failures fall through to the existing 500 INTERNAL_ERROR envelope.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class PhraseItem(BaseModel):
    id: UUID
    phrase_text: str
    category: str


@router.get("/api/phrases", response_model=list[PhraseItem])
async def list_phrases(request: Request) -> list[PhraseItem]:
    async with request.app.state.open_db() as db:
        rows = await db.phrases.list_active()
    return [PhraseItem(id=r.id, phrase_text=r.phrase_text, category=r.category) for r in rows]
