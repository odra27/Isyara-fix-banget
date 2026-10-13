import type { HandFrame } from '@/types/kiosk';

/**
 * Jalur frame tangan → auto-capture. Sumber frame:
 * - useHandTracking (MediaPipe, kamera asli)
 * - SimulatorPanel (frame sintetis untuk uji skenario tanpa kamera)
 * `null` berarti frame tanpa tangan terdeteksi. Sumber wajib tetap mengirim null tiap frame
 * agar stop condition "tangan hilang > 500 ms" bisa dihitung.
 */
type Listener = (frame: HandFrame | null, now: number) => void;
const listeners = new Set<Listener>();

export const frameBus = {
  /** true selama replay contoh (?dev=1) berjalan: frame kamera live diabaikan agar tidak tercampur. */
  liveMuted: false,
  emit(frame: HandFrame | null, now = performance.now()) {
    listeners.forEach((l) => l(frame, now));
  },
  on(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
