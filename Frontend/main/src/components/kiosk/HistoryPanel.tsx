import { AnimatePresence, motion } from 'framer-motion';
import { Hand, Info, Keyboard, MessagesSquare, Mic, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useKiosk } from '@/state/KioskContext';
import type { ConversationItem } from '@/types/kiosk';
import { cn } from '@/lib/utils';

/** Riwayat percakapan sesi ini. Hanya di memori, tidak dikirim / disimpan (PRD §17). */
const CHANNEL_ICON = { isyarat: Hand, suara: Mic, ketik: Keyboard, 'pilih-manual': Hand } as const;
const CHANNEL_LABEL = { isyarat: 'isyarat', suara: 'suara', ketik: 'ketik', 'pilih-manual': 'pilih manual' } as const;

const time = (at: number) => new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export function HistoryPanel() {
  const k = useKiosk();
  const items = k.conversation;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-muted">
          <Info className="size-3.5" aria-hidden="true" />
          Hanya tersimpan sementara di perangkat ini. Hapus sebelum pasien berikutnya.
        </p>
        <Button variant="outline" size="sm" onClick={k.clearConversation} disabled={!items.length}>
          <Trash /> Hapus percakapan
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="grid min-h-72 place-items-center rounded-3xl border-2 border-dashed border-brand-100 bg-white/60 p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-400">
              <MessagesSquare className="size-6" aria-hidden="true" />
            </span>
            <p className="text-lg font-extrabold">Belum ada percakapan</p>
            <p className="max-w-xs text-sm text-muted">Frasa dari pasien dan petugas akan muncul berurutan di sini.</p>
          </div>
        </div>
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Riwayat percakapan">
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <Bubble key={it.id} it={it} />
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}

function Bubble({ it }: { it: ConversationItem }) {
  if (it.from === 'sistem') {
    return (
      <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-center rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600">
        {it.text} · {time(it.at)}
      </motion.li>
    );
  }
  const officer = it.from === 'petugas';
  const Icon = it.channel ? CHANNEL_ICON[it.channel] : Hand;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12, x: officer ? 12 : -12 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      className={cn('flex max-w-[85%] flex-col', officer ? 'items-end self-end text-right' : 'items-start')}
    >
      <span className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">
        <Icon className="size-3" aria-hidden="true" />
        {officer ? 'Petugas' : 'Pasien'} · {it.channel ? CHANNEL_LABEL[it.channel] : ''} · {time(it.at)}
      </span>
      <span
        className={cn(
          'rounded-2xl px-4 py-3 text-base font-bold leading-snug',
          officer ? 'rounded-tr-md bg-brand-600 text-white' : 'rounded-tl-md bg-white text-brand-900',
        )}
      >
        {it.text}
      </span>
      {typeof it.confidence === 'number' && it.confidence < 1 && (
        <span className="mt-1 text-[0.6875rem] text-muted">keyakinan {Math.round(it.confidence * 100)}%</span>
      )}
    </motion.li>
  );
}
