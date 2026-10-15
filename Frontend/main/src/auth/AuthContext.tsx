import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authService } from './auth.service';
import { sessionStore } from './session.store';
import { onSessionChange, refreshSession } from './token';
import type { LoginResult, SiswaProfile, SiswaSession, SessionEndedReason } from './types';

/**
 * Sesi siswa untuk seluruh aplikasi (Tanya ISYARA, Video Pelajaran, Materi Saya, Profil).
 * Catatan keamanan: ini gerbang UI. Proteksi data nyata ada di BE (require_student).
 */
type Ctx = {
  session: SiswaSession | null;
  profile: SiswaProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  endedReason: SessionEndedReason | null;
  clearEndedReason: () => void;
  login: (nis: string, password: string) => Promise<LoginResult>;
  /** reason 'expired' dipakai saat BE menolak token (401). false = data sesi gagal dihapus. */
  logout: (reason?: SessionEndedReason) => boolean;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SiswaSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [endedReason, setEndedReason] = useState<SessionEndedReason | null>(null);
  const sessionRef = useRef<SiswaSession | null>(null);
  sessionRef.current = session;

  // Pulihkan sesi. Mode API: sesi tersimpan langsung diperbarui ke BE (refresh token), yang sekaligus
  // memastikan akun masih aktif. Berhasil → langsung masuk tanpa form; ditolak → form login.
  // Server tak terjangkau → sesi lama tetap dipakai (jangan logout hanya karena koneksi).
  useEffect(() => {
    let alive = true;
    const { session: restored, expired } = sessionStore.restore();
    if (expired) setEndedReason('expired');
    // Sesi tersimpan tanpa token (versi lama): bukan sesi BE yang sah, jadi dibuang.
    if (restored && !restored.refreshToken) {
      sessionStore.clear();
      setSession(null);
      setLoading(false);
      return;
    }
    if (!restored) {
      setSession(restored);
      setLoading(false);
      return;
    }
    refreshSession().then((s) => {
      if (!alive) return;
      if (!s) setEndedReason('expired');
      setSession(s);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Token diperbarui / sesi diakhiri dari luar React (token.ts).
  useEffect(
    () =>
      onSessionChange((s) => {
        if (!s) setEndedReason('expired');
        setSession(s);
      }),
    [],
  );

  // Penanda interaksi terakhir, dibatasi 1x per 30 detik.
  useEffect(() => {
    if (!session) return;
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 30_000) return;
      last = now;
      const current = sessionRef.current;
      if (current) setSession(sessionStore.touch(current));
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'pointermove'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      const current = sessionRef.current;
      if (current && sessionStore.isExpired(current)) {
        sessionStore.clear();
        setEndedReason('expired');
        setSession(null);
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [session]);

  const login = useCallback<Ctx['login']>(async (nis, password) => {
    const result = await authService.login(nis, password);
    if (result.ok) {
      setEndedReason(null);
      setSession(sessionStore.create(result.profile, result.tokens));
    }
    return result;
  }, []);

  const logout = useCallback<Ctx['logout']>((reason = 'logout') => {
    const cleared = sessionStore.clear();
    if (cleared) {
      setEndedReason(reason);
      setSession(null);
    }
    return cleared;
  }, []);

  const clearEndedReason = useCallback(() => setEndedReason(null), []);

  const value = useMemo<Ctx>(
    () => ({
      session,
      profile: session?.profile ?? null,
      isAuthenticated: !!session,
      loading,
      endedReason,
      clearEndedReason,
      login,
      logout,
    }),
    [session, loading, endedReason, clearEndedReason, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}

/** Inisial untuk avatar: huruf pertama kata pertama + kata terakhir, maksimal 2 huruf. */
export function initialsOf(name: string | undefined | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
