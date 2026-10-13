import { AnimatePresence, motion } from 'framer-motion';
import { CameraOff, MicOff, RotateCcw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useKiosk } from '@/state/KioskContext';
import { mockControls } from '@/services/matching.service';
import type { FallbackReason } from '@/types/kiosk';

/**
 * Notifikasi non-modal saat satu sisi beralih ke mode manual (PRD-FE §8).
 * Menyebut sisi mana yang terdampak + tombol "coba aktifkan lagi" tanpa reload.
 */
const COPY: Record<'sign' | 'speech', Record<FallbackReason, { title: string; body: string; retry: string }>> = {
  sign: {
    camera: { title: 'Kamera tidak tersedia', body: 'Sisi pasien beralih ke pilih frasa manual.', retry: 'Coba aktifkan kamera' },
    backend: { title: 'Koneksi ke server terputus', body: 'Sisi pasien beralih ke pilih frasa manual.', retry: 'Coba sambungkan lagi' },
    mic: { title: '', body: '', retry: '' },
  },
  speech: {
    mic: { title: 'Mic tidak tersedia', body: 'Petugas bisa mengetik kalimat. Pencocokan tetap berjalan.', retry: 'Coba aktifkan mic' },
    backend: { title: 'Koneksi ke server terputus', body: 'Teks petugas langsung ditampilkan ke pasien.', retry: 'Coba sambungkan lagi' },
    camera: { title: '', body: '', retry: '' },
  },
};

const ICON = { camera: CameraOff, mic: MicOff, backend: WifiOff };

export function FallbackNotices() {
  const k = useKiosk();
  const items = [
    k.signFallback && { side: 'sign' as const, reason: k.signFallback, clear: () => k.setSignFallback(null) },
    k.speechFallback && { side: 'speech' as const, reason: k.speechFallback, clear: () => k.setSpeechFallback(null) },
  ].filter(Boolean) as { side: 'sign' | 'speech'; reason: FallbackReason; clear: () => void }[];

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-40 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
      <AnimatePresence>
        {items.map((it) => {
          const c = COPY[it.side][it.reason];
          const Icon = ICON[it.reason];
          return (
            <motion.div
              key={it.side + it.reason}
              role="status"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-soft"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-rec-soft text-rec">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold">
                  <span className="mr-1.5 rounded-md bg-brand-50 px-1.5 py-0.5 text-[0.6875rem] font-bold text-brand-600">
                    {it.side === 'sign' ? 'Pasien' : 'Petugas'}
                  </span>
                  {c.title}
                </p>
                <p className="mt-0.5 text-xs text-muted">{c.body}</p>
              </div>
              <Button
                variant="soft"
                size="sm"
                onClick={() => {
                  if (it.reason === 'backend') mockControls.failBackend = false;
                  it.clear();
                }}
              >
                <RotateCcw /> <span className="hidden sm:inline">{c.retry}</span>
                <span className="sm:hidden">Coba lagi</span>
              </Button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
