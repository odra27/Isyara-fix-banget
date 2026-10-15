import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bookmark, CheckCircle2, Play } from 'lucide-react';
import { Avatar } from '@/auth/components/Avatar';
import { SignerAvatar } from '@/components/ui/signer-avatar';
import { subjectLabel, type Materi } from '@/data/materi';
import type { Progress } from '@/state/materi.store';
import { cn } from '@/lib/utils';

/** Kartu video pelajaran: thumbnail, judul, guru pengampu, mapel, durasi, progres menonton. */
export function VideoCard({ m, saved, progress, index = 0 }: { m: Materi; saved?: boolean; progress?: Progress; index?: number }) {
  const pct = progress ? (progress.done ? 1 : (progress.section + 0.5) / m.sections.length) : 0;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        to={`/video/${m.id}`}
        className="group block overflow-hidden rounded-3xl border border-line bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft"
        aria-label={`${m.title}, ${m.teacher}, ${subjectLabel(m)}, durasi ${m.duration}`}
      >
        <div className={cn('relative aspect-[16/10] overflow-hidden bg-gradient-to-br', m.bg)}>
          <SignerAvatar tone={m.tone} animated={false} className="absolute inset-x-[22%] bottom-0 top-[10%] transition-transform duration-500 group-hover:scale-[1.04]" />
          <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-black/70 px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-white">{m.duration}</span>
          <span className="absolute inset-0 m-auto grid size-12 scale-90 place-items-center rounded-full bg-white/95 text-brand-600 opacity-0 shadow-soft transition-all duration-300 group-hover:scale-100 group-hover:opacity-100">
            <Play className="size-5 translate-x-px" fill="currentColor" aria-hidden="true" />
          </span>
          {saved && (
            <span className="absolute left-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-white/90 text-brand-600" title="Disimpan">
              <Bookmark className="size-3.5" fill="currentColor" aria-hidden="true" />
            </span>
          )}
          {progress?.done && (
            <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[0.625rem] font-extrabold text-ok-ink">
              <CheckCircle2 className="size-3" aria-hidden="true" /> Selesai
            </span>
          )}
          {pct > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-black/15" aria-hidden="true">
              <span className="block h-full bg-[#E5484D]" style={{ width: `${pct * 100}%` }} />
            </span>
          )}
        </div>
        <div className="flex gap-3 p-3.5">
          <Avatar name={m.teacher} photoUrl={m.teacherPhoto} className="mt-0.5 size-9" textClassName="text-xs" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[0.9375rem] font-extrabold leading-snug tracking-[-0.01em] text-brand-900">{m.title}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-brand-800">{m.teacher}</p>
            <p className="truncate text-xs text-muted">{subjectLabel(m)}</p>
          </div>
        </div>
      </Link>
    </motion.li>
  );
}
