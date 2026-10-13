import numpy as np
import pandas as pd
import torch

from bisindo.evaluate import closed_set_metrics, coverage_table, ece, known_confidence, softmax
from bisindo.models.dtw import DTWKNN, dtw_batch
from bisindo.models.gru import SignGRU
from bisindo.splits import loso_folds, random_split


def _meta():
    rows = []
    for s in range(5):
        labels = range(12) if s == 0 else range(32)
        for l in labels:
            for k in range(3):
                rows.append({"signer": s, "label": l, "sample": k})
    return pd.DataFrame(rows)


def test_loso_no_signer_leakage():
    meta = _meta()
    folds = loso_folds(meta, [1, 2, 3, 4], 0)
    assert len(folds) == 4
    for f in folds:
        held = int(f.name.replace("signer", ""))
        assert held not in set(meta.signer[f.train_idx])
        assert 0 not in set(meta.signer[f.train_idx])          # extra signer never trains
        assert set(meta.signer[f.test_idx]) == {held}
        assert set(meta.signer[f.extra_idx]) == {0}


def test_hidden_labels_removed_from_training_only():
    meta = _meta()
    f = loso_folds(meta, [1, 2, 3, 4], 0, hidden_labels=[3, 9])[0]
    assert not set(meta.label[f.train_idx]) & {3, 9}
    assert {3, 9} <= set(meta.label[f.test_idx])


def test_random_split_disjoint():
    meta = _meta()
    f = random_split(meta, 0.2)
    assert len(np.intersect1d(f.train_idx, f.test_idx)) == 0
    assert len(f.train_idx) + len(f.test_idx) == len(meta)


def test_dtw_identical_is_zero_and_nn_correct():
    rng = np.random.default_rng(0)
    refs = rng.normal(size=(6, 16, 5)).astype(np.float32)
    d = dtw_batch(refs[2], refs, band=None)
    assert d[2] < 1e-3 and np.all(d[np.arange(6) != 2] > d[2])
    knn = DTWKNN(band=4).fit(refs, np.array([0, 0, 1, 1, 2, 2]), 3)
    q = refs[4] + rng.normal(0, 0.01, refs[4].shape).astype(np.float32)
    assert knn.predict_logits(q[None]).argmax(1)[0] == 2


def test_gru_forward_shape_and_overfit():
    torch.set_num_threads(1)
    torch.manual_seed(0)
    m = SignGRU(in_dim=10, n_classes=3, hidden=16, layers=2, embed_dim=16, dropout=0.0)
    x = torch.randn(12, 20, 10)
    y = torch.tensor([0, 1, 2] * 4)
    lg, e = m(x)
    assert lg.shape == (12, 3) and e.shape == (12, 16)
    opt = torch.optim.Adam(m.parameters(), lr=1e-2)
    for _ in range(150):
        loss = torch.nn.functional.cross_entropy(m(x)[0], y)
        opt.zero_grad()
        loss.backward()
        opt.step()
    assert (m(x)[0].argmax(1) == y).all()


def test_metrics_on_dummy_predictions():
    y = np.array([0, 1, 2, 0, -2, -1])
    logits = np.array([
        [5, 0, 0, 0], [0, 5, 0, 0], [0, 0, 5, 0], [0, 5, 0, 0], [0, 0, 0, 5], [1, 1, 1, 1.0]
    ], np.float32)
    cs = closed_set_metrics(logits, y, 3)
    assert cs["n"] == 4 and abs(cs["top1"] - 0.75) < 1e-6
    pred, conf = known_confidence(softmax(logits), 3)
    assert pred[4] == -2 and conf[4] < 0.5
    cov = coverage_table(pred, conf, y, 0.85, 0.6)
    assert cov["none"]["reject"] == 1.0
    assert 0 <= ece(conf[:4], (pred[:4] == y[:4]).astype(float)) <= 1
