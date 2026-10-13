import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { KioskScreen } from '@/kiosk/KioskScreen';
import { AuthProvider } from '@/petugas/AuthContext';
import { RequireAuth } from '@/petugas/RequireAuth';
import { DashboardPage } from '@/petugas/dashboard/DashboardPage';
import { LoginPage } from '@/petugas/login/LoginPage';

/**
 * Akar aplikasi kiosk.
 *
 * Login, Dashboard Petugas, dan Kiosk berada dalam satu aplikasi agar ketiganya
 * berbagi satu sesi petugas (lihat petugas/AuthContext.tsx). Dashboard dan Kiosk
 * dijaga RequireAuth; `/login` terbuka. Alamat tak dikenal diarahkan ke `/login`.
 *
 * Tiap halaman dibungkus ErrorBoundary tersendiri supaya crash di satu halaman
 * tidak membuat seluruh layar blank (PRD-FE §9).
 */
export default function App() {
  return (
    // reducedMotion="user": animasi transform framer-motion dimatikan bila prefers-reduced-motion.
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <ErrorBoundary label="Masuk">
                  <LoginPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <ErrorBoundary label="Dashboard">
                    <DashboardPage />
                  </ErrorBoundary>
                </RequireAuth>
              }
            />
            <Route
              path="/"
              element={
                <RequireAuth mode="gate">
                  <KioskScreen />
                </RequireAuth>
              }
            />
            <Route
              path="/kiosk"
              element={
                <RequireAuth mode="gate">
                  <KioskScreen />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </MotionConfig>
  );
}
