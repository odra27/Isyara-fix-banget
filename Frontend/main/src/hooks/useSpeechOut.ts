import { useCallback, useEffect, useRef, useState } from 'react';
import { APP } from '@/config/app.config';

/**
 * Text-to-speech (Web Speech API, id-ID). Hasil Alur A dibacakan untuk petugas.
 * `speaking` tetap true selama TTS + ttsCooldownMs, dipakai untuk mem-pause STT (anti feedback loop).
 * Jika browser tidak mendukung TTS, teks tetap tampil di layar (tidak ada info yang hanya lewat suara).
 */
export function useSpeechOut() {
  const [speaking, setSpeaking] = useState(false);
  const cooldown = useRef<number | undefined>(undefined);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang === APP.speechLang) ?? voices.find((v) => v.lang.startsWith('id')) ?? null;
  };

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!supported) return resolve();
        window.clearTimeout(cooldown.current);
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = APP.speechLang;
        const voice = pickVoice();
        if (voice) u.voice = voice;
        u.rate = 0.95;
        const done = () => {
          cooldown.current = window.setTimeout(() => setSpeaking(false), APP.ttsCooldownMs);
          resolve();
        };
        u.onend = done;
        u.onerror = done;
        setSpeaking(true);
        window.speechSynthesis.speak(u);
      }),
    [supported],
  );

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  useEffect(() => () => window.clearTimeout(cooldown.current), []);

  return { speak, cancel, speaking, supported };
}
