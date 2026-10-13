/**
 * Pengaturan animasi kerangka. Ubah angka di sini, tidak perlu menyentuh komponen.
 */
export const SKELETON = {
  /** 1 = kecepatan asli video. 0.75 = sedikit lebih pelan agar lebih mudah diikuti. */
  speed: 1,
  /** Tahan pose awal sebelum bergerak (ms). */
  holdStartMs: 400,
  /** Tahan pose akhir setelah selesai (ms). */
  holdEndMs: 700,
  /**
   * Kalimat: transisi antar kata (ms). Jeda awal/akhir di atas hanya dipakai di kata pertama & terakhir,
   * dan bagian "tangan turun lalu naik lagi" di sambungan antar kata dipotong supaya terasa satu kalimat.
   */
  transitionMs: 150,
  /** Kalimat: gerak tangan per frame di bawah ini (satuan lebar bahu) dianggap diam & dipotong di sambungan. */
  stillMotion: 0.01,
  /** Kalimat: frame diam yang tetap disisakan di sambungan supaya pose akhir masih terbaca. */
  keepStillFrames: 3,
  /** Celah deteksi tangan sampai sekian frame diisi interpolasi agar tidak berkedip. */
  maxGapFrames: 8,
  /** Tangan dianggap "istirahat" bila pergelangan lebih dari N lebar bahu di bawah garis bahu (aturan ML). */
  restBelowShoulders: 1.35,
  /** Opasitas tangan yang sedang istirahat (0 = disembunyikan). */
  restingAlpha: 0.28,
  /** Jarak tepi tampilan di sekitar badan, dalam satuan lebar bahu. */
  paddingShoulders: 0.45,
  /** Tampilkan muka sederhana (mata, telinga, mulut) supaya letak tangan terhadap wajah jelas. */
  showFace: true,
  colors: {
    /** Mata & mulut. */
    face: '#CECBF6',
    /** Kepala & badan: siluet gelap. JANGAN sama dengan latar panel (bg-brand-800 #3C3489), nanti tak terlihat. */
    head: '#1F1A4D',
    /** Telinga, sedikit lebih terang dari kepala. */
    ear: '#534AB7',
    body: '#1F1A4D',
    arm: '#7F77DD',
    bone: '#CECBF6',
    joint: '#FFFFFF',
    tip: '#AFA9EC',
  },
} as const;
