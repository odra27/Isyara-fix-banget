"""Own live recordings: Recorder (scripts/live_demo.py) + dataset manifests / cache key."""
from __future__ import annotations

import importlib.util

import numpy as np
import pandas as pd
import pytest

from bisindo import dataset
from bisindo.config import ML_ROOT
from helpers import make_raw


@pytest.fixture(scope="module")
def live():
    spec = importlib.util.spec_from_file_location("live_demo", ML_ROOT / "scripts" / "live_demo.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _base_manifest(d):
    pd.DataFrame([{"clip_id": "signer1_label0_sample1", "path": "x.mp4", "signer": 1, "label": 0, "sample": 1,
                   "fps": 30, "frames": 40, "width": 1280, "height": 720, "duration_s": 1.3, "readable": True}]
                 ).to_csv(d / "manifest.csv", index=False)


def test_recorder_saves_numbers_and_deletes(tmp_path, live):
    r = live.Recorder(tmp_path, 5)
    a = make_raw()
    c1, c2 = r.save(a, 10), r.save(a, 10)
    assert (c1, c2) == ("signer5_label10_sample1", "signer5_label10_sample2")
    assert (tmp_path / "landmarks" / f"{c2}.npz").exists()
    assert r.count(10) == 2
    assert r.delete_last() == c2
    assert not (tmp_path / "landmarks" / f"{c2}.npz").exists() and r.count(10) == 1
    # numbering continues after a restart, without reusing a sample number
    assert live.Recorder(tmp_path, 5).save(a, 10) == "signer5_label10_sample2"
    m = pd.read_csv(tmp_path / "manifest_own.csv")
    assert list(m.columns) == live.MANIFEST_COLS and set(m.signer) == {5}


def test_recorder_rejects_dataset_signer_ids(tmp_path, live):
    with pytest.raises(SystemExit):
        live.Recorder(tmp_path, 3)


def test_manifests_are_merged_and_key_changes(tmp_path, live):
    _base_manifest(tmp_path)
    k0 = dataset._data_key(tmp_path)
    assert len(dataset.read_manifests(tmp_path)) == 1
    live.Recorder(tmp_path, 6).save(make_raw(), 3)
    m = dataset.read_manifests(tmp_path)
    assert len(m) == 2 and set(m.signer) == {1, 6}
    assert dataset._data_key(tmp_path) != k0


def test_duplicate_clip_ids_rejected(tmp_path):
    _base_manifest(tmp_path)
    (tmp_path / "manifest_own.csv").write_bytes((tmp_path / "manifest.csv").read_bytes())
    with pytest.raises(ValueError):
        dataset.read_manifests(tmp_path)


def test_saved_clip_loads_like_dataset_clip(tmp_path, live, cfg):
    from bisindo.features import preprocess
    from bisindo.schema import load_npz

    clip = live.Recorder(tmp_path, 5).save(make_raw(), 1)
    s = preprocess(load_npz(tmp_path / "landmarks" / f"{clip}.npz"), cfg["features"])
    assert len(s["hmask"]) >= 8 and np.isfinite(s["hands"]).all()


def test_framing_status(live):
    a = make_raw(n=1)  # shoulders 0.42..0.58 of width at 16:9 -> 0.28 height units, y 0.45
    ok, _ = live.framing_status(a, 1280 / 720)
    assert ok
    a["pose_mask"][0] = False
    assert not live.framing_status(a, 1280 / 720)[0]
