"""Loading the preprocessed dataset + torch datasets (augmented train / fixed eval)."""
from __future__ import annotations

import hashlib
import json
import pickle

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from .augment import augment_and_resample, synth_none
from .config import resolve
from .extract import cache_path
from .features import preprocess, resample, to_features
from .schema import load_npz


def _prep_key(fcfg: dict) -> str:
    keys = {k: fcfg.get(k) for k in ("pose_points", "max_gap_frames", "trim", "rest_mask_y")}
    return hashlib.md5(json.dumps(keys, sort_keys=True).encode()).hexdigest()[:10]


MANIFESTS = ("manifest.csv", "manifest_own.csv")  # WL-BISINDO videos + own live recordings (scripts/live_demo.py --record)


def _data_key(data_dir) -> str:
    """Hash of the clip lists, so adding / removing clips invalidates the preprocessed cache."""
    h = hashlib.md5()
    for name in (*MANIFESTS, "excluded.csv"):
        p = data_dir / name
        h.update(name.encode())
        h.update(p.read_bytes() if p.exists() else b"-")
    return h.hexdigest()[:8]


def read_manifests(data_dir) -> pd.DataFrame:
    frames = [pd.read_csv(data_dir / n) for n in MANIFESTS if (data_dir / n).exists()]
    m = pd.concat(frames, ignore_index=True)
    dup = m.clip_id[m.clip_id.duplicated()]
    if len(dup):
        raise ValueError(f"duplicate clip_id across manifests: {sorted(set(dup))[:5]}")
    return m


def load_dataset(cfg: dict) -> tuple[list[dict], pd.DataFrame]:
    """Returns (normalized+trimmed sequences, meta[clip_id, signer, label, sample]).

    Reads manifest.csv + manifest_own.csv. QC-excluded clips are dropped. Result cached per
    preprocessing config and clip list.
    """
    fcfg = cfg["features"]
    data_dir = resolve(cfg, "data_dir")
    cache = data_dir / f"preprocessed_{_prep_key(fcfg)}_{_data_key(data_dir)}.pkl"
    if cache.exists():
        with open(cache, "rb") as f:
            return pickle.load(f)
    manifest = read_manifests(data_dir)
    excl_path = data_dir / "excluded.csv"
    excluded = set(pd.read_csv(excl_path).clip_id) if excl_path.exists() else set()
    seqs, rows = [], []
    for r in manifest.itertuples():
        p = cache_path(cfg, r.clip_id)
        if r.clip_id in excluded or not p.exists():
            continue
        seqs.append(preprocess(load_npz(p), fcfg))
        rows.append({"clip_id": r.clip_id, "signer": r.signer, "label": r.label, "sample": r.sample})
    meta = pd.DataFrame(rows)
    with open(cache, "wb") as f:
        pickle.dump((seqs, meta), f)
    return seqs, meta


class TrainSet(Dataset):
    """Augmented training samples; indices >= len(seqs) yield synthetic "none" (class = none_idx)."""

    def __init__(self, seqs, y, cfg, none_idx: int | None, seed: int):
        self.seqs, self.y, self.cfg = seqs, np.asarray(y), cfg
        self.none_idx = none_idx
        ratio = cfg["none_class"]["ratio"] if none_idx is not None else 0.0
        self.n_none = int(round(len(seqs) * ratio / max(1 - ratio, 1e-6)))
        self.rng = np.random.default_rng(seed)

    def __len__(self):
        return len(self.seqs) + self.n_none

    def __getitem__(self, i):
        fc, ac = self.cfg["features"], self.cfg["augment"]
        if i < len(self.seqs):
            r = augment_and_resample(self.seqs[i], self.rng, ac, fc)
            y = int(self.y[i])
        else:
            s = synth_none(self.seqs, self.y, self.rng, self.cfg["none_class"].get("kind_p"))
            r = augment_and_resample(s, self.rng, ac, fc)
            y = int(self.none_idx)
        return torch.from_numpy(to_features(r, fc)), y


def eval_features(seqs: list[dict], fcfg: dict) -> np.ndarray:
    return np.stack([to_features(resample(s, fcfg["T"]), fcfg) for s in seqs])


def make_none_eval(seqs, y, cfg, n: int, seed: int) -> np.ndarray:
    """Fixed synthetic out-of-vocabulary set built from (held-out) sequences, no augmentation."""
    rng = np.random.default_rng(seed)
    fc = cfg["features"]
    return np.stack([to_features(resample(synth_none(seqs, np.asarray(y), rng), fc["T"]), fc) for _ in range(n)])
