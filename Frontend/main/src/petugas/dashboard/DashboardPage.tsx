import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, CalendarClock, Hospital, IdCard, LogOut, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '../AuthContext';
import { Avatar } from '../components/Avatar';
import { CloudBackdrop } from './CloudBackdrop';
import { RecentHistoryCard } from './RecentHistoryCard';

const BELUM_ADA = 'Belum tersedia';

/** Satu baris informasi tugas pada kartu identitas. */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-bold text-brand-900">{value}</dd>
      </div>
    </div>
  );
}

/**
 * Dashboard petugas (Requirement 7, 13).
 *
 * Tata letak dua area: kiri kartu identitas (avatar inisial, nama, jabatan, badge,
 * blok info tugas, lalu tombol Logout di bawahnya), kanan sapaan + tombol
 * "Mulai Bekerja" yang membuka kiosk.
 */
export function DashboardPage() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState(false);

  // RequireAuth menjamin sesi ada; ini hanya penjaga tipe.
  if (!profile) return null;

  const name = profile.name?.trim() || BELUM_ADA;
  const firstName = name !== BELUM_ADA ? name.split(/\s+/)[0] : name;

  const onLogout = () => {
    const ok = logout();
    if (!ok) {
      setLogoutError(true);
      return;
    }
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-tint">
      <header className="border-b border-line bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <Logo />
          <p className="flex items-center gap-2 text-sm font-bold text-brand-800">
            <Hospital className="size-[1.1rem] text-brand-600" aria-hidden="true" />
            <span className="max-w-[12rem] truncate sm:max-w-none">{profile.unit?.trim() || BELUM_ADA}</span>
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 md:px-6 md:py-10 lg:grid lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-8">
        {/* ---------- Kartu identitas ---------- */}
        <motion.section
          aria-label="Identitas petugas"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative isolate overflow-hidden rounded-[1.75rem] bg-white p-6 shadow-soft"
        >
          {/* Hiasan awan lembut hanya di bagian atas (di belakang avatar/nama/badge). */}
          <CloudBackdrop />

          <div className="relative flex flex-col items-center text-center">
            <Avatar name={profile.name} photoUrl={profile.photoUrl} className="size-28 text-[2rem] ring-4 ring-white shadow-soft" />
            <h2 className="mt-4 text-xl font-extrabold tracking-[-0.03em] text-brand-950">{name}</h2>
            {profile.role && <p className="mt-0.5 text-sm font-semibold text-brand-800">{profile.role}</p>}
            <span className="mt-2.5 rounded-full bg-white px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-brand-600 shadow-soft">
              Petugas
            </span>
          </div>

          <hr className="relative my-5 border-line" />

          <dl className="relative flex flex-col gap-4">
            <InfoRow icon={<IdCard className="size-[1.1rem]" />} label="ID Petugas" value={profile.employeeId?.trim() || BELUM_ADA} />
            <InfoRow icon={<Building2 className="size-[1.1rem]" />} label="Unit Kerja" value={profile.unit?.trim() || BELUM_ADA} />
            <InfoRow
              icon={<CalendarClock className="size-[1.1rem]" />}
              label="Jadwal Hari Ini"
              value={profile.todaySchedule?.trim() || BELUM_ADA}
            />
          </dl>

          {/* Logout diletakkan setelah blok informasi tugas. */}
          <div className="relative mt-6 border-t border-line pt-5">
            <Button variant="outline" size="md" onClick={onLogout} className="w-full">
              <LogOut aria-hidden="true" /> Keluar
            </Button>
            <div aria-live="polite" role="status">
              {logoutError && (
                <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-rec">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Gagal keluar karena penyimpanan perangkat terkunci. Coba lagi atau tutup peramban.
                </p>
              )}
            </div>
          </div>
        </motion.section>

        {/* ---------- Kolom kanan: sapaan + riwayat ---------- */}
        <div className="flex flex-col gap-5">
          {/* ---------- Sapaan + aksi utama ---------- */}
          <motion.section
            aria-label="Sapaan bertugas"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="relative isolate flex min-h-[18rem] flex-col justify-center overflow-hidden rounded-[1.75rem] bg-white p-7 shadow-soft md:p-10"
          >
            <div aria-hidden="true" className="absolute -bottom-20 -right-16 -z-10 size-[22rem] rounded-full bg-tint" />
            <div aria-hidden="true" className="absolute -bottom-6 right-10 -z-10 size-[10rem] rounded-full bg-brand-50" />

            <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.16em] text-brand-600">Siap melayani</p>
            <h1 className="mt-2 max-w-[28rem] text-[clamp(1.875rem,4.5vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.05em]">
              Selamat bertugas, {firstName}!
            </h1>
            <p className="mt-4 max-w-[26rem] text-base leading-relaxed text-muted">
              Semoga hari ini lancar dan banyak membantu pasien. Kiosk siap dipakai bergantian oleh pasien dan Anda.
            </p>

            <div className="mt-8">
              <Button size="lg" onClick={() => navigate('/kiosk')}>
                Mulai Bekerja <ArrowRight aria-hidden="true" />
              </Button>
              <p className="mt-3 text-xs text-muted">Kiosk terbuka di perangkat ini. Anda bisa kembali ke dashboard kapan saja.</p>
            </div>
          </motion.section>

          {/* Riwayat dibungkus boundary sendiri: gagal render di sini tidak mematikan dashboard. */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <ErrorBoundary label="Riwayat sesi">
              <RecentHistoryCard />
            </ErrorBoundary>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
