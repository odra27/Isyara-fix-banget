import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

/** Semua halaman aplikasi hanya untuk siswa yang sudah masuk; selain itu diarahkan ke /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-tint" role="status" aria-live="polite">
        <span className="text-sm font-semibold text-muted">Memuat sesi…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Rute tujuan disimpan agar login berhasil mengembalikan siswa ke sini.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
