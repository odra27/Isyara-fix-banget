import { uid } from '@/lib/utils';
import { AUTH } from './auth.config';
import type { PetugasProfile, PetugasSession } from './types';

/**
 * Penyimpanan sesi petugas di sisi klien.
 *
 * localStorage dipakai agar sesi bertahan saat pindah rute DAN saat halaman dimuat
 * ulang (Requirement 9). Sesi dianggap kedaluwarsa bila idle melewati
 * AUTH.idleTimeoutMs sejak interaksi terakhir (Requirement 11).
 *
 * Yang disimpan hanya profil non-sensitif yang memang tampil di layar. Password
 * TIDAK pernah disimpan. Ini bukan mekanisme keamanan — lihat catatan di auth.service.ts.
 */

const isExpired = (s: PetugasSession, now = Date.now()) => now - s.lastActiveAt > AUTH.idleTimeoutMs;

function parse(raw: string | null): PetugasSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<PetugasSession>;
    if (!s || typeof s !== 'object') return null;
    const p = s.profile;
    if (!s.sessionId || !p || typeof p.employeeId !== 'string') return null;
    if (typeof s.lastActiveAt !== 'number' || typeof s.loginAt !== 'number') return null;
    return s as PetugasSession;
  } catch {
    return null;
  }
}

export const sessionStore = {
  /**
   * Pulihkan sesi dari penyimpanan. `expired: true` berarti ada sesi tersimpan tetapi
   * sudah lewat batas idle — dipakai untuk membedakan "belum pernah login" dari
   * "sesi berakhir", agar pesan di halaman login tidak menyesatkan.
   */
  restore(): { session: PetugasSession | null; expired: boolean } {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(AUTH.storageKey);
    } catch {
      return { session: null, expired: false }; // localStorage diblokir → anggap belum login.
    }
    const s = parse(raw);
    if (!s) return { session: null, expired: false };
    if (isExpired(s)) {
      sessionStore.clear();
      return { session: null, expired: true };
    }
    return { session: s, expired: false };
  },

  /** Sesi valid saja, tanpa informasi kedaluwarsa. */
  read(): PetugasSession | null {
    return sessionStore.restore().session;
  },

  create(profile: PetugasProfile, accessToken?: string): PetugasSession {
    const now = Date.now();
    const session: PetugasSession = { sessionId: uid(), profile, loginAt: now, lastActiveAt: now, accessToken };
    sessionStore.write(session);
    return session;
  },

  write(session: PetugasSession) {
    try {
      localStorage.setItem(AUTH.storageKey, JSON.stringify(session));
    } catch {
      // Gagal menulis tidak boleh menghentikan alur; sesi tetap hidup di memori.
    }
  },

  /** Perbarui penanda interaksi terakhir agar sesi tidak dianggap idle. */
  touch(session: PetugasSession): PetugasSession {
    const next = { ...session, lastActiveAt: Date.now() };
    sessionStore.write(next);
    return next;
  },

  /** Hapus sesi. Mengembalikan false bila penghapusan gagal (Requirement 8). */
  clear(): boolean {
    try {
      localStorage.removeItem(AUTH.storageKey);
      return localStorage.getItem(AUTH.storageKey) === null;
    } catch {
      return false;
    }
  },

  isExpired,
};
