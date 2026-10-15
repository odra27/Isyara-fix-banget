import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bookmark, History, LoaderCircle, MessageCircle, PlaySquare, Plus, Settings, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/auth/components/Avatar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Logo } from '@/components/ui/logo';
import { APP } from '@/config/app.config';
import { chatService, type ChatSession } from '@/features/chatbot/chat.service';
import { DeleteChatDialog } from '@/features/chatbot/DeleteChatDialog';
import { sessionsStore, useSessions } from '@/features/chatbot/sessions.store';
import { cn } from '@/lib/utils';

/**
 * Kerangka aplikasi siswa (ADR-053). Desktop: sidebar kiri dengan tiga blok yang terpisah jelas,
 *  1. menu (Tanya ISYARA, Video Pelajaran, Materi Saya),
 *  2. percakapan terakhir (4) + "Lihat semua",
 *  3. kartu profil (→ Profil & pengaturan).
 * Layar kecil: bar atas + tab bawah. Kiosk tidak ada di menu (tetap bisa dibuka di /kiosk).
 */
export const NAV = [
  { to: '/chat', label: 'Tanya ISYARA', short: 'Tanya', icon: MessageCircle },
  { to: '/video', label: 'Video Pelajaran', short: 'Video', icon: PlaySquare },
  { to: '/materi', label: 'Materi Saya', short: 'Materi', icon: Bookmark },
] as const;

const RECENT = 4;

