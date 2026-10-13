"""Robustness to continuous signing: predict dataset clips with the rise / lowering of the hands cut off.

In continuous mode a word starts and ends with the hands already in the air, unlike the WL-BISINDO clips
(hands rise from rest, sign, lower). This crops a fraction of the hand-visible frames at both ends and
reports top-1, accept rate and how often the `none` class wins.

    python scripts/eval_midair.py                          # deployed artifacts/
    python scripts/eval_midair.py --artifacts runs/x --signers 3 4 --every 2

Note: the deployed model is trained on all signers, so this is optimistic in absolute terms; use it to
compare models / crop levels, not as an accuracy claim.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR / "src"))

from bisindo.config import load_config, resolve  # noqa: E402
from bisindo.predict import Predictor  # noqa: E402
from bisindo.schema import load_npz  # noqa: E402


def crop_midair(a: dict, frac: float) -> dict:
    """Drop `frac` of the hand-visible span at each end (the rise from / return to rest)."""
    idx = np.flatnonzero(np.asarray(a["hand_mask"]).any(1))
    if frac <= 0 or len(idx) < 4:
        return a
    s, e = idx[0], idx[-1] + 1
    k = int((e - s) * frac)
    s, e = s + k, e - k
    out = {k2: (v[s:e] if isinstance(v, np.ndarray) and v.ndim and len(v) == len(a["t_ms"]) else v) for k2, v in a.items()}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts", default=str(ML_DIR / "artifacts"))
    ap.add_argument("--signers", type=int, nargs="+", default=[0, 1, 2, 3, 4])
    ap.add_argument("--every", type=int, default=4, help="use every N-th clip (speed)")
    ap.add_argument("--crops", type=float, nargs="+", default=[0.0, 0.15, 0.25, 0.35])
    args = ap.parse_args()
    cfg = load_config()
    p = Predictor(args.artifacts)
    files = [f for f in sorted((resolve(cfg, "data_dir") / "landmarks").glob("signer*_label*_sample*.npz"))
             if int(f.stem.split("_")[0][6:]) in args.signers][::args.every]
    clips = [(load_npz(f), int(f.stem.split("_")[1][5:])) for f in files]
    print(f"{len(clips)} clips, artifacts {args.artifacts}")
    print("crop  top1   accept  accept_correct  none_wins  reject")
    for c in args.crops:
        top1 = acc = acc_ok = none = rej = 0
        for a, lbl in clips:
            r = p.predict_arrays(crop_midair(a, c))
            pid = f"label_{lbl:02d}"
            t1 = r["topK"][0]["phraseId"] if r["topK"] else None
            top1 += t1 == pid
            acc += r["action"] == "accept"
            acc_ok += r["action"] == "accept" and r["phraseId"] == pid
            none += r["reason"] == "none_class"
            rej += r["action"] == "reject"
        n = len(clips)
        print(f"{c:.2f}  {top1 / n:.3f}  {acc / n:.3f}   {acc_ok / n:.3f}           {none / n:.3f}      {rej / n:.3f}")


if __name__ == "__main__":
    main()
