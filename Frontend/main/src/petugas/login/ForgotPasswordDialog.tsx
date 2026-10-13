import { useEffect, useRef, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AUTH } from '../auth.config';

/**
 * Dialog "Lupa password?" (Requirement 6). Akun petugas dibuatkan Admin, jadi tidak
 * ada pemulihan mandiri — dialog hanya mengarahkan ke Admin.
 *
 * Aksesibilitas: role dialog + aria-modal, fokus awal masuk ke dalam dialog, fokus
 * terkunci (Tab berputar di dalam), Escape dan klik backdrop menutup, dan fokus
 * dikembalikan ke pemicu oleh pemanggil.
 */
export function ForgotPasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus trap: Tab dari elemen terakhir kembali ke pertama, dan sebaliknya.
  const onKeyDownTrap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 grid place-items-center bg-brand-950/45 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-title"
            aria-describedby="forgot-body"
            onKeyDown={onKeyDownTrap}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[32rem] rounded-[1.75rem] bg-white p-6 shadow-soft md:p-7"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <KeyRound className="size-5" aria-hidden="true" />
            </span>

            <h2 id="forgot-title" className="mt-4 text-[1.375rem] font-extrabold leading-tight tracking-[-0.03em]">
              Password diatur oleh Admin
            </h2>

            <div id="forgot-body" className="mt-2 flex flex-col gap-3 text-sm leading-relaxed text-muted">
              <p>
                Akun petugas dibuat dan dikelola oleh Admin, jadi password tidak dapat diatur ulang sendiri dari halaman ini.
              </p>
              <p className="rounded-2xl bg-tint p-3.5 text-brand-800">
                Hubungi <span className="font-bold">{AUTH.adminContact}</span> untuk meminta password baru. Sebutkan ID Pegawai Anda agar
                akun lebih cepat ditemukan.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <Button ref={closeRef} variant="primary" size="md" onClick={onClose}>
                <ArrowLeft aria-hidden="true" /> Kembali
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
