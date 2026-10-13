"""Tasks 5-6-8: LOSO experiments (DTW / GRU) and final training.

Usage:
    python -m bisindo.train --name dtw --model dtw
    python -m bisindo.train --name gru_base
    python -m bisindo.train --name gru_h192 --set model.hidden=192
    python -m bisindo.train --name gru_hidden --hidden-labels      # open-set experiment
    python -m bisindo.train --name gru_random --random             # optimistic reference split
    python -m bisindo.train --name final --final --seeds 42 43 44  # all signers
"""
from __future__ import annotations

import argparse
import json
import math
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import torch
import yaml
from torch import nn
from torch.utils.data import DataLoader

from .config import load_config, resolve
from .dataset import TrainSet, eval_features, load_dataset, make_none_eval
from .evaluate import print_summary, summarize
from .features import feature_dim
from .models.dtw import DTWKNN
from .models.gru import SignGRU
from .splits import loso_folds, random_split


# --------------------------------------------------------------------------- GRU
def build_model(cfg: dict, n_out: int) -> SignGRU:
    m = cfg["model"]
    return SignGRU(feature_dim(cfg["features"]), n_out, m["hidden"], m["layers"], m["embed_dim"], m["dropout"])


def train_gru(seqs, y, n_known: int, cfg: dict, seed: int, log=print) -> SignGRU:
    torch.manual_seed(seed)
    np.random.seed(seed)
    tc = cfg["train"]
    use_none = cfg["none_class"]["enabled"]
    n_out = n_known + (1 if use_none else 0)
    model = build_model(cfg, n_out)
    X0 = torch.from_numpy(eval_features(seqs, cfg["features"]))
    flat = X0.reshape(-1, X0.shape[-1])
    model.set_normalization(flat.mean(0), flat.std(0))

    ds = TrainSet(seqs, y, cfg, n_known if use_none else None, seed)
    dl = DataLoader(ds, batch_size=tc["batch_size"], shuffle=True, num_workers=0, drop_last=True)
    # Balanced class weights. The none class = synthetic movement + (demo mode) real out-of-vocabulary signs.
    counts = np.bincount(np.asarray(y), minlength=n_out).astype(np.float32)[:n_out]
    if use_none:
        counts[n_known] += ds.n_none
    w = counts.sum() / np.maximum(counts, 1) / n_out
    if use_none:
        w[n_known] *= cfg["none_class"].get("none_weight", 1.0)
    crit = nn.CrossEntropyLoss(weight=torch.tensor(w, dtype=torch.float32), label_smoothing=tc["label_smoothing"])
    opt = torch.optim.AdamW(model.parameters(), lr=tc["lr"], weight_decay=tc["weight_decay"])
    total = tc["epochs"] * len(dl)
    warm = max(1, int(0.05 * total))
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: (s + 1) / warm if s < warm else 0.5 * (1 + math.cos(math.pi * (s - warm) / max(1, total - warm)))
    )
    t0 = time.time()
    for ep in range(tc["epochs"]):
        model.train()
        tot, correct, n = 0.0, 0, 0
        for xb, yb in dl:
            logits, _ = model(xb)
            loss = crit(logits, yb)
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            tot += loss.item() * len(yb)
            correct += (logits.argmax(1) == yb).sum().item()
            n += len(yb)
        if ep % 10 == 0 or ep == tc["epochs"] - 1:
            log(f"  ep{ep:3d} loss={tot / n:.3f} train_acc={correct / n:.3f} ({time.time() - t0:.0f}s)")
    model.eval()
    return model


@torch.no_grad()
def predict_gru(model: SignGRU, X: np.ndarray, bs: int = 256) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    L, E = [], []
    for i in range(0, len(X), bs):
        lg, e = model(torch.from_numpy(X[i:i + bs]))
        L.append(lg.numpy())
        E.append(e.numpy())
    if not L:
        return np.zeros((0, model.head.out_features), np.float32), np.zeros((0, model.head.in_features), np.float32)
    return np.concatenate(L), np.concatenate(E)


def class_centroids(emb: np.ndarray, y: np.ndarray, n_known: int) -> np.ndarray:
    e = emb / (np.linalg.norm(emb, axis=1, keepdims=True) + 1e-8)
    C = np.zeros((n_known, e.shape[1]), np.float32)
    for c in range(n_known):
        m = y == c
        if m.any():
            v = e[m].mean(0)
            C[c] = v / (np.linalg.norm(v) + 1e-8)
    return C


def centroid_sim(emb: np.ndarray, logits: np.ndarray, C: np.ndarray) -> np.ndarray:
    e = emb / (np.linalg.norm(emb, axis=1, keepdims=True) + 1e-8)
    pred = logits[:, : len(C)].argmax(1)
    return (e * C[pred]).sum(1)


