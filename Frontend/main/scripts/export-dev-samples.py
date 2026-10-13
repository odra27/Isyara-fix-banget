"""Ekspor beberapa klip landmark dataset (ml/data/landmarks/*.npz) ke public/dev-samples/*.json.

Dipakai SimulatorPanel (?dev=1) → "Putar contoh asli": frame diputar ke frameBus dengan timing asli,
jadi melewati auto-capture + backend + model yang sama dengan kamera. Hanya koordinat landmark,
tanpa piksel video.

Jalankan dari Frontend/main:
    ..\\..\\Backend\\.venv\\Scripts\\python.exe scripts\\export-dev-samples.py
"""
from __future__ import annotations

import json
from pathlib import Path

from bisindo.schema import arrays_to_sequence, load_npz

ROOT = Path(__file__).resolve().parents[1]
LANDMARKS = ROOT.parents[1] / "ml" / "data" / "landmarks"
OUT = ROOT / "public" / "dev-samples"
LABEL_MAP = json.loads((ROOT.parents[1] / "ml" / "artifacts" / "label_map.json").read_text(encoding="utf-8"))

# (clip, label) — klip dari signer berbeda supaya tidak hanya satu gaya tangan.
CLIPS = [
    ("signer0_label10_sample1", 10),
    ("signer2_label10_sample3", 10),
    ("signer4_label10_sample5", 10),
    ("signer1_label9_sample2", 9),
    ("signer3_label6_sample1", 6),
    ("signer2_label5_sample2", 5),
]


def r(v: float) -> float:
    return round(float(v), 5)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for clip, label in CLIPS:
        f = LANDMARKS / f"{clip}.npz"
        if not f.exists():
            print("lewati (tidak ada):", f.name)
            continue
        seq = arrays_to_sequence(load_npz(f))
        frames = [
            {
                "t_ms": r(fr.t_ms),
                "hands": [{"landmarks": [[r(x) for x in p] for p in h.landmarks], "handedness": h.handedness, "score": r(h.score)} for h in fr.hands],
                "pose": [[r(x) for x in p] for p in fr.pose] if fr.pose is not None else None,
            }
            for fr in seq.frames
        ]
        text = LABEL_MAP[str(label)]["text"]
        (OUT / f"{clip}.json").write_text(
            json.dumps({"clip": clip, "text": text, "width": seq.width, "height": seq.height, "frames": frames}, separators=(",", ":")),
            encoding="utf-8",
        )
        index.append({"clip": clip, "text": text, "file": f"{clip}.json"})
        print("ok", clip, text, len(frames), "frame")
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
