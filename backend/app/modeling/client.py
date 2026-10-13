"""Modeling client (ADR-013): the only place that knows how Modeling is called.

Integration mode: Python library (`bisindo.predict.Predictor`). Selected because the
Modeling package imports, loads the adopted artifact (20260930-0122, ADR-045) and runs inference in a
CPython 3.12 environment with the exact ml/requirements.txt pins, and ml/ ships no
HTTP service. The `ModelingClient` protocol keeps the logical contract identical if
a process/service implementation is added later.

Lifecycle: one Predictor per client, loaded once and reused (AGENTS §29).
Timeout: 3 s per call (ADR-014). Calls run on a single dedicated worker thread so
the event loop never blocks and the Predictor is never used concurrently; a call
that times out keeps running in that thread (Python threads cannot be killed), and
later calls queue behind it within their own 3 s budget.

Privacy: the payload is only passed in memory. Nothing is logged, and inference
exceptions are not chained so patient landmarks cannot leak through tracebacks.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Protocol

from pydantic import ValidationError

from app.errors import ModelingInternalError, ModelingTimeout, ModelingUnavailable, PayloadTooLarge
from app.modeling.contract import ModelingSignResult
from app.modeling.sequence import SignSequence

MODELING_TIMEOUT_S = 3.0  # ADR-014


class ModelingClient(Protocol):
    @property
    def max_frames(self) -> int: ...

    async def match_sign(self, sequence: SignSequence) -> ModelingSignResult: ...


class _Predictor(Protocol):
    max_frames: int

    def predict_json(self, payload: dict[str, Any]) -> dict[str, Any]: ...


class LibraryModelingClient:
    def __init__(self, predictor: _Predictor, *, timeout_s: float = MODELING_TIMEOUT_S) -> None:
        self._predictor = predictor
        self._timeout_s = timeout_s
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="modeling")

    @classmethod
    def load(
        cls, artifacts_dir: str | Path | None = None, *, timeout_s: float = MODELING_TIMEOUT_S
    ) -> "LibraryModelingClient":
        """Load the Predictor once. Any failure means Modeling is unavailable."""
        try:
            from bisindo.predict import Predictor

            predictor = Predictor(artifacts_dir) if artifacts_dir is not None else Predictor()
        except Exception as exc:
            raise ModelingUnavailable(
                f"Modeling predictor could not be loaded ({type(exc).__name__})"
            ) from None
        return cls(predictor, timeout_s=timeout_s)

    @property
    def max_frames(self) -> int:
        return int(self._predictor.max_frames)

    async def match_sign(self, sequence: SignSequence) -> ModelingSignResult:
        n_frames = len(sequence.frames)
        if n_frames > self.max_frames:
            raise PayloadTooLarge(f"sequence has {n_frames} frames (max {self.max_frames})")

        payload = sequence.model_dump(mode="python")
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(self._executor, self._predictor.predict_json, payload)
        try:
            raw = await asyncio.wait_for(future, timeout=self._timeout_s)
        except TimeoutError:
            raise ModelingTimeout(f"Modeling did not respond within {self._timeout_s:g} s") from None
        except Exception as exc:
            raise ModelingInternalError(
                f"Modeling failed during inference ({type(exc).__name__})"
            ) from None

        try:
            return ModelingSignResult.model_validate(raw)
        except ValidationError as exc:
            # Response holds labels/confidences only — safe to chain for diagnosis.
            raise ModelingInternalError("Modeling response violated the contract") from exc

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)
