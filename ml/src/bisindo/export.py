"""Task 8: build the seed ensemble, export ONNX, write artifacts/, check parity.

Usage: python -m bisindo.export --run runs/final
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
import yaml
from torch import nn

from .config import resolve
from .dataset import eval_features, load_dataset
from .train import build_model, class_centroids, label_targets


class Ensemble(nn.Module):
    """Mean logits over members; embeddings stacked [B, M, E] for per-member centroid checks."""

    def __init__(self, members: list[nn.Module]):
        super().__init__()
        self.members = nn.ModuleList(members)

    def forward(self, x):
        outs = [m(x) for m in self.members]
        logits = torch.stack([o[0] for o in outs], 0).mean(0)
        emb = torch.stack([o[1] for o in outs], 1)
        return logits, emb


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def export(run_dir: Path) -> Path:
    cfg = yaml.safe_load((run_dir / "config.yaml").read_text(encoding="utf-8"))
    info = json.loads((run_dir / "info.json").read_text(encoding="utf-8"))
    K = info["n_known"]
    n_out = K + (1 if cfg["none_class"]["enabled"] else 0)
    members = []
    for p in sorted(run_dir.glob("final_seed*.pt")):
        m = build_model(cfg, n_out)
        m.load_state_dict(torch.load(p))
        m.eval()
        members.append(m)
    assert members, f"no final_seed*.pt in {run_dir}"
    ens = Ensemble(members).eval()

    art = resolve(cfg, "artifacts_dir")
    art.mkdir(parents=True, exist_ok=True)

    # centroids per member on (non-augmented) training data
    seqs, meta = load_dataset(cfg)
    known, y, _ = label_targets(meta.label.to_numpy(), cfg, info.get("demo", False), [], final=True)
    assert known == info["known_labels"], "config vocab differs from the trained run"
    X = eval_features(seqs, cfg["features"])
    with torch.no_grad():
        logits, emb = ens(torch.from_numpy(X))
    C = np.stack([class_centroids(emb[:, i].numpy(), y, K) for i in range(len(members))])
    np.save(art / "centroids.npy", C)
    train_acc = float((logits.argmax(1).numpy() == y).mean())  # incl. none class for negatives

    onnx_path = art / "model.onnx"
    T, D = X.shape[1], X.shape[2]
    dummy = torch.from_numpy(X[:2])
    torch.onnx.export(
        ens, dummy, str(onnx_path), input_names=["x"], output_names=["logits", "emb"],
        dynamic_axes={"x": {0: "batch"}, "logits": {0: "batch"}, "emb": {0: "batch"}},
        opset_version=17, dynamo=False,
    )
    # parity
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    xb = X[:64]
    o_lg, o_emb = sess.run(None, {"x": xb})
    with torch.no_grad():
        t_lg, t_emb = ens(torch.from_numpy(xb))
    diff = float(max(np.abs(o_lg - t_lg.numpy()).max(), np.abs(o_emb - t_emb.numpy()).max()))
    assert diff < 1e-4, f"ONNX parity failed: {diff}"

    (art / "feature_config.json").write_text(json.dumps(cfg["features"], indent=2))
    (art / "model_info.json").write_text(json.dumps({
        "n_known": K, "known_labels": info["known_labels"], "none_class": cfg["none_class"]["enabled"],
        "none_index": K if cfg["none_class"]["enabled"] else None, "members": len(members),
        "input_shape": [None, T, D], "model": cfg["model"],
        "demo_vocabulary": info.get("demo", False), "negative_labels": info.get("negative_labels", []),
    }, indent=2))
    files = ["model.onnx", "centroids.npy", "feature_config.json", "model_info.json", "label_map.json", "thresholds.json"]
    version = {
        "version": dt.datetime.now().strftime("%Y%m%d-%H%M"),
        "source_run": run_dir.name,
        "dataset": f"WL-BISINDO (wl-bisindo-raw/videos, {len(seqs)} clips, signers {sorted(set(meta.signer.tolist()))})",
        "train_accuracy_all_signers": train_acc,
        "onnx_parity_max_abs_diff": diff,
        "sha256": {f: sha256(art / f) for f in files if (art / f).exists()},
    }
    (art / "version.json").write_text(json.dumps(version, indent=2))
    print(json.dumps(version, indent=2))
    return art


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    args = ap.parse_args()
    export(Path(args.run))


if __name__ == "__main__":
    main()
