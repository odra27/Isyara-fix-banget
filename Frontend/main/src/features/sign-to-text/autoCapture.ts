import { CAPTURE, type CaptureConfig } from '@/config/capture.config';
import type { HandFrame, Landmark } from '@/types/kiosk';

/**
 * State machine auto-capture (SYSTEM_DESIGN.md §9.1) sebagai fungsi MURNI:
 *   stepCapture(state, frame | null, now) → { state, event? }
 * Tidak menyentuh DOM/kamera sehingga bisa di-unit-test dengan frame sintetis.
 *
 * IDLE ──tangan──▶ HAND_DETECTED ──stabil ≥ handStableMs──▶ RECORDING ──stop──▶ (event 'stop' | 'noise')
 *                      └─tangan hilang─▶ IDLE (event 'falseStart')
 * PROCESSING & RESULT dikelola useSignFlow, bukan di sini.
 */
export type CapturePhase = 'IDLE' | 'HAND_DETECTED' | 'RECORDING';
export type StopReason = 'still' | 'handLost' | 'timeout';

export type CaptureState = {
  phase: CapturePhase;
  detectedAt: number | null;
  recordStart: number | null;
  lastHandAt: number | null;
  /** Awal tangan hilang selama RECORDING (null = tangan terlihat). */
  lostSince: number | null;
  stillSince: number | null;
  prevHands: Landmark[][] | null;
  motions: number[];
  frames: HandFrame[];
  avgMotion: number;
};

export type CaptureEvent =
  | { type: 'falseStart' }
  | { type: 'recordingStarted' }
  | { type: 'stop'; reason: StopReason; frames: HandFrame[]; durationMs: number }
  | { type: 'noise'; reason: StopReason; durationMs: number };

export const initialCapture = (): CaptureState => ({
  phase: 'IDLE',
  detectedAt: null,
  recordStart: null,
  lastHandAt: null,
  lostSince: null,
  stillSince: null,
  prevHands: null,
  motions: [],
  frames: [],
  avgMotion: 0,
});

/** Rata-rata perpindahan euclidean landmark yang berpasangan antar dua frame. */
export function frameMotion(a: Landmark[][], b: Landmark[][]) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  let count = 0;
  for (let h = 0; h < n; h++) {
    const len = Math.min(a[h].length, b[h].length);
    for (let i = 0; i < len; i++) {
      const dx = a[h][i][0] - b[h][i][0];
      const dy = a[h][i][1] - b[h][i][1];
      sum += Math.hypot(dx, dy);
      count++;
    }
  }
  return count ? sum / count : 0;
}

/** Tangan yang terangkat (bukan posisi istirahat). Hanya ini yang memicu capture & dihitung gerakannya. */
export function activeHands(frame: HandFrame): Landmark[][] {
  return frame.raised ? frame.hands.filter((_, i) => frame.raised![i]) : frame.hands;
}

function finish(s: CaptureState, reason: StopReason, now: number, cfg: CaptureConfig) {
  // Sama dengan AutoCapture di ml/scripts/live_demo.py: durasi dihitung dari tangan pertama terdeteksi,
  // dan waktu menunggu "tangan hilang" bukan bagian dari isyarat.
  const end = reason === 'handLost' ? (s.lostSince ?? s.lastHandAt ?? now) : now;
  const durationMs = end - (s.detectedAt ?? end);
  const event: CaptureEvent =
    durationMs < cfg.minRecordMs ? { type: 'noise', reason, durationMs } : { type: 'stop', reason, frames: s.frames, durationMs };
  // Buffer dibuang dari state (privasi, SYSTEM_DESIGN.md §12).
  return { state: initialCapture(), event };
}

/**
 * `frame` null = frame tanpa data (mis. simulator). Frame dengan `hands` kosong / semua tangan istirahat
 * tetap dikirim tracker supaya ikut ke sekuens saat RECORDING (model dilatih dengan sekuens utuh).
 */
export function stepCapture(
  s: CaptureState,
  frame: HandFrame | null,
  now: number,
  cfg: CaptureConfig = CAPTURE,
): { state: CaptureState; event?: CaptureEvent } {
  const active = frame ? activeHands(frame) : [];
  const hasHand = active.length > 0 && frame!.score >= cfg.minHandConfidence;
  const asFrame = (): HandFrame => frame ?? { t: now, hands: [], score: 0 };

  switch (s.phase) {
    case 'IDLE': {
      if (!hasHand) return { state: s };
      return {
        state: { ...initialCapture(), phase: 'HAND_DETECTED', detectedAt: now, lastHandAt: now, prevHands: active, frames: [frame!] },
      };
    }

    case 'HAND_DETECTED': {
      if (!hasHand) {
        // Toleransi flicker detektor; frame tanpa tangan di masa ini tidak masuk buffer.
        if (now - (s.lastHandAt ?? now) > cfg.detectGraceMs) return { state: initialCapture(), event: { type: 'falseStart' } };
        return { state: s };
      }
      // Pre-roll: frame debounce adalah bagian dari isyarat.
      const frames = [...s.frames, frame!];
      if (now - (s.detectedAt ?? now) >= cfg.handStableMs) {
        return {
          // prevHands null: gerakan mulai dihitung dari frame RECORDING berikutnya (sama dengan live_demo.py).
          state: { ...s, phase: 'RECORDING', recordStart: now, lastHandAt: now, frames, prevHands: null, motions: [] },
          event: { type: 'recordingStarted' },
        };
      }
      return { state: { ...s, lastHandAt: now, prevHands: active, frames } };
    }

    case 'RECORDING': {
      let next: CaptureState = { ...s, frames: [...s.frames, asFrame()] };
      if (hasHand) {
        const m = s.prevHands && s.prevHands.length === active.length ? frameMotion(s.prevHands, active) : null;
        const motions = m === null ? s.motions : [...s.motions, m].slice(-cfg.motionWindowFrames);
        const avg = motions.length ? motions.reduce((a, b) => a + b, 0) / motions.length : 1;
        const isStill = avg < cfg.motionThreshold;
        next = {
          ...next,
          lastHandAt: now,
          lostSince: null,
          prevHands: active,
          motions,
          avgMotion: avg,
          // Timer diam reset setiap gerakan melewati ambang → jeda alami tidak memutus rekaman.
          stillSince: isStill ? (s.stillSince ?? now) : null,
        };
      } else {
        next = { ...next, lostSince: s.lostSince ?? now };
        if (now - next.lostSince! > cfg.handLostMs) return finish(next, 'handLost', now, cfg);
      }

      if (now - (next.recordStart ?? now) >= cfg.maxRecordMs) return finish(next, 'timeout', now, cfg);
      if (next.stillSince !== null && now - next.stillSince >= cfg.stillHoldMs) return finish(next, 'still', now, cfg);
      return { state: next };
    }
  }
}

/** Angka untuk overlay debug kalibrasi (?dev=1). */
export function captureDebug(s: CaptureState, now: number) {
  return {
    phase: s.phase,
    avgMotion: s.avgMotion,
    stillMs: s.stillSince !== null ? now - s.stillSince : 0,
    lostMs: s.phase === 'RECORDING' && s.lastHandAt !== null ? Math.max(0, now - s.lastHandAt) : 0,
    durationMs: s.recordStart !== null ? now - s.recordStart : 0,
    frameCount: s.frames.length,
  };
}
export type CaptureDebug = ReturnType<typeof captureDebug>;
