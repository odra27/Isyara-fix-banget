import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { LoginGate } from './LoginGate';

/**
 * Gerbang rute (Requirement 9). Dashboard dan Kiosk hanya boleh diakses dengan sesi
 * petugas yang valid.
 *
 * Dua mode penolakan saat belum login:
 *  - 'redirect' (default): langsung ke /login. Dipakai Dashboard karena menampilkan
 *    data petugas, jadi tidak boleh ter-render sama sekali tanpa sesi.
 *  - 'gate': render pratinjau yang diburamkan + popup login (LoginGate). Dipakai Kiosk
 *    sesuai revisi UX; aman karena kiosk belum memuat data apa pun saat pertama dibuka.
 */
export function RequireAuth({ children, mode = 'redirect' }: { children: ReactNode; mode?: 'redirect' | 'gate' }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Sesi masih dipulihkan dari penyimpanan: jangan putuskan apa-apa dulu agar reload
  // halaman pada sesi yang valid tidak terlempar ke login / gate.
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-tint" role="status" aria-live="polite">
        <span className="text-sm font-semibold text-muted">Memuat sesi…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (mode === 'gate') return <LoginGate />;
    // Rute tujuan disimpan agar login berhasil mengembalikan petugas ke sini.
    const from = location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <>{children}</>;
}
