import { useEffect, useState } from 'react';

/**
 * Level suara mic real-time (AnalyserNode) untuk visual "suara tertangkap" saat petugas bicara.
 * Mengembalikan `bars` nilai 0–1, atau null bila mic tidak bisa dibaca (UI memakai animasi cadangan).
 * Audio hanya dianalisis di memori, tidak direkam atau dikirim ke mana pun.
 */
export function useMicLevel(active: boolean, bars = 7) {
  const [levels, setLevels] = useState<number[] | null>(null);

  useEffect(() => {
    // Android: membuka mic kedua bisa mengganggu SpeechRecognition → pakai animasi cadangan.
    if (!active || !navigator.mediaDevices?.getUserMedia || /Android/i.test(navigator.userAgent)) {
      setLevels(null);
      return;
    }
    let cancelled = false;
    let raf = 0;
    let last = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.7;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        // Rentang frekuensi suara manusia ada di bin-bin awal; abaikan bin 0 (DC).
        const usable = Math.min(buf.length - 1, bars * 2);

        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          if (now - last < 33) return; // ~30 fps cukup, hemat render
          last = now;
          analyser.getByteFrequencyData(buf);
          const out: number[] = [];
          for (let i = 0; i < bars; i++) {
            const idx = 1 + Math.floor((i / bars) * usable);
            out.push(Math.min(1, buf[idx] / 200));
          }
          setLevels(out);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setLevels(null);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [active, bars]);

  return levels;
}
