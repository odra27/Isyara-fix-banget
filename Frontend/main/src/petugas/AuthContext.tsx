import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AUTH } from './auth.config';
import { authService } from './auth.service';
import { sessionStore } from './session.store';
import type { LoginResult, PetugasProfile, PetugasSession, SessionEndedReason } from './types';

/**
 * Sesi petugas untuk seluruh Kiosk_App. Login, Dashboard, dan Kiosk berada di satu
 * aplikasi sehingga ketiganya memakai state yang sama — kiosk bisa menampilkan
 * identitas petugas tanpa mekanisme berbagi sesi antar aplikasi.
 *
 * Catatan keamanan: ini gerbang UI/UX, bukan proteksi. Lihat auth.service.ts.
 */
type Ctx = {
  session: PetugasSession | null;
  profile: PetugasProfile | null;
  isAuthenticated: boolean;
  /** true selama sesi dipulihkan dari penyimpanan (hindari redirect keliru saat mount). */
  loading: boolean;
  /** Alasan sesi terakhir berakhir; dipakai Login_Page untuk memberi tahu petugas. */
  endedReason: SessionEndedReason | null;
  clearEndedReason: () => void;
  login: (employeeId: string, password: string) => Promise<LoginResult>;
  /** false bila data sesi gagal dihapus → pemanggil menampilkan pesan gagal logout. */
  logout: () => boolean;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PetugasSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [endedReason, setEndedReason] = useState<SessionEndedReason | null>(null);
  const sessionRef = useRef<PetugasSession | null>(null);
  sessionRef.current = session;

  // Pulihkan sesi saat aplikasi dimuat (termasuk setelah reload halaman).
  useEffect(() => {
    const { session: restored, expired } = sessionStore.restore();
    if (expired) setEndedReason('expired');
    setSession(restored);
    setLoading(false);
  }, []);

  // Perbarui penanda interaksi terakhir, dibatasi 1x per 30 detik agar tidak menulis terus-menerus.
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

  // Pantau kedaluwarsa idle: sesi yang lewat batas langsung diakhiri meski layar dibiarkan terbuka.
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

  const login = useCallback<Ctx['login']>(async (employeeId, password) => {
    const result = await authService.login(employeeId, password);
    if (result.ok) {
      setEndedReason(null);
      setSession(sessionStore.create(result.profile, result.accessToken));
    }
    return result;
  }, []);

  const logout = useCallback<Ctx['logout']>(() => {
    const cleared = sessionStore.clear();
    if (cleared) {
      setEndedReason('logout');
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

export { AUTH };
