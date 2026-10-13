import { buildHandFrame, type RawFrame } from './landmarkFrame';
import { frameBus } from './frameBus';

/**
 * Replay klip landmark asli dari dataset (public/dev-samples, dibuat scripts/export-dev-samples.py)
 * ke frameBus dengan timing aslinya. Jalurnya sama persis dengan kamera:
 * frameBus → auto-capture → POST /api/match/sign → model. Hanya untuk ?dev=1.
 */
export type DevSample = { clip: string; text: string; file: string };
type SampleFile = { clip: string; text: string; width: number; height: number; frames: (RawFrame & { t_ms: number })[] };

const DIR = `${import.meta.env.BASE_URL}dev-samples`;

export async function listDevSamples(): Promise<DevSample[]> {
  const res = await fetch(`${DIR}/index.json`);
  if (!res.ok) return [];
  return (await res.json()) as DevSample[];
}

/** Ekor tanpa tangan setelah klip, supaya stop "tangan hilang" (500 ms) terpicu seperti di kiosk. */
const TAIL_MS = 1200;
const TAIL_STEP_MS = 1000 / 30;

export async function playDevSample(sample: DevSample, onDone?: () => void): Promise<() => void> {
  const res = await fetch(`${DIR}/${sample.file}`);
  if (!res.ok) throw new Error(`Gagal memuat ${sample.file}`);
  const data = (await res.json()) as SampleFile;
  const lastPose = [...data.frames].reverse().find((f) => f.pose)?.pose ?? null;
  const t0 = data.frames[0]?.t_ms ?? 0;
  const clipMs = (data.frames.at(-1)?.t_ms ?? t0) - t0;
  const timers: number[] = [];
  const start = performance.now() + 50;
  frameBus.liveMuted = true;

  const at = (offset: number, fn: () => void) => timers.push(window.setTimeout(fn, Math.max(0, start + offset - performance.now())));

  for (const f of data.frames) {
    const offset = f.t_ms - t0;
    at(offset, () => frameBus.emit(buildHandFrame(f, start + offset, data.width, data.height), start + offset));
  }
  for (let o = clipMs + TAIL_STEP_MS; o <= clipMs + TAIL_MS; o += TAIL_STEP_MS) {
    const offset = o;
    at(offset, () => frameBus.emit(buildHandFrame({ hands: [], pose: lastPose }, start + offset, data.width, data.height), start + offset));
  }
  const stop = () => {
    timers.forEach((t) => window.clearTimeout(t));
    frameBus.liveMuted = false;
  };
  at(clipMs + TAIL_MS + 20, () => {
    stop();
    onDone?.();
  });
  return stop;
}
