"""Step-6 internal logging of POST /api/match/sign (ADR-038 §5, §6, §15 OI-1, OI-3)."""
import logging

import psycopg
import pytest

from tests.api_support import INACTIVE_DEVICE, UNKNOWN_DEVICE, ACTIVE_DEVICE, FakeDb, FakeLogs, body, client_for
from tests.fixtures import LABEL_05_UUID, LABEL_09_UUID, InMemoryPhraseLookup, modeling_result, phrase
from tests.test_modeling_client import FakePredictor

URL = "/api/match/sign"


def run(result=None, *, db=None, payload=None, **kw):
    db = db or FakeDb()
    c, p, _ = client_for(FakePredictor(result) if result is not None else None, db=db, **kw)
    with c:
        r = c.post(URL, json=payload if payload is not None else body())
    return r, db


def reject(conf, reason="none_class"):
    return modeling_result(phrase_id=None, label=None, confidence=conf, action="reject", reason=reason, top_k=[])


def test_accepted_writes_one_row_with_returned_values():
    r, db = run(modeling_result(confidence=0.9123, action="accept"))
    assert r.status_code == 200
    assert db.logs.rows == [{
        "device_id": ACTIVE_DEVICE, "direction": "sign_to_text", "predicted_phrase_id": LABEL_05_UUID,
        "confidence": 0.9123, "resulted_action": "accepted",
    }]
    assert r.json()["phrase_id"] == str(db.logs.rows[0]["predicted_phrase_id"])


def test_accepted_boundary_0_85_logged_as_accepted():
    r, db = run(modeling_result(confidence=0.85, action="confirm"))
    assert r.json()["action"] == "accepted"
    assert [(x["confidence"], x["resulted_action"]) for x in db.logs.rows] == [(0.85, "accepted")]


def test_escalated_from_reject_writes_one_row_with_null_phrase():
    r, db = run(reject(0.5999, "far_from_centroid"))
    assert r.json()["action"] == "escalated_to_jbi"
    assert db.logs.rows == [{
        "device_id": ACTIVE_DEVICE, "direction": "sign_to_text", "predicted_phrase_id": None,
        "confidence": 0.5999, "resulted_action": "escalated_to_jbi",
    }]


def test_inactive_phrase_escalation_logs_null_phrase():
    # label_09 exists and is recognizable but inactive in default_lookup (OI-1).
    r, db = run(modeling_result(phrase_id="label_09", label="Saya", confidence=0.97))
    assert r.json() == {"phrase_id": None, "phrase_text": None, "confidence": 0.97, "action": "escalated_to_jbi"}
    assert len(db.logs.rows) == 1
    assert db.logs.rows[0]["predicted_phrase_id"] is None
    assert db.logs.rows[0]["predicted_phrase_id"] != LABEL_09_UUID


@pytest.mark.parametrize("conf", [0.6, 0.72, 0.8499])
def test_pending_confirmation_writes_no_row(conf):
    r, db = run(modeling_result(confidence=conf, action="confirm"))
    assert r.json()["action"] == "pending_confirmation"
    assert db.logs.attempts == 0


@pytest.mark.parametrize("case", ["422", "404", "403", "413", "504", "503", "500map", "500internal"])
def test_errors_write_no_row(case, tmp_path):
    from app.modeling.client import LibraryModelingClient

    db = FakeDb()
    kw = {}
    payload = body()
    result = modeling_result()
    if case == "422":
        payload["duration_ms"] = 10
    elif case == "404":
        payload = body(device_id=UNKNOWN_DEVICE)
    elif case == "403":
        payload = body(device_id=INACTIVE_DEVICE)
    elif case == "413":
        payload = body(n_frames=601)
    elif case == "504":
        kw = {"timeout_s": 0.05}
    elif case == "503":
        kw = {"modeling_factory": lambda: LibraryModelingClient.load(tmp_path / "missing")}
    elif case == "500map":
        result = modeling_result(phrase_id="label_12", label="Apa", confidence=0.95)
    predictor = (
        FakePredictor(result, delay_s=1.0) if case == "504"
        else FakePredictor(exc=RuntimeError("x")) if case == "500internal"
        else FakePredictor(result)
    )
    c, _, _ = client_for(predictor, db=db, **kw)
    with c:
        r = c.post(URL, json=payload)
    assert r.status_code == int(case[:3])
    assert db.logs.attempts == 0


@pytest.mark.parametrize("exc", [
    psycopg.OperationalError("connection to db-host:5432 failed password=secret"),
    RuntimeError("unexpected secret"),
])
def test_log_insert_failure_is_fail_open(exc, caplog):
    db = FakeDb(logs=FakeLogs(fail=exc))
    marker = 0.123456789
    payload = body()
    payload["sequence"]["frames"][1]["hands"][0]["landmarks"][0][0] = marker
    with caplog.at_level(logging.DEBUG):
        r, _ = run(modeling_result(confidence=0.9123), db=db, payload=payload)
    assert r.status_code == 200
    assert r.json() == {"phrase_id": str(LABEL_05_UUID), "phrase_text": "Lagi", "confidence": 0.9123, "action": "accepted"}
    assert db.logs.attempts == 1 and db.logs.rows == []  # one attempt, no retry
    assert "secret" not in r.text and "db-host" not in r.text
    assert str(marker) not in caplog.text and "secret" not in caplog.text
    assert db.opened == db.closed == 1


def test_log_insert_failure_on_escalation_is_fail_open():
    db = FakeDb(logs=FakeLogs(fail=psycopg.OperationalError("boom")))
    r, _ = run(reject(0.2), db=db)
    assert r.status_code == 200 and r.json()["action"] == "escalated_to_jbi"


def test_each_request_is_a_new_event():
    db = FakeDb()
    c, _, _ = client_for(FakePredictor(reject(0.1)), db=db)
    with c:
        for _ in range(2):
            c.post(URL, json=body())
    assert len(db.logs.rows) == 2


def test_active_recognizable_phrase_row_uses_db_uuid_not_model_id():
    rows = [phrase(LABEL_05_UUID, "Lagi", "label_05")]
    r, db = run(modeling_result(confidence=0.95), db=FakeDb(phrases=InMemoryPhraseLookup(rows)))
    assert db.logs.rows[0]["predicted_phrase_id"] == LABEL_05_UUID
