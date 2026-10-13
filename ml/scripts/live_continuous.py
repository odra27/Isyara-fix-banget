"""Live continuous signing: word after word, without lowering the hands in between.

Usage (from ml/):
    .venv\\Scripts\\python.exe scripts\\live_continuous.py [--camera 0] [--no-audio]

How to sign: raise your hands, sign a word, hold still ~0.6 s, sign the next word, ...
Hold still ~2 s or lower your hands to finish the sentence.

While signing, the model runs on the current segment every ~200 ms and shows a live guess
("membaca: ..."). That guess is only a hint. A word is committed when the short pause ends it,
predicted from the whole word segment (most accurate). Accepted words are spoken immediately,
'confirm' words are shown with "?" and not spoken, rejected words are dropped with a notice.

Keys: q = quit, u = undo last word, c = clear sentence, k = speak whole sentence, r = reset.
Each committed word and each finished sentence is logged to runs/live/cont_<time>.jsonl.
Timings are in config/default.yaml -> capture: (word_pause_ms, sentence_pause_ms, ...).
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from pathlib import Path

import cv2
import numpy as np

ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from bisindo.config import load_config, resolve  # noqa: E402
from bisindo.extract import Extractor  # noqa: E402
from bisindo.predict import Predictor  # noqa: E402
from bisindo.schema import empty_arrays  # noqa: E402
from bisindo.visualize import draw  # noqa: E402
from live_demo import ACTION_BG, draw_label, framing_status, raised_hands  # noqa: E402


class ContinuousCapture:
    """Segments a stream of frames into words (short still pause) and sentences (long pause / hands down).

    step() returns a list of events: ("word", frame_indices), ("discard",), ("sentence_end",).
    States: IDLE -> ARMING (debounce) -> WORD <-> PAUSE -> IDLE.
    """

    def __init__(self, c: dict):
        self.c = c
        self.reset()

    def reset(self):
        self.state = "IDLE"
        self.buf: list[int] = []
        self.recent: list[int] = []
        self.t_detect = self.t_seg = self.t_still = self.t_lost = self.t_last_hand = self.t_pause = None
        self.prev = None
        self.motion: list[float] = []
        self.sentence_open = False

    def _motion(self, pts) -> float:
        if self.prev is not None and pts is not None and self.prev.shape == pts.shape:
            self.motion.append(float(np.linalg.norm(pts - self.prev, axis=-1).mean()))
            self.motion = self.motion[-self.c["word_motion_window_frames"]:]
        self.prev = pts
        return float(np.mean(self.motion)) if self.motion else 1.0

    def _end_word(self, t_end: float):
        if t_end - self.t_seg >= self.c["min_word_ms"]:
            return ("word", list(self.buf))
        return ("discard",)

    def step(self, t: float, has_hand: bool, pts, idx: int) -> list[tuple]:
        c, ev = self.c, []
        self.recent = (self.recent + [idx])[-c["preroll_frames"]:]
        if self.state == "IDLE":
            if has_hand:
                self.state, self.t_detect, self.t_last_hand, self.buf = "ARMING", t, t, [idx]
                self.prev, self.motion = pts, []
            return ev
        if self.state == "ARMING":
            if not has_hand:
                if t - self.t_last_hand > c.get("detect_grace_ms", 150):
                    self.reset()  # false start, silently
                return ev
            self.t_last_hand = t
            self.buf.append(idx)
            self._motion(pts)
            if t - self.t_detect >= c["hand_stable_ms"]:
                self.state, self.t_seg, self.t_still, self.t_lost = "WORD", self.t_detect, None, None
                self.sentence_open = True
            return ev

        avg = None
        if has_hand:
            self.t_lost = None
            avg = self._motion(pts)
        else:
            self.t_lost = self.t_lost or t

        if self.state == "WORD":
            self.buf.append(idx)
            if avg is not None:
                self.t_still = (self.t_still or t) if avg < c["motion_threshold"] else None
            if self.t_lost is not None and t - self.t_lost > c["hand_lost_ms"]:
                ev += [self._end_word(self.t_lost), ("sentence_end",)]
                self.reset()
                return ev
            if self.t_still is not None and t - self.t_still >= c["word_pause_ms"]:
                ev.append(self._end_word(self.t_still))
                self.state, self.t_pause = "PAUSE", self.t_still
                return ev
            if t - self.t_seg >= c["max_word_ms"]:
                ev.append(self._end_word(t))
                self.t_seg, self.buf, self.t_still = t, [idx], None
            return ev

        # PAUSE: hands up and still, between words
        if self.t_lost is not None and t - self.t_lost > c["hand_lost_ms"]:
            if self.sentence_open:
                ev.append(("sentence_end",))
            self.reset()
            return ev
        if avg is not None and avg >= c["motion_threshold"]:
            self.state, self.t_seg, self.buf, self.t_still = "WORD", t, list(self.recent), None
            self.sentence_open = True
            return ev
        if self.sentence_open and t - self.t_pause >= c["sentence_pause_ms"]:
            ev.append(("sentence_end",))
            self.sentence_open = False
        return ev


def speak(paths: list[Path]) -> None:
    """Play WAVs one after another in a background thread (Windows only)."""
    def run():
        try:
            import winsound
            for p in paths:
                winsound.PlaySound(str(p), winsound.SND_FILENAME)
        except (ImportError, RuntimeError):
            pass
    threading.Thread(target=run, daemon=True).start()


def draw_chips(img, words: list[dict], y: int, scale: float) -> None:
    x = 15
    font = cv2.FONT_HERSHEY_SIMPLEX
    for w in words:
        txt = w["label"] + ("?" if w["action"] == "confirm" else "")
        draw_label(img, txt, (x, y), ACTION_BG[w["action"]], scale, 2)
        x += cv2.getTextSize(txt, font, scale, 2)[0][0] + int(30 * scale)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--artifacts", default=str(ML_DIR / "artifacts"))
    ap.add_argument("--log", help="JSONL log path (default runs/live/cont_<time>.jsonl)")
    args = ap.parse_args()
    cfg = load_config()
    cap_cfg = cfg["capture"]
    predictor = Predictor(args.artifacts)
    log_path = Path(args.log) if args.log else resolve(cfg, "runs_dir") / "live" / f"cont_{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    print("log:", log_path)

    def log(entry: dict) -> None:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def audio_path(w: dict):
        return predictor.audio_dir.parent / w["audio"] if w.get("audio") else None

    cam = cv2.VideoCapture(args.camera)
    ex = Extractor(cfg)
    cc = ContinuousCapture(cap_cfg)
    frames: dict[int, dict] = {}
    gi = 0
    words: list[dict] = []
    sentence_done, sentence_id = False, 0
    hint, hint_t = None, 0.0
    note, note_t = "", 0.0
    w = h = 0
    t0 = time.time()

    def seq_of(idx: list[int]) -> dict:
        s = {k: np.concatenate([frames[i][k] for i in idx]) for k in frames[idx[0]]}
        s.update(width=np.int32(w), height=np.int32(h), mirrored=np.bool_(False))
        return s

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
        frames[gi] = a
        active = raised_hands(a, w / h, cfg["features"]["rest_mask_y"])
        has = bool(active.any())
        pts = a["hands"][0][active][..., :2].reshape(-1, 2) if has else None

        for ev in cc.step(t_ms, has, pts, gi):
            if ev[0] == "word":
                if sentence_done:  # first word of a new sentence
                    words, sentence_done = [], False
                tq = time.time()
                r = predictor.predict_arrays(seq_of(ev[1]))
                lat = int((time.time() - tq) * 1000)
                entry = {"time": time.strftime("%Y-%m-%dT%H:%M:%S"), "type": "word", "sentence": sentence_id,
                         "label": r["label"], "phraseId": r["phraseId"], "confidence": r["confidence"],
                         "action": r["action"], "reason": r["reason"], "topK": r["topK"], "debug": r["debug"],
                         "frames": len(ev[1]), "latency_ms": lat}
                log(entry)
                print(json.dumps({k: entry[k] for k in ("label", "confidence", "action", "frames", "latency_ms")},
                                 ensure_ascii=False), [(t["label"], t["confidence"]) for t in r["topK"]])
                if r["action"] == "reject":
                    note, note_t = "kata tidak dikenali - ulangi kata itu", time.time()
                else:
                    words.append({"label": r["label"], "action": r["action"], "confidence": r["confidence"],
                                  "audio": r.get("audio")})
                    if r["action"] == "accept" and not args.no_audio and audio_path(words[-1]):
                        speak([audio_path(words[-1])])
                hint = None
            elif ev[0] == "sentence_end" and words and not sentence_done:
                sentence_done = True
                log({"time": time.strftime("%Y-%m-%dT%H:%M:%S"), "type": "sentence", "sentence": sentence_id,
                     "words": [x["label"] for x in words], "actions": [x["action"] for x in words]})
                print("KALIMAT:", " ".join(x["label"] + ("?" if x["action"] == "confirm" else "") for x in words))
                sentence_id += 1

        # live hint on the word being signed
        if cc.state == "WORD" and time.time() - hint_t >= cap_cfg["live_hint_ms"] / 1000:
            hint_t = time.time()
            idx = cc.buf
            if sum(bool(frames[i]["hand_mask"][0].any()) for i in idx) >= predictor.fcfg["min_frames_for_inference"]:
                hint = predictor.predict_arrays(seq_of(idx))
        if cc.state not in ("WORD",):
            hint = hint if cc.state == "ARMING" else None

        # keep only frames still needed (current word + pre-roll)
        keep = (cc.buf if cc.state in ("ARMING", "WORD") else []) + cc.recent + [gi]
        lo = min(keep)
        for k in [k for k in frames if k < lo]:
            del frames[k]
        gi += 1

        view = cv2.flip(draw(rgb, a, 0), 1)
        scale = max(0.6, w / 900)
        if cc.state == "WORD":
            cv2.rectangle(view, (2, 2), (w - 3, h - 3), (0, 0, 255), 6)
        status = {"IDLE": "Angkat tangan untuk mulai", "ARMING": "Siap...", "WORD": "Merekam kata...",
                  "PAUSE": "Lanjut kata berikutnya, atau diam 2 dtk / turunkan tangan untuk selesai"}[cc.state]
        draw_label(view, status, (15, h - 20), (0, 0, 200) if cc.state == "WORD" else (60, 60, 60), scale * 0.8, 1)
        framed, fmsg = framing_status(a, w / h)
        draw_label(view, fmsg, (15, h - 20 - int(40 * scale)), (40, 140, 40) if framed else (0, 90, 220), scale * 0.8, 1)
        if hint and hint["topK"]:
            t1 = hint["topK"][0]
            draw_label(view, f"membaca: {t1['label']} {t1['confidence']:.0%}", (15, int(40 * scale)), (90, 90, 90), scale * 0.8, 1)
        if words:
            draw_chips(view, words, int(95 * scale), scale)
        if sentence_done:
            draw_label(view, "Kalimat selesai  (k bacakan, c hapus)", (15, int(150 * scale)), (40, 100, 40), scale * 0.7, 1)
        if note and time.time() - note_t < 3:
            draw_label(view, note, (15, int(195 * scale)), (40, 40, 200), scale * 0.7, 1)
        cv2.imshow("BISINDO kontinu", view)

        k = cv2.waitKey(1) & 0xFF
        if k == ord("q"):
            break
        if k == ord("r"):
            cc.reset()
            words, sentence_done, hint = [], False, None
        if k == ord("u") and words:
            words.pop()
        if k == ord("c"):
            words, sentence_done = [], False
        if k == ord("k") and words and not args.no_audio:
            speak([p for p in (audio_path(x) for x in words) if p])
    ex.close()
    cam.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
