"""Score landmark clips with a deployed artifacts dir and report accuracy vs. the filename label.

    python scripts/eval_clips.py "data/landmarks/signer[5-8]_label10_*.npz" [--artifacts artifacts]
"""
from __future__ import annotations

import argparse
import glob
from collections import Counter
from pathlib import Path

from bisindo.inventory import parse_filename
from bisindo.predict import DEFAULT_ARTIFACTS, Predictor
from bisindo.schema import load_npz


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pattern", help="glob of .npz landmark files named signerX_labelY_sampleZ.npz")
    ap.add_argument("--artifacts", default=str(DEFAULT_ARTIFACTS))
    args = ap.parse_args()
    p = Predictor(args.artifacts)
    files = sorted(glob.glob(args.pattern))
    if not files:
        raise SystemExit(f"no files match {args.pattern}")
    top1, actions = 0, Counter()
    for f in files:
        meta = parse_filename(Path(f).stem + ".mp4")
        r = p.predict_arrays(load_npz(Path(f)))
        want = f"label_{meta['label']:02d}"
        hit = bool(r["topK"]) and r["topK"][0]["phraseId"] == want
        top1 += hit
        ok_action = r["action"] if r["phraseId"] in (want, None) else "WRONG_" + r["action"]
        actions[ok_action] += 1
        print(f"{Path(f).stem:28s} {'OK ' if hit else 'BAD'} action={r['action']:7s} conf={r['confidence']:.3f} "
              f"top={[(t['label'], t['confidence']) for t in r['topK']]}")
    print(f"\ntop1 {top1}/{len(files)} = {top1 / len(files):.3f}   actions: {dict(actions)}")


if __name__ == "__main__":
    main()
