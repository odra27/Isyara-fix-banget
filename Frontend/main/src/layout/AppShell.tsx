import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bookmark, Home, LoaderCircle, MessageCircle, MonitorSmartphone, Settings } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/auth/components/Avatar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Logo } from '@/components/ui/logo';
import { APP } from '@/config/app.config';
import { isMockChat } from '@/features/chatbot/chat.service';
import { cn } from '@/lib/utils';

/**
 * Kerangka aplikasi siswa (sesuai referensi UI): sidebar kiri di desktop, bar atas + tab bawah di
 * layar kecil. Isi halaman dirender lewat <Outlet/> dengan transisi halus antar menu.
 */
export const NAV = [
  { to: '/', label: 'Beranda', icon: Home, end: true },
  { to: '/kiosk', label: 'Kiosk', icon: MonitorSmartphone, end: false },
  { to: '/materi', label: 'Materi Saya', icon: Bookmark, end: false },
  { to: '/chatbot', label: 'Chatbot', icon: MessageCircle, end: false },
  { to: '/pengaturan', label: 'Pengaturan', icon: Settings, end: false },
] as const;

export function AppShell() {
  const { profile } = useAuth();
  const location = useLocation();
  // Chatbot memakai tinggi layar penuh (riwayat + percakapan), halaman lain bergulir biasa.
  const fullHeight = location.pathname.startsWith('/chatbot');
  const section = '/' + (location.pathname.split('/')[1] ?? '');

  return (
    <div className="min-h-dvh bg-tint lg:grid lg:grid-cols-[15.5rem_1fr] lg:gap-0">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-white px-4 py-6 lg:flex">
        <a href={APP.landingUrl} aria-label="ISYARA, ke halaman utama" className="mb-8 w-fit rounded-xl px-2 transition-opacity hover:opacity-80">
          <Logo />
        </a>
        <nav aria-label="Menu utama" className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'relative flex h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-bold transition-colors',
                  isActive ? 'text-brand-900' : 'text-muted hover:bg-tint hover:text-brand-800',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-2xl bg-brand-50"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <n.icon className={cn('relative size-[1.15rem]', isActive && 'text-brand-600')} aria-hidden="true" />
                  <span className="relative">{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto">
          {isMockChat && (
            <p className="mb-3 rounded-2xl border border-dashed border-brand-200 px-3 py-2 text-[0.6875rem] leading-snug text-muted">
              <span className="font-bold text-brand-600">Mode demo.</span> Data tersimpan di browser ini saja.
            </p>
          )}
          <NavLink
            to="/pengaturan"
            className="flex items-center gap-3 rounded-2xl border border-line bg-white p-2.5 transition-colors hover:bg-tint"
            aria-label={`Profil ${profile?.name ?? ''}. Buka pengaturan.`}
          >
            <Avatar name={profile?.name} photoUrl={profile?.photoUrl} className="size-10" textClassName="text-sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold text-brand-900">{profile?.name}</span>
              <span className="block truncate text-xs text-muted">
                {profile?.className ? `Kelas ${profile.className}` : 'Siswa'} · NIS {profile?.nis}
              </span>
            </span>
          </NavLink>
        </div>
      </aside>

      {/* ---------- Bar atas (mobile) ---------- */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/85 px-4 backdrop-blur-xl lg:hidden">
        <a href={APP.landingUrl} aria-label="ISYARA, ke halaman utama">
          <Logo />
        </a>
        <NavLink to="/pengaturan" aria-label="Profil dan pengaturan">
          <Avatar name={profile?.name} photoUrl={profile?.photoUrl} className="size-9" textClassName="text-xs" />
        </NavLink>
      </header>

      {/* ---------- Isi ---------- */}
      <main
        id="konten"
        className={cn(
          'mx-auto w-full max-w-[84rem] px-4 pb-28 pt-5 md:px-8 md:pt-8 lg:pb-10',
          fullHeight && 'lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden lg:pb-6',
        )}
      >
        {/* Hanya animasi masuk (tanpa exit): <Outlet/> selalu merender rute baru, jadi exit akan berkedip. */}
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className={cn(fullHeight && 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col')}
        >
          <ErrorBoundary label="Halaman" resetKey={location.pathname}>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </motion.div>
      </main>

      {/* ---------- Tab bawah (mobile) ---------- */}
      <nav aria-label="Menu utama" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[0.625rem] font-bold', isActive ? 'text-brand-600' : 'text-muted')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span layoutId="tab-dot" className="absolute top-1.5 h-1 w-6 rounded-full bg-brand-600" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                    )}
                    <n.icon className="size-5" aria-hidden="true" />
                    <span className="max-w-full truncate px-1">{n.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="grid min-h-64 place-items-center" role="status" aria-live="polite">
      <span className="flex items-center gap-2 text-sm font-semibold text-muted">
        <LoaderCircle className="size-4 anim-spin" aria-hidden="true" /> Memuat…
      </span>
    </div>
  );
}
