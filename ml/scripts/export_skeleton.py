"""Ekspor animasi kerangka (titik tangan + badan) dari 1 klip WL-BISINDO ke JSON kecil untuk kiosk.

Usage (dari folder ml/):
    .venv\\Scripts\\python.exe scripts\\export_skeleton.py --label 10            # "Terima kasih", klip terbaik otomatis
    .venv\\Scripts\\python.exe scripts\\export_skeleton.py --label 10 --clip signer2_label10_sample3
    .venv\\Scripts\\python.exe scripts\\export_skeleton.py --label 10 --preview  # + PNG 12 frame untuk dicek

Input : data/landmarks/<clip>.npz  (cache hasil python -m bisindo.extract)
Output: exports/skeleton/label_10.json  (+ label_10_preview.png dengan --preview)

Format JSON:
{
  "phraseId": "label_10", "text": "Terima kasih", "clip": "...",
  "fps": 30, "durationMs": 1967, "width": 960, "height": 540,
  "mirrored": true,            # x sudah dibalik (x' = 1 - x): tampil seperti cermin di layar kiosk
  "handSide": "anatomical",    # "right"/"left" = tangan kanan/kiri PENANDA TANGAN, bukan sisi layar
  "posePoints": [0, 11, 12, 13, 14, 15, 16],
  "poseNames": ["nose", "l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_wrist", "r_wrist"],
  "frames": [ { "t": 0, "pose": [[x,y] x7] | null,
                "hands": { "right": [[x,y] x21] | null, "left": [[x,y] x21] | null } } ]
}
Koordinat ternormalisasi 0..1 (bisa sedikit di luar rentang di tepi gambar).
Karena sudah di-mirror, tangan kanan penanda tangan tampil di sisi kanan layar.

Sisi tangan TIDAK diambil dari label handedness MediaPipe (label itu bergantung pada mirror dan
kadang tertukar). Sisi ditentukan seperti model: tiap tangan dipasangkan ke pergelangan pose
terdekat (features.canonicalize; 16 = kanan, 15 = kiri).

Tidak ada piksel / wajah yang diekspor, hanya titik kerangka.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR / "src"))  # supaya jalan walau paket bisindo belum di-install

from bisindo.config import load_config, resolve  # noqa: E402
from bisindo.features import canonicalize  # noqa: E402
from bisindo.schema import load_npz  # noqa: E402

POSE_POINTS = [0, 11, 12, 13, 14, 15, 16]  # hidung, bahu, siku, pergelangan (sama dengan model)
POSE_NAMES = ["nose", "l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_wrist", "r_wrist"]
SIDES = ("right", "left")  # canonicalize: slot 0 = tangan kanan penanda tangan, slot 1 = kiri


def hand_ratio(a: dict) -> float:
    """Proporsi frame yang punya minimal 1 tangan terdeteksi."""
    m = np.asarray(a["hand_mask"])
    return float(m.any(1).mean()) if len(m) else 0.0


def pick_best_clip(files: list[Path]) -> Path:
    """Pilih klip dengan deteksi tangan paling stabil (paling sedikit frame hilang)."""
    scored = []
    for f in files:
        a = load_npz(f)
        two_hand = float(np.asarray(a["hand_mask"]).all(1).mean())
        scored.append((hand_ratio(a), two_hand, f))
    scored.sort(key=lambda s: (s[0], s[1]), reverse=True)
    for r, two, f in scored[:5]:
        print(f"  kandidat {f.stem}: tangan {r:.0%} frame, dua tangan {two:.0%}")
    return scored[0][2]


def crop_to_signing(hmask: np.ndarray, pad: int = 4) -> tuple[int, int]:
    """Potong bagian awal/akhir saat tangan belum/tidak terlihat (tangan istirahat di luar frame)."""
    anyh = np.asarray(hmask).any(1)
    if not anyh.any():
        return 0, len(anyh)
    idx = np.flatnonzero(anyh)
    return max(int(idx[0]) - pad, 0), min(int(idx[-1]) + 1 + pad, len(anyh))


def smooth(x: np.ndarray, mask: np.ndarray, w: int = 3) -> np.ndarray:
    """Rata-rata bergerak sepanjang waktu, hanya di frame yang valid, agar animasi tidak gemetar."""
    if w <= 1 or len(x) < w:
        return x
    out = x.copy()
    half = w // 2
    for t in range(len(x)):
        lo, hi = max(0, t - half), min(len(x), t + half + 1)
        sel = mask[lo:hi]
        if mask[t] and sel.sum() > 1:
            out[t] = x[lo:hi][sel].mean(0)
    return out


def r4(v) -> list:
    return np.round(np.asarray(v, dtype=np.float64), 4).tolist()


def build_frames(a: dict) -> list[dict]:
    """Raw arrays (schema) -> frame list dengan sisi tangan anatomis dan x yang sudah di-mirror."""
    c = canonicalize(a, POSE_POINTS)  # x dalam satuan tinggi gambar, un-mirrored, slot 0 = kanan
    aspect = float(a["width"]) / float(a["height"]) if float(a["height"]) > 0 else 16 / 9
    hands = c["hands"][..., :2].copy()   # [F,2,21,2]
    hmask = c["hmask"]                   # [F,2]
    pose = c["pose"].copy()              # [F,7,2], urutan POSE_POINTS, label anatomis
    pmask = c["pmask"]
    hands[..., 0] /= aspect              # kembali ke 0..1 gambar
    pose[..., 0] /= aspect
    hands[..., 0] = 1.0 - hands[..., 0]  # mirror untuk tampilan (label tetap anatomis)
    pose[..., 0] = 1.0 - pose[..., 0]

    s, e = crop_to_signing(hmask)
    t_ms = np.asarray(a["t_ms"])[s:e]
    hands, hmask, pose, pmask = hands[s:e], hmask[s:e], pose[s:e], pmask[s:e]
    for j in range(2):  # smoothing per sisi anatomis, bukan per slot detektor
        hands[:, j] = smooth(hands[:, j], hmask[:, j])
    pose = smooth(pose, pmask)

    frames = []
    for i in range(len(t_ms)):
        frames.append({
            "t": int(round(float(t_ms[i] - t_ms[0]))),
            "pose": r4(pose[i]) if pmask[i] else None,
            "hands": {side: (r4(hands[i, j]) if hmask[i, j] else None) for j, side in enumerate(SIDES)},
        })
    return frames


def export(npz: Path, label: int, text: str, out_dir: Path) -> Path:
    a = load_npz(npz)
    frames = build_frames(a)
    dur = frames[-1]["t"] if frames else 0
    fps = round((len(frames) - 1) / (dur / 1000), 1) if dur > 0 else 30
    data = {
        "phraseId": f"label_{label:02d}",
        "text": text,
        "clip": npz.stem,
        "source": "WL-BISINDO (landmark MediaPipe, tanpa piksel)",
        "fps": fps,
        "durationMs": dur,
        "width": int(a["width"]),
        "height": int(a["height"]),
        "mirrored": True,
        "handSide": "anatomical",
        "posePoints": POSE_POINTS,
        "poseNames": POSE_NAMES,
        "frames": frames,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"label_{label:02d}.json"
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_r = sum(f["hands"]["right"] is not None for f in frames)
    n_l = sum(f["hands"]["left"] is not None for f in frames)
    print(f"OK {out}  ({len(frames)} frame, {dur} ms, {out.stat().st_size / 1024:.1f} KB, "
          f"kanan {n_r} frame, kiri {n_l} frame)")
    return out


# --------------------------------------------------------------------------- preview
HAND_EDGES = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8), (5, 9), (9, 10), (10, 11),
              (11, 12), (9, 13), (13, 14), (14, 15), (15, 16), (13, 17), (17, 18), (18, 19), (19, 20), (0, 17)]
POSE_EDGES = [(1, 2), (1, 3), (3, 5), (2, 4), (4, 6)]  # indeks ke POSE_NAMES
COLORS = {"right": (0, 110, 230), "left": (200, 90, 0)}  # BGR: kanan = oranye, kiri = biru


def render_preview(data: dict, out: Path, n: int = 12, tile: tuple[int, int] = (320, 180)) -> Path:
    """Grid n frame. Data sudah di-mirror, jadi digambar apa adanya (tanpa flip tambahan)."""
    import cv2

    W, H = tile
    frames = data["frames"]
    P = lambda p: (int(np.clip(p[0], 0, 1) * (W - 1)), int(np.clip(p[1], 0, 1) * (H - 1)))  # noqa: E731
    tiles = []
    for i in np.linspace(0, len(frames) - 1, n).round().astype(int):
        f = frames[i]
        img = np.full((H, W, 3), 255, np.uint8)
        if f["pose"]:
            for a, b in POSE_EDGES:
                cv2.line(img, P(f["pose"][a]), P(f["pose"][b]), (130, 130, 130), 2)
            cv2.circle(img, P(f["pose"][0]), 6, (130, 130, 130), 2)
        for side, pts in f["hands"].items():
            if pts is None:
                continue
            for a, b in HAND_EDGES:
                cv2.line(img, P(pts[a]), P(pts[b]), COLORS[side], 1)
            x, y = P(pts[0])
            cv2.putText(img, "Kanan" if side == "right" else "Kiri", (x + 6, y + 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLORS[side], 1, cv2.LINE_AA)
        cv2.putText(img, f"{f['t']} ms", (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)
        cv2.rectangle(img, (0, 0), (W - 1, H - 1), (220, 220, 220), 1)
        tiles.append(img)
    cols = 4
    while len(tiles) % cols:
        tiles.append(np.full((H, W, 3), 255, np.uint8))
    sheet = np.vstack([np.hstack(tiles[r:r + cols]) for r in range(0, len(tiles), cols)])
    legend = np.full((28, sheet.shape[1], 3), 255, np.uint8)
    cv2.putText(legend, f"{data['text']} ({data['clip']})  |  mirrored: tampilan cermin  |", (8, 19),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
    x0 = 8 + cv2.getTextSize(f"{data['text']} ({data['clip']})  |  mirrored: tampilan cermin  |",
                             cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0][0] + 10
    cv2.putText(legend, "oranye = tangan KANAN", (x0, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLORS["right"], 1, cv2.LINE_AA)
    cv2.putText(legend, "biru = tangan KIRI", (x0 + 210, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLORS["left"], 1, cv2.LINE_AA)
    sheet = np.vstack([sheet, legend])
    cv2.imwrite(str(out), sheet)
    print(f"OK {out}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", type=int, default=10, help="nomor label WL-BISINDO (10 = Terima kasih)")
    ap.add_argument("--clip", help="nama klip tertentu, mis. signer2_label10_sample3 (default: pilih otomatis)")
    ap.add_argument("--out", default=str(ML_DIR / "exports" / "skeleton"))
    ap.add_argument("--preview", action="store_true", help="tulis juga label_XX_preview.png untuk dicek")
    args = ap.parse_args()

    cfg = load_config()
    lm_dir = resolve(cfg, "data_dir") / "landmarks"
    label_map = json.loads((ML_DIR / "artifacts" / "label_map.json").read_text(encoding="utf-8"))
    text = label_map.get(str(args.label), {}).get("text", f"label_{args.label:02d}")

    if args.clip:
        npz = lm_dir / f"{args.clip}.npz"
        if not npz.exists():
            sys.exit(f"Tidak ditemukan: {npz}")
    else:
        files = sorted(lm_dir.glob(f"signer*_label{args.label}_sample*.npz"))
        if not files:
            sys.exit(f"Tidak ada cache untuk label {args.label} di {lm_dir}. Jalankan dulu: python -m bisindo.extract")
        print(f"Label {args.label} = '{text}', {len(files)} klip ditemukan")
        npz = pick_best_clip(files)

    out = export(npz, args.label, text, Path(args.out))
    if args.preview:
        data = json.loads(out.read_text(encoding="utf-8"))
        render_preview(data, out.with_name(out.stem + "_preview.png"))


if __name__ == "__main__":
    main()
