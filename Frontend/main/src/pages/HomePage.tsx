import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ArrowRight, MessageCircle, Search, SearchX, Sparkles } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { MateriCard } from '@/components/materi/MateriCard';
import { LogoMark } from '@/components/ui/logo';
import { MATERI, SUBJECTS, type Subject } from '@/data/materi';
import { isMockChat } from '@/features/chatbot/chat.service';
import { QUICK_PROMPTS } from '@/features/chatbot/prompts';
import { useMateriStore } from '@/state/materi.store';
import { cn } from '@/lib/utils';

type Filter = 'Semua' | Subject;
const FILTERS: Filter[] = ['Semua', ...SUBJECTS];

/** Beranda: sapaan, pencarian, filter mapel, grid video materi, dan panel chat singkat. */
export default function HomePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const store = useMateriStore(profile!.id);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('Semua');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return MATERI.filter((m) => filter === 'Semua' || m.subject === filter).filter(
      (m) =>
        !needle ||
        [m.title, m.subject, m.summary, ...m.sections.map((s) => s.title)].some((t) => t.toLowerCase().includes(needle)),
    );
  }, [q, filter]);

  const firstName = profile?.name.split(' ')[0] ?? 'Pelajar';
  const ask = (prompt: string) => navigate('/chatbot', { state: { prompt, autoSend: true } });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem] xl:gap-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <h1 className="text-[1.75rem] font-extrabold leading-[1.05] tracking-[-0.045em] md:text-[2.25rem]">
              Halo, {firstName}!{' '}
              <motion.span
                className="inline-block origin-[70%_70%]"
                animate={{ rotate: [0, 16, -6, 14, 0] }}
                transition={{ delay: 0.5, duration: 1.2, ease: 'easeInOut' }}
                aria-hidden="true"
              >
                👋
              </motion.span>
            </h1>
            <p className="mt-1.5 text-sm text-muted">Pilih materi yang ingin kamu pelajari hari ini.</p>
          </motion.div>
          <span className="flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-xs font-bold text-ok-ink">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
            {isMockChat ? 'Mode demo' : 'Terhubung'}
          </span>
        </div>

        <label className="relative mt-5 block max-w-xl">
          <span className="sr-only">Cari materi</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-[1.1rem] -translate-y-1/2 text-brand-400" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari materi, topik, atau kata kunci…"
            className="h-12 w-full rounded-2xl border border-line bg-white pl-11 pr-4 text-base text-brand-900 placeholder:text-muted focus:border-brand-400 focus:outline-none"
          />
        </label>

        <h2 className="mt-7 text-lg font-extrabold tracking-[-0.02em]">Video Pembelajaran</h2>
        <LayoutGroup>
          <div role="radiogroup" aria-label="Filter mata pelajaran" className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {FILTERS.map((f) => {
              const on = f === filter;
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'relative shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-colors',
                    on ? 'border-brand-600 text-white' : 'border-line bg-white text-brand-800 hover:border-brand-200',
                  )}
                >
                  {on && <motion.span layoutId="filter-pill" className="absolute inset-0 rounded-full bg-brand-600" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <span className="relative">{f}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>

        <div aria-live="polite" className="sr-only">
          {list.length} materi ditemukan
        </div>
        {list.length === 0 ? (
          <div className="mt-5 grid min-h-56 place-items-center rounded-3xl border-2 border-dashed border-brand-100 bg-white/60 p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-400">
                <SearchX className="size-5" aria-hidden="true" />
              </span>
              <p className="font-extrabold">Materi belum ditemukan</p>
              <p className="max-w-xs text-sm text-muted">Coba kata kunci lain, atau tanyakan langsung ke chatbot.</p>
              {q.trim() && (
                <button type="button" onClick={() => ask(q.trim())} className="text-sm font-bold text-brand-600 underline-offset-4 hover:underline">
                  Tanya ISYARA: “{q.trim()}”
                </button>
              )}
            </div>
          </div>
        ) : (
          <motion.ul layout className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {list.map((m, i) => (
                <MateriCard key={m.id} m={m} index={i} saved={store.isSaved(m.id)} />
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>

      <MiniChat onAsk={ask} onOpen={() => navigate('/chatbot')} />
    </div>
  );
}

/** Panel "Chat dengan ISYARA" di kanan (seperti referensi): sapaan + pertanyaan cepat. */
function MiniChat({ onAsk, onOpen }: { onAsk: (p: string) => void; onOpen: () => void }) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Chat dengan ISYARA"
      className="h-fit rounded-3xl border border-line bg-white p-4 xl:sticky xl:top-8"
    >
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <p className="text-sm font-extrabold">Chat dengan ISYARA</p>
          <p className="flex items-center gap-1 text-[0.6875rem] font-semibold text-ok-ink">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" /> Online
          </p>
        </div>
        <button type="button" onClick={onOpen} className="grid size-9 place-items-center rounded-xl text-brand-600 hover:bg-brand-50" aria-label="Buka chatbot">
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-4 flex gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50">
          <LogoMark className="size-5" />
        </span>
        <motion.p
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.45, duration: 0.35 }}
          className="rounded-2xl rounded-tl-md bg-tint px-3.5 py-2.5 text-sm leading-relaxed text-brand-900"
        >
          Halo! Aku ISYARA, asisten belajarmu. Kamu bisa bertanya tentang materi, minta penjelasan konsep, atau rekomendasi video. Ketik atau pakai
          isyarat, ya.
        </motion.p>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2 xl:flex-col xl:items-start">
        {QUICK_PROMPTS.map((p, i) => (
          <motion.li key={p} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.06 }}>
            <button
              type="button"
              onClick={() => onAsk(p)}
              className="rounded-full border border-brand-100 bg-white px-3.5 py-2 text-left text-xs font-bold text-brand-800 transition-colors hover:border-brand-400 hover:bg-brand-50"
            >
              {p}
            </button>
          </motion.li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 flex h-11 w-full items-center gap-2 rounded-2xl border border-line bg-tint px-3.5 text-left text-sm text-muted transition-colors hover:border-brand-200"
      >
        <MessageCircle className="size-4 text-brand-400" aria-hidden="true" />
        Tulis pesan…
        <Sparkles className="ml-auto size-4 text-brand-400" aria-hidden="true" />
      </button>
    </motion.aside>
  );
}
