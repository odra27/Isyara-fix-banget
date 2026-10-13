"""Synthetic test fixtures. No real patient data."""
from __future__ import annotations

import copy
from typing import Any
from uuid import UUID, uuid4

from app.matching.sign import PhraseRecord


def hand(handedness: str = "Right") -> dict[str, Any]:
    return {
        "landmarks": [[0.4 + i * 0.001, 0.5, -0.01] for i in range(21)],
        "handedness": handedness,
        "score": 0.97,
    }


def pose(width: int = 4) -> list[list[float]]:
    return [[0.5, 0.5, 0.0, 1.0][:width] for _ in range(33)]


def sequence_payload(n_frames: int = 12) -> dict[str, Any]:
    frames = []
    for i in range(n_frames):
        hands = [] if i == 0 else [hand("Right"), hand("Left")] if i % 2 else [hand("Right")]
        frames.append({"t_ms": i * 33.3, "hands": hands, "pose": pose(4 if i % 3 else 3)})
    frames[-1]["pose"] = None
    return {"frames": frames, "mirrored": False, "width": 960, "height": 540}


def modeling_result(
    *,
    phrase_id: str | None = "label_05",
    label: str | None = "Lagi",
    confidence: float = 0.999,
    action: str = "accept",
    reason: str | None = None,
    top_k: list[dict[str, Any]] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    r = {
        "phraseId": phrase_id,
        "label": label,
        "confidence": confidence,
        "action": action,
        "reason": reason,
        "topK": top_k
        if top_k is not None
        else [{"phraseId": "label_05", "label": "Lagi", "confidence": confidence}],
    }
    if extra:
        r.update(extra)
    return r


class InMemoryPhraseLookup:
    """Test double for the phrases table: resolves by model_phrase_id only."""

    def __init__(self, rows: list[PhraseRecord]) -> None:
        self._by_model_id = {r.model_phrase_id: r for r in rows if r.model_phrase_id is not None}
        self._ids = {r.id for r in rows}
        self.calls: list[str] = []
        self.exists_calls: list[UUID] = []

    async def find_by_model_phrase_id(self, model_phrase_id: str) -> PhraseRecord | None:
        self.calls.append(model_phrase_id)
        return self._by_model_id.get(model_phrase_id)

    async def exists_by_id(self, phrase_id: UUID) -> bool:
        self.exists_calls.append(phrase_id)
        return phrase_id in self._ids


LABEL_05_UUID = UUID("00000000-0000-0000-0000-00000000f005")
LABEL_06_UUID = UUID("00000000-0000-0000-0000-00000000f006")
LABEL_09_UUID = UUID("00000000-0000-0000-0000-00000000f009")
LABEL_10_UUID = UUID("00000000-0000-0000-0000-00000000f010")


def phrase(uid: UUID, text: str, model_id: str | None, *, active=True, recognizable=True) -> PhraseRecord:
    return PhraseRecord(
        id=uid, model_phrase_id=model_id, phrase_text=text, active=active, sign_recognizable=recognizable
    )


def default_lookup() -> InMemoryPhraseLookup:
    return InMemoryPhraseLookup(
        [
            phrase(LABEL_05_UUID, "Lagi", "label_05"),
            phrase(LABEL_06_UUID, "Maaf", "label_06"),
            phrase(LABEL_09_UUID, "Saya", "label_09", active=False),  # recognizable, inactive
            phrase(LABEL_10_UUID, "Terima kasih", "label_10", recognizable=False),  # DB/artifact mismatch
            phrase(uuid4(), "Saya ingin berobat", None, recognizable=False),  # domain phrase, no Modeling class
        ]
    )


def deep(d: dict[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(d)
