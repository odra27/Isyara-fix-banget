"""Tambahkan titik muka (mata, telinga, sudut mulut) ke animasi kerangka kiosk.

Sumber: landmark MediaPipe Pose asli di ml/data/landmarks/<clip>.npz (titik 2, 5, 7, 8, 9, 10),
dengan potongan frame + smoothing yang SAMA dengan ml/scripts/export_skeleton.py, sehingga muka
sinkron dengan badan & tangan. Hanya koordinat titik, tanpa piksel.

Kata yang .npz-nya tidak ada di laptop ini dilewati; muka-nya diperkirakan di FE dari hidung + bahu
(processSkeleton.ts, `estimateFace`).

Pemakaian (dari Frontend/main, setelah `node scripts/sync-skeletons.mjs`):
    ..\\..\\Backend\\.venv\\Scripts\\python.exe scripts\\add-skeleton-face.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ML = ROOT.parents[1] / "ml"
DATA = ROOT / "src" / "features" / "skeleton-animation" / "data"
LANDMARKS = ML / "data" / "landmarks"
sys.path.insert(0, str(ML / "scripts"))

import export_skeleton as ex  # noqa: E402
from bisindo.schema import load_npz  # noqa: E402

BODY = list(ex.POSE_POINTS)  # [0, 11, 12, 13, 14, 15, 16]
# Urutan field `face`: mata kiri, mata kanan, telinga kiri, telinga kanan, mulut kiri, mulut kanan (anatomis)
FACE = [2, 5, 7, 8, 9, 10]


def main() -> None:
    ex.POSE_POINTS = BODY + FACE  # build_frames membaca konstanta modul ini
    for f in sorted(DATA.glob("label_*.json")):
        clip = json.loads(f.read_text(encoding="utf-8"))
        npz = LANDMARKS / f"{clip['clip']}.npz"
        if not npz.exists():
            print(f"lewati {f.stem} ({clip['text']}): {npz.name} tidak ada, muka diperkirakan di FE")
            continue
        frames = ex.build_frames(load_npz(npz))
        if len(frames) != len(clip["frames"]):
            print(f"lewati {f.stem}: jumlah frame beda ({len(frames)} vs {len(clip['frames'])})")
            continue
        worst = 0.0
        for fe, fr in zip(clip["frames"], frames):
            if fr["pose"] is None or fe["pose"] is None:
                fe["face"] = None
                continue
            pts = [[round(1 - x, 4), y] for x, y in fr["pose"]]  # ekspor ML di-mirror → kembalikan
            body, face = pts[: len(BODY)], pts[len(BODY):]
            worst = max(worst, float(np.abs(np.asarray(body) - np.asarray(fe["pose"])).max()))
            fe["face"] = face
        if worst > 2e-4:  # muka harus dari potongan/smoothing yang sama dengan badan
            print(f"lewati {f.stem}: pose tidak cocok (selisih {worst:.4f})")
            continue
        clip["faceSource"] = "landmark"
        f.write_text(json.dumps(clip, separators=(",", ":")), encoding="utf-8")
        print(f"ok {f.stem} {clip['text']}: muka dari landmark asli")


if __name__ == "__main__":
    main()
