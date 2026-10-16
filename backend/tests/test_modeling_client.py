import asyncio
import threading

import pytest

from app.errors import ModelingInternalError, ModelingTimeout, ModelingUnavailable, PayloadTooLarge
from app.modeling.client import LibraryModelingClient
from app.modeling.sequence import SignSequence
from tests.fixtures import modeling_result, sequence_payload


class FakePredictor:
    def __init__(self, result=None, *, max_frames=600, delay_s=0.0, exc=None):
        self.max_frames = max_frames
        self._result = result if result is not None else modeling_result()
        self._delay = threading.Event() if delay_s else None
        self._delay_s = delay_s
        self._exc = exc
        self.payloads = []

    def predict_json(self, payload):
        self.payloads.append(payload)
        if self._delay:
            self._delay.wait(self._delay_s)
        if self._exc:
            raise self._exc
        return self._result


def _run(client, seq):
    async def go():
        try:
            return await client.match_sign(seq)
        finally:
            client.close()

    return asyncio.run(go())


def _seq(n=12):
    return SignSequence.model_validate(sequence_payload(n))


def test_forwards_sequence_unchanged_and_parses_result():
    p = FakePredictor()
    r = _run(LibraryModelingClient(p), _seq())
    assert r.phraseId == "label_05" and r.action == "accept"
    assert p.payloads == [sequence_payload(12)]


def test_timeout_raises_structured_error_not_prediction():
    p = FakePredictor(delay_s=1.0)
    with pytest.raises(ModelingTimeout) as exc:
        _run(LibraryModelingClient(p, timeout_s=0.05), _seq())
    assert exc.value.code == "MODELING_TIMEOUT"


def test_default_timeout_is_3_seconds():
    from app.modeling.client import MODELING_TIMEOUT_S

    assert MODELING_TIMEOUT_S == 3.0


def test_unavailable_when_predictor_cannot_load(tmp_path):
    with pytest.raises(ModelingUnavailable) as exc:
        LibraryModelingClient.load(tmp_path / "no-artifacts")
    assert exc.value.code == "MODELING_UNAVAILABLE"


def test_inference_exception_is_structured_and_not_chained():
    p = FakePredictor(exc=RuntimeError("boom with secret payload"))
    with pytest.raises(ModelingInternalError) as exc:
        _run(LibraryModelingClient(p), _seq())
    assert exc.value.__cause__ is None
    assert "secret" not in str(exc.value)


def test_contract_violating_response_is_internal_error():
    p = FakePredictor(result=modeling_result(action="accept", phrase_id=None, label=None))
    with pytest.raises(ModelingInternalError):
        _run(LibraryModelingClient(p), _seq())


def test_too_many_frames_is_413_and_modeling_not_called():
    p = FakePredictor(max_frames=5)
    with pytest.raises(PayloadTooLarge) as exc:
        _run(LibraryModelingClient(p), _seq(6))
    assert exc.value.http_status == 413
    assert p.payloads == []


def test_frame_limit_comes_from_predictor():
    assert LibraryModelingClient(FakePredictor(max_frames=123)).max_frames == 123


def test_http_modeling_client_success():
    import httpx
    from app.modeling.client import HttpModelingClient

    res_body = modeling_result(phrase_id="label_10", label="Terima kasih", confidence=0.95, action="accept")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/predict"
        return httpx.Response(200, json=res_body)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://test-model")
    http_client = HttpModelingClient("http://test-model", client=client)
    res = _run(http_client, _seq())
    assert res.phraseId == "label_10"
    assert res.confidence == 0.95
    assert res.action == "accept"


def test_http_modeling_client_unavailable_on_503():
    import httpx
    from app.modeling.client import HttpModelingClient

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="Service Unavailable")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://test-model")
    http_client = HttpModelingClient("http://test-model", client=client)
    with pytest.raises(ModelingUnavailable):
        _run(http_client, _seq())


def test_http_modeling_client_timeout():
    import httpx
    from app.modeling.client import HttpModelingClient

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://test-model")
    http_client = HttpModelingClient("http://test-model", client=client)
    with pytest.raises(ModelingTimeout):
        _run(http_client, _seq())


def test_load_modeling_client_uses_service_url(monkeypatch):
    from app.modeling.client import HttpModelingClient, LibraryModelingClient, load_modeling_client

    monkeypatch.setenv("MODELING_SERVICE_URL", "https://isyara-model.example.com")
    c = load_modeling_client()
    assert isinstance(c, HttpModelingClient)
    assert c._base_url == "https://isyara-model.example.com"

    monkeypatch.delenv("MODELING_SERVICE_URL")
    c_lib = load_modeling_client()
    assert isinstance(c_lib, LibraryModelingClient)

