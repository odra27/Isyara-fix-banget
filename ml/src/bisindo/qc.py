"""Task 3: QC report over the landmark cache.

Usage: python -m bisindo.qc
"""
from __future__ import annotations

import pandas as pd

from .config import load_config, resolve
from .extract import cache_path
from .schema import load_npz


def clip_stats(a: dict) -> dict:
    hm = a["hand_mask"]
    n = len(hm)
    return {
        "n_frames": n,
        "hand_any": float(hm.any(1).mean()) if n else 0.0,
        "hand_both": float(hm.all(1).mean()) if n else 0.0,
        "pose": float(a["pose_mask"].mean()) if n else 0.0,
    }


def qc_flags(stats: dict, cfg: dict) -> list[str]:
    q = cfg["qc"]
    flags = []
    if stats["n_frames"] == 0:
        flags.append("empty")
    if stats["hand_any"] < q["min_hand_frame_ratio"] or stats["hand_any"] * stats["n_frames"] < q["min_hand_frames"]:
        flags.append("few_hands")
    if stats["pose"] < q["min_pose_frame_ratio"]:
        flags.append("few_pose")
    return flags


def main() -> None:
    cfg = load_config()
    data_dir = resolve(cfg, "data_dir")
    manifest = pd.read_csv(data_dir / "manifest.csv")
    rows = []
    for r in manifest.itertuples():
        p = cache_path(cfg, r.clip_id)
        if not p.exists():
            rows.append({"clip_id": r.clip_id, "signer": r.signer, "label": r.label, "flags": "missing"})
            continue
        s = clip_stats(load_npz(p))
        rows.append({"clip_id": r.clip_id, "signer": r.signer, "label": r.label, **s,
                     "flags": ";".join(qc_flags(s, cfg))})
    df = pd.DataFrame(rows)
    df.to_csv(data_dir / "qc_report.csv", index=False)
    excluded = df[df["flags"].fillna("") != ""]
    excluded[["clip_id", "flags"]].to_csv(data_dir / "excluded.csv", index=False)
    print(f"clips: {len(df)}  excluded: {len(excluded)}")
    print(excluded["flags"].value_counts().to_string())
    print("\nper signer (mean ratios):")
    print(df.groupby("signer")[["hand_any", "hand_both", "pose", "n_frames"]].mean().round(3))
    worst = df.groupby("label")["hand_any"].mean().sort_values().head(8)
    print("\nlabels with lowest hand detection:")
    print(worst.round(3).to_string())


if __name__ == "__main__":
    main()
