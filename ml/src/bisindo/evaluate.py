"""Task 5: metrics and reports.

Label conventions in prediction files:
    y >= 0  known class index
    y == -1 unknown word (never seen in training: hidden label / demo-mode unknown_holdout)
    y == -2 synthetic "none" movement
    y == -3 out-of-vocabulary word of a type used as `none` training data (demo mode), unseen signer

Usage: python -m bisindo.evaluate runs/<run_name>
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.metrics import confusion_matrix, f1_score, roc_auc_score


def GROUPS_NEG(y: np.ndarray):  # noqa: N802 - constant-like helper
    return [(n, m) for n, m in [("unknown_word", y == -1), ("none", y == -2), ("negative_word", y == -3)] if m.any()]


def softmax(z: np.ndarray, T: float = 1.0) -> np.ndarray:
    z = z / T
    z = z - z.max(-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(-1, keepdims=True)


def known_confidence(probs: np.ndarray, n_known: int) -> tuple[np.ndarray, np.ndarray]:
    """(predicted known class, confidence). If the 'none' class wins, confidence is its complement-capped."""
    pk = probs[:, :n_known]
    pred = pk.argmax(1)
    conf = pk.max(1)
    if probs.shape[1] > n_known:  # none class present
        none_wins = probs[:, n_known] >= conf
        conf = np.where(none_wins, np.minimum(conf, 1 - probs[:, n_known]), conf)
        pred = np.where(none_wins, -2, pred)
    return pred, conf


def closed_set_metrics(logits: np.ndarray, y: np.ndarray, n_known: int) -> dict:
    """Known samples only. 'none' predictions count as errors."""
    m = y >= 0
    if not m.any():
        return {}
    lg, yy = logits[m], y[m]
    full_pred = lg.argmax(1)
    pred = np.where(full_pred >= n_known, -2, full_pred)
    top3 = np.argsort(-lg[:, :n_known], 1)[:, :3]
    labels = np.arange(n_known)
    present = np.unique(yy)
    return {
        "n": int(m.sum()),
        "top1": float((pred == yy).mean()),
        "top3": float((top3 == yy[:, None]).any(1).mean()),
        "macro_f1": float(f1_score(yy, pred, labels=present, average="macro", zero_division=0)),
        "per_class_f1": {int(c): float(v) for c, v in zip(
            labels, f1_score(yy, pred, labels=labels, average=None, zero_division=0))},
        "predicted_none_rate": float((pred == -2).mean()),
    }


def open_set_metrics(conf: np.ndarray, y: np.ndarray) -> dict:
    known = y >= 0
    out = {}
    for name, mask in GROUPS_NEG(y):
        if mask.any() and known.any():
            sel = known | mask
            out[f"auroc_known_vs_{name}"] = float(roc_auc_score(known[sel], conf[sel]))
    return out


def ece(conf: np.ndarray, correct: np.ndarray, bins: int = 15) -> float:
    edges = np.linspace(0, 1, bins + 1)
    e = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            e += m.mean() * abs(correct[m].mean() - conf[m].mean())
    return float(e)


def coverage_table(pred, conf, y, accept: float, confirm: float) -> dict:
    """Decision outcome rates. Errors = accepted/confirmed with wrong class, or any non-reject on unknown."""
    act = np.where(conf >= accept, "accept", np.where(conf >= confirm, "confirm", "reject"))
    correct = (pred == y) & (y >= 0)
    rows = {}
    for group, gm in [("known", y >= 0), *GROUPS_NEG(y)]:
        if not gm.any():
            continue
        g = {}
        for a in ("accept", "confirm", "reject"):
            am = gm & (act == a)
            g[a] = float(am.sum() / gm.sum())
            if group == "known" and a != "reject":
                g[f"{a}_precision_known"] = float(correct[am].mean()) if am.any() else None
        rows[group] = g
    am = act == "accept"
    rows["accept_precision_all"] = float(correct[am].mean()) if am.any() else None
    cm = act == "confirm"
    rows["confirm_precision_all"] = float(correct[cm].mean()) if cm.any() else None
    return rows


def summarize(preds: dict, n_known: int, T: float = 1.0) -> dict:
    """preds: dict of arrays logits, y, split ('test'|'extra'), fold."""
    out = {}
    for split in np.unique(preds["split"]):
        m = preds["split"] == split
        lg, y = preds["logits"][m], preds["y"][m]
        probs = softmax(lg, T)
        pred, conf = known_confidence(probs, n_known)
        km = y >= 0
        s = {"closed": closed_set_metrics(lg, y, n_known), "open": open_set_metrics(conf, y)}
        if km.any():
            s["ece"] = ece(conf[km], (pred[km] == y[km]).astype(float))
        per_fold = {}
        for f in np.unique(preds["fold"][m]):
            fm = preds["fold"][m] == f
            cs = closed_set_metrics(lg[fm], y[fm], n_known)
            if cs:
                per_fold[str(f)] = {k: cs[k] for k in ("top1", "macro_f1")}
        s["per_fold"] = per_fold
        out[str(split)] = s
    return out


def confusion(preds: dict, n_known: int, split: str = "test") -> np.ndarray:
    m = (preds["split"] == split) & (preds["y"] >= 0)
    p = preds["logits"][m][:, :n_known].argmax(1)
    return confusion_matrix(preds["y"][m], p, labels=np.arange(n_known))


def load_preds(run_dir: Path) -> tuple[dict, dict]:
    with np.load(run_dir / "preds.npz", allow_pickle=True) as z:
        preds = {k: z[k] for k in z.files}
    info = json.loads((run_dir / "info.json").read_text(encoding="utf-8"))
    return preds, info


def print_summary(summary: dict) -> None:
    for split, s in summary.items():
        c = s.get("closed", {})
        line = f"[{split}] n={c.get('n')} top1={c.get('top1', 0):.3f} top3={c.get('top3', 0):.3f} macroF1={c.get('macro_f1', 0):.3f}"
        if "ece" in s:
            line += f" ECE={s['ece']:.3f}"
        for k, v in s.get("open", {}).items():
            line += f" {k}={v:.3f}"
        print(line)
        pf = "  ".join(f"{k}:{v['top1']:.3f}" for k, v in s.get("per_fold", {}).items())
        if pf:
            print("   per-fold top1:", pf)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir")
    args = ap.parse_args()
    preds, info = load_preds(Path(args.run_dir))
    s = summarize(preds, info["n_known"])
    print_summary(s)


if __name__ == "__main__":
    main()
