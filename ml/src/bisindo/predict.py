"""Model inference entry point (the only thing the backend needs to call).

    from bisindo.predict import Predictor
    p = Predictor()                      # loads ml/artifacts/ once (~0.5 s); reuse the instance
    result = p.predict_json(payload)     # payload = dict/JSON in the schema.Sequence format
    # -> {"phraseId": "label_10" | None, "label": "Terima kasih" | None, "confidence": 0.93,
    #     "action": "accept" | "confirm" | "reject", "audio": "audio/label_10.wav" | None,
    #     "reason": ..., "topK": [...], "debug": {...}}

`action` already applies the calibrated PRD §10 decision (accept >= 0.85, confirm 0.60–0.84, else reject)
including out-of-vocabulary rejection. `phraseId`/`label` are None when action == "reject".

CLI: python -m bisindo.predict data/landmarks/signer3_label5_sample2.npz [more.npz | seq.json ...]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort

from .calibrate import remap
from .config import ML_ROOT
from .evaluate import known_confidence, softmax
from .features import featurize
from .schema import Sequence, load_npz, sequence_to_arrays

DEFAULT_ARTIFACTS = ML_ROOT / "artifacts"
DEFAULT_MAX_FRAMES = 600


class Predictor:
    def __init__(self, artifacts_dir: str | Path = DEFAULT_ARTIFACTS, max_frames: int = DEFAULT_MAX_FRAMES):
        d = Path(artifacts_dir)
        self.fcfg = json.loads((d / "feature_config.json").read_text(encoding="utf-8"))
        self.info = json.loads((d / "model_info.json").read_text(encoding="utf-8"))
        self.th = json.loads((d / "thresholds.json").read_text(encoding="utf-8"))
        self.label_map = json.loads((d / "label_map.json").read_text(encoding="utf-8"))
        self.version = json.loads((d / "version.json").read_text(encoding="utf-8")).get("version")
        self.C = np.load(d / "centroids.npy")  # [M, K, E]
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        self.sess = ort.InferenceSession(str(d / "model.onnx"), opts, providers=["CPUExecutionProvider"])
        self.K = self.info["n_known"]
        self.labels = self.info["known_labels"]
        self.max_frames = max_frames
        # spoken word per phraseId (scripts/generate_audio.ps1); optional
        self.audio_dir = d / "audio"
        idx = self.audio_dir / "index.json"
        files = json.loads(idx.read_text(encoding="utf-8-sig"))["files"] if idx.exists() else {}
        self.audio = {pid: f"audio/{v['file']}" for pid, v in files.items() if (self.audio_dir / v["file"]).exists()}

    # ----------------------------------------------------------------------------------- metadata
    def vocabulary(self) -> list[dict]:
        """Words the model can recognize (demo vocabulary), in class order."""
        return [{"phraseId": self.label_map[str(l)]["phraseId"], "text": self.label_map[str(l)]["text"],
                 "english": self.label_map[str(l)].get("english")} for l in self.labels]

    # ----------------------------------------------------------------------------------- inference
    def _entry(self, idx: int, conf: float) -> dict:
        lbl = self.labels[idx]
        m = self.label_map.get(str(lbl), {"phraseId": f"label_{lbl:02d}", "text": f"label_{lbl:02d}"})
        return {"phraseId": m["phraseId"], "label": m["text"], "confidence": round(float(conf), 4)}

    def predict_arrays(self, a: dict, top_k: int = 3) -> dict:
        n_frames = len(a["t_ms"])
        if n_frames > self.max_frames:
            raise ValueError(f"sequence has {n_frames} frames (max {self.max_frames})")
        n_hand_frames = int(np.asarray(a["hand_mask"]).any(1).sum()) if n_frames else 0
        if n_hand_frames < self.fcfg["min_frames_for_inference"]:
            return {"phraseId": None, "label": None, "confidence": 0.0, "action": "reject", "audio": None,
                    "reason": "too_short", "topK": [], "debug": {}}
        x = featurize(a, self.fcfg)[None]
        logits, emb = self.sess.run(None, {"x": x})
        probs = softmax(logits, self.th["temperature"])
        pred, conf = known_confidence(probs, self.K)
        raw_conf = float(conf[0])
        best = int(probs[0, : self.K].argmax())
        # per-member cosine similarity to the predicted class centroid, averaged
        e = emb[0] / (np.linalg.norm(emb[0], axis=-1, keepdims=True) + 1e-8)   # [M,E]
        sim = float((e * self.C[:, best]).sum(-1).mean())
        reason = None
        if pred[0] == -2:
            reason = "none_class"
        if sim < self.th["centroid_sim_min"]:
            raw_conf = min(raw_conf, self.th["raw_confirm"] * 0.99)
            reason = reason or "far_from_centroid"
        kc = float(remap(raw_conf, self.th["raw_confirm"], self.th["raw_accept"],
                         self.th["kiosk_confirm"], self.th["kiosk_accept"]))
        action = "accept" if kc >= self.th["kiosk_accept"] else "confirm" if kc >= self.th["kiosk_confirm"] else "reject"
        order = np.argsort(-probs[0, : self.K])[:top_k]
        top = [self._entry(int(i), float(remap(probs[0, i], self.th["raw_confirm"], self.th["raw_accept"],
                                                 self.th["kiosk_confirm"], self.th["kiosk_accept"])))
               for i in order]
        head = self._entry(best, kc)
        return {
            "phraseId": head["phraseId"] if action != "reject" else None,
            "label": head["label"] if action != "reject" else None,
            "confidence": head["confidence"],
            "action": action,
            # WAV path relative to artifacts/ (e.g. "audio/label_10.wav"), None on reject / no audio
            "audio": self.audio.get(head["phraseId"]) if action != "reject" else None,
            "reason": reason,
            "topK": top,
            "debug": {"raw_confidence": round(raw_conf, 4), "centroid_sim": round(sim, 4),
                      "none_prob": round(float(probs[0, self.K]), 4) if probs.shape[1] > self.K else None},
        }

    def predict_sequence(self, seq: Sequence, top_k: int = 3) -> dict:
        return self.predict_arrays(sequence_to_arrays(seq), top_k)

    def predict_json(self, payload: dict[str, Any] | str | bytes, top_k: int = 3) -> dict:
        """Validate a JSON payload (schema.Sequence) and predict. Raises pydantic.ValidationError / ValueError."""
        seq = Sequence.model_validate_json(payload) if isinstance(payload, (str, bytes)) else Sequence.model_validate(payload)
        return self.predict_sequence(seq, top_k)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", help=".npz landmark cache or .json Sequence payload")
    ap.add_argument("--artifacts", default=str(DEFAULT_ARTIFACTS))
    args = ap.parse_args()
    p = Predictor(args.artifacts)
    print("vocabulary:", ", ".join(v["text"] for v in p.vocabulary()))
    for f in map(Path, args.files):
        r = p.predict_json(f.read_bytes()) if f.suffix == ".json" else p.predict_arrays(load_npz(f))
        print(f.stem, json.dumps({k: r[k] for k in ("phraseId", "label", "confidence", "action", "audio", "reason")}, ensure_ascii=False),
              "top:", [(t["label"], t["confidence"]) for t in r["topK"]])


if __name__ == "__main__":
    main()
