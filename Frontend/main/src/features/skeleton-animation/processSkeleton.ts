import { SKELETON } from './skeleton.config';
import type { Pt, SkeletonClip } from './types';

/**
 * Merapikan data mentah supaya animasinya halus dan benar:
 *  1. Koordinat 0..1 → piksel (rasio asli video tetap terjaga).
 *  2. Tangan kiri/kanan ditentukan dari pergelangan pose terdekat, BUKAN label "side"
 *     (label MediaPipe kadang tertukar, misalnya di t=433 dan t=567).
 *  3. Celah tangan hilang sesaat diisi interpolasi.
 *  4. Tangan yang istirahat di bawah dibuat transparan.
 *  5. Area tampilan (viewBox) dihitung dari gerakan supaya badan selalu terlihat utuh.
 */

// Posisi di array pose (lihat posePoints [0,11,12,13,14,15,16])
export const P = { nose: 0, lSh: 1, rSh: 2, lEl: 3, rEl: 4, lWr: 5, rWr: 6 } as const;

/** Posisi di array face: [mata kiri, mata kanan, telinga kiri, telinga kanan, mulut kiri, mulut kanan] */
export const F = { lEye: 0, rEye: 1, lEar: 2, rEar: 3, lMouth: 4, rMouth: 5 } as const;

export type HandState = { pts: Pt[]; alpha: number };
/** slot 0 = tangan kiri penanda isyarat (dekat pergelangan pose 15), slot 1 = kanan (pose 16) */
export type Frame = { t: number; pose: Pt[]; face: Pt[]; hands: [HandState | null, HandState | null] };
export type ProcessedClip = {
  frames: Frame[];
  durationMs: number;
  shoulderW: number;
  viewBox: { x: number; y: number; w: number; h: number };
};

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a: number, b: number, w: number) => a + (b - a) * w;
const lerpPts = (a: Pt[], b: Pt[], w: number): Pt[] => a.map((p, i) => [lerp(p[0], b[i][0], w), lerp(p[1], b[i][1], w)]);

/**
 * Perkiraan titik muka dari hidung + bahu (piksel), untuk klip tanpa landmark muka.
 * Proporsi kira-kira kepala dewasa dalam satuan lebar bahu; arah kiri-kanan ikut garis bahu.
 */
export function estimateFace(pose: Pt[], shoulderW: number): Pt[] {
  const n = pose[P.nose];
  const dx = pose[P.lSh][0] - pose[P.rSh][0];
  const dy = pose[P.lSh][1] - pose[P.rSh][1];
  const len = Math.hypot(dx, dy) || 1;
  const u: Pt = [dx / len, dy / len]; // ke arah kiri anatomis
  const d: Pt = [-u[1], u[0]]; // tegak lurus garis bahu (ke bawah)
  const at = (side: number, down: number): Pt => [n[0] + u[0] * side * shoulderW + d[0] * down * shoulderW, n[1] + u[1] * side * shoulderW + d[1] * down * shoulderW];
  // Angka = rata-rata landmark asli relatif hidung (5 klip WL-BISINDO, satuan lebar bahu).
  return [at(0.11, -0.1), at(-0.11, -0.1), at(0.19, -0.035), at(-0.19, -0.035), at(0.08, 0.11), at(-0.08, 0.11)];
}

