"""Route-level tests for POST /api/logs (ADR-038 §3, §4, §9, §15 OI-2). In-memory DB."""
import pytest

from tests.api_support import ACTIVE_DEVICE, INACTIVE_DEVICE, UNKNOWN_DEVICE, FakeDb, FakeLogs, client_for
from tests.fixtures import LABEL_05_UUID, LABEL_09_UUID, LABEL_10_UUID

URL = "/api/logs"
MISSING_PHRASE = "00000000-0000-0000-0000-00000000ffff"


def log_body(**over):
    b = {
        "device_id": str(ACTIVE_DEVICE),
        "direction": "sign_to_text",
        "predicted_phrase_id": str(LABEL_05_UUID),
        "confidence": 0.7234,
        "resulted_action": "confirmed",
    }
    b.update(over)
    return b


def post(payload, db=None):
    db = db or FakeDb()
    c, p, _ = client_for(db=db)
    with c:
        r = c.post(URL, json=payload)
    return r, db, p


def assert_error(r, status, code):
    assert r.status_code == status, r.text
    b = r.json()
    assert b == {"error": {"code": code, "message": b["error"]["message"]}} and b["error"]["message"]


# ---- 204 ------------------------------------------------------------------------------------

def test_confirmed_with_phrase_204_and_row_stored_as_sent():
    r, db, p = post(log_body())
    assert r.status_code == 204 and r.content == b""
    assert db.logs.rows == [{
        "device_id": ACTIVE_DEVICE, "direction": "sign_to_text", "predicted_phrase_id": LABEL_05_UUID,
        "confidence": 0.7234, "resulted_action": "confirmed",
    }]
    assert p.payloads == []  # never calls Modeling


def test_escalated_with_phrase_204():
    r, db, _ = post(log_body(resulted_action="escalated_to_jbi"))
    assert r.status_code == 204
    assert db.logs.rows[0]["resulted_action"] == "escalated_to_jbi"
    assert db.logs.rows[0]["predicted_phrase_id"] == LABEL_05_UUID


def test_escalated_with_null_phrase_and_zero_confidence_204():
    # Matches the FE header "Panggil JBI" with no result: phraseId null, confidence 0.
    r, db, _ = post(log_body(resulted_action="escalated_to_jbi", predicted_phrase_id=None, confidence=0))
    assert r.status_code == 204
    assert db.logs.rows[0]["predicted_phrase_id"] is None and db.logs.rows[0]["confidence"] == 0.0
    assert db.phrases.exists_calls == []  # no phrase lookup when null


@pytest.mark.parametrize("phrase_id", [LABEL_09_UUID, LABEL_10_UUID], ids=["inactive phrase", "non-recognizable phrase"])
def test_existing_phrase_is_enough_regardless_of_flags(phrase_id):
    r, db, _ = post(log_body(predicted_phrase_id=str(phrase_id)))
    assert r.status_code == 204
    assert db.logs.rows[0]["predicted_phrase_id"] == phrase_id


def test_client_confidence_and_action_not_reinterpreted():
    # 0.9 with confirmed would be "accepted" by thresholds; /api/logs must store it as sent.
    r, db, _ = post(log_body(confidence=0.9, resulted_action="confirmed"))
    assert r.status_code == 204
    assert (db.logs.rows[0]["confidence"], db.logs.rows[0]["resulted_action"]) == (0.9, "confirmed")


def test_four_decimal_confidence_passed_unchanged():
    r, db, _ = post(log_body(confidence=0.8499))
    assert r.status_code == 204 and db.logs.rows[0]["confidence"] == 0.8499


def test_duplicate_events_are_accepted():
    db = FakeDb()
    c, _, _ = client_for(db=db)
    with c:
        codes = [c.post(URL, json=log_body(resulted_action="escalated_to_jbi")).status_code for _ in range(3)]
    assert codes == [204, 204, 204] and len(db.logs.rows) == 3


def test_extreme_confidence_bounds_are_valid():
    for conf in (0, 1, 0.0, 1.0):
        r, _, _ = post(log_body(confidence=conf))
        assert r.status_code == 204


