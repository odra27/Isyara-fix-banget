import { APP } from '@/config/app.config';
import { decideAction } from '@/config/confidence.config';
import { phraseById, studentPhrases } from '@/data/phrases.mock';
import { tokenizeWords } from './textMatch';
import type { HandFrame, MatchResult } from '@/types/kiosk';
import { logsService } from './logs.service';

/**
 * Service matching. FE TIDAK memanggil model langsung, semua lewat BE (SYSTEM_DESIGN.md §2).
 * - VITE_API_BASE_URL kosong → mockMatchingService (bisa dikendalikan SimulatorPanel).
 * - VITE_API_BASE_URL terisi → httpMatchingService sesuai kontrak SYSTEM_DESIGN.md §4.2.
 */
export interface MatchingService {
  matchSign(sequence: HandFrame[], durationMs: number): Promise<MatchResult>;
  matchText(utterance: string): Promise<MatchResult>;
}

export class MatchingError extends Error {
  constructor(
    message: string,
    public kind: 'timeout' | 'network' | 'server',
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- HTTP (asli)

/** Kontrak BE: Backend/app/api/sign.py (SignMatchResponse). */
type ApiMatchResponse = {
  phrase_id: string | null;
  phrase_text: string | null;
  confidence: number;
  action: 'accepted' | 'pending_confirmation' | 'escalated_to_jbi';
  video_url?: string | null;
};

/**
 * HandFrame[] → SignSequence BE (Backend/app/modeling/sequence.py = skema model ml/src/bisindo/schema.py).
 * Kamera diproses tanpa mirror → mirrored: false. width/height = ukuran asli kamera.
 */
export function toSignSequence(frames: HandFrame[]) {
  const t0 = frames[0]?.t ?? 0;
  const first = frames.find((f) => f.width && f.height);
  return {
    frames: frames.map((f) => ({
      t_ms: Math.max(0, f.t - t0),
      hands: f.hands.slice(0, 2).map((landmarks, i) => ({
        landmarks,
        handedness: f.handedness?.[i] ?? (i === 0 ? 'Right' : 'Left'),
        score: f.handScores?.[i] ?? f.score,
      })),
      pose: f.pose ?? null,
    })),
    mirrored: false,
    width: Math.round(first?.width ?? 1280),
    height: Math.round(first?.height ?? 720),
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), APP.requestTimeoutMs);
  try {
    const res = await fetch(`${APP.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new MatchingError(`HTTP ${res.status}`, 'server');
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof MatchingError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new MatchingError('Timeout', 'timeout');
    throw new MatchingError('Network error', 'network');
  } finally {
    clearTimeout(timer);
  }
}

const fromApi = (r: ApiMatchResponse): MatchResult => ({
  phraseId: r.phrase_id,
  phraseText: r.phrase_text,
  confidence: r.confidence,
  // BE menyebut pita tengah "pending_confirmation", FE menyebutnya "confirmed" (perlu konfirmasi).
  action: r.action === 'pending_confirmation' ? 'confirmed' : r.action,
  videoUrl: r.video_url ?? null,
});

export const httpMatchingService: MatchingService = {
  async matchSign(sequence, durationMs) {
    const r = await post<ApiMatchResponse>('/api/match/sign', {
      device_id: APP.deviceId,
      sequence: toSignSequence(sequence),
      duration_ms: Math.max(500, Math.round(durationMs)),
    });
    const result = fromApi(r);
    // Catat lokal untuk panel simulator (?dev=1). Log asli sudah ditulis BE oleh endpoint match.
    logsService.add({ direction: 'sign_to_text', predictedPhraseId: result.phraseId, confidence: result.confidence, resultedAction: result.action, source: 'match' });
    return result;
  },
  async matchText(utterance) {
    // /api/match/text masih diblokir (ADR-047 D10). Sementara tokenizer lokal (ADR-050), tanpa delay.
    return matchTextLocal(utterance);
  },
};

// ---------------------------------------------------------------- Mock

/** Diubah oleh SimulatorPanel (?dev=1). */
export const mockControls = {
  /** null = acak. Nilai 0–1 memaksa confidence. */
  forcedConfidence: null as number | null,
  /** null = acak 400–1200 ms. */
  delayMs: null as number | null,
  failBackend: false,
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = () => mockControls.delayMs ?? 400 + Math.random() * 800;

function randomConfidence() {
  const r = Math.random();
  if (r < 0.6) return 0.86 + Math.random() * 0.1;
  if (r < 0.85) return 0.62 + Math.random() * 0.2;
  return 0.3 + Math.random() * 0.25;
}

async function simulateNetwork() {
  const d = randomDelay();
  if (mockControls.failBackend) {
    await wait(Math.min(d, APP.requestTimeoutMs));
    throw new MatchingError('Mock backend dimatikan', 'network');
  }
  if (d > APP.requestTimeoutMs) {
    await wait(APP.requestTimeoutMs);
    throw new MatchingError('Timeout', 'timeout');
  }
  await wait(d);
}

/**
 * Kalimat guru → urutan kata (ADR-050, ADR-051 D5). Kata kosakata diperagakan dengan rekaman asli,
 * kata lain dengan gerakan buatan, jadi setiap kalimat yang berisi kata selalu diputar (accepted).
 */
export function matchTextLocal(utterance: string): MatchResult {
  const segments = tokenizeWords(utterance);
  const hits = segments.filter((s) => s.phraseId);
  for (const h of hits) {
    logsService.add({ direction: 'speech_to_sign', predictedPhraseId: h.phraseId, confidence: 1, resultedAction: 'accepted', source: 'match' });
  }
  if (segments.length === 0) {
    return { phraseId: null, phraseText: null, confidence: 0, action: 'escalated_to_jbi', segments };
  }
  return {
    phraseId: hits[0]?.phraseId ?? null,
    phraseText: segments.map((s) => s.text).join(' '),
    confidence: 1,
    action: 'accepted',
    videoUrl: hits.length === 1 && segments.length === 1 ? (phraseById(hits[0].phraseId)?.videoUrl ?? null) : null,
    segments,
  };
}

function buildResult(phraseId: string | null, confidence: number, direction: 'sign_to_text' | 'speech_to_sign'): MatchResult {
  const action = decideAction(confidence);
  const phrase = action === 'escalated_to_jbi' ? null : phraseById(phraseId);
  const result: MatchResult = {
    phraseId: phrase?.id ?? null,
    phraseText: phrase?.text ?? null,
    confidence,
    action,
    videoUrl: direction === 'speech_to_sign' ? (phrase?.videoUrl ?? null) : undefined,
  };
  logsService.add({ direction, predictedPhraseId: phraseId, confidence, resultedAction: action, source: 'match' });
  return result;
}

export const mockMatchingService: MatchingService = {
  async matchSign() {
    await simulateNetwork();
    // Mock: hanya kata kosakata model (label_XX), sama seperti yang bisa dikenali model asli.
    const words = studentPhrases.filter((p) => p.id.startsWith('label_'));
    const pick = words[Math.floor(Math.random() * words.length)];
    return buildResult(pick.id, mockControls.forcedConfidence ?? randomConfidence(), 'sign_to_text');
  },
  async matchText(utterance) {
    // Tanpa delay buatan: pencocokan teks berjalan lokal. "Matikan backend" di simulator tetap diuji.
    if (mockControls.failBackend) throw new MatchingError('Mock backend dimatikan', 'network');
    return matchTextLocal(utterance);
  },
};

/** Selalu lewat Backend (ADR-053). mockMatchingService hanya untuk SimulatorPanel (?dev=1, kiosk). */
export const matchingService: MatchingService = httpMatchingService;
export const isMockBackend = false;
