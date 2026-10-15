import { APP } from '@/config/app.config';
import type { Direction, LogEntry, MatchAction } from '@/types/kiosk';
import { uid } from '@/lib/utils';

/**
 * Log pencocokan (skema `matching_logs`, PRD §15).
 * - Entri `source: 'match'` di BE asli dicatat otomatis oleh endpoint match. Di mode mock dicatat di sini.
 * - Entri `source: 'user'` (Konfirmasi) dikirim FE ke POST /api/logs (SYSTEM_DESIGN.md §4.2).
 * Tidak menyimpan video/landmark siswa. Sejak ADR-051 FE tidak lagi mengirim escalated_to_jbi.
 */
type Listener = (logs: LogEntry[]) => void;

const logs: LogEntry[] = [];
const listeners = new Set<Listener>();

export type LogInput = {
  direction: Direction;
  predictedPhraseId: string | null;
  confidence: number;
  resultedAction: MatchAction;
  source: LogEntry['source'];
};

export const logsService = {
  add(input: LogInput) {
    const entry: LogEntry = { ...input, id: uid(), deviceId: APP.deviceId, createdAt: Date.now() };
    logs.unshift(entry);
    if (logs.length > 100) logs.pop();
    listeners.forEach((l) => l([...logs]));

    // BE (backend/app/api/logs.py) hanya menerima direction sign_to_text dengan resulted_action
    // confirmed | escalated_to_jbi. speech_to_sign belum didukung BE.
    if (input.source === 'user' && input.direction === 'sign_to_text' && input.resultedAction === 'confirmed') {
      // Fire-and-forget. Gagal kirim log tidak boleh mengganggu alur komunikasi.
      fetch(`${APP.apiBaseUrl}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: entry.deviceId,
          direction: entry.direction,
          predicted_phrase_id: entry.predictedPhraseId,
          confidence: entry.confidence,
          resulted_action: entry.resultedAction,
        }),
      }).catch(() => undefined);
    }
  },
  list: () => [...logs],
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
