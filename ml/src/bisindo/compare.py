"""Compare LOSO runs side by side.

Usage: python -m bisindo.compare [run names...]
"""
from __future__ import annotations

import json
import sys

from .config import load_config, resolve


def rows(names: list[str] | None = None) -> list[dict]:
    runs = resolve(load_config(), "runs_dir")
    out = []
    for d in sorted(runs.iterdir()):
        if not (d / "summary.json").exists() or (names and d.name not in names):
            continue
        s = json.loads((d / "summary.json").read_text(encoding="utf-8"))
        info = json.loads((d / "info.json").read_text(encoding="utf-8"))
        t, e = s.get("test", {}), s.get("extra", {})
        out.append({
            "run": d.name,
            "random": info.get("random", False),
            "hidden": bool(info.get("hidden_labels")),
            "test_top1": t.get("closed", {}).get("top1"),
            "test_top3": t.get("closed", {}).get("top3"),
            "test_macro_f1": t.get("closed", {}).get("macro_f1"),
            "per_fold": {k: v["top1"] for k, v in t.get("per_fold", {}).items()},
            "extra_top1": e.get("closed", {}).get("top1"),
            "auroc_none": t.get("open", {}).get("auroc_known_vs_none"),
            "auroc_unknown": t.get("open", {}).get("auroc_known_vs_unknown_word"),
            "ece": t.get("ece"),
            "minutes": info.get("minutes"),
        })
    return out


def fmt(v):
    return "-" if v is None else f"{v:.3f}" if isinstance(v, float) else str(v)


def markdown(rs: list[dict]) -> str:
    head = "| run | LOSO top1 | top3 | macro-F1 | s1 / s2 / s3 / s4 | signer0 top1 | AUROC none | AUROC unk. word | ECE |"
    lines = [head, "|" + "---|" * 9]
    for r in rs:
        pf = " / ".join(fmt(r["per_fold"].get(f"signer{i}")) for i in (1, 2, 3, 4)) if not r["random"] else "random split"
        lines.append(f"| {r['run']} | {fmt(r['test_top1'])} | {fmt(r['test_top3'])} | {fmt(r['test_macro_f1'])} | {pf} | "
                     f"{fmt(r['extra_top1'])} | {fmt(r['auroc_none'])} | {fmt(r['auroc_unknown'])} | {fmt(r['ece'])} |")
    return "\n".join(lines)


if __name__ == "__main__":
    print(markdown(rows(sys.argv[1:] or None)))
