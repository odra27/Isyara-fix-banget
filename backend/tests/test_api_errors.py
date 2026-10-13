import asyncio
import json

import pytest
from pydantic import ValidationError

from app.api.errors import from_backend_error, from_unexpected_error, from_validation_error
from app.errors import (
    ModelingInternalError,
    ModelingTimeout,
    ModelingUnavailable,
    ModelMappingError,
    PayloadTooLarge,
)
from app.matching.sign import decide_sign_result
from app.modeling.client import LibraryModelingClient
from app.modeling.contract import ModelingSignResult
from app.modeling.sequence import SignSequence
from tests.fixtures import deep, default_lookup, modeling_result, sequence_payload
from tests.test_modeling_client import FakePredictor


def _assert_envelope(body, code):
    assert body == {"error": {"code": code, "message": body["error"]["message"]}}
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


def test_validation_error_is_422_envelope_without_input_values():
    p = deep(sequence_payload())
    p["frames"][1]["hands"][0]["landmarks"] = [[123.456789, 0.1, 0.2]] * 20  # wrong shape + sentinel
    p["width"] = 0
    with pytest.raises(ValidationError) as exc:
        SignSequence.model_validate(p)
    status, body = from_validation_error(exc.value)
    assert status == 422
    _assert_envelope(body, "VALIDATION_ERROR")
    text = json.dumps(body)
    assert "123.456789" not in text
    assert "frames.1.hands.0.landmarks" in text and "width" in text


def test_too_many_frames_is_413_payload_too_large():
    client = LibraryModelingClient(FakePredictor(max_frames=5))
    try:
        with pytest.raises(PayloadTooLarge) as exc:
            asyncio.run(client.match_sign(SignSequence.model_validate(sequence_payload(6))))
    finally:
        client.close()
    status, body = from_backend_error(exc.value)
    assert status == 413
    _assert_envelope(body, "PAYLOAD_TOO_LARGE")


@pytest.mark.parametrize(
    ("exc", "status", "code"),
    [
        (ModelingTimeout("t"), 504, "MODELING_TIMEOUT"),
        (ModelingUnavailable("u"), 503, "MODELING_UNAVAILABLE"),
        (ModelMappingError("m"), 500, "MODEL_MAPPING_ERROR"),
        (ModelingInternalError("i"), 500, "INTERNAL_ERROR"),
    ],
)
def test_backend_error_status_and_code(exc, status, code):
    s, body = from_backend_error(exc)
    assert s == status
    _assert_envelope(body, code)


def test_mapping_error_from_decision_maps_to_500():
    r = ModelingSignResult.model_validate(modeling_result(phrase_id="label_99", confidence=0.95))
    with pytest.raises(ModelMappingError) as exc:
        asyncio.run(decide_sign_result(r, default_lookup()))
    assert from_backend_error(exc.value)[0] == 500


def test_contract_violation_maps_to_500_internal_error():
    client = LibraryModelingClient(FakePredictor(result={"phraseId": "label_05"}))
    try:
        with pytest.raises(ModelingInternalError) as exc:
            asyncio.run(client.match_sign(SignSequence.model_validate(sequence_payload())))
    finally:
        client.close()
    status, body = from_backend_error(exc.value)
    assert status == 500
    _assert_envelope(body, "INTERNAL_ERROR")


def test_unexpected_error_hides_details():
    status, body = from_unexpected_error(RuntimeError("password=secret"))
    assert status == 500
    _assert_envelope(body, "INTERNAL_ERROR")
    assert "secret" not in json.dumps(body)
