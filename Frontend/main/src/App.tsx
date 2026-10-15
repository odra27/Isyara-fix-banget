import { lazy } from 'react';
import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { RequireAuth } from '@/auth/RequireAuth';
import { LoginPage } from '@/auth/login/LoginPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppShell } from '@/layout/AppShell';
import { SettingsProvider } from '@/state/SettingsContext';

// Halaman dimuat saat dibuka: data animasi isyarat & MediaPipe tidak ikut di halaman login.
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const VideoListPage = lazy(() => import('@/pages/VideoListPage'));
const VideoWatchPage = lazy(() => import('@/pages/VideoWatchPage'));
const MateriSayaPage = lazy(() => import('@/pages/MateriSayaPage'));
const HistoryPage = lazy(() => import('@/pages/HistoryPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const KioskScreen = lazy(() => import('@/kiosk/KioskScreen'));

/** Tautan lama /materi/:id → /video/:id. */
function OldMateriLink() {
  const { id } = useParams();
  return <Navigate to={`/video/${id ?? ''}`} replace />;
}
function OldChatLink() {
  const { sessionId } = useParams();
  return <Navigate to={sessionId ? `/chat/${sessionId}` : '/chat'} replace />;
}

/**
 * Aplikasi siswa ISYARA (ADR-051, ADR-053). `/login` terbuka; semua halaman lain hanya untuk siswa
 * yang sudah masuk (RequireAuth) dan tampil di dalam AppShell. Halaman utama = Tanya ISYARA.
 * `/kiosk` (mode kelas) sengaja tidak ada di menu, tetapi tetap bisa dibuka lewat alamatnya.
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
                <Route index element={<Navigate to="/chat" replace />} />
                {/* Satu rute (segmen opsional) supaya ChatPage tidak di-mount ulang saat sesi baru dibuat. */}
                <Route path="chat/:sessionId?" element={<ChatPage />} />
                <Route path="video" element={<VideoListPage />} />
                <Route path="video/:id" element={<VideoWatchPage />} />
                <Route path="materi" element={<MateriSayaPage />} />
                <Route path="materi/:id" element={<OldMateriLink />} />
                <Route path="riwayat" element={<HistoryPage />} />
                <Route path="profil" element={<ProfilePage />} />
                <Route path="pengaturan" element={<Navigate to="/profil" replace />} />
                <Route path="chatbot/:sessionId?" element={<OldChatLink />} />
                <Route path="kiosk" element={<KioskScreen />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </SettingsProvider>
    </MotionConfig>
  );
}
