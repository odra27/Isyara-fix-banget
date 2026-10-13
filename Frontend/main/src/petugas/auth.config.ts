/** Konfigurasi alur petugas. Nilai dari .env bila ada. */
export const AUTH = {
  /** Sesi dianggap kedaluwarsa setelah idle sepanjang ini (30 menit). */
  idleTimeoutMs: 30 * 60 * 1000,
  /** Jumlah percobaan login gagal berturut-turut sebelum tombol Masuk dikunci. */
  maxAttempts: 5,
  /** Lama tombol Masuk dikunci setelah batas percobaan tercapai. */
  lockoutMs: 30 * 1000,
  /** Batas panjang masukan form (validasi saat submit). */
  maxEmployeeIdLength: 64,
  maxPasswordLength: 128,
  /** Kunci penyimpanan sesi di sisi klien. */
  storageKey: 'isyara.petugas.session',
  /** Kontak yang ditampilkan di dialog "Lupa password?". */
  adminContact: 'Admin / Ketua Puskesmas di meja administrasi',
} as const;
