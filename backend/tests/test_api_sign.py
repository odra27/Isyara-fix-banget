"""Route-level tests for POST /api/match/sign (ADR-037). Fake Modeling, in-memory DB."""
import json
from uuid import UUID

import psycopg
import pytest

from app.errors import ModelingUnavailable
from app.modeling.client import LibraryModelingClient
from tests.api_support import (
    INACTIVE_DEVICE,
    UNKNOWN_DEVICE,
    FakeDb,
    body,
    client_for,
)
from tests.fixtures import (
    LABEL_05_UUID,
    InMemoryPhraseLookup,
    modeling_result,
    phrase,
)
from tests.test_modeling_client import FakePredictor

URL = "/api/match/sign"


def post(result=None, payload=None, **kw):
    predictor = FakePredictor(result) if result is not None else None
    c, p, db = client_for(predictor, **kw)
    with c:
        r = c.post(URL, json=payload if payload is not None else body())
    return r, p, db


def assert_error(r, status, code):
    assert r.status_code == status, r.text
    b = r.json()
    assert b == {"error": {"code": code, "message": b["error"]["message"]}} and b["error"]["message"]


def reject(conf=0.0, reason="none_class"):
    return modeling_result(phrase_id=None, label=None, confidence=conf, action="reject", reason=reason, top_k=[])


# ---- 200 responses ---------------------------------------------------------------------------

def test_valid_request_accepted():
    r, p, db = post(modeling_result(confidence=0.9123, action="accept"))
    assert r.status_code == 200
    assert r.json() == {"phrase_id": str(LABEL_05_UUID), "phrase_text": "Lagi", "confidence": 0.9123, "action": "accepted"}
    assert db.opened == db.closed == 1  # per-request connection, closed after use


def test_valid_request_pending_confirmation_uses_db_phrase():
    # Modeling label differs from DB text: response text must come from the DB row.
    rows = [phrase(LABEL_05_UUID, "Lagi (DB)", "label_05")]
    r, _, _ = post(modeling_result(confidence=0.72, action="confirm"), db=FakeDb(phrases=InMemoryPhraseLookup(rows)))
    assert r.status_code == 200
    assert r.json() == {"phrase_id": str(LABEL_05_UUID), "phrase_text": "Lagi (DB)", "confidence": 0.72,
                        "action": "pending_confirmation"}


@pytest.mark.parametrize(("conf", "modeling_action", "expected"), [
    (0.85, "confirm", "accepted"),  # Backend decision wins over advisory action
    (0.8499, "confirm", "pending_confirmation"),
    (0.6, "confirm", "pending_confirmation"),
])
def test_boundaries(conf, modeling_action, expected):
    r, _, _ = post(modeling_result(confidence=conf, action=modeling_action))
    assert r.json()["action"] == expected and r.json()["confidence"] == conf


def test_low_confidence_escalates_with_null_phrase():
    r, _, db = post(reject(conf=0.5999, reason="far_from_centroid"))
    assert r.status_code == 200
    assert r.json() == {"phrase_id": None, "phrase_text": None, "confidence": 0.5999, "action": "escalated_to_jbi"}
    assert db.phrases.calls == []


def test_modeling_reject_escalates_without_lookup_or_topk_fallback():
    res = reject(conf=0.41)
    res["topK"] = [{"phraseId": "label_05", "label": "Lagi", "confidence": 0.41}]
    r, _, db = post(res)
    assert r.json() == {"phrase_id": None, "phrase_text": None, "confidence": 0.41, "action": "escalated_to_jbi"}
    assert db.phrases.calls == []


def test_inactive_phrase_escalates_with_null_phrase():
    rows = [phrase(LABEL_05_UUID, "Lagi", "label_05", active=False)]
    r, _, _ = post(modeling_result(confidence=0.95), db=FakeDb(phrases=InMemoryPhraseLookup(rows)))
    assert r.status_code == 200
    assert r.json()["action"] == "escalated_to_jbi" and r.json()["phrase_id"] is None and r.json()["phrase_text"] is None


def test_confirmed_never_returned():
    seen = set()
    for i in range(0, 10001, 97):
        conf = round(i / 10000, 4)
        res = modeling_result(confidence=conf, action="accept" if conf >= 0.6 else "confirm") if conf >= 0.6 else reject(conf)
        r, _, _ = post(res)
        seen.add(r.json()["action"])
    assert seen == {"accepted", "pending_confirmation", "escalated_to_jbi"}


# ---- 422 ------------------------------------------------------------------------------------

@pytest.mark.parametrize("mutate", [
    pytest.param(lambda b: b.update(device_id="not-a-uuid"), id="invalid uuid"),
    pytest.param(lambda b: b.pop("device_id"), id="missing device_id"),
    pytest.param(lambda b: b.update(duration_ms=499), id="duration 499"),
    pytest.param(lambda b: b.pop("duration_ms"), id="missing duration"),
    pytest.param(lambda b: b.update(duration_ms=1200.5), id="duration not int"),
    pytest.param(lambda b: b.update(duration_ms="1200"), id="duration string"),
    pytest.param(lambda b: b["sequence"]["frames"][1].pop("pose"), id="malformed sequence"),
    pytest.param(lambda b: b["sequence"].update(width=0), id="sequence width 0"),
    pytest.param(lambda b: b.pop("sequence"), id="missing sequence"),
])
def test_validation_errors_are_422_and_skip_db_and_modeling(mutate):
    b = body()
    mutate(b)
    r, p, db = post(payload=b)
    assert_error(r, 422, "VALIDATION_ERROR")
    assert p.payloads == [] and db.opened == 0


