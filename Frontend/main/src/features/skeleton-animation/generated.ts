import { allSkeletonClips } from './registry';
import { P, processSkeleton } from './processSkeleton';
import type { Pt, SkeletonClip } from './types';

/**
 * Gerakan kerangka buatan untuk kata DI LUAR 43 kosakata terlatih (ADR-051 D5).
 *
 *  - Deterministik per kata: kata yang sama selalu menghasilkan gerakan yang sama, jadi siswa
 *    melihat pola yang konsisten setiap kali kata itu muncul.
 *  - Dijamin BEDA dari 43 gerakan terlatih: lintasan kedua pergelangan dibandingkan dengan
 *    lintasan tiap klip asli. Kandidat yang terlalu mirip dibuang dan dibuat ulang dengan seed lain.
 *  - Formatnya sama dengan klip asli (SkeletonClip, koordinat 0..1 gambar tidak di-mirror), jadi
 *    SkeletonPlayer / buildTimeline memutarnya bersambung dengan kata asli tanpa kode khusus.
 *
 * Ini BUKAN isyarat BISINDO yang benar; hanya penanda visual supaya kalimat tetap mengalir.
 */

const W = 960;
const H = 540;
const FPS = 30;
const S = 150; // lebar bahu (px)
const C: Pt = [470, 262]; // titik tengah bahu (px)
const UPPER = 0.84 * S;
const FORE = 0.78 * S;

/** Batas kemiripan lintasan (satuan lebar bahu). Di bawah ini dianggap "sama" dengan kata terlatih. */
const MIN_DISTANCE = 0.32;
const MAX_ATTEMPTS = 16;
const SIG_POINTS = 12;

// ------------------------------------------------------------------ util