export function AppShell() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const sessions = useSessions();
  /**
   * Tanya ISYARA mengisi minimal satu layar supaya kolom tanya duduk di bawah walau percakapan
   * masih pendek. Gulirnya tetap milik halaman (bukan panel sendiri), jadi siswa memakai scrollbar
   * peramban seperti di halaman lain.
   */
  const fullHeight = location.pathname.startsWith('/chat');
  const section = '/' + (location.pathname.split('/')[1] ?? '');
  const activeChat = location.pathname.startsWith('/chat/') ? location.pathname.split('/')[2] : null;

  // Riwayat milik siswa ini saja; dimuat sekali per akun.
  useEffect(() => {
    sessionsStore.reset();
    void sessionsStore.refresh();
  }, [profile?.id]);

  const newChat = () => navigate('/chat');

  // ---------- hapus percakapan dari sidebar
  const [confirm, setConfirm] = useState<ChatSession | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  // Tombol X yang membuka dialog, supaya fokus bisa dikembalikan saat dibatalkan.
  const trigger = useRef<HTMLButtonElement | null>(null);
  // Setelah terhapus, tombol X-nya ikut hilang: fokus dipindah ke "Chat baru" agar tidak lepas.
  const newChatBtn = useRef<HTMLButtonElement>(null);

  const askDelete = (s: ChatSession, el: HTMLButtonElement) => {
    trigger.current = el;
    setFailed(false);
    setConfirm(s);
  };
  const closeConfirm = () => {
    setConfirm(null);
    setFailed(false);
    trigger.current?.focus();
  };
  const doDelete = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await chatService.remove(confirm.id);
      sessionsStore.drop(confirm.id);
      // Percakapan yang sedang dibuka ikut terhapus: mulai percakapan baru.
      if (activeChat === confirm.id) navigate('/chat', { replace: true });
      setConfirm(null);
      setFailed(false);
      trigger.current = null;
      newChatBtn.current?.focus();
    } catch {
      setFailed(true);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-tint lg:grid lg:grid-cols-[16rem_1fr]">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-white px-3.5 py-5 lg:flex">
        <a href={APP.landingUrl} aria-label="ISYARA, ke halaman utama" className="mb-5 w-fit rounded-xl px-2 transition-opacity hover:opacity-80">
          <Logo />
        </a>

        <button
          ref={newChatBtn}
          type="button"
          onClick={newChat}
          className="mb-3 flex h-11 items-center gap-2 rounded-2xl border border-line bg-white px-3.5 text-sm font-extrabold text-brand-900 transition-colors hover:border-brand-200 hover:bg-brand-50"
        >
          <span className="grid size-6 place-items-center rounded-lg bg-brand-600 text-white">
            <Plus className="size-4" aria-hidden="true" />
          </span>
          Chat baru
        </button>

        <nav aria-label="Menu utama" className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
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
                    <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-2xl bg-brand-50" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                  )}
                  <n.icon className={cn('relative size-[1.15rem]', isActive && 'text-brand-600')} aria-hidden="true" />
                  <span className="relative">{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-5 min-h-0 flex-1 border-t border-line pt-4">
          <p className="mb-1.5 px-3.5 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-muted">Percakapan terakhir</p>
          {!sessions.loaded ? (
            <div className="flex flex-col gap-1.5 px-1.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-8 animate-pulse rounded-xl bg-tint" />
              ))}
            </div>
          ) : sessions.sessions.length === 0 ? (
            <p className="px-3.5 text-xs leading-relaxed text-muted">{sessions.error ? 'Tidak bisa terhubung ke server.' : 'Belum ada percakapan.'}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {sessions.sessions.slice(0, RECENT).map((s) => (
                <li key={s.id} className="group/chat relative">
                  <Link
                    to={`/chat/${s.id}`}
                    aria-current={s.id === activeChat ? 'page' : undefined}
                    className={cn(
                      'block truncate rounded-xl py-2 pl-3.5 pr-9 text-[0.8125rem] transition-colors',
                      s.id === activeChat ? 'bg-tint font-extrabold text-brand-900' : 'font-semibold text-brand-800 hover:bg-tint',
                    )}
                  >
                    {s.title}
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => askDelete(s, e.currentTarget)}
                    aria-label={`Hapus percakapan ${s.title}`}
                    title="Hapus percakapan"
                    className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-brand-200 transition-colors hover:bg-rec-soft hover:text-rec focus-visible:text-rec group-hover/chat:text-muted"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {sessions.sessions.length > 0 && (
            <NavLink
              to="/riwayat"
              className={({ isActive }) =>
                cn('mt-1 flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold', isActive ? 'text-brand-900' : 'text-brand-600 hover:bg-tint')
              }
            >
              <History className="size-3.5" aria-hidden="true" /> Lihat semua
            </NavLink>
          )}
        </div>

        <NavLink
          to="/profil"
          className={({ isActive }) =>
            cn('mt-3 flex items-center gap-3 rounded-2xl border p-2.5 transition-colors', isActive ? 'border-brand-200 bg-brand-50' : 'border-line bg-white hover:bg-tint')
          }
          aria-label={`Profil ${profile?.name ?? ''}. Buka profil dan pengaturan.`}
        >
          <Avatar name={profile?.name?.split(' ')[0]} photoUrl={profile?.photoUrl} className="size-10" textClassName="text-sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold text-brand-900">{profile?.name}</span>
            <span className="block truncate text-xs text-muted">{profile?.className ? `Siswa Kelas ${profile.className}` : 'Siswa'}</span>
          </span>
          <Settings className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </NavLink>
      </aside>

      {/* ---------- Bar atas (mobile) ---------- */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur-xl lg:hidden">
        {/* flex: tanpa ini <a> tetap inline, logonya didudukkan di baseline teks dan tampak naik. */}
        <a href={APP.landingUrl} aria-label="ISYARA, ke halaman utama" className="flex items-center">
          <Logo />
        </a>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={newChat} aria-label="Chat baru" className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white">
            <Plus className="size-4" aria-hidden="true" />
          </button>
          <NavLink to="/profil" aria-label="Profil dan pengaturan">
            <Avatar name={profile?.name?.split(' ')[0]} photoUrl={profile?.photoUrl} className="size-9" textClassName="text-xs" />
          </NavLink>
        </div>
      </header>

      {/* ---------- Isi ---------- */}
      <main
        id="konten"
        className={cn(
          'mx-auto w-full max-w-[84rem] px-4 pb-28 pt-5 md:px-8 md:pt-8 lg:pb-10',
          // pb-0: jarak bawah kolom tanya diurus ChatPage (kolomnya menempel ke tepi bawah layar).
          fullHeight && 'lg:flex lg:min-h-dvh lg:flex-col lg:pb-0 lg:pt-6',
        )}
      >
        {/* Hanya animasi masuk (tanpa exit): <Outlet/> selalu merender rute baru, jadi exit akan berkedip. */}
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className={cn(fullHeight && 'lg:flex lg:flex-1 lg:flex-col')}
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
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {[...NAV, { to: '/riwayat', label: 'Riwayat', short: 'Riwayat', icon: History }].map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                className={({ isActive }) =>
                  cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-bold', isActive ? 'text-brand-600' : 'text-muted')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span layoutId="tab-dot" className="absolute top-1.5 h-1 w-6 rounded-full bg-brand-600" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                    )}
                    <n.icon className="size-5" aria-hidden="true" />
                    <span className="max-w-full truncate px-1">{n.short}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <DeleteChatDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        deleting={deleting}
        failed={failed}
        onCancel={closeConfirm}
        onConfirm={() => void doDelete()}
      />
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
