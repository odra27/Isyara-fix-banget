"""DTW k-NN baseline (vectorized over the reference set)."""
from __future__ import annotations

import numpy as np


def dtw_batch(q: np.ndarray, refs: np.ndarray, band: int | None = None) -> np.ndarray:
    """DTW distance between q [T,D] and each of refs [N,T,D]. Returns [N]."""
    T = q.shape[0]
    qq = (q ** 2).sum(-1)                       # [T]
    rr = (refs ** 2).sum(-1)                    # [N,T]
    cost = qq[None, :, None] + rr[:, None, :] - 2 * np.einsum("td,nsd->nts", q, refs)
    cost = np.sqrt(np.maximum(cost, 0))         # [N,T,T]
    N = refs.shape[0]
    INF = np.float32(1e18)
    acc = np.full((N, T + 1, T + 1), INF, np.float32)
    acc[:, 0, 0] = 0
    for i in range(1, T + 1):
        lo, hi = (1, T) if band is None else (max(1, i - band), min(T, i + band))
        for j in range(lo, hi + 1):
            best = np.minimum(np.minimum(acc[:, i - 1, j], acc[:, i, j - 1]), acc[:, i - 1, j - 1])
            acc[:, i, j] = cost[:, i - 1, j - 1] + best
    return acc[:, T, T] / (2 * T)


class DTWKNN:
    def __init__(self, band: int = 6):
        self.band = band

    def fit(self, X: np.ndarray, y: np.ndarray, n_classes: int):
        self.X, self.y, self.C = X.astype(np.float32), np.asarray(y), n_classes
        return self

    def class_distances(self, q: np.ndarray) -> np.ndarray:
        d = dtw_batch(q.astype(np.float32), self.X, self.band)
        out = np.full(self.C, np.inf, np.float32)
        for c in range(self.C):
            m = self.y == c
            if m.any():
                out[c] = d[m].min()
        return out

    def predict_logits(self, Q: np.ndarray) -> np.ndarray:
        """Negative nearest-neighbour distance per class (higher = better)."""
        D = np.stack([self.class_distances(q) for q in Q])
        tau = np.median(D[np.isfinite(D)]) * 0.1 + 1e-6
        return np.where(np.isfinite(D), -D / tau, -1e9)
