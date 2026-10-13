"""Tasks 2-3: MediaPipe Hand + Pose landmark extraction (single video and batch).

Usage:
    python -m bisindo.extract --one signer0_label0_sample1
    python -m bisindo.extract            # all clips, resumable, parallel
"""
from __future__ import annotations

import argparse
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import pandas as pd
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision
from tqdm import tqdm

from .config import load_config, resolve
from .schema import empty_arrays, save_npz


class Extractor:
    """Wraps HandLandmarker + PoseLandmarker in VIDEO mode. One instance per video."""

    def __init__(self, cfg: dict):
        e = cfg["extract"]
        self.hand = vision.HandLandmarker.create_from_options(
            vision.HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(resolve(cfg, "hand_model"))),
                running_mode=vision.RunningMode.VIDEO,
                num_hands=e["num_hands"],
                min_hand_detection_confidence=e["min_hand_detection_confidence"],
                min_hand_presence_confidence=e["min_hand_presence_confidence"],
                min_tracking_confidence=e["min_tracking_confidence"],
            )
        )
        self.pose = vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(resolve(cfg, "pose_model"))),
                running_mode=vision.RunningMode.VIDEO,
                num_poses=1,
            )
        )

    def close(self):
        self.hand.close()
        self.pose.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def process_frame(self, rgb: np.ndarray, t_ms: int, a: dict, i: int) -> None:
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        hr = self.hand.detect_for_video(img, t_ms)
        for j, lms in enumerate(hr.hand_landmarks[:2]):
            a["hands"][i, j] = [(p.x, p.y, p.z) for p in lms]
            a["hand_mask"][i, j] = True
            cat = hr.handedness[j][0]
            a["handedness"][i, j] = 0 if cat.category_name == "Left" else 1
            a["hand_score"][i, j] = cat.score
        pr = self.pose.detect_for_video(img, t_ms)
        if pr.pose_landmarks:
            a["pose"][i] = [(p.x, p.y, p.z, p.visibility) for p in pr.pose_landmarks[0]]
            a["pose_mask"][i] = True


def read_frames(path: Path, max_width: int):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames = []
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        h, w = bgr.shape[:2]
        if w > max_width:
            bgr = cv2.resize(bgr, (max_width, int(round(h * max_width / w))), interpolation=cv2.INTER_AREA)
        frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    cap.release()
    return frames, fps


def extract_video(path: Path, cfg: dict) -> dict:
    frames, fps = read_frames(path, cfg["extract"]["max_width"])
    a = empty_arrays(len(frames))
    with Extractor(cfg) as ex:
        for i, rgb in enumerate(frames):
            t_ms = int(round(i * 1000.0 / fps))
            a["t_ms"][i] = t_ms
            ex.process_frame(rgb, t_ms, a, i)
    h, w = frames[0].shape[:2] if frames else (0, 0)
    a["width"], a["height"], a["mirrored"] = np.int32(w), np.int32(h), np.bool_(False)
    return a


def cache_path(cfg: dict, clip_id: str) -> Path:
    return resolve(cfg, "data_dir") / "landmarks" / f"{clip_id}.npz"


def _worker(args):
    path, out, cfg = args
    try:
        a = extract_video(Path(path), cfg)
        save_npz(Path(out), a)
        return path, None
    except Exception:  # noqa: BLE001 - report and continue the batch
        return path, traceback.format_exc()


def run_batch(cfg: dict, limit: int | None = None) -> None:
    manifest = pd.read_csv(resolve(cfg, "data_dir") / "manifest.csv")
    jobs = []
    for r in manifest.itertuples():
        out = cache_path(cfg, r.clip_id)
        if not out.exists():  # resumable
            jobs.append((r.path, str(out), cfg))
    if limit:
        jobs = jobs[:limit]
    print(f"{len(manifest) - len(jobs)} cached, {len(jobs)} to extract")
    errors = []
    with ProcessPoolExecutor(max_workers=cfg["extract"]["workers"]) as pool:
        futs = [pool.submit(_worker, j) for j in jobs]
        for f in tqdm(as_completed(futs), total=len(futs)):
            path, err = f.result()
            if err:
                errors.append((path, err))
    for p, e in errors:
        print("FAILED", p, e.splitlines()[-1])
    print(f"done, {len(errors)} errors")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--one", help="clip_id to extract (writes cache and prints stats)")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    cfg = load_config()
    if args.one:
        manifest = pd.read_csv(resolve(cfg, "data_dir") / "manifest.csv").set_index("clip_id")
        a = extract_video(Path(manifest.loc[args.one, "path"]), cfg)
        save_npz(cache_path(cfg, args.one), a)
        n = len(a["t_ms"])
        print(f"frames={n} size={a['width']}x{a['height']}")
        print(f"frames with >=1 hand: {a['hand_mask'].any(1).mean():.2f}, 2 hands: {a['hand_mask'].all(1).mean():.2f}")
        print(f"frames with pose: {a['pose_mask'].mean():.2f}")
    else:
        run_batch(cfg, args.limit)


if __name__ == "__main__":
    main()
