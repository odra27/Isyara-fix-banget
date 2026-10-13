import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bookmark, Play } from 'lucide-react';
import { SignerAvatar } from '@/components/ui/signer-avatar';
import { subjectLabel, type Materi } from '@/data/materi';
import { cn } from '@/lib/utils';

/** Kartu video materi (thumbnail avatar placeholder + durasi + mapel). */
export function MateriCard({ m, saved, index = 0 }: { m: Materi; saved?: boolean; index?: number }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        to={`/materi/${m.id}`}
        className="group block overflow-hidden rounded-3xl border border-line bg-white transition-shadow duration-300 hover:shadow-soft"
        aria-label={`${m.title}, ${subjectLabel(m)}, durasi ${m.duration}`}
      >
        <div className={cn('relative aspect-[16/10] overflow-hidden bg-gradient-to-br', m.bg)}>
          <SignerAvatar tone={m.tone} animated={false} className="absolute inset-x-[22%] bottom-0 top-[10%] transition-transform duration-500 group-hover:scale-[1.04]" />
          <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-brand-900/85 px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-white">{m.duration}</span>
          {saved && (
            <span className="absolute left-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-white/90 text-brand-600" title="Tersimpan di Materi Saya">
              <Bookmark className="size-3.5" fill="currentColor" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-extrabold tracking-[-0.01em] text-brand-900">{m.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{subjectLabel(m)}</p>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
            <Play className="size-4 translate-x-px" fill="currentColor" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </motion.li>
  );
}
