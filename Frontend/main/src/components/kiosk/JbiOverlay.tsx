import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useKiosk } from '@/state/KioskContext';

/**
 * ESCALATED (PRD §8 Fitur C). Transisi tegas tapi tidak menakutkan.
 * TODO (BE/integrasi): notifikasi nyata ke JBI/petugas jaga. Saat ini mock + log escalated_to_jbi.
 */
export function JbiOverlay() {
  const k = useKiosk();
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!k.escalated) return;
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && k.closeJbi();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [k.escalated, k]);

  return (
    <AnimatePresence>
      {k.escalated && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="jbi-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 grid place-items-center bg-brand-900 p-5 text-white"
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-full max-w-xl flex-col items-center text-center"
          >
            <span className="relative grid size-24 place-items-center rounded-[2rem] bg-white/10">
              <span className="absolute inset-0 rounded-[2rem] border-2 border-brand-200/40 anim-breathe" aria-hidden="true" />
              <Users className="size-10 text-brand-200" aria-hidden="true" />
            </span>
            <h2 id="jbi-title" className="mt-7 text-[2.5rem] font-extrabold leading-[1] tracking-[-0.05em] md:text-[3.5rem]">
              JBI sedang dipanggil
            </h2>
            <p className="mt-4 max-w-md text-lg text-brand-100">Mohon tunggu sebentar. Juru bahasa isyarat akan membantu Anda.</p>

            <ol className="mt-8 grid w-full gap-2 text-left text-sm sm:grid-cols-2">
              <li className="rounded-2xl bg-white/[0.07] p-4">
                <span className="text-xs font-bold text-brand-200">UNTUK PASIEN</span>
                <p className="mt-1 font-semibold">Tetap di dekat meja layanan.</p>
              </li>
              <li className="rounded-2xl bg-white/[0.07] p-4">
                <span className="text-xs font-bold text-brand-200">UNTUK PETUGAS</span>
                <p className="mt-1 font-semibold">Hubungi JBI atau petugas pendamping yang bertugas hari ini.</p>
              </li>
            </ol>

            <Button ref={backRef} variant="soft" size="lg" onClick={k.closeJbi} className="mt-8 bg-white text-brand-900 hover:bg-brand-50">
              <ArrowLeft /> Kembali ke kiosk
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
