"""Config loading. All tunable numbers live in config/default.yaml."""
from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import yaml

ML_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = ML_ROOT / "config" / "default.yaml"


def load_config(path: str | Path | None = None, overrides: dict | None = None) -> dict[str, Any]:
    with open(path or DEFAULT_CONFIG, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    if overrides:
        cfg = deep_update(cfg, overrides)
    return cfg


def deep_update(base: dict, upd: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in upd.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_update(out[k], v)
        else:
            out[k] = v
    return out


def resolve(cfg: dict, key: str) -> Path:
    """Resolve a path from cfg['paths'] relative to the ml/ root."""
    p = Path(cfg["paths"][key])
    return p if p.is_absolute() else ML_ROOT / p
