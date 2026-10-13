"""Write artifacts/MODEL_REPORT.md from run summaries and calibration (+ integration notes for other teams).

Usage: python -m bisindo.report --main demo_loso
"""
from __future__ import annotations

import argparse
import json

import numpy as np

from .compare import markdown, rows
from .config import load_config, resolve
from .evaluate import confusion, load_preds


def pct(v):
    return "-" if v is None else f"{100 * v:.1f}%"


def cov_line(name: str, g: dict | None) -> str | None:
    if not g:
        return None
    s = f"- {name}: accept {pct(g['accept'])}, confirm {pct(g['confirm'])}, reject {pct(g['reject'])}"
    if "accept_precision_known" in g:
        s += f" (accept precision {pct(g['accept_precision_known'])}, confirm precision {pct(g.get('confirm_precision_known'))})"
    return s


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--main", default="demo_loso")
    ap.add_argument("--runs", nargs="*", default=["dtw", "gru_base", "demo_loso"])
    args = ap.parse_args()
    cfg = load_config()
    runs = resolve(cfg, "runs_dir")
    art = resolve(cfg, "artifacts_dir")
    main_dir = runs / args.main
    summary = json.loads((main_dir / "summary.json").read_text(encoding="utf-8"))
    cal = json.loads((main_dir / "calibration" / "report.json").read_text(encoding="utf-8"))
    th = json.loads((art / "thresholds.json").read_text(encoding="utf-8"))
    lm = json.loads((art / "label_map.json").read_text(encoding="utf-8"))
    version = json.loads((art / "version.json").read_text(encoding="utf-8")) if (art / "version.json").exists() else {}
    preds, info = load_preds(main_dir)
    K = info["n_known"]
    known = info["known_labels"]
    name = lambda l: lm[str(l)]["text"]  # noqa: E731

    f1 = summary["test"]["closed"]["per_class_f1"]
    per_class = sorted(((name(known[int(c)]), v) for c, v in f1.items()), key=lambda kv: kv[1])
    cm = confusion(preds, K)
    np.fill_diagonal(cm, 0)
    pairs = sorted(((cm[i, j], i, j) for i in range(K) for j in range(K) if cm[i, j] > 0), reverse=True)[:5]
    cov = cal["coverage"]
    ex = cal.get("coverage_extra_signer", {})
    closed = summary["test"]["closed"]

    lines = [
        "# Model Report — BISINDO skeleton recognizer (WL-BISINDO)",
        "",
        f"Artifacts version: `{version.get('version', '-')}` · evaluation run: `{args.main}` · deployed model: `final` "
        "(all signers, 3-seed ensemble).",
        "",
        "## What the model does",
        "Input: MediaPipe Hand (2×21) + Pose landmarks per frame, no pixels. Output: one word of the demo vocabulary "
        "with a calibrated confidence and `accept / confirm / reject`, or `reject` for anything outside the vocabulary.",
        "",
        f"**Demo vocabulary ({K} words):** " + ", ".join(f"{name(l)} (`label_{l:02d}`)" for l in known),
        "",
        "Chosen for Puskesmas relevance and cross-signer reliability, avoiding pairs the 32-class model confused "
        "(Terima kasih/Kapan, Siang/Sore, Keluarga/Cari, Apa/Berangkat). The other 22 WL-BISINDO words are used as real "
        "\"bukan kosakata\" examples for the `none` class. Alur B (staff → video) can still show all 32 reference videos.",
        "",
        "## Evaluation (leave-one-signer-out on signers 1–4; signer 0 = extra unseen signer)",
        "",
        f"`{args.main}`: each fold is a 3-seed ensemble, like the deployed model. Six words "
        f"({', '.join(name(l) for l in info.get('unknown_holdout', []))}) were **never** used for training in any fold, "
        "so they measure rejection of truly unseen signs. They were picked because they resemble demo words.",
        "",
        f"- Known words, unseen signer: top-1 **{pct(closed['top1'])}**, macro-F1 {closed['macro_f1']:.3f}, "
        f"wrongly rejected as `none` {pct(closed.get('predicted_none_rate'))}",
        "- Per word F1: " + ", ".join(f"{n} {v:.2f}" for n, v in per_class),
    ]
    if pairs:
        lines.append("- Most confused (true → predicted, count): " + ", ".join(
            f"{name(known[i])}→{name(known[j])} ({n})" for n, i, j in pairs))
    lines += [
        "",
        "History (32-class runs are for comparison; different vocabulary size):",
        "",
        markdown(rows(args.runs)),
        "",
        "## Decisions (thresholds calibrated out-of-fold, unseen signers)",
        f"- Temperature {th['temperature']:.3f} · ECE {cal['ece_raw']:.3f} → {cal['ece_calibrated']:.3f}",
        f"- Raw thresholds: accept ≥ {th['raw_accept']}, confirm ≥ {th['raw_confirm']}, centroid cosine ≥ "
        f"{th['centroid_sim_min']:.3f}; remapped to the kiosk's {th['kiosk_accept']} / {th['kiosk_confirm']}.",
    ]
    for label, key in [("Demo words", "known"), ("Unseen words (never trained)", "unknown_word"),
                       ("Other non-demo words (unseen signer)", "negative_word"), ("Non-sign movement", "none")]:
        line = cov_line(label, cov.get(key))
        if line:
            lines.append(line)
    lines.append("  - In the deployed model all 22 non-demo WL-BISINDO words (incl. the 6 above) are trained as `none`, so "
                 "they behave like the \"other non-demo words\" row. The \"unseen words\" row is the estimate for signs "
                 "outside all 32 WL-BISINDO words.")
    lines.append(f"- Precision of accepted results, assuming {pct(cal.get('unknown_word_prior'))} of inputs are "
                 f"out-of-vocabulary signs: **{pct(cal.get('accept_precision_weighted'))}**")
    if ex:
        lines.append(cov_line("Extra signer 0 (demo words 0–11 only)", ex.get("known")))
    lines.append("- AUROC known vs " + ", ".join(f"{k.split('_vs_')[1]} {v:.3f}" for k, v in cal["open_set_auroc"].items()))

    lines += [
        "",
        "## Integration (for the backend / frontend teams)",
        "**Backend** — load once, call per capture:",
        "```python",
        "from bisindo.predict import Predictor",
        "p = Predictor()                 # ml/artifacts/",
        "r = p.predict_json(payload)     # dict or JSON str/bytes; raises pydantic.ValidationError / ValueError",
        "# r = {phraseId, label, confidence, action: accept|confirm|reject, reason, topK, debug}",
        "p.vocabulary()                  # the words the model recognizes",
        "```",
        "`action` already contains the calibrated PRD §10 decision (≥0.85 accept, 0.60–0.84 confirm, else reject) "
        "including out-of-vocabulary rejection; `phraseId`/`label` are null on reject. ~20–30 ms per call on CPU.",
        "",
        "**Payload** (`ml/src/bisindo/schema.py`): `{frames: [{t_ms, hands: [{landmarks: 21×[x,y,z], handedness, score}], "
        "pose: 33×[x,y,z,visibility] | null}], mirrored, width, height}` — MediaPipe HandLandmarker (numHands 2) + "
        "PoseLandmarker (lite) normalized image coordinates, same `.task` models as in `ml/mp_models/`.",
        "",
        "**Frontend capture rules** (otherwise accuracy drops; each was found in a browser test where headless Edge "
        "played dataset clips as the webcam, after which browser and Python pipelines agreed 26/26):",
        "- Send landmarks of the **un-mirrored** camera frame (`mirrored: false`); mirror only the preview.",
        "- Include pose landmarks (the model normalizes by shoulders). Send the real camera `width`/`height`.",
        "- Start the sequence at the **first detected hand**, including the 250 ms debounce (pre-roll).",
        "- During the debounce, tolerate a detector dropout of ~150 ms instead of treating it as a false start.",
        "- A hand hanging at rest (wrist more than 1.35 shoulder-widths below the shoulder line) must not count as "
        "\"still signing\"; otherwise the capture never sees the hand leave and stops late/badly.",
        "- Guard-rail numbers are in `ml/config/default.yaml` → `capture:`; `scripts/live_demo.py` is a reference "
        "implementation of the auto-capture state machine.",
    ]
    lines += [
        "",
        "## Limitations",
        "- Word-level WL-BISINDO vocabulary, not the full Puskesmas phrases of PRD §7.",
        "- 5 signers, one recording setup each; a real kiosk camera/lighting has not been tested with real people. "
        "Run the PRD §21 test (5 words × 10 tries) on the actual device before demo day.",
        "- Unseen out-of-vocabulary signs are the weakest point; the product must keep Konfirmasi/Coba Lagi/Panggil JBI.",
        "- Dataset license was not found in the provided files; confirm before public demo or reuse of videos (Alur B).",
        "",
        "## Framing",
        "\"Mengenali sejumlah isyarat BISINDO tingkat kata dari dataset publik WL-BISINDO, dievaluasi pada penanda tangan "
        "yang tidak pernah dilihat model.\"",
    ]
    (art / "MODEL_REPORT.md").write_text("\n".join(l for l in lines if l is not None), encoding="utf-8")
    print(art / "MODEL_REPORT.md")


if __name__ == "__main__":
    main()
