"""Fair mid-air robustness check: LOSO fold models on their held-out signer, with the sign ends cropped.

    python scripts/eval_midair_loso.py gru_base gru_midair

Uses runs/<name>/model_signer<S>.pt (trained without signer S) on signer S's clips after
preprocessing, cropping `frac` of the sequence at each end (rise from / return to rest),
plus signer 0 (never trained in LOSO). Reports top-1 and how often `none` wins (argmax).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch
import yaml

ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR / "src"))

from bisindo.config import resolve  # noqa: E402
from bisindo.dataset import load_dataset  # noqa: E402
from bisindo.features import resample, to_features  # noqa: E402
from bisindo.train import build_model, label_targets  # noqa: E402

CROPS = [0.0, 0.15, 0.25, 0.35]


def crop(c: dict, frac: float) -> dict:
    n = len(c["hmask"])
    k = int(n * frac)
    if frac <= 0 or n - 2 * k < 8:
        return c
    return {key: (v[k:n - k] if isinstance(v, np.ndarray) and len(v) == n else v) for key, v in c.items()}


@torch.no_grad()
def evaluate(run: str) -> dict:
    rd = ML_DIR / "runs" / run
    cfg = yaml.safe_load((rd / "config.yaml").read_text())
    seqs, meta = load_dataset(cfg)
    known, y, _ = label_targets(meta.label.to_numpy(), cfg, False, [])
    K = len(known)
    fc = cfg["features"]
    res = {c: [0, 0, 0] for c in CROPS}  # correct, none, n
    for s in cfg["eval"]["loso_signers"]:
        model = build_model(cfg, K + 1)
        model.load_state_dict(torch.load(rd / f"model_signer{s}.pt", map_location="cpu"))
        model.eval()
        test = np.flatnonzero(meta.signer.to_numpy() == s)
        if s == cfg["eval"]["loso_signers"][0]:  # signer 0 once, with the first fold model
            test = np.concatenate([test, np.flatnonzero(meta.signer.to_numpy() == cfg["eval"]["extra_test_signer"])])
        for c in CROPS:
            X = np.stack([to_features(resample(crop(seqs[i], c), fc["T"]), fc) for i in test])
            pred = model(torch.from_numpy(X))[0].argmax(1).numpy()
            res[c][0] += int((pred == y[test]).sum())
            res[c][1] += int((pred == K).sum())
            res[c][2] += len(test)
    return {c: (a / n, b / n) for c, (a, b, n) in res.items()}


def main() -> None:
    runs = sys.argv[1:] or ["gru_base"]
    out = {r: evaluate(r) for r in runs}
    print("crop  " + "  ".join(f"{r:>22s}" for r in runs))
    print("      " + "  ".join(f"{'top1':>10s} {'none_wins':>11s}" for _ in runs))
    for c in CROPS:
        print(f"{c:.2f}  " + "  ".join(f"{out[r][c][0]:>10.3f} {out[r][c][1]:>11.3f}" for r in runs))


if __name__ == "__main__":
    main()