export function processSkeleton(clip: SkeletonClip): ProcessedClip {
  const W = clip.width;
  const H = clip.height;
  const px = (p: Pt): Pt => [p[0] * W, p[1] * H];

  // 1. pose ke piksel, isi frame tanpa pose dengan pose terdekat
  const poses: (Pt[] | null)[] = clip.frames.map((f) => (f.pose ? f.pose.map(px) : null));
  let lastPose = poses.find(Boolean) ?? Array.from({ length: 7 }, () => [W / 2, H / 2] as Pt);
  const pose = poses.map((p) => (p ? (lastPose = p) : lastPose));

  const shoulderWs = pose.map((p) => dist(p[P.lSh], p[P.rSh])).sort((a, b) => a - b);
  const shoulderW = shoulderWs[Math.floor(shoulderWs.length / 2)] || W * 0.15;

  // 2. tetapkan slot tangan dari pergelangan pose terdekat
  const slots: [Pt[] | null, Pt[] | null][] = clip.frames.map((f, i) => {
    const hs = f.hands.map((h) => h.pts.map(px));
    const lw = pose[i][P.lWr];
    const rw = pose[i][P.rWr];
    if (hs.length === 0) return [null, null];
    if (hs.length === 1) return dist(hs[0][0], lw) <= dist(hs[0][0], rw) ? [hs[0], null] : [null, hs[0]];
    const straight = dist(hs[0][0], lw) + dist(hs[1][0], rw);
    const swapped = dist(hs[1][0], lw) + dist(hs[0][0], rw);
    return straight <= swapped ? [hs[0], hs[1]] : [hs[1], hs[0]];
  });

  // 3. isi celah pendek per slot
  for (const s of [0, 1] as const) {
    let i = 0;
    while (i < slots.length) {
      if (slots[i][s]) {
        i++;
        continue;
      }
      let j = i;
      while (j < slots.length && !slots[j][s]) j++;
      const before = i - 1;
      const gap = j - i;
      if (before >= 0 && j < slots.length && gap <= SKELETON.maxGapFrames) {
        const a = slots[before][s]!;
        const b = slots[j][s]!;
        for (let k = i; k < j; k++) slots[k][s] = lerpPts(a, b, (k - before) / (j - before));
      }
      i = j;
    }
  }

  // 4. alpha: tangan istirahat dibuat transparan
  const frames: Frame[] = clip.frames.map((f, i) => {
    const sy = (pose[i][P.lSh][1] + pose[i][P.rSh][1]) / 2;
    const restLine = sy + SKELETON.restBelowShoulders * shoulderW;
    const hand = (pts: Pt[] | null): HandState | null =>
      pts ? { pts, alpha: pts[0][1] > restLine ? SKELETON.restingAlpha : 1 } : null;
    const face = f.face && f.face.length === 6 ? f.face.map(px) : estimateFace(pose[i], shoulderW);
    return { t: f.t, pose: pose[i], face, hands: [hand(slots[i][0]), hand(slots[i][1])] };
  });

  // 5. viewBox dari semua titik yang terlihat jelas + kepala, dibatasi tepi video
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (p: Pt) => {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  };
  for (const fr of frames) {
    fr.pose.forEach(add);
    fr.face.forEach(add);
    add([fr.pose[P.nose][0], fr.pose[P.nose][1] - shoulderW * 0.6]); // puncak kepala
    for (const h of fr.hands) if (h && h.alpha === 1) h.pts.forEach(add);
  }
  const pad = SKELETON.paddingShoulders * shoulderW;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(W, maxX + pad);
  maxY = Math.min(H, maxY + pad * 0.5);

  return {
    frames,
    durationMs: clip.durationMs,
    shoulderW,
    viewBox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
}

/** Pose pada waktu t (ms), diinterpolasi di antara dua frame terdekat. */
export function frameAt(clip: ProcessedClip, t: number): Frame {
  const fs = clip.frames;
  if (t <= fs[0].t) return fs[0];
  if (t >= fs[fs.length - 1].t) return fs[fs.length - 1];
  let i = 0;
  while (i < fs.length - 2 && fs[i + 1].t < t) i++;
  const a = fs[i];
  const b = fs[i + 1];
  const w = (t - a.t) / (b.t - a.t || 1);
  const hand = (ha: HandState | null, hb: HandState | null): HandState | null => {
    if (ha && hb) return { pts: lerpPts(ha.pts, hb.pts, w), alpha: lerp(ha.alpha, hb.alpha, w) };
    if (ha) return { pts: ha.pts, alpha: ha.alpha * (1 - w) }; // memudar keluar
    if (hb) return { pts: hb.pts, alpha: hb.alpha * w }; // memudar masuk
    return null;
  };
  return {
    t,
    pose: lerpPts(a.pose, b.pose, w),
    face: lerpPts(a.face, b.face, w),
    hands: [hand(a.hands[0], b.hands[0]), hand(a.hands[1], b.hands[1])],
  };
}

/** Satu animasi kalimat: beberapa klip disambung. `spans[i]` = rentang waktu kata ke-i. */
export type Timeline = ProcessedClip & { spans: { start: number; end: number }[] };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/**
 * Sambung beberapa klip jadi satu animasi.
 *  - Tiap klip dinormalkan: titik tengah bahu → (0,0), lebar bahu → 100. Klip dari penanda isyarat /
 *    resolusi video berbeda jadi sama besar & sama posisi, sehingga badan tidak "lompat" antar kata.
 *  - Di sambungan antar kata, bagian awal/akhir saat tangan masih istirahat dipotong.
 *  - Antar kata ada `transitionMs`; frameAt menginterpolasi pose akhir kata A → pose awal kata B.
 */
export function buildTimeline(clips: SkeletonClip[], transitionMs = SKELETON.transitionMs): Timeline {
  const S = 100;
  const frames: Frame[] = [];
  const spans: { start: number; end: number }[] = [];
  let offset = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  clips.forEach((clip, ci) => {
    const p = processSkeleton(clip);
    const mx = median(p.frames.map((f) => (f.pose[P.lSh][0] + f.pose[P.rSh][0]) / 2));
    const my = median(p.frames.map((f) => (f.pose[P.lSh][1] + f.pose[P.rSh][1]) / 2));
    const k = S / (p.shoulderW || 1);
    const tf = (q: Pt): Pt => [(q[0] - mx) * k, (q[1] - my) * k];

    // Di sambungan antar kata buang bagian yang "tidak bergerak": tangan masih istirahat, atau pose
    // ditahan diam (mis. akhir "Kamu" ±2 dtk). Kata pertama & terakhir tidak dipotong di sisi luarnya.
    const moving = p.frames.map((f, i) => {
      if (i === 0) return false;
      let s = 0;
      let n = 0;
      for (const k of [0, 1] as const) {
        const ha = p.frames[i - 1].hands[k];
        const hb = f.hands[k];
        if (ha && hb && hb.alpha === 1) hb.pts.forEach((q, j) => ((s += Math.hypot(q[0] - ha.pts[j][0], q[1] - ha.pts[j][1])), n++));
      }
      return n > 0 && s / n / (p.shoulderW || 1) > SKELETON.stillMotion;
    });
    const firstMove = moving.indexOf(true);
    const lastMove = moving.lastIndexOf(true);
    let a = 0;
    let b = p.frames.length - 1;
    if (firstMove >= 0) {
      if (ci > 0) a = Math.max(0, firstMove - SKELETON.keepStillFrames);
      if (ci < clips.length - 1) b = Math.min(b, lastMove + SKELETON.keepStillFrames);
    }
    if (b < a) b = a;
    const fs = p.frames.slice(a, b + 1);
    const t0 = fs[0].t;
    if (ci > 0) offset += transitionMs;
    const start = offset;
    for (const f of fs) {
      frames.push({
        t: offset + f.t - t0,
        pose: f.pose.map(tf),
        face: f.face.map(tf),
        hands: f.hands.map((h) => (h ? { pts: h.pts.map(tf), alpha: h.alpha } : null)) as Frame['hands'],
      });
    }
    offset += fs[fs.length - 1].t - t0;
    spans.push({ start, end: offset });

    const v = p.viewBox;
    const [x0, y0] = tf([v.x, v.y]);
    const [x1, y1] = tf([v.x + v.w, v.y + v.h]);
    minX = Math.min(minX, x0); minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1);
  });

  // Area tampilan dari titik yang benar-benar terlihat (badan, muka, tangan terangkat), persentil 1–99
  // supaya satu titik deteksi yang nyasar tidak membuat avatar mengecil. Kotak per-klip hanya sebagai batas luar.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const fr of frames) {
    for (const q of [...fr.pose, ...fr.face]) xs.push(q[0]), ys.push(q[1]);
    ys.push(fr.pose[P.nose][1] - S * 0.6); // puncak kepala
    for (const h of fr.hands) if (h && h.alpha === 1) for (const q of h.pts) xs.push(q[0]), ys.push(q[1]);
  }
  const pct = (v: number[], p: number) => {
    const s = [...v].sort((u, w) => u - w);
    return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  };
  const pad = SKELETON.paddingShoulders * S;
  const x0 = Math.max(minX, pct(xs, 0.01) - pad);
  const x1 = Math.min(maxX, pct(xs, 0.99) + pad);
  const y0 = Math.max(minY, pct(ys, 0.01) - pad);
  const y1 = Math.min(maxY, pct(ys, 0.99) + pad * 0.5);
  return { frames, durationMs: offset, shoulderW: S, viewBox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, spans };
}
