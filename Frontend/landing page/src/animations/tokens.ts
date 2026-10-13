/** Easing & durasi terpusat (lihat prompt animasi §8). Jangan tulis angka lepas di komponen. */
export const EASE = {
  enter: 'power3.out',
  exit: 'power2.in',
  loop: 'sine.inOut',
  pop: 'back.out(2)',
  reveal: 'power2.inOut',
} as const;

export const DUR = {
  micro: 0.2,
  base: 0.4,
  slow: 0.6,
} as const;

/**
 * Timing loop demo mode kiosk (detik). Nilai mencerminkan guard rail PRD §9:
 * debounce 250 ms, ambang diam 1.5 dtk, batas rekam 8 dtk.
 * Pulse "Merekam" dijaga >= 1.2 dtk per siklus (keamanan fotosensitif).
 */
export const DEMO = {
  idle: 1.8,
  detected: 0.45,
  recording: 2.6,
  still: 1.5,
  processing: 0.9,
  result: 3.2,
  maxRecord: 8,
  pulseHalf: 0.65,
} as const;
/** Timing mockup tablet di hero (detik): lama satu langkah siklus air disorot & ayunan float. */
export const TABLET = {
  stepHold: 2.6,
  floatHalf: 3.2,
  signHalf: 0.7,
} as const;
/** Timing mock chat Tanya ISYARA (detik). */
export const CHAT = {
  typing: 1.1,
  gap: 0.35,
} as const;
