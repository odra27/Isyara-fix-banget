import { CAPTURE } from '@/config/capture.config';
import type { HandFrame, Landmark } from '@/types/kiosk';

/** Indeks MediaPipe Pose untuk bahu kiri / kanan. */
const L_SHOULDER = 11;
const R_SHOULDER = 12;

/**
 * Port `raised_hands` dari ml/scripts/live_demo.py: tangan yang tergantung di posisi istirahat
 * (pergelangan lebih dari `restY` × lebar bahu di bawah garis bahu) dianggap "tidak ada tangan".
 * Tanpa pose, semua tangan yang terdeteksi dianggap terangkat.
 */
export function raisedMask(hands: Landmark[][], pose: number[][] | null | undefined, aspect: number, restY = CAPTURE.restMaskY): boolean[] {
  const all = hands.map(() => true);
  if (!pose) return all;
  const ls = pose[L_SHOULDER];
  const rs = pose[R_SHOULDER];
  const width = Math.abs(ls[0] - rs[0]) * aspect;
  if (width < 1e-3) return all;
  const shoulderY = (ls[1] + rs[1]) / 2;
  return hands.map((h) => (h[0][1] - shoulderY) / width <= restY);
}

/** Input mentah satu frame (bentuk sama dengan Frame di skema model ml/src/bisindo/schema.py). */
export type RawFrame = {
  hands: { landmarks: Landmark[]; handedness: 'Left' | 'Right'; score: number }[];
  pose: number[][] | null;
};

export function buildHandFrame(raw: RawFrame, t: number, width: number, height: number): HandFrame {
  const hands = raw.hands.slice(0, 2);
  const lm = hands.map((h) => h.landmarks);
  return {
    t,
    hands: lm,
    handedness: hands.map((h) => h.handedness),
    handScores: hands.map((h) => h.score),
    raised: raisedMask(lm, raw.pose, width / height),
    pose: raw.pose,
    width,
    height,
    score: hands.reduce((m, h) => Math.max(m, h.score), 0),
  };
}
