/**
 * Guard rail auto-capture (PRD §9, PRD-FE §4.1).
 * WAJIB dikalibrasi di device asli sebelum demo. Pakai ?dev=1 untuk melihat nilai motion & timer secara live.
 */
// Nilai disamakan dengan ml/config/default.yaml → capture: (dipakai saat model diuji).
export const CAPTURE = {
  handStableMs: 250, // debounce sebelum masuk RECORDING
  detectGraceMs: 150, // toleransi detector flicker selama debounce
  minRecordMs: 500, // di bawah ini = noise, buang, kembali IDLE
  maxRecordMs: 8000, // timeout paksa → tetap PROCESSING
  stillHoldMs: 1500, // rentang 1000–2000
  handLostMs: 500, // tangan hilang > ini = stop (toleransi flicker)
  motionWindowFrames: 10, // rata-rata perpindahan dari N frame terakhir
  motionThreshold: 0.008, // perpindahan landmark ternormalisasi per frame
  // 0 = sama dengan live_demo.py: MediaPipe sudah menyaring deteksi di 0,5. Skor yang tersedia di frame
  // adalah skor handedness (kiri/kanan), bukan skor deteksi, jadi jangan dipakai menyaring tangan.
  minHandConfidence: 0,
  restMaskY: 1.35, // pergelangan > 1,35 × lebar bahu di bawah garis bahu = tangan istirahat (ml features.rest_mask_y)
} as const;

export type CaptureConfig = { [K in keyof typeof CAPTURE]: number };