function rng(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

type Rand = ReturnType<typeof rng>;
const range = (r: Rand, a: number, b: number) => a + (b - a) * r();
const pick = <T,>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const norm = (p: Pt): Pt => [Math.round((p[0] / W) * 1e4) / 1e4, Math.round((p[1] / H) * 1e4) / 1e4];

/** Titik di ruang isyarat: (x, y) dalam lebar bahu relatif tengah bahu. x negatif = sisi kanan penanda isyarat. */
const space = (x: number, y: number): Pt => [C[0] + x * S, C[1] + y * S];

// ------------------------------------------------------------------ tubuh

const NOSE: Pt = [C[0] + 2, C[1] - 0.67 * S];
const L_SH: Pt = [C[0] + S / 2, C[1] - 0.03 * S]; // bahu kiri anatomis (tampak di kanan gambar)
const R_SH: Pt = [C[0] - S / 2, C[1] + 0.03 * S];
const FACE: Pt[] = [
  [NOSE[0] + 0.1 * S, NOSE[1] - 0.17 * S], [NOSE[0] - 0.12 * S, NOSE[1] - 0.15 * S],
  [NOSE[0] + 0.2 * S, NOSE[1] - 0.04 * S], [NOSE[0] - 0.2 * S, NOSE[1] - 0.02 * S],
  [NOSE[0] + 0.09 * S, NOSE[1] + 0.2 * S], [NOSE[0] - 0.08 * S, NOSE[1] + 0.22 * S],
];
/** Posisi istirahat pergelangan (di bawah garis istirahat → digambar redup). */
const REST_R = space(-0.42, 1.62);
const REST_L = space(0.42, 1.62);

/** IK dua ruas: siku ditekuk ke luar badan & ke bawah. */
function elbow(shoulder: Pt, wrist: Pt, outward: 1 | -1): Pt {
  const dx = wrist[0] - shoulder[0];
  const dy = wrist[1] - shoulder[1];
  const d = Math.min(Math.hypot(dx, dy), UPPER + FORE - 1) || 1;
  const a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  const ux = dx / d;
  const uy = dy / d;
  // dua kemungkinan; pilih yang lebih ke luar (dan sedikit ke bawah).
  const e1: Pt = [shoulder[0] + a * ux - h * uy, shoulder[1] + a * uy + h * ux];
  const e2: Pt = [shoulder[0] + a * ux + h * uy, shoulder[1] + a * uy - h * ux];
  const score = (e: Pt) => (e[0] - C[0]) * outward + (e[1] - shoulder[1]) * 0.35;
  return score(e1) >= score(e2) ? e1 : e2;
}

// ------------------------------------------------------------------ bentuk tangan

/** curl 0 = lurus, 1 = menggenggam. Urutan: jempol, telunjuk, tengah, manis, kelingking. */
type Shape = { curl: [number, number, number, number, number]; spread: number };

const SHAPES: readonly Shape[] = [
  { curl: [0, 0, 0, 0, 0], spread: 0.7 }, // terbuka
  { curl: [0.1, 0, 0, 0, 0], spread: 0 }, // datar rapat
  { curl: [0.85, 0.9, 0.9, 0.9, 0.9], spread: 0.1 }, // kepalan
  { curl: [0.8, 0, 0.9, 0.9, 0.9], spread: 0.2 }, // menunjuk
  { curl: [0.8, 0, 0, 0.9, 0.9], spread: 0.8 }, // V
  { curl: [0, 0.9, 0.9, 0.9, 0.9], spread: 0.2 }, // jempol
  { curl: [0, 0, 0.9, 0.9, 0.9], spread: 0.9 }, // L
  { curl: [0.85, 0.9, 0.9, 0.9, 0], spread: 0.4 }, // kelingking
  { curl: [0.45, 0.5, 0.5, 0.5, 0.5], spread: 0.5 }, // cakar
  { curl: [0.6, 0.6, 0, 0, 0], spread: 0.5 }, // "oke"
  { curl: [0, 0, 0.9, 0.9, 0], spread: 0.9 }, // "Y"
];

/**
 * 21 titik tangan MediaPipe (0 pergelangan, 1–4 jempol, 5–8 telunjuk, 9–12 tengah, 13–16 manis,
 * 17–20 kelingking). `angle` = arah telapak (pergelangan → pangkal jari tengah), `thumbSide` = sisi
 * jempol dalam koordinat lokal (+1 / -1).
 */
function handPoints(wrist: Pt, angle: number, shape: Shape, thumbSide: 1 | -1): Pt[] {
  const u: Pt = [Math.cos(angle), Math.sin(angle)];
  const v: Pt = scale([-u[1], u[0]], thumbSide);
  const at = (along: number, side: number): Pt => add(wrist, add(scale(u, along * S), scale(v, side * S)));
  const pts: Pt[] = [wrist];

  // jempol
  const cmc = at(0.07, 0.09);
  const thumbDir = angle + thumbSide * (0.95 - shape.curl[0] * 1.5);
  let p = cmc;
  pts.push(p);
  let dir = thumbDir;
  for (const len of [0.09, 0.07, 0.06]) {
    p = add(p, scale([Math.cos(dir), Math.sin(dir)], len * S));
    pts.push(p);
    dir -= thumbSide * shape.curl[0] * 0.7;
  }

  // empat jari
  const bases: [number, number][] = [[0.25, 0.085], [0.26, 0.03], [0.245, -0.025], [0.22, -0.075]];
  const lens = [[0.1, 0.06, 0.05], [0.11, 0.07, 0.055], [0.1, 0.065, 0.05], [0.08, 0.05, 0.045]];
  bases.forEach(([along, side], i) => {
    let q = at(along, side);
    pts.push(q);
    let d = angle + thumbSide * (1.5 - i) * 0.09 * shape.spread;
    const c = shape.curl[i + 1];
    for (const len of lens[i]) {
      d -= thumbSide * c * 1.05;
      q = add(q, scale([Math.cos(d), Math.sin(d)], len * S * (1 - c * 0.25)));
      pts.push(q);
    }
  });
  return pts;
}

// ------------------------------------------------------------------ gerakan

type Key = { r: Pt; l: Pt | null; angR: number; angL: number; shapeR: Shape; shapeL: Shape };
type Motion = 'line' | 'arc' | 'circle' | 'tap' | 'shake';

/** Rencana gerak acak (deterministik dari `r`). */
function plan(r: Rand): { keys: Key[]; motion: Motion; twoHanded: 'none' | 'mirror' | 'base' } {
  const motion = pick(r, ['line', 'arc', 'circle', 'tap', 'shake'] as const);
  const twoHanded = r() < 0.4 ? (r() < 0.6 ? 'mirror' : 'base') : 'none';
  const n = motion === 'line' || motion === 'arc' ? 3 : 2;
  const shapeA = pick(r, SHAPES);
  const shapeB = r() < 0.5 ? shapeA : pick(r, SHAPES);
  const baseL = space(range(r, 0.05, 0.45), range(r, 0.45, 0.95));
  const keys: Key[] = [];
  for (let i = 0; i < n; i++) {
    const rx = range(r, -1.0, 0.45);
    const ry = range(r, -0.85, 1.0);
    const right = space(rx, ry);
    const angR = -Math.PI / 2 + range(r, -0.9, 0.7);
    const left =
      twoHanded === 'mirror' ? space(-rx + range(r, -0.1, 0.1), ry + range(r, -0.1, 0.1)) : twoHanded === 'base' ? baseL : null;
    keys.push({
      r: right,
      l: left,
      angR,
      angL: twoHanded === 'mirror' ? -Math.PI - angR : -Math.PI / 2 + range(r, -0.4, 0.4),
      shapeR: i === n - 1 ? shapeB : shapeA,
      shapeL: twoHanded === 'base' ? SHAPES[1] : i === n - 1 ? shapeB : shapeA,
    });
  }
  return { keys, motion, twoHanded };
}

const lerpShape = (a: Shape, b: Shape, t: number): Shape => ({
  curl: a.curl.map((c, i) => lerp(c, b.curl[i], t)) as Shape['curl'],
  spread: lerp(a.spread, b.spread, t),
});

/** Posisi utama pada t ∈ [0,1] fase isyarat. */
function sample(keys: Key[], motion: Motion, t: number) {
  const seg = Math.min(keys.length - 2, Math.floor(t * (keys.length - 1)));
  const local = ease(t * (keys.length - 1) - seg);
  const a = keys[seg];
  const b = keys[seg + 1];
  let r = lerpPt(a.r, b.r, local);
  let l = a.l && b.l ? lerpPt(a.l, b.l, local) : a.l;
  let angR = lerp(a.angR, b.angR, local);
  const bump = Math.sin(Math.PI * local);
  if (motion === 'arc') r = add(r, [0, -0.28 * S * bump]);
  if (motion === 'circle') {
    const off: Pt = [Math.cos(t * Math.PI * 4) * 0.16 * S, Math.sin(t * Math.PI * 4) * 0.16 * S];
    r = add(r, off);
    if (l && keys[0].l && keys[0].l !== keys[1].l) l = add(l, [-off[0], off[1]]);
  }
  if (motion === 'tap') r = add(r, [0, Math.abs(Math.sin(t * Math.PI * 3)) * 0.14 * S]);
  if (motion === 'shake') angR += Math.sin(t * Math.PI * 6) * 0.35;
  return { r, l, angR, angL: lerp(a.angL, b.angL, local), shapeR: lerpShape(a.shapeR, b.shapeR, local), shapeL: lerpShape(a.shapeL, b.shapeL, local) };
}

function buildClip(word: string, r: Rand): SkeletonClip {
  const { keys, motion } = plan(r);
  const riseMs = 230;
  const signMs = Math.round(range(r, 650, 950));
  const fallMs = 230;
  const total = riseMs + signMs + fallMs;
  const restShape = SHAPES[1];
  const frames: SkeletonClip['frames'] = [];

  for (let t = 0; t <= total; t += 1000 / FPS) {
    let pR: Pt;
    let pL: Pt;
    let aR: number;
    let aL: number;
    let sR: Shape;
    let sL: Shape;
    let leftRaised = true;
    if (t < riseMs || t > riseMs + signMs) {
      // naik dari / turun ke posisi istirahat
      const k = t < riseMs ? keys[0] : keys[keys.length - 1];
      const w = ease(t < riseMs ? t / riseMs : 1 - (t - riseMs - signMs) / fallMs);
      const end = t < riseMs ? sample(keys, motion, 0) : sample(keys, motion, 1);
      pR = lerpPt(REST_R, end.r, w);
      pL = end.l ? lerpPt(REST_L, end.l, w) : REST_L;
      aR = lerp(-Math.PI / 2 - 0.2, end.angR, w);
      aL = lerp(-Math.PI / 2 + 0.2, end.angL, w);
      sR = lerpShape(restShape, k.shapeR, w);
      sL = lerpShape(restShape, k.shapeL, w);
      leftRaised = !!end.l;
    } else {
      const s = sample(keys, motion, (t - riseMs) / signMs);
      pR = s.r;
      pL = s.l ?? REST_L;
      aR = s.angR;
      aL = s.angL;
      sR = s.shapeR;
      sL = s.shapeL;
      leftRaised = !!s.l;
    }
    const pose: Pt[] = [NOSE, L_SH, R_SH, elbow(L_SH, pL, 1), elbow(R_SH, pR, -1), pL, pR];
    const hands: SkeletonClip['frames'][number]['hands'] = [
      { side: 'Right', pts: handPoints(pR, aR, sR, 1).map(norm) },
      { side: 'Left', pts: handPoints(pL, aL, leftRaised ? sL : restShape, -1).map(norm) },
    ];
    frames.push({ t: Math.round(t), pose: pose.map(norm), hands, face: FACE.map(norm) });
  }

  return {
    phraseId: `gen:${word}`,
    text: word,
    clip: 'generated',
    source: 'generated (ADR-051 D5)',
    fps: FPS,
    durationMs: frames[frames.length - 1].t,
    width: W,
    height: H,
    mirrored: false,
    posePoints: [0, 11, 12, 13, 14, 15, 16],
    frames,
  };
}

// ------------------------------------------------------------------ jaminan beda dari kata terlatih

type Signature = Pt[];

/** Lintasan kedua pergelangan (relatif tengah bahu, satuan lebar bahu), dicuplik SIG_POINTS titik. */
function signature(clip: SkeletonClip): Signature {
  const p = processSkeleton(clip);
  const out: Pt[] = [];
  const fs = p.frames;
  for (const slot of [0, 1] as const) {
    for (let i = 0; i < SIG_POINTS; i++) {
      const f = fs[Math.round((i / (SIG_POINTS - 1)) * (fs.length - 1))];
      const mx = (f.pose[P.lSh][0] + f.pose[P.rSh][0]) / 2;
      const my = (f.pose[P.lSh][1] + f.pose[P.rSh][1]) / 2;
      const h = f.hands[slot];
      const wr = h && h.alpha === 1 ? h.pts[0] : f.pose[slot === 0 ? P.lWr : P.rWr];
      out.push([(wr[0] - mx) / p.shoulderW, (wr[1] - my) / p.shoulderW]);
    }
  }
  return out;
}

const distance = (a: Signature, b: Signature) => a.reduce((s, p, i) => s + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length;

let trained: Signature[] | null = null;
const trainedSignatures = () => (trained ??= allSkeletonClips().map(signature));

/** Jarak terdekat kandidat ke semua klip terlatih (untuk pengujian & pemilihan kandidat). */
export function nearestTrainedDistance(clip: SkeletonClip): number {
  const sig = signature(clip);
  return Math.min(Infinity, ...trainedSignatures().map((t) => distance(sig, t)));
}

const cache = new Map<string, SkeletonClip>();

/** Klip buatan untuk satu kata (huruf kecil). Hasil di-cache. */
export function generatedClip(word: string): SkeletonClip {
  const key = word.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  let best: { clip: SkeletonClip; d: number } | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const clip = buildClip(key, rng(`${key}#${attempt}`));
    const d = nearestTrainedDistance(clip);
    if (!best || d > best.d) best = { clip, d };
    if (d >= MIN_DISTANCE) break;
  }
  cache.set(key, best!.clip);
  return best!.clip;
}

export const GENERATED_MIN_DISTANCE = MIN_DISTANCE;
