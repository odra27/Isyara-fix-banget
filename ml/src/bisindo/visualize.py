"""Skeleton overlay for visual QC.

Usage:
    python -m bisindo.visualize signer0_label0_sample1            # MP4 overlay
    python -m bisindo.visualize signer0_label0_sample1 --sheet    # PNG contact sheet
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
import pandas as pd

from .config import load_config, resolve
from .extract import cache_path, read_frames
from .schema import load_npz

HAND_EDGES = [
    (0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8), (5, 9), (9, 10), (10, 11),
    (11, 12), (9, 13), (13, 14), (14, 15), (15, 16), (13, 17), (17, 18), (18, 19), (19, 20), (0, 17),
]
POSE_EDGES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24)]
HAND_COLORS = [(0, 200, 255), (255, 120, 0)]


def draw(rgb: np.ndarray, a: dict, i: int) -> np.ndarray:
    img = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR).copy()
    h, w = img.shape[:2]
    if a["pose_mask"][i]:
        p = a["pose"][i]
        for s, e in POSE_EDGES:
            cv2.line(img, (int(p[s, 0] * w), int(p[s, 1] * h)), (int(p[e, 0] * w), int(p[e, 1] * h)), (0, 255, 0), 2)
    for j in range(2):
        if not a["hand_mask"][i, j]:
            continue
        pts = a["hands"][i, j]
        for s, e in HAND_EDGES:
            cv2.line(img, (int(pts[s, 0] * w), int(pts[s, 1] * h)), (int(pts[e, 0] * w), int(pts[e, 1] * h)), HAND_COLORS[j], 2)
        lbl = "L" if a["handedness"][i, j] == 0 else "R"
        cv2.putText(img, lbl, (int(pts[0, 0] * w), int(pts[0, 1] * h)), cv2.FONT_HERSHEY_SIMPLEX, 0.8, HAND_COLORS[j], 2)
    cv2.putText(img, f"f{i}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("clip_id")
    ap.add_argument("--sheet", action="store_true")
    ap.add_argument("--out")
    args = ap.parse_args()
    cfg = load_config()
    manifest = pd.read_csv(resolve(cfg, "data_dir") / "manifest.csv").set_index("clip_id")
    frames, fps = read_frames(Path(manifest.loc[args.clip_id, "path"]), cfg["extract"]["max_width"])
    a = load_npz(cache_path(cfg, args.clip_id))
    out_dir = resolve(cfg, "runs_dir") / "viz"
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.sheet:
        idx = np.linspace(0, len(frames) - 1, 12).astype(int)
        tiles = [cv2.resize(draw(frames[i], a, i), (320, 180)) for i in idx]
        sheet = np.vstack([np.hstack(tiles[r * 4:(r + 1) * 4]) for r in range(3)])
        out = Path(args.out or out_dir / f"{args.clip_id}.png")
        cv2.imwrite(str(out), sheet)
    else:
        h, w = frames[0].shape[:2]
        out = Path(args.out or out_dir / f"{args.clip_id}.mp4")
        vw = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
        for i, rgb in enumerate(frames):
            vw.write(draw(rgb, a, i))
        vw.release()
    print(out)


if __name__ == "__main__":
    main()
