"""Live webcam demo: webcam -> MediaPipe -> auto-capture -> model -> text on screen.

Usage (from ml/):
    .venv\\Scripts\\python.exe scripts\\live_demo.py                      # free signing
    .venv\\Scripts\\python.exe scripts\\live_demo.py --target 10          # test one word, with sign guide
    .venv\\Scripts\\python.exe scripts\\live_demo.py --target 0 --record 5   # record own data as signer 5

Keys: q = quit, r = reset to IDLE, n / p = next / previous target word, g = sign guide on/off,
      x = delete the last recorded clip (record mode).

Every capture is logged to runs/live/<time>.jsonl (result, topK, debug, target). Landmarks are only
saved in --record mode: data/landmarks/signer<S>_label<L>_sample<N>.npz + a row in data/manifest_own.csv,
so the clips can be used for training (bisindo.dataset reads manifest_own.csv). No video pixels are stored.

Frames are fed to MediaPipe un-mirrored (like the dataset); only the preview is mirrored.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR / "src"))

from bisindo.config import load_config, resolve  # noqa: E402
from bisindo.extract import Extractor  # noqa: E402
from bisindo.predict import Predictor  # noqa: E402
from bisindo.schema import empty_arrays  # noqa: E402
from bisindo.visualize import draw  # noqa: E402

MANIFEST_OWN = "manifest_own.csv"
MANIFEST_COLS = ["clip_id", "path", "signer", "label", "sample", "fps", "frames", "width", "height",
                 "duration_s", "readable"]
FIRST_OWN_SIGNER = 5  # WL-BISINDO uses signers 0-4
# Framing of the WL-BISINDO videos, in frame-HEIGHT units (q05..q95 over 200 clips): shoulder width
# 0.26-0.37, shoulder line y 0.48-0.65. The live check allows a margin around that.
FRAME_SHOULDER_W = (0.22, 0.42)
FRAME_SHOULDER_Y = (0.40, 0.72)


def play_audio(path) -> None:
    """Play a WAV without blocking the camera loop (Windows only; silently skipped elsewhere)."""
    try:
        import winsound
        winsound.PlaySound(str(path), winsound.SND_FILENAME | winsound.SND_ASYNC)
    except (ImportError, RuntimeError):
        pass


ACTION_BG = {"accept": (40, 140, 40), "confirm": (0, 110, 200), "reject": (40, 40, 200)}  # BGR


def draw_label(img, text: str, org, bg, scale: float = 1.0, thick: int = 2) -> None:
    """White text on a solid box so it stays readable on any background."""
    font = cv2.FONT_HERSHEY_SIMPLEX
    (tw, th), base = cv2.getTextSize(text, font, scale, thick)
    x, y = org
    pad = int(10 * scale)
    cv2.rectangle(img, (x - pad, y - th - pad), (x + tw + pad, y + base + pad), bg, -1)
    cv2.putText(img, text, (x, y), font, scale, (255, 255, 255), thick, cv2.LINE_AA)


def raised_hands(a: dict, aspect: float, rest_y: float) -> np.ndarray:
    """Mask of detected hands in frame 0 that are not hanging at rest (same rule as features.rest_mask_y)."""
    m = a["hand_mask"][0].copy()
    if not a["pose_mask"][0]:
        return m
    ls, rs = a["pose"][0, 11], a["pose"][0, 12]
    width = abs(ls[0] - rs[0]) * aspect
    if width < 1e-3:
        return m
    shoulder_y = (ls[1] + rs[1]) / 2
    for j in range(2):
        if m[j] and (a["hands"][0, j, 0, 1] - shoulder_y) / width > rest_y:
            m[j] = False
    return m


def framing_status(a: dict, aspect: float) -> tuple[bool, str]:
    """Is the signer framed like the training videos? (shoulders visible, distance, height)."""
    if not a["pose_mask"][0]:
        return False, "Badan tidak terlihat - mundur sedikit"
    ls, rs = a["pose"][0, 11], a["pose"][0, 12]
    if min(ls[3], rs[3]) < 0.5 or not (0 < ls[0] < 1 and 0 < rs[0] < 1):
        return False, "Kedua bahu harus terlihat"
    w = abs(ls[0] - rs[0]) * aspect
    y = (ls[1] + rs[1]) / 2
    if w > FRAME_SHOULDER_W[1]:
        return False, "Terlalu dekat - mundur"
    if w < FRAME_SHOULDER_W[0]:
        return False, "Terlalu jauh - maju"
    if y < FRAME_SHOULDER_Y[0]:
        return False, "Kamera terlalu rendah / badan terlalu tinggi"
    if y > FRAME_SHOULDER_Y[1]:
        return False, "Kamera terlalu tinggi / badan terlalu rendah"
    return True, "Posisi OK"


class AutoCapture:
    """Auto-capture state machine (PRD §9): debounce, pre-roll, flicker grace, still / hand-lost / timeout stop."""

    def __init__(self, c: dict):
        self.c = c
        self.reset()

    def reset(self):
        self.state = "IDLE"
        self.t_detect = self.t_rec = self.t_lost = self.t_still = None
        self.buf: list[int] = []
        self.prev = None
        self.motion: list[float] = []

    def step(self, t: float, has_hand: bool, pts: np.ndarray | None, idx: int) -> str | None:
        """Returns 'process' or 'discard' when a recording ends."""
        c = self.c
        if self.state == "IDLE":
            if has_hand:
                self.state, self.t_detect, self.t_last_hand, self.buf = "HAND_DETECTED", t, t, [idx]
            return None
        if self.state == "HAND_DETECTED":
            if not has_hand:
                # tolerate a short detector flicker; a hand really gone = false start
                if t - self.t_last_hand > c.get("detect_grace_ms", 150):
                    self.reset()
                return None
            self.t_last_hand = t
            self.buf.append(idx)  # pre-roll: debounce frames belong to the sign
            if t - self.t_detect >= c["hand_stable_ms"]:
                self.state, self.t_rec = "RECORDING", t
            return None
        self.buf.append(idx)
        if has_hand:
            self.t_lost = None
            if self.prev is not None and pts is not None and self.prev.shape == pts.shape:
                self.motion.append(float(np.linalg.norm(pts - self.prev, axis=-1).mean()))
                self.motion = self.motion[-c["motion_window_frames"]:]
            self.prev = pts
            avg = np.mean(self.motion) if self.motion else 1.0
            if avg < c["motion_threshold"]:
                self.t_still = self.t_still or t
            else:
                self.t_still = None
        else:
            self.t_lost = self.t_lost or t
        dur = t - self.t_rec
        stop = (
            (self.t_still is not None and t - self.t_still >= c["still_hold_ms"])
            or (self.t_lost is not None and t - self.t_lost > c["hand_lost_ms"])
            or dur >= c["max_record_ms"]
        )
        if stop:
            # from the first detected hand; the hand-lost wait is not part of the gesture
            effective = (self.t_lost if self.t_lost is not None else t) - self.t_detect
            return "process" if effective >= c["min_record_ms"] else "discard"
        return None


# --------------------------------------------------------------------------- sign guide
HAND_EDGES = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8), (5, 9), (9, 10), (10, 11),
              (11, 12), (9, 13), (13, 14), (14, 15), (15, 16), (13, 17), (17, 18), (18, 19), (19, 20), (0, 17)]
POSE_EDGES = [(1, 2), (1, 3), (3, 5), (2, 4), (4, 6)]
GUIDE_COLORS = {"right": (0, 110, 230), "left": (200, 90, 0)}


class SignGuide:
    """Loops the reference skeleton (exports/skeleton/label_XX.json, already mirrored) for the target word."""

    def __init__(self, skel_dir: Path):
        self.dir = skel_dir
        self.cache: dict[int, dict | None] = {}

    def get(self, label: int) -> dict | None:
        if label not in self.cache:
            p = self.dir / f"label_{label:02d}.json"
            self.cache[label] = json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
        return self.cache[label]

    def render(self, label: int, t_s: float, size: tuple[int, int]) -> np.ndarray:
        W, H = size
        img = np.full((H, W, 3), 245, np.uint8)
        d = self.get(label)
        if not d or not d["frames"]:
            cv2.putText(img, "contoh tidak ada", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1, cv2.LINE_AA)
            return img
        period = d["durationMs"] + 800  # short pause between loops
        t = (t_s * 1000) % period
        frames = d["frames"]
        f = frames[min(np.searchsorted([x["t"] for x in frames], t), len(frames) - 1)]
        # source aspect -> fit into the panel
        sw, sh = d["width"], d["height"]
        s = min(W / sw, H / sh)
        ox, oy = (W - sw * s) / 2, (H - sh * s) / 2
        P = lambda p: (int(ox + p[0] * sw * s), int(oy + p[1] * sh * s))  # noqa: E731
        if f["pose"]:
            for a, b in POSE_EDGES:
                cv2.line(img, P(f["pose"][a]), P(f["pose"][b]), (130, 130, 130), 3)
            cv2.circle(img, P(f["pose"][0]), 10, (130, 130, 130), 2)
        for side, pts in f["hands"].items():
            if pts is None:
                continue
            for a, b in HAND_EDGES:
                cv2.line(img, P(pts[a]), P(pts[b]), GUIDE_COLORS[side], 2)
        cv2.putText(img, "CONTOH (cermin)", (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (60, 60, 60), 1, cv2.LINE_AA)
        if t > d["durationMs"]:
            cv2.putText(img, "ulang...", (8, H - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (60, 60, 60), 1, cv2.LINE_AA)
        return img


# --------------------------------------------------------------------------- recording
class Recorder:
    """Saves captured landmark sequences as training clips (record mode)."""

    def __init__(self, data_dir: Path, signer: int):
        if signer < FIRST_OWN_SIGNER:
            raise SystemExit(f"--record signer harus >= {FIRST_OWN_SIGNER} (0-4 dipakai WL-BISINDO)")
        self.signer = signer
        self.lm_dir = data_dir / "landmarks"
        self.lm_dir.mkdir(parents=True, exist_ok=True)
        self.manifest = data_dir / MANIFEST_OWN
        self.last: str | None = None

    def _rows(self) -> list[dict]:
        if not self.manifest.exists():
            return []
        with open(self.manifest, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def _write(self, rows: list[dict]) -> None:
        with open(self.manifest, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=MANIFEST_COLS)
            w.writeheader()
            w.writerows(rows)

    def count(self, label: int) -> int:
        return sum(1 for r in self._rows() if int(r["signer"]) == self.signer and int(r["label"]) == label)

    def save(self, seq_a: dict, label: int) -> str:
        rows = self._rows()
        used = {int(r["sample"]) for r in rows if int(r["signer"]) == self.signer and int(r["label"]) == label}
        sample = 1
        while sample in used or (self.lm_dir / f"signer{self.signer}_label{label}_sample{sample}.npz").exists():
            sample += 1
        clip = f"signer{self.signer}_label{label}_sample{sample}"
        np.savez_compressed(self.lm_dir / f"{clip}.npz", **seq_a)
        t = np.asarray(seq_a["t_ms"], np.float64)
        dur = (t[-1] - t[0]) / 1000 if len(t) > 1 else 0.0
        rows.append({"clip_id": clip, "path": "live", "signer": self.signer, "label": label, "sample": sample,
                     "fps": round((len(t) - 1) / dur, 2) if dur > 0 else 0, "frames": len(t),
                     "width": int(seq_a["width"]), "height": int(seq_a["height"]),
                     "duration_s": round(dur, 3), "readable": True})
        self._write(rows)
        self.last = clip
        return clip

    def delete_last(self) -> str | None:
        if not self.last:
            return None
        clip, self.last = self.last, None
        (self.lm_dir / f"{clip}.npz").unlink(missing_ok=True)
        self._write([r for r in self._rows() if r["clip_id"] != clip])
        return clip


def summarize_log(entries: list[dict]) -> str:
    rows = [e for e in entries if e.get("target") is not None]
    if not rows:
        return "tidak ada percobaan dengan target"
    lines = [f"{'target':16s} n  benar  accept  confirm  reject  conf(avg)"]
    by: dict[str, list[dict]] = {}
    for e in rows:
        by.setdefault(e["target_text"], []).append(e)
    for k, es in sorted(by.items()):
        n = len(es)
        ok = sum(e["top1_correct"] for e in es)
        acts = [e["action"] for e in es]
        lines.append(f"{k:16s} {n:<2d} {ok:>5d}  {acts.count('accept'):>6d}  {acts.count('confirm'):>7d}  "
                     f"{acts.count('reject'):>6d}  {np.mean([e['confidence'] for e in es]):.2f}")
    n = len(rows)
    lines.append(f"TOTAL {n}: top1 benar {sum(e['top1_correct'] for e in rows) / n:.0%}, "
                 f"accept benar {sum(e['action'] == 'accept' and e['top1_correct'] for e in rows) / n:.0%}")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--no-audio", action="store_true", help="do not speak recognized words")
    ap.add_argument("--target", type=int, help="label to practise / test (0-31); enables the sign guide")
    ap.add_argument("--record", type=int, metavar="SIGNER", help=f"save captures as training clips for this signer (>= {FIRST_OWN_SIGNER})")
    ap.add_argument("--artifacts", default=str(ML_DIR / "artifacts"))
    ap.add_argument("--log", help="JSONL log path (default runs/live/<time>.jsonl)")
    args = ap.parse_args()
    cfg = load_config()
    cap_cfg = cfg["capture"]
    predictor = Predictor(args.artifacts)
    vocab = predictor.labels
    texts = {l: predictor.label_map.get(str(l), {}).get("text", f"label_{l:02d}") for l in vocab}
    if args.record is not None and args.target is None:
        args.target = vocab[0]
    target = args.target
    if target is not None and target not in vocab:
        raise SystemExit(f"--target {target} bukan label model ({vocab[0]}..{vocab[-1]})")
    recorder = Recorder(resolve(cfg, "data_dir"), args.record) if args.record is not None else None
    guide = SignGuide(ML_DIR / "exports" / "skeleton")
    show_guide = target is not None
    log_path = Path(args.log) if args.log else resolve(cfg, "runs_dir") / "live" / f"{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []
    print("log:", log_path)

    cam = cv2.VideoCapture(args.camera)
    ex = Extractor(cfg)
    ac = AutoCapture(cap_cfg)
    frames_a: list[dict] = []
    result, result_t, note, note_t = None, 0.0, "", 0.0
    t0 = time.time()
    fps_t, fps_n, fps = time.time(), 0, 0.0
    while True:
        ok, bgr = cam.read()
        if not ok:
            break
        h, w = bgr.shape[:2]
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        t_ms = int((time.time() - t0) * 1000)
        a = empty_arrays(1)
        ex.process_frame(rgb, t_ms, a, 0)
        a["t_ms"][0] = t_ms
        frames_a.append(a)
        active = raised_hands(a, w / h, cfg["features"]["rest_mask_y"])  # resting hands don't count
        has = bool(active.any())
        pts = a["hands"][0][active][..., :2].reshape(-1, 2) if has else None
        ev = ac.step(t_ms, has, pts, len(frames_a) - 1)
        if ev == "process":
            idx = ac.buf
            seq_a = {k: np.concatenate([frames_a[i][k] for i in idx]) for k in frames_a[0]}
            seq_a.update(width=np.int32(w), height=np.int32(h), mirrored=np.bool_(False))
            tq = time.time()
            result = predictor.predict_arrays(seq_a)
            result["latency_ms"] = int((time.time() - tq) * 1000)
            dur_ms = float(seq_a["t_ms"][-1] - seq_a["t_ms"][0])
            top1 = result["topK"][0]["phraseId"] if result["topK"] else None
            entry = {
                "time": time.strftime("%Y-%m-%dT%H:%M:%S"), "target": target,
                "target_text": texts.get(target) if target is not None else None,
                "phraseId": result["phraseId"], "label": result["label"], "confidence": result["confidence"],
                "action": result["action"], "reason": result["reason"], "topK": result["topK"],
                "debug": result["debug"], "latency_ms": result["latency_ms"], "frames": len(idx),
                "duration_ms": round(dur_ms), "fps": round((len(idx) - 1) / (dur_ms / 1000), 1) if dur_ms > 0 else None,
                "top1_correct": target is not None and top1 == f"label_{target:02d}",
                "clip": None, "artifacts": Path(args.artifacts).name,
            }
            if recorder is not None:
                entry["clip"] = recorder.save(seq_a, target)
                note, note_t = f"disimpan {entry['clip']} (x = hapus)", time.time()
            entries.append(entry)
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            print(json.dumps({k: entry[k] for k in ("target_text", "label", "confidence", "action", "reason",
                                                    "frames", "fps", "latency_ms")}, ensure_ascii=False),
                  [(t["label"], t["confidence"]) for t in result["topK"]], result["debug"])
            result_t = time.time()
            if not args.no_audio and result["action"] in ("accept", "confirm") and result.get("audio"):
                play_audio(predictor.audio_dir.parent / result["audio"])
            ac.reset()
            frames_a = []
        elif ev == "discard":
            ac.reset()
            frames_a = []
        if ac.state == "IDLE" and len(frames_a) > 30:
            frames_a = frames_a[-1:]  # keep memory bounded; buffer is discarded between captures
            ac.buf = []

        fps_n += 1
        if time.time() - fps_t >= 1.0:
            fps, fps_n, fps_t = fps_n / (time.time() - fps_t), 0, time.time()

        view = cv2.flip(draw(rgb, a, 0), 1)
        scale = max(0.6, w / 900)
        color = (0, 0, 255) if ac.state == "RECORDING" else (200, 200, 200)
        if ac.state == "RECORDING":
            cv2.rectangle(view, (2, 2), (w - 3, h - 3), color, 6)
        framed, fmsg = framing_status(a, w / h)
        draw_label(view, f"{ac.state}  {fps:.0f} fps", (15, h - 20),
                   (0, 0, 200) if ac.state == "RECORDING" else (60, 60, 60), scale, 1)
        draw_label(view, fmsg, (15, h - 20 - int(45 * scale)), (40, 140, 40) if framed else (0, 90, 220), scale, 1)
        if result and time.time() - result_t < cap_cfg["result_hold_ms"] / 1000:
            txt = f"{result['action'].upper()}: {result.get('label') or 'tidak dikenal'} ({result['confidence']:.0%})"
            draw_label(view, txt, (15, int(40 * scale)), ACTION_BG[result["action"]], scale, 2)
            if result["topK"]:
                alt = "  ".join(f"{t['label']} {t['confidence']:.0%}" for t in result["topK"])
                draw_label(view, alt, (15, int(85 * scale)), (60, 60, 60), scale * 0.7, 1)
        if note and time.time() - note_t < 3:
            draw_label(view, note, (15, int(125 * scale)), (90, 60, 0), scale * 0.7, 1)

        if target is not None:
            head = f"Target: {texts[target]} (label {target})"
            if recorder is not None:
                head += f"  | signer {recorder.signer}: {recorder.count(target)} klip"
            panel_w = int(h * 0.75)
            panel = guide.render(target, time.time() - t0, (panel_w, h)) if show_guide else np.full((h, panel_w, 3), 245, np.uint8)
            cv2.putText(panel, head[:40], (8, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
            cv2.putText(panel, "n/p ganti kata  g contoh  r reset  q keluar", (8, h - 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (60, 60, 60), 1, cv2.LINE_AA)
            if recorder is not None:
                cv2.putText(panel, f"signer {recorder.signer}: {recorder.count(target)} klip  (x hapus terakhir)", (8, 64),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 160), 1, cv2.LINE_AA)
            view = np.hstack([view, panel])
        cv2.imshow("BISINDO live demo", view)
        k = cv2.waitKey(1) & 0xFF
        if k == ord("q"):
            break
        if k == ord("r"):
            ac.reset()
            frames_a = []
        if k in (ord("n"), ord("p")) and target is not None:
            i = vocab.index(target) + (1 if k == ord("n") else -1)
            target = vocab[i % len(vocab)]
            ac.reset()
            frames_a, result = [], None
        if k == ord("g") and target is not None:
            show_guide = not show_guide
        if k == ord("x") and recorder is not None:
            gone = recorder.delete_last()
            if gone:
                entries = [e for e in entries if e.get("clip") != gone]
                note, note_t = f"dihapus {gone}", time.time()
    ex.close()
    cam.release()
    cv2.destroyAllWindows()
    print(summarize_log(entries))


if __name__ == "__main__":
    main()
