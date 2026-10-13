"""GET /api/health — cek cepat untuk dev/ops: model termuat? DB mana? Tanpa data sensitif, tanpa DB call."""
from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/api/health")
async def health(request: Request) -> dict:
    modeling = request.app.state.modeling
    return {
        "status": "ok",
        "modeling": "loaded" if modeling is not None else "unavailable",
        "max_frames": modeling.max_frames if modeling is not None else None,
        "database": "local-memory" if getattr(request.app.state.open_db, "store", None) is not None else "postgres",
    }
