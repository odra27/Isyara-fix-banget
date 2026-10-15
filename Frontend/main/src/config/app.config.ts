/** Konfigurasi umum aplikasi siswa. Nilai dari .env bila ada. */
export const APP = {
  /** UUID device kiosk di tabel `devices` (BE memvalidasi sebagai UUID). Dipakai /api/match/sign. */
  deviceId: import.meta.env.VITE_DEVICE_ID || '00000000-0000-4000-8000-00000000d001',
  /**
   * Aplikasi selalu memakai Backend (ADR-053: tidak ada mode demo). Kosong atau "/" = origin yang
   * sama lewat proxy Vite (/api → backend :8000, lihat vite.config.ts). URL penuh = panggil backend
   * langsung (butuh CORS). Bila backend mati, layar menampilkan "Tidak bisa terhubung ke server".
   */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  landingUrl: import.meta.env.VITE_LANDING_URL || '/',
  /** Request ke BE dianggap gagal setelah ini → mode fallback (PRD §Reliability). */
  requestTimeoutMs: 4000,
  /** Lama RESULT_ACCEPT / RESULT_UNKNOWN tampil sebelum kembali ke IDLE. RESULT_CONFIRM menunggu aksi. */
  resultHoldMs: 7000,
  /** Jeda setelah TTS selesai sebelum mic boleh aktif lagi (cegah feedback loop). */
  ttsCooldownMs: 300,
  /** Durasi placeholder video isyarat saat video_url belum tersedia. */
  placeholderVideoMs: 3500,
  speechLang: 'id-ID',
} as const;
