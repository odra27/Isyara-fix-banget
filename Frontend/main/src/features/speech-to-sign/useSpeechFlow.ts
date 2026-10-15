import { useCallback, useEffect, useRef, useState } from 'react';
import { APP } from '@/config/app.config';
import { phraseById } from '@/data/phrases.mock';
import { useSpeechIn } from '@/hooks/useSpeechIn';
import { logsService } from '@/services/logs.service';
import { matchingService } from '@/services/matching.service';
import { useKiosk } from '@/state/KioskContext';
import type { MatchResult } from '@/types/kiosk';

/**
 * Alur B: suara/teks guru → animasi isyarat (SYSTEM_DESIGN.md §3.6 & §9.5).
 * B_IDLE → B_LISTENING → B_MATCHING → B_PLAYING_SIGN → B_IDLE
 *                                   ↘ B_CONFIRM (ke guru)   ↘ B_NO_MATCH
 */
export type SpeechPhase = 'IDLE' | 'LISTENING' | 'MATCHING' | 'CONFIRM' | 'PLAYING' | 'NO_MATCH' | 'TEXT_ONLY';

export function useSpeechFlow() {
  const k = useKiosk();
  const [phase, setPhase] = useState<SpeechPhase>('IDLE');
  const [result, setResult] = useState<MatchResult | null>(null);
  const [lastUtterance, setLastUtterance] = useState('');
  /** Naik setiap pemutaran baru, supaya kalimat yang sama diputar ulang dari awal. */
  const [playId, setPlayId] = useState(0);
  const reqId = useRef(0);
  const holdTimer = useRef<number | undefined>(undefined);

  const submit = useCallback(
    async (utterance: string, channel: 'suara' | 'ketik') => {
      const text = utterance.trim();
      if (!text) return;
      setLastUtterance(text);
      k.say({ from: 'guru', text, channel });

      // Backend mati: tampilkan teks guru apa adanya ke siswa (tetap bisa dibaca).
      if (k.speechFallback === 'backend') {
        setResult(null);
        setPhase('TEXT_ONLY');
        return;
      }

      setPhase('MATCHING');
      const id = ++reqId.current;
      try {
        const r = await matchingService.matchText(text);
        if (id !== reqId.current) return;
        setResult(r);
        if (r.action === 'accepted') setPlayId((n) => n + 1);
        setPhase(r.action === 'accepted' ? 'PLAYING' : r.action === 'confirmed' ? 'CONFIRM' : 'NO_MATCH');
      } catch {
        if (id !== reqId.current) return;
        k.setSpeechFallback('backend');
        setPhase('TEXT_ONLY');
      }
    },
    [k],
  );

  const mic = useSpeechIn({
    onFinal: (t) => void submit(t, 'suara'),
    onUnavailable: () => k.setSpeechFallback('mic'),
  });

  // Alasan tombol Bicara nonaktif harus tertulis (SYSTEM_DESIGN.md §3.6).
  const talkBlockedReason = k.signRecording
    ? 'Siswa sedang mengisyaratkan. Tunggu sampai selesai.'
    : k.ttsSpeaking
      ? 'Suara sedang dibacakan. Mic aktif lagi setelah selesai.'
      : phase === 'MATCHING'
        ? 'Sedang mencocokkan ucapan.'
        : null;

  const startTalking = useCallback(() => {
    if (talkBlockedReason) return;
    setResult(null);
    setPhase('LISTENING');
    mic.start();
  }, [mic, talkBlockedReason]);

  // TTS mulai berbunyi saat mic aktif → hentikan mic (anti feedback loop).
  useEffect(() => {
    if (k.ttsSpeaking && mic.listening) mic.abort();
  }, [k.ttsSpeaking, mic]);

  // Mic selesai tanpa transkrip → kembali IDLE.
  useEffect(() => {
    if (!mic.listening && phase === 'LISTENING') setPhase('IDLE');
  }, [mic.listening, phase]);

  // Flag arbitrase: listening / video diputar → auto-capture di-pause.
  useEffect(() => {
    k.setSpeechActive(phase === 'LISTENING' || phase === 'PLAYING');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  useEffect(() => () => k.setSpeechActive(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    reqId.current++;
    window.clearTimeout(holdTimer.current);
    mic.abort();
    setResult(null);
    setPhase('IDLE');
  }, [mic]);

  const confirm = useCallback(() => {
    if (!result) return;
    logsService.add({ direction: 'speech_to_sign', predictedPhraseId: result.phraseId, confidence: result.confidence, resultedAction: 'confirmed', source: 'user' });
    setResult({ ...result, action: 'accepted' });
    setPlayId((n) => n + 1);
    setPhase('PLAYING');
  }, [result]);

  /** Mode fallback / pintasan: guru memilih frasa langsung → putar animasi. */
  const playPhrase = useCallback(
    (phraseId: string) => {
      const p = phraseById(phraseId);
      if (!p) return;
      reqId.current++;
      k.say({ from: 'guru', text: p.text, channel: 'pilih-manual' });
      setLastUtterance(p.text);
      setResult({ phraseId: p.id, phraseText: p.text, confidence: 1, action: 'accepted', videoUrl: p.videoUrl, segments: [{ phraseId: p.id, text: p.text }] });
      setPlayId((n) => n + 1);
      setPhase('PLAYING');
    },
    [k],
  );

  const onVideoDone = useCallback(() => {
    window.clearTimeout(holdTimer.current);
    // Video tetap terlihat sebentar (bisa diulang), lalu panel kembali siap.
    holdTimer.current = window.setTimeout(() => setPhase((p) => (p === 'PLAYING' ? 'IDLE' : p)), APP.resultHoldMs);
    k.setSpeechActive(false);
  }, [k]);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  return {
    phase,
    result,
    playId,
    lastUtterance,
    interim: mic.interim,
    micSupported: mic.supported,
    micError: mic.error,
    listening: mic.listening,
    talkBlockedReason,
    startTalking,
    stopTalking: mic.stop,
    submitText: (t: string) => submit(t, 'ketik'),
    confirm,
    reset,
    playPhrase,
    onVideoDone,
  };
}