# --------------------------------------------------------------------------- fold runner
def _run_fold(job: dict) -> dict:
    cfg, fold, seqs, meta_y, meta_signer, model_type = (
        job["cfg"], job["fold"], job["seqs"], job["y"], job["signer"], job["model"])
    y_train_all = job.get("y_train", meta_y)
    torch.set_num_threads(job["threads"])
    tag = f"[{fold['name']}]"
    log = lambda s: print(tag, s, flush=True)  # noqa: E731
    tr, te, ex = fold["train_idx"], fold["test_idx"], fold["extra_idx"]
    n_known = job["n_known"]
    fc = cfg["features"]
    tr_seqs = [seqs[i] for i in tr]
    tr_y = y_train_all[tr]

    sets = [("test", te), ("extra", ex)]
    X_eval, y_eval, split_eval, signer_eval = [], [], [], []
    for name, idx in sets:
        if len(idx):
            X_eval.append(eval_features([seqs[i] for i in idx], fc))
            y_eval.append(meta_y[idx])
            split_eval += [name] * len(idx)
            signer_eval.append(meta_signer[idx])
    # synthetic none from held-out signer (no augmentation)
    n_none = max(20, len(te) // 8)
    X_eval.append(make_none_eval([seqs[i] for i in te], meta_y[te].clip(0), cfg, n_none, seed=123))
    y_eval.append(np.full(n_none, -2))
    split_eval += ["test"] * n_none
    signer_eval.append(np.full(n_none, meta_signer[te][0]))
    X_eval = np.concatenate(X_eval)
    y_eval = np.concatenate(y_eval)
    signer_eval = np.concatenate(signer_eval)

    if model_type == "dtw":
        fc_d = dict(fc, T=32)
        Xtr = eval_features(tr_seqs, fc_d)
        # rebuild eval features at T=32
        Xe = []
        for name, idx in sets:
            if len(idx):
                Xe.append(eval_features([seqs[i] for i in idx], fc_d))
        cfg_d = dict(cfg, features=fc_d)
        Xe.append(make_none_eval([seqs[i] for i in te], meta_y[te].clip(0), cfg_d, n_none, seed=123))
        Xe = np.concatenate(Xe)
        mu, sd = Xtr.reshape(-1, Xtr.shape[-1]).mean(0), Xtr.reshape(-1, Xtr.shape[-1]).std(0) + 1e-3
        knn = DTWKNN(band=6).fit((Xtr - mu) / sd, tr_y, n_known)
        t0 = time.time()
        logits = knn.predict_logits((Xe - mu) / sd)
        log(f"DTW predicted {len(Xe)} in {time.time() - t0:.0f}s")
        emb = np.zeros((len(Xe), 1), np.float32)
        sim = np.ones(len(Xe), np.float32)
        state = None
    else:
        # Seed ensemble per fold (mean logits, mean per-member centroid similarity) — same as the exported model,
        # so out-of-fold calibration matches the deployed model.
        seeds = job.get("seeds") or [cfg["train"]["seed"]]
        X_tr_eval = eval_features(tr_seqs, fc)
        L, members, states = [], [], []
        for sd in seeds:
            model = train_gru(tr_seqs, tr_y, n_known, cfg, sd, lambda s, sd=sd: log(f"seed{sd} {s}"))
            lg, e = predict_gru(model, X_eval)
            _, tr_emb = predict_gru(model, X_tr_eval)
            L.append(lg)
            members.append((e, class_centroids(tr_emb, tr_y, n_known)))
            states.append({k: v.clone() for k, v in model.state_dict().items()})
        logits = np.mean(L, 0)
        # similarity of each member's embedding to its own centroid of the *ensemble* prediction (as in predict.py)
        sim = np.mean([centroid_sim(e, logits, C) for e, C in members], 0)
        emb = members[0][0]
        state = states[0]
    return {
        "fold": fold["name"], "logits": logits.astype(np.float32), "emb": emb.astype(np.float32),
        "sim": sim.astype(np.float32), "y": y_eval, "split": np.array(split_eval), "signer": signer_eval,
        "state": state,
    }


def label_targets(labels: np.ndarray, cfg: dict, demo: bool, hidden: list[int], final: bool = False):
    """Returns (known_labels, y_train, y_eval).

    Default mode: every non-hidden label is a class; hidden labels -> -1 (unknown words, not trained).
    Demo mode:    only cfg.vocab.demo_labels are classes. Other labels are *real* out-of-vocabulary signs:
                  trained as the `none` class (y_train = K, y_eval = -3), except cfg.vocab.unknown_holdout
                  which is never trained on (y = -1) so open-set rejection is measured on unseen words.
                  With final=True all non-demo labels become `none` training data.
    """
    if not demo:
        known = sorted(set(labels.tolist()) - set(hidden))
        idx = {l: i for i, l in enumerate(known)}
        y = np.array([idx.get(l, -1) for l in labels])
        return known, y, y
    vc = cfg["vocab"]
    known = sorted(vc["demo_labels"])
    K = len(known)
    idx = {l: i for i, l in enumerate(known)}
    hold = set() if final else set(vc["unknown_holdout"])
    y_train = np.array([idx[l] if l in idx else (-1 if l in hold else K) for l in labels])
    y_eval = np.array([idx[l] if l in idx else (-1 if l in hold else -3) for l in labels])
    return known, y_train, y_eval


def run_experiment(cfg: dict, name: str, model_type: str = "gru", hidden: bool = False,
                   random: bool = False, demo: bool = False, seeds: list[int] | None = None) -> dict:
    seqs, meta = load_dataset(cfg)
    ev = cfg["eval"]
    hidden_labels = ev["hidden_labels"] if hidden else []
    known, y_train, y = label_targets(meta.label.to_numpy(), cfg, demo, hidden_labels)
    if random:
        folds = [random_split(meta, 0.2, seed=cfg["train"]["seed"])]
    else:
        folds = loso_folds(meta, ev["loso_signers"], ev["extra_test_signer"], hidden_labels)
    for f in folds:  # never train on held-out unknown words
        f.train_idx = f.train_idx[y_train[f.train_idx] >= 0]

    run_dir = resolve(cfg, "runs_dir") / name
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "config.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False))
    threads = max(1, cfg["train"]["threads"] // len(folds))
    jobs = [{
        "cfg": cfg, "fold": {"name": f.name, "train_idx": f.train_idx, "test_idx": f.test_idx, "extra_idx": f.extra_idx},
        "seqs": seqs, "y": y, "y_train": y_train, "signer": meta.signer.to_numpy(), "model": model_type,
        "n_known": len(known), "threads": threads, "seeds": seeds,
    } for f in folds]
    t0 = time.time()
    if len(jobs) == 1:
        results = [_run_fold(jobs[0])]
    else:
        with ProcessPoolExecutor(max_workers=len(jobs)) as pool:
            results = list(pool.map(_run_fold, jobs))
    preds = {k: np.concatenate([r[k] for r in results]) for k in ("logits", "emb", "sim", "y", "split", "signer")}
    preds["fold"] = np.concatenate([[r["fold"]] * len(r["y"]) for r in results])
    np.savez_compressed(run_dir / "preds.npz", **preds)
    for r in results:
        if r["state"] is not None:
            torch.save(r["state"], run_dir / f"model_{r['fold']}.pt")
    info = {"name": name, "model": model_type, "n_known": len(known), "known_labels": known,
            "hidden_labels": hidden_labels, "random": random, "demo": demo, "seeds": seeds,
            "unknown_holdout": cfg["vocab"]["unknown_holdout"] if demo else [],
            "minutes": round((time.time() - t0) / 60, 1)}
    (run_dir / "info.json").write_text(json.dumps(info, indent=2))
    summary = summarize(preds, len(known))
    (run_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"== {name} ({info['minutes']} min)")
    print_summary(summary)
    return summary


# --------------------------------------------------------------------------- final
def _train_final(job):
    torch.set_num_threads(job["threads"])
    cfg = job["cfg"]
    log = lambda s: print(f"[seed{job['seed']}]", s, flush=True)  # noqa: E731
    model = train_gru(job["seqs"], job["y"], job["n_known"], cfg, job["seed"], log)
    return job["seed"], {k: v.clone() for k, v in model.state_dict().items()}


def run_final(cfg: dict, name: str, seeds: list[int], demo: bool = False) -> Path:
    seqs, meta = load_dataset(cfg)
    known, y, _ = label_targets(meta.label.to_numpy(), cfg, demo, [], final=True)
    run_dir = resolve(cfg, "runs_dir") / name
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "config.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False))
    threads = max(1, cfg["train"]["threads"] // len(seeds))
    jobs = [{"cfg": cfg, "seqs": seqs, "y": y, "n_known": len(known), "seed": s, "threads": threads} for s in seeds]
    with ProcessPoolExecutor(max_workers=len(jobs)) as pool:
        for seed, state in pool.map(_train_final, jobs):
            torch.save(state, run_dir / f"final_seed{seed}.pt")
    (run_dir / "info.json").write_text(json.dumps(
        {"name": name, "final": True, "seeds": seeds, "n_known": len(known), "known_labels": known, "demo": demo,
         "negative_labels": sorted(set(meta.label) - set(known)) if demo else []}, indent=2))
    print("saved", run_dir)
    return run_dir


def parse_overrides(items: list[str]) -> dict:
    out: dict = {}
    for it in items or []:
        key, val = it.split("=", 1)
        d = out
        parts = key.split(".")
        for p in parts[:-1]:
            d = d.setdefault(p, {})
        d[parts[-1]] = yaml.safe_load(val)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--model", default="gru", choices=["gru", "dtw"])
    ap.add_argument("--hidden-labels", action="store_true")
    ap.add_argument("--random", action="store_true")
    ap.add_argument("--final", action="store_true")
    ap.add_argument("--seeds", type=int, nargs="+", default=None,
                    help="final: seeds to train (default 42 43 44); LOSO: per-fold seed ensemble (default: one seed)")
    ap.add_argument("--demo", action="store_true", help="demo vocabulary with real out-of-vocabulary negatives")
    ap.add_argument("--set", nargs="*", default=[])
    ap.add_argument("--config")
    args = ap.parse_args()
    cfg = load_config(args.config, parse_overrides(args.set))
    if args.final:
        run_final(cfg, args.name, args.seeds or [42, 43, 44], args.demo)
    else:
        run_experiment(cfg, args.name, args.model, args.hidden_labels, args.random, args.demo, args.seeds)


if __name__ == "__main__":
    main()
