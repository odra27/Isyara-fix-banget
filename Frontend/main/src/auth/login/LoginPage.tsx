import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Hand, IdCard, Info, LoaderCircle, Lock, MessageCircle, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { SignerAvatar } from '@/components/ui/signer-avatar';
import { APP } from '@/config/app.config';
import { AUTH } from '../auth.config';
import { readyAccounts, validateCredentialLengths } from '../auth.service';
import { useAuth } from '../AuthContext';
import { Field } from '../components/Field';
import { ForgotPasswordDialog } from './ForgotPasswordDialog';

/**
 * Halaman masuk siswa (ADR-051 D2). Akun dibuat sekolah; siswa masuk dengan NIS + password.
 * Kiri: branding + ilustrasi tablet belajar. Kanan: form. Di layar sempit menumpuk vertikal.
 */
const hintAccounts = readyAccounts;

export function LoginPage() {
  const { login, isAuthenticated, loading, endedReason, clearEndedReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [nis, setNis] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ nis?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockLeft, setLockLeft] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const forgotRef = useRef<HTMLButtonElement>(null);

  const locked = lockLeft > 0;

  useEffect(() => {
    if (isAuthenticated) navigate(from || '/', { replace: true });
  }, [isAuthenticated, from, navigate]);

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

  const onEdit = (setter: (v: string) => void, key: 'nis' | 'password') => (value: string) => {
    setter(value);
    if (!locked) setMessage(null);
    setFieldError((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    if (endedReason) clearEndedReason();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked || submitting) return;

    const id = nis.trim();
    const pass = password;
    const missing: typeof fieldError = {};
    if (!id) missing.nis = 'NIS wajib diisi.';
    if (!pass.trim()) missing.password = 'Password wajib diisi.';
    if (missing.nis || missing.password) {
      setFieldError(missing);
      setMessage('Lengkapi NIS dan password dulu, ya.');
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
      navigate(from || '/', { replace: true });
      return;
    }

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
    setMessage(`NIS atau password tidak cocok. Sisa percobaan: ${AUTH.maxAttempts - next}.`);
  };

  // Sesi tersimpan sedang diperiksa / sudah login: jangan tampilkan form sama sekali.
  if (loading || isAuthenticated) {
    return (
      <div className="grid min-h-dvh place-items-center bg-tint" role="status" aria-live="polite">
        <span className="flex items-center gap-2 text-sm font-semibold text-muted">
          <LoaderCircle className="size-4 anim-spin" aria-hidden="true" /> Menyiapkan akunmu…
        </span>
      </div>
    );
  }

  const notice =
    endedReason === 'expired'
      ? 'Sesi sebelumnya berakhir. Silakan masuk kembali.'
      : endedReason === 'logout'
        ? 'Kamu sudah keluar. Sampai jumpa lagi!'
        : null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Branding ---------- */}
      <section className="relative isolate flex overflow-hidden bg-white px-6 py-8 md:px-10 md:py-10 lg:px-14 xl:px-20">
        <div aria-hidden="true" className="absolute -left-28 top-1/3 -z-10 size-[26rem] rounded-full bg-brand-50/80 blur-2xl" />
        <div aria-hidden="true" className="absolute -right-24 -top-10 -z-10 size-[22rem] rounded-full bg-tint" />

        <div className="mx-auto flex w-full max-w-[32rem] flex-col justify-between gap-8">
          <a href={APP.landingUrl} aria-label="ISYARA, ke halaman utama" className="w-fit rounded-xl transition-opacity hover:opacity-80">
            <Logo />
          </a>

          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600">
              <BookOpen className="size-3.5" aria-hidden="true" /> Platform Edukasi Inklusif
            </span>
            <h1 className="mt-4 text-[clamp(2.25rem,4.4vw,3.5rem)] font-extrabold leading-[1] tracking-[-0.055em] text-brand-900">
              Memahami <br />
              Tanpa <span className="relative inline-block">Batas<Underline /></span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
              Materi dengan bahasa isyarat, teks, dan audio. Tanya apa saja ke chatbot ISYARA, lewat ketikan atau isyarat.
            </p>
          </div>

          <LoginIllustration />
        </div>
      </section>

      {/* ---------- Form ---------- */}
      <section className="flex items-center justify-center bg-tint px-5 py-10 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[26rem]"
        >
          <div className="flex flex-col items-center text-center">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-brand-600">Akun siswa</span>
            <h2 className="mt-3 text-[1.625rem] font-extrabold tracking-[-0.035em]">Masuk untuk mulai belajar</h2>
            <p className="mt-1.5 text-sm text-muted">Gunakan NIS dan password dari sekolahmu.</p>
          </div>

          {notice && (
            <p role="status" className="mt-5 flex items-start gap-2 rounded-2xl bg-white p-3.5 text-sm text-brand-800">
              <Info className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
              {notice}
            </p>
          )}

          <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
            <Field
              label="NIS (Nomor Induk Siswa)"
              icon={<IdCard className="size-[1.1rem]" />}
              value={nis}
              onChange={(e) => onEdit(setNis, 'nis')(e.target.value)}
              placeholder="mis. 0012345678"
              autoComplete="username"
              inputMode="numeric"
              spellCheck={false}
              error={fieldError.nis}
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
                  Terlalu banyak percobaan. Tunggu {lockLeft} detik lagi.
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

          {hintAccounts.length > 0 && (
            <div className="mt-7 rounded-2xl border border-dashed border-brand-200 bg-white/70 p-4">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-brand-600">Akun siap pakai</p>
              <p className="mt-1 text-xs text-muted">
                Ketuk akun untuk mengisi form.
              </p>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {hintAccounts.map((c) => (
                  <li key={c.nis}>
                    <button
                      type="button"
                      onClick={() => {
                        setNis(c.nis);
                        setPassword(c.password);
                        setMessage(null);
                        setFieldError({});
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-tint px-3 py-2 text-xs transition-colors hover:bg-brand-50"
                    >
                      <span className="font-bold text-brand-900">NIS {c.nis}</span>
                      <span className="font-mono text-muted">{c.password}</span>
                    </button>
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

/** Garis tangan di bawah kata terakhir tagline (dekoratif). */
function Underline() {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 18" className="absolute -bottom-2 left-0 h-3 w-full text-brand-400" preserveAspectRatio="none">
      <motion.path
        d="M3 12 C 50 4, 110 4, 197 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

/** Tablet belajar dengan avatar penanda isyarat (placeholder) + dua kartu fitur. Dekoratif. */
function LoginIllustration() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[26rem] select-none lg:mx-0">
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="rounded-[1.75rem] bg-brand-900 p-2 shadow-soft"
      >
        <div className="relative aspect-[16/10] overflow-hidden rounded-[1.3rem] bg-gradient-to-br from-brand-100 via-brand-50 to-white">
          <SignerAvatar className="absolute inset-x-[18%] bottom-0 top-[8%]" />
          <span className="absolute left-3 top-3 rounded-full bg-brand-900/85 px-2 py-0.5 text-[0.625rem] font-bold tabular-nums text-white">00:45</span>
          <p className="absolute inset-x-3 bottom-3 rounded-xl bg-brand-900/85 px-3 py-2 text-center text-[0.6875rem] font-semibold text-white">
            Hari ini kita akan belajar tentang siklus air.
          </p>
        </div>
      </motion.div>
      <div className="absolute -right-3 -top-4 flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-brand-800 shadow-soft">
        <Hand className="size-3.5 text-brand-600" /> Video isyarat
      </div>
      <div className="absolute -bottom-4 -left-3 flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-brand-800 shadow-soft">
        <MessageCircle className="size-3.5 text-brand-600" /> Chatbot AI
      </div>
    </div>
  );
}
