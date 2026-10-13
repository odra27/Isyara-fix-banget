/** Konfigurasi umum kiosk. Nilai dari .env bila ada. */
export const APP = {
  deviceId: import.meta.env.VITE_DEVICE_ID || 'kiosk-demo-1',
  /**
   * VITE_API_BASE_URL kosong = pakai mock service.
   * "/" = lewat proxy Vite (/api → backend :8000, lihat vite.config.ts). Disarankan: jalan juga di HP via https.
   * URL penuh (mis. http://localhost:8000) = panggil backend langsung (butuh CORS).
   */
  useBackend: Boolean(import.meta.env.VITE_API_BASE_URL),
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  /**
   * Login siswa: 'api' = Supabase lewat BE, 'mock' = akun demo di browser.
   * Default ikut useBackend. Set VITE_AUTH_MODE=mock saat BE jalan tanpa Supabase (LOCAL_DEV_DB=1).
   */
  authMode: (import.meta.env.VITE_AUTH_MODE || (import.meta.env.VITE_API_BASE_URL ? 'api' : 'mock')) as 'api' | 'mock',
  landingUrl: import.meta.env.VITE_LANDING_URL || '/',
  /** Request ke BE dianggap gagal setelah ini → mode fallback (PRD-FE §3). */
  requestTimeoutMs: 4000,
  /** Lama RESULT_ACCEPT / RESULT_UNKNOWN tampil sebelum kembali ke IDLE. RESULT_CONFIRM menunggu aksi. */
  resultHoldMs: 7000,
  /** Jeda setelah TTS selesai sebelum mic boleh aktif lagi (cegah feedback loop, PRD-FE §7). */
  ttsCooldownMs: 300,
  /** Durasi placeholder video isyarat saat video_url belum tersedia. */
  placeholderVideoMs: 3500,
  speechLang: 'id-ID',
} as const;
