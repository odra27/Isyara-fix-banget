/** Tipe bersama alur akun siswa (ADR-051 D2). */

/**
 * Profil siswa yang dikembalikan auth service saat login berhasil.
 * Bentuknya mengikuti StudentOut di BE (backend/app/api/student.py), jadi penggantian
 * sumber data (dummy → API) tidak mengubah komponen UI.
 */
export type SiswaProfile = {
  id: string;
  /** Nomor Induk Siswa. Sekaligus identitas login. */
  nis: string;
  name: string;
  /** Mis. "5A". */
  className?: string;
  grade?: number;
  school: string;
  /** URL foto profil. Opsional; bila kosong/gagal dimuat, UI memakai avatar inisial. */
  photoUrl?: string;
};

/** Sesi login aktif. Disimpan di sisi klien agar bertahan saat pindah rute & reload. */
export type SiswaSession = {
  sessionId: string;
  profile: SiswaProfile;
  /** Epoch ms saat login. */
  loginAt: number;
  /** Epoch ms interaksi terakhir. Dasar perhitungan idle timeout. */
  lastActiveAt: number;
  /** Bearer token dari BE (POST /api/student/auth/login). Kosong di mode dummy. */
  accessToken?: string;
  /** Dipakai untuk memperbarui token tanpa login ulang (ADR-052). */
  refreshToken?: string;
  /** Epoch ms saat accessToken kedaluwarsa. */
  expiresAt?: number;
};

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

export type LoginResult =
  | { ok: true; profile: SiswaProfile; tokens?: Tokens }
  | { ok: false; reason: 'invalid-credentials' | 'service-error' };

/** Alasan sesi berakhir, dipakai halaman login untuk menampilkan pemberitahuan. */
export type SessionEndedReason = 'expired' | 'logout';
