import { useCallback, useEffect, useRef, useState } from 'react';
import { APP } from '@/config/app.config';
import { logsService } from '@/services/logs.service';
import { matchingService } from '@/services/matching.service';
import { useKiosk } from '@/state/KioskContext';
import type { MatchResult } from '@/types/kiosk';
import type { CaptureEvent } from './autoCapture';
import { useAutoCapture } from './useAutoCapture';

/**
 * Alur A: isyarat → teks + suara (PRD-FE §4 & §6).
 * IDLE → HAND_DETECTED → RECORDING → PROCESSING → RESULT(accepted | confirmed | belum dikenali) → IDLE
 */
export type SignPhase = 'IDLE' | 'HAND_DETECTED' | 'RECORDING' | 'PROCESSING' | 'RESULT';

export function useSignFlow(active: boolean) {
  const k = useKiosk();
  const [stage, setStage] = useState<'capture' | 'PROCESSING' | 'RESULT'>('capture');
  const [result, setResult] = useState<MatchResult | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  const reqId = useRef(0);

  // Auto-capture hanya jalan bila panel aktif, tidak sedang proses/hasil,
  // dan guru tidak sedang bicara/memutar animasi isyarat (arbitrase PRD-FE §7.3).
  const captureEnabled = active && !k.speechActive && stage === 'capture' && k.signFallback === null;

  const deliver = useCallback(
    (r: MatchResult, channel: 'isyarat' | 'pilih-manual') => {
      if (!r.phraseText) return;
      k.say({ from: 'siswa', text: r.phraseText, channel, confidence: r.confidence });
      void k.speak(r.phraseText);
    },
    [k],
  );

  const toIdle = useCallback(() => {
    window.clearTimeout(holdTimer.current);
    reqId.current++;
    setResult(null);
    setStage('capture');
  }, []);

  const holdThenIdle = useCallback(() => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(toIdle, APP.resultHoldMs);
  }, [toIdle]);

  const onCapture = useCallback(
    async (e: CaptureEvent) => {
      if (e.type === 'recordingStarted') return k.setSignRecording(true);
      k.setSignRecording(false);
      if (e.type !== 'stop') return; // falseStart / noise: kembali IDLE diam-diam, tanpa request

      setStage('PROCESSING');
      const id = ++reqId.current;
      try {
        const r = await matchingService.matchSign(e.frames, e.durationMs);
        if (id !== reqId.current) return; // sudah di-reset user
        setResult(r);
        setStage('RESULT');
        if (r.action === 'accepted') {
          deliver(r, 'isyarat');
          holdThenIdle();
        } else if (r.action === 'escalated_to_jbi') {
          holdThenIdle();
        }
        // 'confirmed' menunggu aksi pengguna, tidak ada TTS otomatis.
      } catch {
        if (id !== reqId.current) return;
        toIdle();
        k.setSignFallback('backend');
      }
    },
    [k, deliver, holdThenIdle, toIdle],
  );

  const capture = useAutoCapture(captureEnabled, onCapture);

  /** "Ulangi Isyarat": reset paksa ke IDLE dan buang buffer. */
  const retry = useCallback(() => {
    capture.reset();
    k.setSignRecording(false);
    toIdle();
  }, [capture, k, toIdle]);

  const confirm = useCallback(() => {
    if (!result) return;
    logsService.add({ direction: 'sign_to_text', predictedPhraseId: result.phraseId, confidence: result.confidence, resultedAction: 'confirmed', source: 'user' });
    const accepted = { ...result, action: 'accepted' as const };
    setResult(accepted);
    deliver(accepted, 'isyarat');
    holdThenIdle();
  }, [result, deliver, holdThenIdle]);

  /** Mode fallback: siswa memilih frasa langsung (tanpa kamera/BE). */
  const pickManual = useCallback(
    (phraseId: string, text: string) => {
      const r: MatchResult = { phraseId, phraseText: text, confidence: 1, action: 'accepted' };
      setResult(r);
      setStage('RESULT');
      deliver(r, 'pilih-manual');
      holdThenIdle();
    },
    [deliver, holdThenIdle],
  );

  // Panel ditinggalkan → pastikan flag recording tidak menggantung.
  useEffect(() => {
    if (!active) k.setSignRecording(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const phase: SignPhase = stage === 'capture' ? capture.phase : stage;
  return { phase, result, debug: capture.debug, captureEnabled, retry, confirm, pickManual };
}
