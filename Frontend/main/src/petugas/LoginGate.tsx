import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, LogIn, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP } from '@/config/app.config';
import { KioskScreen } from '@/kiosk/KioskScreen';

/**
 * Gerbang login untuk kiosk (revisi UX): alih-alih melempar langsung ke /login,
 * kiosk tetap ditampilkan sebagai pratinjau yang DIBURAMKAN dengan popup di tengah.
 *
 * Dua pengaman:
 *  1. Lapisan penutup menghalangi semua interaksi ke kiosk di belakangnya
 *     (pointer-events + aria-hidden pada preview), jadi kamera/mic/kontrol tidak
 *     dapat disentuh tanpa login. Preview hanya tampilan.
 *  2. Gerbang tidak punya jalan untuk "menutup lalu memakai kiosk" — fokus
 *     dikunci di dalam dialog dan Escape tidak membuka kiosk. Satu-satunya jalan
 *     maju adalah Masuk; satu-satunya jalan keluar adalah kembali ke landing.
 */
export function LoginGate() {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  const onKeyDownTrap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const f = panelRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    if (!f || f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="relative min-h-dvh">
      {/* Pratinjau kiosk: buram, tidak dapat disentuh, dan disembunyikan dari pembaca layar.
          preview=true memastikan kamera/mic tidak dinyalakan. */}
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px]">
        <KioskScreen preview />
      </div>

      {/* Lapisan gerbang. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 grid place-items-center bg-brand-950/40 p-4"
      >
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gate-title"
          aria-describedby="gate-body"
          onKeyDown={onKeyDownTrap}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[30rem] rounded-[1.75rem] bg-white p-7 text-center shadow-soft md:p-8"
        >
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Lock className="size-6" aria-hidden="true" />
          </span>

          <h2 id="gate-title" className="mt-5 text-[1.5rem] font-extrabold leading-tight tracking-[-0.035em]">
            Masuk dulu untuk membuka kiosk
          </h2>
          <p id="gate-body" className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Kiosk hanya dapat dioperasikan oleh petugas yang sudah masuk. Tampilan di belakang hanyalah pratinjau dan belum bisa dipakai.
          </p>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row-reverse">
            <Button ref={primaryRef} size="lg" className="w-full sm:flex-1" onClick={() => navigate('/login', { state: { from: '/kiosk' } })}>
              <LogIn aria-hidden="true" /> Masuk
            </Button>
            <Button variant="outline" size="lg" className="w-full sm:flex-1" onClick={() => window.location.assign(APP.landingUrl)}>
              <ArrowLeft aria-hidden="true" /> Kembali ke mode demo
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
