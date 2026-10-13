/** Konfigurasi akun siswa. */
export const AUTH = {
  /**
   * Sesi berakhir bila perangkat tidak dipakai selama ini (14 hari). Selama masih dalam batas,
   * siswa langsung masuk tanpa form login; token diperbarui otomatis (ADR-052).
   */
  idleTimeoutMs: 14 * 24 * 60 * 60 * 1000,
  /** Token diperbarui bila sisa umurnya kurang dari ini. */
  refreshMarginMs: 2 * 60 * 1000,
  /** Jumlah percobaan login gagal berturut-turut sebelum tombol Masuk dikunci. */
  maxAttempts: 5,
  /** Lama tombol Masuk dikunci setelah batas percobaan tercapai. */
  lockoutMs: 30 * 1000,
  /** Batas panjang masukan form (sama dengan validasi BE). */
  maxNisLength: 30,
  maxPasswordLength: 128,
  /** Kunci penyimpanan sesi di sisi klien. */
  storageKey: 'isyara.siswa.session',
  /** Kontak yang ditampilkan di dialog "Lupa password?". */
  adminContact: 'wali kelas atau operator sekolah',
} as const;
