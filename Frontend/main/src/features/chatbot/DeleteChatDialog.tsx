import { useEffect, useRef, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Konfirmasi hapus percakapan, muncul di tengah layar. Menghapus percakapan juga menghapus
 * pesannya dan materi PDF yang diunggah di dalamnya (Backend: DELETE /api/chat/sessions/{id}),
 * jadi akibatnya disebutkan apa adanya sebelum siswa menekan Hapus.
 *
 * Aksesibilitas: role dialog + aria-modal, fokus awal ke "Batalkan" (pilihan yang aman), fokus
 * terkunci di dalam dialog, Escape dan klik backdrop membatalkan. Fokus dikembalikan ke tombol
 * pemicu oleh pemanggil.
 */
export function DeleteChatDialog({
  open,
  title,
  deleting,
  failed,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Judul percakapan yang akan dihapus. */
  title: string;
  deleting: boolean;
  failed: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

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
            if (e.target === e.currentTarget && !deleting) onCancel();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hapus-chat-title"
            aria-describedby="hapus-chat-body"
            onKeyDown={onKeyDownTrap}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[28rem] rounded-[1.75rem] bg-white p-6 shadow-soft md:p-7"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-rec-soft text-rec">
              <Trash2 className="size-5" aria-hidden="true" />
            </span>

            <h2 id="hapus-chat-title" className="mt-4 text-[1.375rem] font-extrabold leading-tight tracking-[-0.03em]">
              Hapus percakapan?
            </h2>

            <div id="hapus-chat-body" className="mt-2 flex flex-col gap-3 text-sm leading-relaxed text-muted">
              <p>
                Semua pesan di <span className="font-bold text-brand-800">“{title}”</span> akan hilang dari Riwayat, termasuk materi PDF yang
                kamu unggah di percakapan ini.
              </p>
              <p className="rounded-2xl bg-tint p-3.5 text-brand-800">
                Percakapan yang sudah dihapus <span className="font-bold">tidak bisa dikembalikan</span>. Video pelajaran dan materi lainmu
                tidak terpengaruh.
              </p>
            </div>

            <div aria-live="polite" role="status">
              {failed && (
                <p className="mt-3 flex items-start gap-1.5 text-sm font-semibold text-rec">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Tidak bisa terhubung ke server. Percakapan belum dihapus, coba lagi sebentar.
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button ref={cancelRef} variant="outline" size="md" onClick={onCancel} disabled={deleting}>
                Batalkan
              </Button>
              <Button variant="danger" size="md" onClick={onConfirm} disabled={deleting}>
                {deleting ? <LoaderCircle className="anim-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                {deleting ? 'Menghapus…' : 'Hapus'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
