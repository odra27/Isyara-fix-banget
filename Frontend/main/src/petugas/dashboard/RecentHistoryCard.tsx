import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Hand, Keyboard, MessagesSquare, Mic, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { conversationStore } from '@/state/conversation.store';
import type { ConversationItem } from '@/types/kiosk';
import { cn } from '@/lib/utils';

/**
 * Riwayat penggunaan sesi ini di Dashboard Petugas.
 *
 * Membaca conversationStore yang sama dengan tab "Riwayat" di kiosk, jadi isinya
 * selalu sinkron. Tetap hanya di memori dan hilang saat halaman dimuat ulang (PRD §17).
 */
const CHANNEL_ICON = { isyarat: Hand, suara: Mic, ketik: Keyboard, 'pilih-manual': Hand } as const;
const CHANNEL_LABEL = { isyarat: 'isyarat', suara: 'suara', ketik: 'ketik', 'pilih-manual': 'pilih manual' } as const;

const time = (at: number) => new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

/** Jumlah entri terbaru yang ditampilkan; sisanya dilihat di tab Riwayat kiosk. */
const PREVIEW = 4;

export function RecentHistoryCard() {
  const items = useSyncExternalStore(conversationStore.subscribe, conversationStore.list, conversationStore.list);
  const recent = items.slice(-PREVIEW).reverse();
  const spoken = items.filter((i) => i.from !== 'sistem').length;

  return (
    <section aria-label="Riwayat penggunaan sesi ini" className="rounded-[1.75rem] bg-white p-6 shadow-soft md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600" aria-hidden="true">
            <MessagesSquare className="size-[1.1rem]" />
          </span>
          <div>
            <h2 className="text-base font-extrabold tracking-[-0.02em]">Riwayat sesi ini</h2>
            <p className="mt-0.5 text-xs text-muted">
              {spoken > 0 ? `${spoken} pesan tercatat di perangkat ini` : 'Tersimpan sementara, hilang saat halaman dimuat ulang'}
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={() => conversationStore.clear()} disabled={items.length === 0}>
          <Trash aria-hidden="true" /> Hapus
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="mt-5 grid place-items-center rounded-2xl border-2 border-dashed border-brand-100 bg-tint/60 px-5 py-8 text-center">
          <p className="text-sm font-bold text-brand-900">Belum ada percakapan</p>
          <p className="mt-1 max-w-xs text-xs text-muted">Frasa dari pasien dan petugas akan muncul di sini setelah kiosk dipakai.</p>
        </div>
      ) : (
        <>
          <ol className="mt-5 flex flex-col gap-2.5" aria-label="Percakapan terbaru">
            <AnimatePresence initial={false}>
              {recent.map((it) => (
                <Row key={it.id} it={it} />
              ))}
            </AnimatePresence>
          </ol>

          <Link
            to="/kiosk?tab=percakapan"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-bold text-brand-600 underline-offset-4 transition-colors hover:text-brand-900 hover:underline"
          >
            Lihat riwayat lengkap di kiosk
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </>
      )}
    </section>
  );
}

function Row({ it }: { it: ConversationItem }) {
  if (it.from === 'sistem') {
    return (
      <motion.li
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 rounded-2xl bg-brand-50 px-3.5 py-2.5 text-xs font-bold text-brand-600"
      >
        <span className="flex-1">{it.text}</span>
        <span className="shrink-0 font-semibold text-muted">{time(it.at)}</span>
      </motion.li>
    );
  }

  const officer = it.from === 'petugas';
  const Icon = it.channel ? CHANNEL_ICON[it.channel] : Hand;

  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl',
          officer ? 'bg-brand-600 text-white' : 'bg-tint text-brand-600',
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
          {officer ? 'Petugas' : 'Pasien'}
          {it.channel && <span>· {CHANNEL_LABEL[it.channel]}</span>}
          <span>· {time(it.at)}</span>
        </p>
        <p className="mt-0.5 break-words text-sm font-bold leading-snug text-brand-900">{it.text}</p>
      </div>
    </motion.li>
  );
}
