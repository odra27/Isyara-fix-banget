"""Integration against the real Modeling library + artifact.

Skipped unless `bisindo` (ml/) is installed in the environment.
"""
import asyncio

import pytest

pytest.importorskip("bisindo.predict")

from app.matching.sign import decide_sign_result  # noqa: E402
from app.modeling.client import LibraryModelingClient  # noqa: E402
from app.modeling.sequence import SignSequence  # noqa: E402
from tests.fixtures import default_lookup, sequence_payload  # noqa: E402


@pytest.fixture(scope="module")
def client():
    c = LibraryModelingClient.load()
    yield c
    c.close()


def _match(client, n):
    seq = SignSequence.model_validate(sequence_payload(n))
    return asyncio.run(client.match_sign(seq))


def test_artifact_version_and_limit(client):
    assert client._predictor.version == "20261006-1528"  # ADR-049 (43 labels)
    assert client.max_frames == 600


def test_real_predictor_returns_contract_result(client):
    r = _match(client, 40)
    assert r.action in {"accept", "confirm", "reject"}
    assert 0.0 <= r.confidence <= 1.0
    assert round(r.confidence, 4) == r.confidence


def test_real_too_short_is_reject_and_escalates(client):
    r = _match(client, 3)
    assert r.action == "reject" and r.phraseId is None and r.reason == "too_short"
    d = asyncio.run(decide_sign_result(r, default_lookup()))
    assert d.action == "escalated_to_jbi" and d.phrase is None


def test_route_with_real_predictor_escalates_too_short():
    from fastapi.testclient import TestClient

    from app.main import create_app
    from tests.api_support import FakeDb, body

    app = create_app(open_db=FakeDb().open)  # default factory: real LibraryModelingClient.load()
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.post("/api/match/sign", json=body(n_frames=3))
    assert r.status_code == 200
    assert r.json() == {"phrase_id": None, "phrase_text": None, "confidence": 0.0, "action": "escalated_to_jbi"}
