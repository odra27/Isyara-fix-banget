import { lazy } from 'react';
import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { RequireAuth } from '@/auth/RequireAuth';
import { LoginPage } from '@/auth/login/LoginPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppShell } from '@/layout/AppShell';
import { SettingsProvider } from '@/state/SettingsContext';

// Halaman dimuat saat dibuka: data animasi isyarat (43 kata) & MediaPipe tidak ikut di halaman login.
const HomePage = lazy(() => import('@/pages/HomePage'));
const MateriSayaPage = lazy(() => import('@/pages/MateriSayaPage'));
const MateriDetailPage = lazy(() => import('@/pages/MateriDetailPage'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const KioskScreen = lazy(() => import('@/kiosk/KioskScreen'));

/**
 * Aplikasi siswa ISYARA (ADR-051). `/login` terbuka; semua menu lain hanya untuk siswa yang
 * sudah masuk (RequireAuth) dan tampil di dalam AppShell (sidebar / tab bawah).
 */
export default function App() {
  return (
    // reducedMotion="user": animasi transform framer-motion dimatikan bila prefers-reduced-motion.
    <MotionConfig reducedMotion="user">
      <SettingsProvider>
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
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route index element={<HomePage />} />
                <Route path="materi" element={<MateriSayaPage />} />
                <Route path="materi/:id" element={<MateriDetailPage />} />
                {/* Satu rute (segmen opsional) supaya ChatPage tidak di-mount ulang saat sesi baru dibuat. */}
                <Route path="chatbot/:sessionId?" element={<ChatPage />} />
                <Route path="kiosk" element={<KioskScreen />} />
                <Route path="pengaturan" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </SettingsProvider>
    </MotionConfig>
  );
}
