import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, IdCard, Info, LoaderCircle, Lock, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { APP } from '@/config/app.config';
import { AUTH } from '../auth.config';
import { demoCredentials, isMockAuth, validateCredentialLengths } from '../auth.service';
import { useAuth } from '../AuthContext';
import { Field } from '../components/Field';
import { ForgotPasswordDialog } from './ForgotPasswordDialog';
import { KioskPreview } from './KioskPreview';

/**
 * Halaman masuk petugas (Requirement 3, 5, 6, 12).
 *
 * Tata letak dua area: kiri branding/informasi, kanan form. Di layar sempit
 * keduanya menumpuk vertikal dengan form tetap dapat dioperasikan.
 */
export function LoginPage() {
  const { login, isAuthenticated, endedReason, clearEndedReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ employeeId?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockLeft, setLockLeft] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const forgotRef = useRef<HTMLButtonElement>(null);

  const locked = lockLeft > 0;

  // Petugas yang sudah punya sesi tidak perlu melihat form lagi.
  useEffect(() => {
    if (isAuthenticated) navigate(from || '/dashboard', { replace: true });
  }, [isAuthenticated, from, navigate]);

  // Hitung mundur penguncian tombol Masuk.
  useEffect(() => {
    if (!lockUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockLeft(left);
      if (left === 0) {
        setLockUntil(null);
        setAttempts(0);
        setMessage(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [lockUntil]);

  /** Perubahan isi field menghapus pesan kesalahan sebelumnya. */
  const onEdit = (setter: (v: string) => void, key: 'employeeId' | 'password') => (value: string) => {
    setter(value);
    if (!locked) setMessage(null);
    setFieldError((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    if (endedReason) clearEndedReason();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked || submitting) return;

    const id = employeeId.trim();
    const pass = password;

    // Field kosong: jangan panggil auth service sama sekali.
    const missing: typeof fieldError = {};
    if (!id) missing.employeeId = 'ID Pegawai wajib diisi.';
    if (!pass.trim()) missing.password = 'Password wajib diisi.';
    if (missing.employeeId || missing.password) {
      setFieldError(missing);
      setMessage('Lengkapi ID Pegawai dan password terlebih dahulu.');
      return;
    }

    const tooLong = validateCredentialLengths(id, pass);
    if (tooLong) {
      setMessage(tooLong);
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const result = await login(id, pass);
    setSubmitting(false);

    if (result.ok) {
      navigate(from || '/dashboard', { replace: true });
      return;
    }

    // Password dikosongkan, ID dipertahankan agar petugas tidak mengetik ulang.
    setPassword('');
    const next = attempts + 1;
    setAttempts(next);

    if (result.reason === 'service-error') {
      setMessage('Tidak bisa menghubungi server. Coba lagi sebentar.');
      return;
    }

    if (next >= AUTH.maxAttempts) {
      setLockUntil(Date.now() + AUTH.lockoutMs);
      return;
    }
    setMessage(`ID Pegawai atau password tidak dikenali. Sisa percobaan: ${AUTH.maxAttempts - next}.`);
  };

  const notice =
    endedReason === 'expired'
      ? 'Sesi sebelumnya berakhir karena tidak ada aktivitas. Silakan masuk kembali.'
      : endedReason === 'logout'
        ? 'Anda telah keluar. Terima kasih sudah bertugas.'
        : null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* ---------- Area branding / informasi ---------- */}
      <section className="relative isolate flex overflow-hidden bg-white px-6 py-8 md:px-10 md:py-10 lg:px-14 xl:px-20">
        <div aria-hidden="true" className="absolute -left-28 top-1/3 -z-10 size-[26rem] rounded-full bg-brand-50/70 blur-2xl" />
        <div aria-hidden="true" className="absolute -right-24 bottom-0 -z-10 size-[20rem] rounded-full bg-tint" />

        {/* Konten dipusatkan dalam wadah ber-lebar-tetap agar tidak menempel ke tepi layar. */}
        <div className="mx-auto flex w-full max-w-[30rem] flex-col justify-between">
          {/* Logo menautkan kembali ke landing page (app terpisah). */}
          <a
            href={APP.landingUrl}
            aria-label="ISYARA, ke halaman utama"
            className="w-fit rounded-xl transition-opacity hover:opacity-80 focus-visible:outline-none"
          >
            <Logo />
          </a>

          <div className="my-8 lg:my-10">
            <h1 className="text-[clamp(2rem,4.2vw,3.25rem)] font-extrabold leading-[1.02] tracking-[-0.055em] text-brand-900">
              Masuk dulu,
              <br />
              lalu buka kiosk
              <br />
              untuk pasien.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted">
              Kiosk ISYARA menjembatani percakapan pasien Tuli dan petugas Puskesmas. Masuk dengan akun petugas untuk melihat jadwal Anda
              hari ini.
            </p>
          </div>

          <KioskPreview />
        </div>
      </section>

      {/* ---------- Area form ---------- */}
      <section className="flex items-center justify-center bg-tint px-5 py-10 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[26rem]"
        >
          <div className="flex flex-col items-center text-center">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-brand-600">
              Akun petugas
            </span>
            <h2 className="mt-3 text-[1.625rem] font-extrabold tracking-[-0.035em]">Masuk ke akun petugas</h2>
            <p className="mt-1.5 text-sm text-muted">Gunakan ID Pegawai yang dibuatkan Admin Puskesmas.</p>
          </div>

          {notice && (
            <p role="status" className="mt-5 flex items-start gap-2 rounded-2xl bg-white p-3.5 text-sm text-brand-800">
              <Info className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
              {notice}
            </p>
          )}

          <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
            <Field
              label="ID Pegawai"
              icon={<IdCard className="size-[1.1rem]" />}
              value={employeeId}
              onChange={(e) => onEdit(setEmployeeId, 'employeeId')(e.target.value)}
              placeholder="mis. PTG-001"
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              error={fieldError.employeeId}
            />

            <Field
              label="Password"
              password
              icon={<Lock className="size-[1.1rem]" />}
              value={password}
              onChange={(e) => onEdit(setPassword, 'password')(e.target.value)}
              placeholder="Masukkan password"
              autoComplete="current-password"
              error={fieldError.password}
            />

            {/* Pesan status/kesalahan diumumkan ke pembaca layar. */}
            <div aria-live="polite" role="status" className="min-h-5">
              {message && (
                <p className="flex items-start gap-1.5 text-sm font-semibold text-rec">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {message}
                </p>
              )}
              {locked && (
                <p className="flex items-start gap-1.5 text-sm font-semibold text-rec">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Terlalu banyak percobaan. Tunggu {lockLeft} detik lagi, atau hubungi Admin.
                </p>
              )}
            </div>

            <Button type="submit" size="lg" disabled={submitting || locked} className="w-full">
              {submitting ? (
                <>
                  <LoaderCircle className="anim-spin" aria-hidden="true" /> Memeriksa…
                </>
              ) : (
                <>
                  Masuk <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>

            <button
              ref={forgotRef}
              type="button"
              onClick={() => setForgotOpen(true)}
              className="mx-auto rounded-lg px-2 py-1 text-sm font-semibold text-brand-600 underline-offset-4 transition-colors hover:text-brand-900 hover:underline"
            >
              Lupa password?
            </button>
          </form>

          {isMockAuth && (
            <div className="mt-7 rounded-2xl border border-dashed border-brand-200 bg-white/70 p-4">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-brand-600">Akun demo</p>
              <p className="mt-1 text-xs text-muted">Backend belum tersambung, jadi gunakan salah satu akun berikut.</p>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {demoCredentials.map((c) => (
                  <li key={c.employeeId} className="flex items-center justify-between gap-3 rounded-xl bg-tint px-3 py-2 text-xs">
                    <span className="font-bold text-brand-900">{c.employeeId}</span>
                    <span className="font-mono text-muted">{c.password}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      </section>

      <ForgotPasswordDialog
        open={forgotOpen}
        onClose={() => {
          setForgotOpen(false);
          forgotRef.current?.focus();
        }}
      />
    </div>
  );
}
