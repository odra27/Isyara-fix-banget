import type { HandFrame, Landmark } from '@/types/kiosk';
import { frameBus } from './frameBus';

/**
 * Generator frame tangan sintetis untuk SimulatorPanel & unit test.
 * Gerak = osilasi sinus (rata-rata perpindahan ≈ 0.013/frame, di atas motionThreshold 0.008).
 * Diam = noise kecil (≈ 0.001/frame).
 */
export type Segment = { kind: 'move' | 'still' | 'none'; ms: number };

export const SCENARIOS = {
  normal: [
    { kind: 'none', ms: 300 },
    { kind: 'move', ms: 2200 },
    { kind: 'still', ms: 1800 },
    { kind: 'none', ms: 400 },
  ],
  falseStart: [
    { kind: 'none', ms: 200 },
    { kind: 'move', ms: 150 },
    { kind: 'none', ms: 900 },
  ],
  jedaAlami: [
    { kind: 'none', ms: 200 },
    { kind: 'move', ms: 1200 },
    { kind: 'still', ms: 800 },
    { kind: 'move', ms: 1200 },
    { kind: 'still', ms: 1800 },
    { kind: 'none', ms: 300 },
  ],
  tanganKeluar: [
    { kind: 'none', ms: 200 },
    { kind: 'move', ms: 1800 },
    { kind: 'none', ms: 900 },
  ],
  timeout: [
    { kind: 'none', ms: 200 },
    { kind: 'move', ms: 9000 },
    { kind: 'none', ms: 300 },
  ],
} satisfies Record<string, Segment[]>;

export type ScenarioName = keyof typeof SCENARIOS;

const BASE: Landmark[] = Array.from({ length: 21 }, (_, i) => [0.4 + (i % 5) * 0.03, 0.35 + Math.floor(i / 5) * 0.04, 0]);

export function syntheticFrame(kind: 'move' | 'still', t: number): HandFrame {
  const phase = (t / 1000) * 2 * Math.PI * 2; // 2 Hz
  const dx = kind === 'move' ? Math.sin(phase) * 0.05 : (Math.random() - 0.5) * 0.002;
  const dy = kind === 'move' ? Math.cos(phase) * 0.03 : (Math.random() - 0.5) * 0.002;
  const hand = BASE.map(([x, y, z]) => [x + dx, y + dy, z] as Landmark);
  return { t, hands: [hand], score: 0.92 };
}

/** Rangkaian (frame, waktu) pada ~30 fps, dipakai unit test & player. */
export function* scenarioFrames(segments: Segment[], fps = 30, start = 0) {
  const step = 1000 / fps;
  let t = start;
  for (const seg of segments) {
    const end = t + seg.ms;
    for (; t < end; t += step) {
      yield { now: t, frame: seg.kind === 'none' ? null : syntheticFrame(seg.kind, t) };
    }
  }
}

/** Memutar skenario secara real-time ke frameBus. Mengembalikan fungsi stop. */
export function playScenario(name: ScenarioName, onDone?: () => void) {
  const segments: Segment[] = SCENARIOS[name];
  const total = segments.reduce((a, s) => a + s.ms, 0);
  const t0 = performance.now();
  let cursor = 0;
  let segEnd = segments[0].ms;
  frameBus.liveMuted = true; // jangan campur dengan frame kamera asli
  const id = window.setInterval(() => {
    const now = performance.now();
    const elapsed = now - t0;
    if (elapsed >= total) {
      window.clearInterval(id);
      frameBus.liveMuted = false;
      onDone?.();
      return;
    }
    while (elapsed >= segEnd && cursor < segments.length - 1) {
      cursor++;
      segEnd += segments[cursor].ms;
    }
    const kind = segments[cursor].kind;
    frameBus.emit(kind === 'none' ? null : syntheticFrame(kind, now), now);
  }, 1000 / 30);
  return () => {
    window.clearInterval(id);
    frameBus.liveMuted = false;
  };
}
