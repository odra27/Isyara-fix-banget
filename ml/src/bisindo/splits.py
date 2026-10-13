"""Task 5: evaluation splits."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class Fold:
    name: str
    train_idx: np.ndarray
    test_idx: np.ndarray       # held-out signer (known + hidden labels)
    extra_idx: np.ndarray      # extra test signer (never in LOSO training)


def loso_folds(meta: pd.DataFrame, loso_signers: list[int], extra_signer: int | None,
               hidden_labels: list[int] | None = None) -> list[Fold]:
    """Leave-one-signer-out over `loso_signers`. The extra signer is test-only.

    If `hidden_labels` is given, those labels are removed from training (open-set experiment)
    but kept in the test sets.
    """
    hidden = set(hidden_labels or [])
    folds = []
    extra = meta.index[meta.signer == extra_signer].to_numpy() if extra_signer is not None else np.array([], int)
    for s in loso_signers:
        train = meta.index[meta.signer.isin([x for x in loso_signers if x != s]) & ~meta.label.isin(hidden)]
        test = meta.index[meta.signer == s]
        folds.append(Fold(f"signer{s}", train.to_numpy(), test.to_numpy(), extra))
    return folds


def random_split(meta: pd.DataFrame, test_frac: float = 0.2, seed: int = 0) -> Fold:
    """Stratified random split — optimistic reference only (same signers in train & test)."""
    rng = np.random.default_rng(seed)
    test = []
    for _, g in meta.groupby(["signer", "label"]):
        idx = g.index.to_numpy()
        k = max(1, int(round(len(idx) * test_frac)))
        test.extend(rng.choice(idx, k, replace=False))
    test = np.array(sorted(test))
    train = np.setdiff1d(meta.index.to_numpy(), test)
    return Fold("random", train, test, np.array([], int))
