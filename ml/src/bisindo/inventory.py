"""Task 1: build manifest.csv and a placeholder label map from the raw video folder.

Usage: python -m bisindo.inventory
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import cv2
import pandas as pd

from .config import load_config, resolve

VIDEO_EXTS = (".mp4", ".mov")  # .mov = iPhone recordings of own signers
FILENAME_RE = re.compile(r"^signer(?P<signer>\d+)_label(?P<label>\d+)_sample(?P<sample>\d+)\.(?:mp4|mov)$", re.IGNORECASE)


def parse_filename(name: str) -> dict | None:
    m = FILENAME_RE.match(name)
    if not m:
        return None
    return {k: int(v) for k, v in m.groupdict().items()}


def probe_video(path: Path) -> dict:
    cap = cv2.VideoCapture(str(path))
    try:
        ok = cap.isOpened()
        fps = cap.get(cv2.CAP_PROP_FPS) if ok else 0.0
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if ok else 0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) if ok else 0
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) if ok else 0
    finally:
        cap.release()
    return {
        "fps": fps,
        "frames": frames,
        "width": w,
        "height": h,
        "duration_s": frames / fps if fps > 0 else 0.0,
        "readable": bool(ok and frames > 0 and fps > 0),
    }


def build_manifest(videos_dir: Path, probe: bool = True) -> pd.DataFrame:
    rows, unparsed = [], []
    for p in sorted(f for f in videos_dir.iterdir() if f.suffix.lower() in VIDEO_EXTS):
        meta = parse_filename(p.name)
        if meta is None:
            unparsed.append(p.name)
            continue
        row = {"clip_id": p.stem, "path": str(p), **meta}
        if probe:
            row.update(probe_video(p))
        rows.append(row)
    df = pd.DataFrame(rows).sort_values(["signer", "label", "sample"]).reset_index(drop=True)
    df.attrs["unparsed"] = unparsed
    return df


def placeholder_label_map(labels: list[int]) -> dict:
    return {
        str(l): {"phraseId": f"label_{l:02d}", "text": f"label_{l:02d}", "verified": False}
        for l in sorted(labels)
    }


def main() -> None:
    cfg = load_config()
    videos_dir = Path(cfg["paths"]["videos_dir"])
    data_dir = resolve(cfg, "data_dir")
    data_dir.mkdir(parents=True, exist_ok=True)

    df = build_manifest(videos_dir)
    df.to_csv(data_dir / "manifest.csv", index=False)

    lm_path = resolve(cfg, "artifacts_dir") / "label_map.json"
    lm_path.parent.mkdir(parents=True, exist_ok=True)
    if not lm_path.exists():  # never overwrite a manually filled map
        lm_path.write_text(json.dumps(placeholder_label_map(df["label"].unique().tolist()), indent=2))

    print(f"clips: {len(df)}  signers: {df.signer.nunique()}  labels: {df.label.nunique()}")
    if df.attrs["unparsed"]:
        print("unparsed files:", df.attrs["unparsed"])
    bad = df[~df.readable]
    print(f"unreadable: {len(bad)}")
    print("\nclips per signer x label-range:")
    top = max(31, int(df.label.max()))
    print(pd.crosstab(df.signer, pd.cut(df.label, [-1, 11, 31, top], labels=["0-11", "12-31", f"32-{top}"])))
    print("\nsamples per (signer,label) — distinct counts:")
    print(df.groupby(["signer", "label"]).size().groupby("signer").agg(["min", "max", "sum"]))
    print("\nfps / duration:")
    print(df.groupby("signer")[["fps", "duration_s", "width", "height"]].agg(["min", "max"]).round(2))


if __name__ == "__main__":
    main()
