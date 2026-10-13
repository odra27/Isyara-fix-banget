import numpy as np

from bisindo.augment import augment_and_resample, mirror, synth_none
from bisindo.features import (
    canonicalize, feature_dim, featurize, interpolate_gaps, normalize, preprocess, resample, to_features, trim,
)
from helpers import make_raw


def test_slot_assignment_uses_pose_not_detector_order(cfg):
    a = make_raw(n=10)
    c = canonicalize(a, cfg["features"]["pose_points"])
    # slot 0 = signer's right hand = near pose[16] (image-left, x ~ 0.38 * aspect)
    assert c["hands"][0, 0, 0, 0] < c["hands"][0, 1, 0, 0]
    assert c["hmask"].all()


def test_mirrored_input_gives_same_features(cfg):
    fc = cfg["features"]
    a = make_raw(n=30)
    b = {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in a.items()}
    b["hands"][..., 0] = 1 - b["hands"][..., 0]
    b["pose"][..., 0] = 1 - b["pose"][..., 0]
    # a mirrored image makes the pose model swap anatomical sides
    for l, r in [(11, 12), (13, 14), (15, 16), (23, 24)]:
        b["pose"][:, [l, r]] = b["pose"][:, [r, l]]
    b["mirrored"] = np.bool_(True)
    np.testing.assert_allclose(featurize(a, fc), featurize(b, fc), atol=1e-4)


def test_translation_and_scale_invariance(cfg):
    fc = cfg["features"]
    a = make_raw(n=30)
    b = {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in a.items()}
    for key in ("hands", "pose"):
        b[key][..., :2] = (b[key][..., :2] - 0.5) * 0.7 + 0.5 + np.array([0.05, -0.03], np.float32)
    b["hands"][..., 2] *= 0.7
    np.testing.assert_allclose(featurize(a, fc), featurize(b, fc), atol=1e-3)


def test_gap_interpolation(cfg):
    a = make_raw(n=30, hand_gap=(10, 13))
    c = interpolate_gaps(canonicalize(a, cfg["features"]["pose_points"]), max_gap=5)
    assert c["hmask"].all()
    c2 = interpolate_gaps(canonicalize(make_raw(n=30, hand_gap=(5, 20)), cfg["features"]["pose_points"]), 5)
    assert not c2["hmask"][10].any()


def test_trim_caps_still_edges_keeps_motion(cfg):
    fc = cfg["features"]
    a = make_raw(n=30, still_head=40, still_tail=40)
    c = normalize(interpolate_gaps(canonicalize(a, fc["pose_points"]), 5))
    t = trim(c, fc["trim"])
    F = len(t["hmask"])
    keep = fc["trim"]["max_still_edge_frames"]
    assert F < 110
    assert 30 - 4 <= F <= 30 + 2 * keep + 4


def test_trim_keeps_static_sign(cfg):
    fc = cfg["features"]
    a = make_raw(n=40, moving=False)
    t = preprocess(a, fc)
    assert len(t["hmask"]) == 40  # a fully still (held) sign is not removed


def test_feature_shape_and_dim(cfg):
    fc = cfg["features"]
    x = featurize(make_raw(n=25), fc)
    assert x.shape == (fc["T"], feature_dim(fc))
    assert np.isfinite(x).all()
    for up, uv in [(False, True), (True, False), (False, False)]:
        f2 = dict(fc, use_pose=up, use_velocity=uv)
        assert featurize(make_raw(n=25), f2).shape[1] == feature_dim(f2)


def test_missing_hand_is_zero_and_masked(cfg):
    fc = cfg["features"]
    x = featurize(make_raw(n=25, two_hands=False), fc)
    # mask columns come right after 84 global + 120 local
    assert np.all(x[:, 205] == 0)   # left-hand slot mask
    assert np.all(x[:, 204] == 1)   # right-hand slot mask


def test_mirror_twice_is_identity(cfg):
    fc = cfg["features"]
    c = preprocess(make_raw(n=20), fc)
    m2 = mirror(mirror(c, fc["pose_points"]), fc["pose_points"])
    np.testing.assert_allclose(c["hands"], m2["hands"], atol=1e-6)
    np.testing.assert_allclose(c["pose"], m2["pose"], atol=1e-6)


def test_augment_deterministic_and_shape(cfg):
    fc, ac = cfg["features"], cfg["augment"]
    c = preprocess(make_raw(n=30), fc)
    r1 = augment_and_resample(c, np.random.default_rng(3), ac, fc)
    r2 = augment_and_resample(c, np.random.default_rng(3), ac, fc)
    np.testing.assert_array_equal(to_features(r1, fc), to_features(r2, fc))
    assert to_features(r1, fc).shape == (fc["T"], feature_dim(fc))


def test_synth_none_shapes(cfg):
    fc = cfg["features"]
    pool = [preprocess(make_raw(n=30, moving=bool(i % 2)), fc) for i in range(4)]
    labels = np.array([0, 1, 0, 1])
    rng = np.random.default_rng(0)
    for _ in range(9):
        s = synth_none(pool, labels, rng)
        x = to_features(resample(s, fc["T"]), fc)
        assert x.shape == (fc["T"], feature_dim(fc)) and np.isfinite(x).all()


def test_resting_hand_is_masked(cfg):
    from bisindo.features import mask_resting

    fc = cfg["features"]
    c = normalize(interpolate_gaps(canonicalize(make_raw(n=20), fc["pose_points"]), 5))
    c["hands"][:5, 1, :, 1] += 3.0  # push left hand far below the hips for 5 frames
    m = mask_resting(c, fc["rest_mask_y"])
    assert not m["hmask"][:5, 1].any() and m["hmask"][5:, 1].all()
    assert m["hmask"][:, 0].all()


def test_midair_crop_keeps_core(cfg):
    from bisindo.augment import temporal
    from bisindo.features import preprocess
    from helpers import make_raw

    c = preprocess(make_raw(n=60), cfg["features"])
    F = len(c["hmask"])
    acfg = dict(cfg["augment"], crop_max_ratio=0.0, frame_drop_p=0.0, hold_pad_max=0, midair_p=1.0,
                midair_crop=[0.3, 0.3])
    out = temporal(c, np.random.default_rng(0), acfg)
    n = len(out["hmask"])
    assert int(0.3 * F) <= n < F  # both ends cut, core kept
    off = dict(acfg, midair_p=0.0)
    assert len(temporal(c, np.random.default_rng(0), off)["hmask"]) == F


def test_synth_none_kind_weights(cfg):
    from bisindo.augment import synth_none
    from bisindo.features import preprocess
    from helpers import make_raw

    pool = [preprocess(make_raw(n=40, moving=m), cfg["features"]) for m in (True, False)]
    y = np.array([0, 1])
    rng = np.random.default_rng(0)
    # splice only: length = half of a + half of b
    for _ in range(5):
        s = synth_none(pool, y, rng, kind_p=[0, 1, 0])
        assert np.isfinite(s["hands"]).all() and len(s["hmask"]) <= max(len(p["hmask"]) for p in pool)