def test_duration_exactly_500_is_valid_and_no_upper_bound():
    for d in (500, 10_000_000):
        r, _, _ = post(payload=body(duration_ms=d))
        assert r.status_code == 200


def test_malformed_json_is_422_envelope():
    c, _, _ = client_for()
    with c:
        r = c.post(URL, content=b"{not json", headers={"content-type": "application/json"})
    assert_error(r, 422, "VALIDATION_ERROR")


def test_validation_error_does_not_leak_landmarks():
    b = body()
    b["sequence"]["frames"][2]["hands"][0]["landmarks"] = [[0.123456789, 0.987654321, 0.5]] * 20
    r, _, _ = post(payload=b)
    assert_error(r, 422, "VALIDATION_ERROR")
    assert "0.123456789" not in r.text and "0.987654321" not in r.text and "input" not in r.json()["error"]


# ---- device -----------------------------------------------------------------------------------

def test_unknown_device_404_and_modeling_not_called():
    r, p, db = post(payload=body(device_id=UNKNOWN_DEVICE))
    assert_error(r, 404, "DEVICE_NOT_FOUND")
    assert p.payloads == [] and db.closed == 1


def test_inactive_device_403_and_modeling_not_called():
    r, p, _ = post(payload=body(device_id=INACTIVE_DEVICE))
    assert_error(r, 403, "DEVICE_INACTIVE")
    assert p.payloads == []


def test_device_checked_before_frame_limit():
    r, p, _ = post(payload=body(device_id=UNKNOWN_DEVICE, n_frames=601))
    assert_error(r, 404, "DEVICE_NOT_FOUND")
    assert p.payloads == []


# ---- 413 / Modeling failures ------------------------------------------------------------------

def test_too_many_frames_413_and_modeling_not_called():
    r, p, _ = post(payload=body(n_frames=601))
    assert_error(r, 413, "PAYLOAD_TOO_LARGE")
    assert p.payloads == []


def test_exactly_max_frames_is_allowed():
    r, _, _ = post(payload=body(n_frames=600))
    assert r.status_code == 200


def test_modeling_timeout_504():
    c, _, _ = client_for(FakePredictor(modeling_result(), delay_s=1.0), timeout_s=0.05)
    with c:
        r = c.post(URL, json=body())
    assert_error(r, 504, "MODELING_TIMEOUT")


def test_modeling_unavailable_503(tmp_path):
    c, _, _ = client_for(modeling_factory=lambda: LibraryModelingClient.load(tmp_path / "missing"))
    with c:
        r = c.post(URL, json=body())
    assert_error(r, 503, "MODELING_UNAVAILABLE")


def test_modeling_unavailable_still_checks_device_first():
    def boom():
        raise ModelingUnavailable("x")

    c, _, _ = client_for(modeling_factory=boom)
    with c:
        r = c.post(URL, json=body(device_id=UNKNOWN_DEVICE))
    assert_error(r, 404, "DEVICE_NOT_FOUND")


def test_modeling_contract_violation_500_internal():
    r, _, _ = post({"phraseId": "label_05", "confidence": 0.9})
    assert_error(r, 500, "INTERNAL_ERROR")


def test_modeling_inference_exception_500_internal():
    c, _, _ = client_for(FakePredictor(exc=RuntimeError("boom")))
    with c:
        r = c.post(URL, json=body())
    assert_error(r, 500, "INTERNAL_ERROR")
    assert "boom" not in r.text


# ---- mapping / DB errors ----------------------------------------------------------------------

def test_unknown_phrase_id_500_mapping_error():
    r, _, _ = post(modeling_result(phrase_id="label_12", label="Apa", confidence=0.95))
    assert_error(r, 500, "MODEL_MAPPING_ERROR")


@pytest.mark.parametrize("recognizable", [False, None])
def test_non_recognizable_phrase_500_mapping_error(recognizable):
    rows = [phrase(LABEL_05_UUID, "Lagi", "label_05", recognizable=recognizable)]
    r, _, _ = post(modeling_result(confidence=0.95), db=FakeDb(phrases=InMemoryPhraseLookup(rows)))
    assert_error(r, 500, "MODEL_MAPPING_ERROR")


@pytest.mark.parametrize("exc", [psycopg.OperationalError("connection refused to db-host"), RuntimeError("DATABASE_URL is not set")])
def test_db_open_failure_500_internal_without_details(exc):
    r, p, _ = post(db=FakeDb(fail=exc))
    assert_error(r, 500, "INTERNAL_ERROR")
    assert "db-host" not in r.text and "DATABASE_URL" not in r.text
    assert p.payloads == []


def test_db_lookup_failure_500_internal():
    class Broken:
        async def find_by_model_phrase_id(self, _):
            raise psycopg.OperationalError("server closed the connection")

    r, _, db = post(db=FakeDb(phrases=Broken()))
    assert_error(r, 500, "INTERNAL_ERROR")
    assert db.closed == 1


def test_missing_database_url_is_500(monkeypatch):
    from app.db.session import open_postgres
    from app.main import create_app
    from fastapi.testclient import TestClient

    monkeypatch.delenv("DATABASE_URL", raising=False)
    app = create_app(modeling_factory=lambda: LibraryModelingClient(FakePredictor()), open_db=open_postgres)
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.post(URL, json=body())
    assert_error(r, 500, "INTERNAL_ERROR")


def test_no_extra_routes_exposed():
    c, _, _ = client_for()
    with c:
        assert c.get("/docs").status_code == 404
        assert c.get("/openapi.json").status_code == 404


def test_response_uuid_is_domain_id_not_model_id():
    r, _, _ = post(modeling_result(confidence=0.95))
    pid = r.json()["phrase_id"]
    assert UUID(pid) == LABEL_05_UUID and "label_" not in json.dumps(r.json())
