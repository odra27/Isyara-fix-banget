"""Task 7: temperature scaling, open-set rejection and threshold selection.

Uses out-of-fold (held-out signer) predictions, so thresholds reflect unseen signers.

Usage:
    python -m bisindo.calibrate --run runs/gru_final_cfg --hidden-run runs/gru_hidden
Writes artifacts/thresholds.json and runs/<run>/calibration/*.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .config import load_config, resolve
from .evaluate import coverage_table, ece, known_confidence, load_preds, open_set_metrics, softmax


def fit_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    grid = np.exp(np.linspace(np.log(0.3), np.log(6.0), 120))
    best, best_nll = 1.0, np.inf
    for T in grid:
        p = softmax(logits, T)
        nll = -np.log(p[np.arange(len(y)), y] + 1e-12).mean()
        if nll < best_nll:
            best, best_nll = float(T), nll
    return best


def apply_centroid_gate(conf, sim, sim_min, confirm):
    """Samples far from their predicted class centroid are pushed below the confirm threshold."""
    return np.where(sim < sim_min, np.minimum(conf, confirm * 0.99), conf)


def sample_weights(y: np.ndarray, unknown_word_prior: float) -> np.ndarray:
    """Weight unknown-word samples so they form `unknown_word_prior` of the population."""
    w = np.ones(len(y))
    u = (y == -1) | (y == -3)  # real signs outside the vocabulary
    if u.any() and unknown_word_prior > 0:
        rest = (~u).sum()
        w[u] = unknown_word_prior * rest / ((1 - unknown_word_prior) * u.sum())
    return w


def choose_thresholds(pred, conf, y, ccfg) -> tuple[float, float]:
    """accept: weighted precision of accepted results >= target (known + none + weighted unknown words).
    confirm: >= `unknown_reject_target` of non-sign ('none') movement falls below it.
    Unknown *words* landing in the confirm band still require the user's explicit confirmation.
    """
    known = y >= 0
    correct = (pred == y) & known
    w = sample_weights(y, ccfg.get("unknown_word_prior", 0.0))
    grid = np.round(np.arange(0.30, 0.995, 0.005), 3)
    accept = 0.99
    for t in grid:
        m = conf >= t
        if m.sum() >= 10 and (w[m] * correct[m]).sum() / w[m].sum() >= ccfg["accept_precision_target"]:
            accept = float(t)
            break
    groups = {"none": -2, "unknown_word": -1, "negative_word": -3}
    neg = np.isin(y, [groups[g] for g in ccfg.get("confirm_reject_groups", ["none"])])
    if not neg.any():
        neg = ~known
    confirm = max(ccfg["confirm_min"], accept - 0.25)
    if neg.any():
        for t in grid:
            if t >= ccfg["confirm_min"] and (conf[neg] >= t).mean() <= 1 - ccfg["unknown_reject_target"]:
                confirm = float(t)
                break
    return accept, min(confirm, accept)


def _weighted_precision(pred, conf, y, accept, ccfg) -> float | None:
    m = conf >= accept
    if not m.any():
        return None
    w = sample_weights(y, ccfg.get("unknown_word_prior", 0.0))
    correct = (pred == y) & (y >= 0)
    return float((w[m] * correct[m]).sum() / w[m].sum())


def remap(conf: np.ndarray, confirm: float, accept: float, k_confirm: float, k_accept: float) -> np.ndarray:
    """Monotone piecewise-linear map so that raw thresholds land on the kiosk's 0.60 / 0.85."""
    conf = np.asarray(conf, np.float64)
    lo = conf / max(confirm, 1e-6) * k_confirm
    mid = k_confirm + (conf - confirm) / max(accept - confirm, 1e-6) * (k_accept - k_confirm)
    hi = k_accept + (conf - accept) / max(1 - accept, 1e-6) * (1 - k_accept)
    out = np.where(conf < confirm, lo, np.where(conf < accept, mid, hi))
    return np.clip(out, 0, 1)


def reliability_plot(conf, correct, path: Path, title: str):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    edges = np.linspace(0, 1, 11)
    xs, ys, ns = [], [], []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            xs.append(conf[m].mean())
            ys.append(correct[m].mean())
            ns.append(m.sum())
    plt.figure(figsize=(4, 4))
    plt.plot([0, 1], [0, 1], "k--", lw=1)
    plt.plot(xs, ys, "o-")
    for x, yv, n in zip(xs, ys, ns):
        plt.annotate(str(n), (x, yv), fontsize=7)
    plt.xlabel("confidence")
    plt.ylabel("accuracy")
    plt.title(title)
    plt.tight_layout()
    plt.savefig(path, dpi=120)
    plt.close()


