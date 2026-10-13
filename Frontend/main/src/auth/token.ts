import { AUTH } from './auth.config';
import { authService } from './auth.service';
import { sessionStore } from './session.store';
import type { SiswaSession } from './types';

/**
 * Akses token untuk panggilan API (ADR-052). Token yang hampir kedaluwarsa diperbarui dulu
 * dengan refresh token; beberapa panggilan bersamaan hanya memicu satu refresh.
 *
 * Bila refresh ditolak BE (token dicabut / akun nonaktif), sesi dihapus dan pendengar
 * `onSessionEnded` dipanggil, sehingga AuthContext menampilkan form login lagi.
 */
type Listener = (session: SiswaSession | null) => void;
const listeners = new Set<Listener>();
let inflight: Promise<SiswaSession | null> | null = null;

/** AuthContext berlangganan perubahan sesi dari luar React (refresh / berakhir). */
export function onSessionChange(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const emit = (s: SiswaSession | null) => listeners.forEach((l) => l(s));

/**
 * Perbarui token sekarang. Mengembalikan sesi baru, sesi lama bila server tidak terjangkau
 * (jangan logout karena koneksi), atau null bila sesi berakhir.
 */
export function refreshSession(): Promise<SiswaSession | null> {
  inflight ??= (async () => {
    const current = sessionStore.read();
    if (!current?.refreshToken) return current;
    const r = await authService.refresh(current.refreshToken);
    // Sesi bisa saja diganti (logout / login akun lain) selama menunggu.
    if (sessionStore.read()?.sessionId !== current.sessionId) return sessionStore.read();
    if (r.ok && r.tokens) {
      const next: SiswaSession = { ...current, ...r.tokens, profile: r.profile };
      sessionStore.write(next);
      emit(next);
      return next;
    }
    if (!r.ok && r.reason === 'invalid') {
      sessionStore.clear();
      emit(null);
      return null;
    }
    return current;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Token siap pakai, atau null bila tidak ada sesi. */
export async function getAccessToken(): Promise<string | null> {
  let s = sessionStore.read();
  if (!s?.accessToken) return null;
  if (s.expiresAt && s.expiresAt - Date.now() < AUTH.refreshMarginMs) s = await refreshSession();
  return s?.accessToken ?? null;
}
