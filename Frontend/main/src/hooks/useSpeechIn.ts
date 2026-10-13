import { useCallback, useEffect, useRef, useState } from 'react';
import { APP } from '@/config/app.config';

/**
 * Speech-to-text (Web Speech API, id-ID). Dipicu tombol "Bicara" (tekan sekali, bukan tahan).
 * Transkrip interim ditampilkan live, transkrip final dikirim lewat onFinal.
 */

// Tipe minimal: SpeechRecognition belum ada di lib.dom TypeScript.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

const getCtor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export type SpeechInError = 'unsupported' | 'denied' | 'no-speech' | 'other';

export function useSpeechIn(opts: { onFinal: (text: string) => void; onUnavailable?: (e: SpeechInError) => void }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<SpeechInError | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef('');
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const supported = typeof window !== 'undefined' && getCtor() !== null;

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError('unsupported');
      optsRef.current.onUnavailable?.('unsupported');
      return;
    }
    rec.current?.abort();
    const r = new Ctor();
    r.lang = APP.speechLang;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    finalText.current = '';
    setInterim('');
    setError(null);

    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript;
        else live += res[0].transcript;
      }
      setInterim((finalText.current + ' ' + live).trim());
    };
    r.onerror = (e) => {
      const kind: SpeechInError = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' ? 'no-speech' : 'other';
      setError(kind);
      if (kind === 'denied') optsRef.current.onUnavailable?.('denied');
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
      const text = finalText.current.trim();
      if (text) optsRef.current.onFinal(text);
    };

    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
      setError('other');
    }
  }, []);

  /** Berhenti dan kirim transkrip yang sudah final. */
  const stop = useCallback(() => rec.current?.stop(), []);
  /** Batalkan tanpa mengirim apa pun. */
  const abort = useCallback(() => {
    finalText.current = '';
    rec.current?.abort();
    setListening(false);
    setInterim('');
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, interim, error, start, stop, abort };
}