def calibrate(run_dir: Path, hidden_dir: Path | None, cfg: dict) -> dict:
    ccfg = cfg["calibration"]
    preds, info = load_preds(run_dir)
    K = info["n_known"]
    m = preds["split"] == "test"
    lg, y, sim = preds["logits"][m], preds["y"][m], preds["sim"][m]

    known = y >= 0
    T = fit_temperature(lg[known], y[known])
    pred_raw, conf_raw = known_confidence(softmax(lg, 1.0), K)
    pred, conf = known_confidence(softmax(lg, T), K)

    # optional unknown words from the leave-labels-out run
    if hidden_dir is not None:
        hp, hinfo = load_preds(hidden_dir)
        hm = (hp["split"] == "test") & (hp["y"] == -1)
        hK = hinfo["n_known"]
        hlg = hp["logits"][hm]
        hkm = (hp["split"] == "test") & (hp["y"] >= 0)
        hT = fit_temperature(hp["logits"][hkm], hp["y"][hkm])
        hpred, hconf = known_confidence(softmax(hlg, hT), hK)
        u_conf, u_sim = hconf, hp["sim"][hm]
        u_pred = np.full(len(hconf), -9)  # never "correct"
    else:
        u_conf = u_sim = u_pred = np.zeros(0)

    correct_known = (pred == y) & known
    sim_min = float(np.percentile(sim[correct_known], ccfg["centroid_known_percentile"]))

    all_pred = np.concatenate([pred, u_pred])
    all_y = np.concatenate([y, np.full(len(u_conf), -1)])
    all_conf = np.concatenate([conf, u_conf])
    all_sim = np.concatenate([sim, u_sim])

    # thresholds on temperature-scaled confidence with centroid gate (gate uses provisional confirm)
    accept, confirm = choose_thresholds(all_pred, all_conf, all_y, ccfg)
    gated = apply_centroid_gate(all_conf, all_sim, sim_min, confirm)
    accept, confirm = choose_thresholds(all_pred, gated, all_y, ccfg)
    accept_auto = accept
    if ccfg.get("raw_accept_override") is not None:  # manual trade-off: more accepts, lower precision
        accept = float(ccfg["raw_accept_override"])
        confirm = min(confirm, accept)
    gated = apply_centroid_gate(all_conf, all_sim, sim_min, confirm)

    out_dir = run_dir / "calibration"
    out_dir.mkdir(exist_ok=True)
    reliability_plot(conf_raw[known], (pred_raw[known] == y[known]).astype(float), out_dir / "reliability_raw.png", "raw")
    reliability_plot(conf[known], correct_known[known].astype(float), out_dir / f"reliability_T.png", f"T={T:.2f}")

    report = {
        "temperature": T,
        "ece_raw": ece(conf_raw[known], (pred_raw[known] == y[known]).astype(float)),
        "ece_calibrated": ece(conf[known], correct_known[known].astype(float)),
        "raw_accept": accept,
        "raw_accept_auto": accept_auto,
        "raw_confirm": confirm,
        "centroid_sim_min": sim_min,
        "open_set_auroc": open_set_metrics(gated, all_y),
        "coverage": coverage_table(all_pred, gated, all_y, accept, confirm),
        "accept_precision_weighted": _weighted_precision(all_pred, gated, all_y, accept, ccfg),
        "unknown_word_prior": ccfg.get("unknown_word_prior", 0.0),
        "n_known": int(known.sum()), "n_none": int((all_y == -2).sum()), "n_unknown_word": int((all_y == -1).sum()),
    }
    # extra-signer check with the same thresholds
    me = preds["split"] == "extra"
    if me.any():
        ep, ec = known_confidence(softmax(preds["logits"][me], T), K)
        ec = apply_centroid_gate(ec, preds["sim"][me], sim_min, confirm)
        report["coverage_extra_signer"] = coverage_table(ep, ec, preds["y"][me], accept, confirm)
    (out_dir / "report.json").write_text(json.dumps(report, indent=2))

    thresholds = {
        "temperature": T,
        "raw_accept": accept,
        "raw_accept_auto": accept_auto,  # what the precision target alone would choose
        "raw_confirm": confirm,
        "centroid_sim_min": sim_min,
        "kiosk_accept": ccfg["kiosk_accept"],
        "kiosk_confirm": ccfg["kiosk_confirm"],
        "source_run": run_dir.name,
        "hidden_run": hidden_dir.name if hidden_dir else None,
    }
    art = resolve(cfg, "artifacts_dir")
    art.mkdir(parents=True, exist_ok=True)
    (art / "thresholds.json").write_text(json.dumps(thresholds, indent=2))
    return report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--hidden-run")
    args = ap.parse_args()
    cfg = load_config()
    rep = calibrate(Path(args.run), Path(args.hidden_run) if args.hidden_run else None, cfg)
    print(json.dumps(rep, indent=2))


if __name__ == "__main__":
    main()
