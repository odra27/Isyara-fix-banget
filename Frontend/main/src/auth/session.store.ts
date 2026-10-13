import { uid } from '@/lib/utils';
import { AUTH } from './auth.config';
import type { SiswaProfile, SiswaSession, Tokens } from './types';

/**
 * Penyimpanan sesi siswa di localStorage: bertahan saat pindah rute dan reload. Sesi kedaluwarsa
 * bila idle melewati AUTH.idleTimeoutMs. Yang disimpan hanya profil yang memang tampil di layar
 * dan token (access + refresh, ADR-052); password TIDAK pernah disimpan. Catatan: token di
 * localStorage bisa dibaca skrip di halaman ini, jadi jangan pernah menyisipkan HTML dari luar.
 */
const isExpired = (s: SiswaSession, now = Date.now()) => now - s.lastActiveAt > AUTH.idleTimeoutMs;

function parse(raw: string | null): SiswaSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<SiswaSession>;
    if (!s || typeof s !== 'object') return null;
    const p = s.profile;
    if (!s.sessionId || !p || typeof p.nis !== 'string' || typeof p.id !== 'string') return null;
    if (typeof s.lastActiveAt !== 'number' || typeof s.loginAt !== 'number') return null;
    return s as SiswaSession;
  } catch {
    return null;
  }
}

export const sessionStore = {
  restore(): { session: SiswaSession | null; expired: boolean } {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(AUTH.storageKey);
    } catch {
      return { session: null, expired: false };
    }
    const s = parse(raw);
    if (!s) return { session: null, expired: false };
    if (isExpired(s)) {
      sessionStore.clear();
      return { session: null, expired: true };
    }
    return { session: s, expired: false };
  },

  /** Sesi valid saat ini (dipakai service untuk mengambil access token). */
  read(): SiswaSession | null {
    return sessionStore.restore().session;
  },

  create(profile: SiswaProfile, tokens?: Tokens): SiswaSession {
    const now = Date.now();
    const session: SiswaSession = { sessionId: uid(), profile, loginAt: now, lastActiveAt: now, ...tokens };
    sessionStore.write(session);
    return session;
  },

  write(session: SiswaSession) {
    try {
      localStorage.setItem(AUTH.storageKey, JSON.stringify(session));
    } catch {
      // Gagal menulis tidak boleh menghentikan alur; sesi tetap hidup di memori.
    }
  },

  touch(session: SiswaSession): SiswaSession {
    const next = { ...session, lastActiveAt: Date.now() };
    sessionStore.write(next);
    return next;
  },

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
