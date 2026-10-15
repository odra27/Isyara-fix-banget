import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Play, Search, SearchX } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { VideoCard } from '@/components/materi/VideoCard';
import { SignerAvatar } from '@/components/ui/signer-avatar';
import { MATERI, materiById, SUBJECTS, type Materi, type Subject } from '@/data/materi';
import { PageHeader } from '@/layout/PageHeader';
import { useMateriStore } from '@/state/materi.store';
import { cn } from '@/lib/utils';

type Filter = 'Semua' | Subject;
const FILTERS: Filter[] = ['Semua', ...SUBJECTS.filter((s) => MATERI.some((m) => m.subject === s))];

/** Video Pelajaran: "Lanjutkan menonton" (belum selesai) di atas, lalu semua video + cari + filter mapel. */
export default function VideoListPage() {
  const { profile } = useAuth();
  const store = useMateriStore(profile!.id);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('Semua');

  const continuing = useMemo(
    () =>
      Object.entries(store.progress)
        .filter(([, p]) => !p.done)
        .sort((a, b) => b[1].at - a[1].at)
        .map(([id, p]) => ({ m: materiById(id), p }))
        .filter((x): x is { m: Materi; p: (typeof x)['p'] } => !!x.m)
        .slice(0, 3),
    [store.progress],
  );

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return MATERI.filter((m) => filter === 'Semua' || m.subject === filter).filter(
      (m) =>
        !needle ||
        [m.title, m.subject, m.summary, m.bookTitle, m.bookSource, ...m.sections.map((s) => s.title)].some((t) => t.toLowerCase().includes(needle)),
    );
  }, [q, filter]);

  return (
    <div>
      <PageHeader eyebrow="Video Pelajaran" title="Belajar lewat video" subtitle="Setiap video punya caption dan isyarat. Bingung di menit tertentu? Langsung tanya di sampingnya." />

      {continuing.length > 0 && (
        <section aria-label="Lanjutkan menonton" className="mb-9">
          <h2 className="text-lg font-extrabold tracking-[-0.02em]">Lanjutkan menonton</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {continuing.map(({ m, p }, i) => {
              const pct = (p.section + 0.5) / m.sections.length;
              return (
                <motion.li key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Link
                    to={`/video/${m.id}`}
                    className="group flex items-center gap-3 rounded-3xl border border-line bg-white p-2.5 pr-4 transition-all hover:-translate-y-0.5 hover:shadow-soft"
                  >
                    <span className={cn('relative aspect-[16/10] w-28 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br', m.bg)}>
                      <SignerAvatar tone={m.tone} animated={false} className="absolute inset-x-[20%] bottom-0 top-[10%]" />
                      <span className="absolute inset-x-0 bottom-0 h-1 bg-black/15">
                        <span className="block h-full bg-[#E5484D]" style={{ width: `${pct * 100}%` }} />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold text-brand-900">{m.title}</span>
                      <span className="block truncate text-xs text-muted">
                        Bagian {p.section + 1} dari {m.sections.length} · {m.sections[p.section]?.title}
                      </span>
                    </span>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                      <Play className="size-4 translate-x-px" fill="currentColor" aria-hidden="true" />
                    </span>
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-extrabold tracking-[-0.02em]">Semua video</h2>
        <label className="relative block w-full md:max-w-xs">
          <span className="sr-only">Cari video</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-brand-400" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul, topik, atau buku…"
            className="h-11 w-full rounded-2xl border border-line bg-white pl-10 pr-4 text-sm text-brand-900 placeholder:text-muted focus:border-brand-400 focus:outline-none"
          />
        </label>
      </div>

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
                  'relative shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold transition-colors',
                  on ? 'border-brand-900 text-white' : 'border-line bg-white text-brand-800 hover:border-brand-200',
                )}
              >
                {on && <motion.span layoutId="filter-pill" className="absolute inset-0 rounded-full bg-brand-900" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                <span className="relative">{f}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <div aria-live="polite" className="sr-only">
        {list.length} video ditemukan
      </div>
      {list.length === 0 ? (
        <div className="mt-5 grid min-h-48 place-items-center rounded-3xl border-2 border-dashed border-brand-100 bg-white/60 p-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <SearchX className="size-6 text-brand-200" aria-hidden="true" />
            <p className="font-extrabold">Video belum ditemukan</p>
            <p className="text-sm text-muted">Coba kata kunci lain, atau tanyakan langsung ke ISYARA.</p>
            {q.trim() && (
              <Link to="/chat" state={{ prompt: q.trim(), autoSend: true }} className="text-sm font-bold text-brand-600 hover:underline">
                Tanya ISYARA: “{q.trim()}”
              </Link>
            )}
          </div>
        </div>
      ) : (
        <motion.ul layout className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {list.map((m, i) => (
              <VideoCard key={m.id} m={m} index={i} saved={store.isSaved(m.id)} progress={store.progress[m.id]} />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}
