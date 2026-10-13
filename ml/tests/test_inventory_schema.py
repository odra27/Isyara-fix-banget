import numpy as np

from bisindo.inventory import parse_filename, placeholder_label_map
from bisindo.schema import Sequence, arrays_to_sequence, load_npz, save_npz, sequence_to_arrays
from helpers import make_raw


def test_parse_filename_variants():
    assert parse_filename("signer0_label0_sample1.mp4") == {"signer": 0, "label": 0, "sample": 1}
    assert parse_filename("signer2_label31_sample15.mp4") == {"signer": 2, "label": 31, "sample": 15}
    assert parse_filename("signer1_label12_sample10.mp4")["sample"] == 10
    assert parse_filename("readme.txt") is None
    assert parse_filename("signer1_label1_sample1.webm") is None


def test_placeholder_label_map():
    m = placeholder_label_map([2, 0, 1])
    assert list(m) == ["0", "1", "2"]
    assert m["2"]["phraseId"] == "label_02" and m["2"]["verified"] is False


def test_schema_roundtrip_json_npz(tmp_path):
    a = make_raw(n=10, hand_gap=(3, 5))
    seq = arrays_to_sequence(a)
    seq2 = Sequence.model_validate_json(seq.model_dump_json())
    b = sequence_to_arrays(seq2)
    save_npz(tmp_path / "x.npz", b)
    c = load_npz(tmp_path / "x.npz")
    assert np.array_equal(a["hand_mask"], c["hand_mask"])
    np.testing.assert_allclose(a["hands"], c["hands"], atol=1e-6)
    np.testing.assert_allclose(a["pose"], c["pose"], atol=1e-6)
    assert int(c["width"]) == 1280 and not bool(c["mirrored"])
    assert np.all(np.diff(c["t_ms"]) > 0)


def test_schema_rejects_bad_hand():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Sequence.model_validate({"frames": [{"t_ms": 0, "hands": [{"landmarks": [[0, 0, 0]] * 5}]}]})