# ---- 422 ------------------------------------------------------------------------------------

@pytest.mark.parametrize("mutate", [
    pytest.param(lambda b: b.update(resulted_action="accepted"), id="accepted action"),
    pytest.param(lambda b: b.update(resulted_action="pending_confirmation"), id="pending action"),
    pytest.param(lambda b: b.update(resulted_action="retry"), id="unknown action"),
    pytest.param(lambda b: b.update(direction="speech_to_sign"), id="speech_to_sign"),
    pytest.param(lambda b: b.update(direction="sideways"), id="unknown direction"),
    pytest.param(lambda b: b.update(predicted_phrase_id=None), id="confirmed without phrase"),
    pytest.param(lambda b: b.pop("predicted_phrase_id"), id="missing predicted_phrase_id key"),
    pytest.param(lambda b: b.update(confidence=-0.0001), id="confidence below 0"),
    pytest.param(lambda b: b.update(confidence=1.0001), id="confidence above 1"),
    pytest.param(lambda b: b.update(confidence="0.7"), id="confidence string"),
    pytest.param(lambda b: b.update(confidence=True), id="confidence bool"),
    pytest.param(lambda b: b.pop("confidence"), id="missing confidence"),
    pytest.param(lambda b: b.update(device_id="not-a-uuid"), id="invalid device uuid"),
    pytest.param(lambda b: b.update(predicted_phrase_id="label_05"), id="model id instead of uuid"),
    pytest.param(lambda b: b.pop("resulted_action"), id="missing action"),
])
def test_invalid_requests_are_422_without_db_access(mutate):
    b = log_body()
    mutate(b)
    r, db, _ = post(b)
    assert_error(r, 422, "VALIDATION_ERROR")
    assert db.opened == 0 and db.logs.attempts == 0


def test_malformed_json_422():
    c, _, _ = client_for()
    with c:
        r = c.post(URL, content=b"{nope", headers={"content-type": "application/json"})
    assert_error(r, 422, "VALIDATION_ERROR")


# ---- device / phrase and check order ----------------------------------------------------------

def test_unknown_device_404_before_phrase_lookup():
    r, db, _ = post(log_body(device_id=str(UNKNOWN_DEVICE), predicted_phrase_id=MISSING_PHRASE))
    assert_error(r, 404, "DEVICE_NOT_FOUND")
    assert db.phrases.exists_calls == [] and db.logs.attempts == 0


def test_inactive_device_403_before_phrase_lookup():
    r, db, _ = post(log_body(device_id=str(INACTIVE_DEVICE), predicted_phrase_id=MISSING_PHRASE))
    assert_error(r, 403, "DEVICE_INACTIVE")
    assert db.phrases.exists_calls == [] and db.logs.attempts == 0


def test_unknown_phrase_404_after_device_passes():
    r, db, _ = post(log_body(predicted_phrase_id=MISSING_PHRASE))
    assert_error(r, 404, "PHRASE_NOT_FOUND")
    assert db.devices.calls == [ACTIVE_DEVICE] and len(db.phrases.exists_calls) == 1
    assert db.logs.attempts == 0


def test_insert_failure_is_500_internal_without_details():
    import psycopg

    db = FakeDb(logs=FakeLogs(fail=psycopg.OperationalError("server at db-host:5432 closed")))
    r, _, _ = post(log_body(), db=db)
    assert_error(r, 500, "INTERNAL_ERROR")
    assert "db-host" not in r.text


def test_database_open_failure_is_500():
    import psycopg

    r, _, _ = post(log_body(), db=FakeDb(fail=psycopg.OperationalError("password=secret")))
    assert_error(r, 500, "INTERNAL_ERROR")
    assert "secret" not in r.text


def test_logs_endpoint_does_not_depend_on_modeling():
    from app.errors import ModelingUnavailable

    def boom():
        raise ModelingUnavailable("x")

    c, _, db = client_for(modeling_factory=boom)
    with c:
        r = c.post(URL, json=log_body())
    assert r.status_code == 204 and len(db.logs.rows) == 1
