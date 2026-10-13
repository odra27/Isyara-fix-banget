/** Tipe bersama alur petugas (login + dashboard). */

/**
 * Profil petugas yang dikembalikan auth service saat login berhasil.
 * Bentuknya dibuat menyerupai baris tabel petugas di BE agar penggantian
 * sumber data (dummy → API) tidak mengubah komponen UI.
 */
export type PetugasProfile = {
  /** ID Pegawai / NIP. Sekaligus identitas login. */
  employeeId: string;
  name: string;
  /** Jabatan, mis. "Dokter Umum". Opsional: tidak semua akun mengisinya. */
  role?: string;
  /** Unit kerja / lokasi puskesmas. */
  unit: string;
  /** Jadwal hari ini, mis. "08:00 - 14:00". */
  todaySchedule: string;
  /**
   * URL foto profil. Opsional — bila kosong/gagal dimuat, UI jatuh ke avatar inisial.
   * Nanti diisi BE dari kolom foto petugas.
   */
  photoUrl?: string;
};

/** Sesi login aktif. Disimpan di sisi klien agar bertahan saat pindah rute & reload. */
export type PetugasSession = {
  /** Pengenal sesi, dipakai untuk memastikan profil yang tampil berasal dari sesi yang sama. */
  sessionId: string;
  profile: PetugasProfile;
  /** Epoch ms saat login. */
  loginAt: number;
  /** Epoch ms interaksi terakhir. Dasar perhitungan idle timeout. */
  lastActiveAt: number;
  /** Bearer token dari BE (POST /api/auth/login). Kosong di mode dummy. */
  accessToken?: string;
};

export type LoginResult =
  | { ok: true; profile: PetugasProfile; accessToken?: string }
  | { ok: false; reason: 'invalid-credentials' | 'service-error' };

/** Alasan sesi berakhir, dipakai Login_Page untuk menampilkan pemberitahuan. */
export type SessionEndedReason = 'expired' | 'logout';
