import { motion } from 'framer-motion';
import { Hand, Mic, Sparkles } from 'lucide-react';
import { HandSkeleton } from '@/components/ui/hand-skeleton';
import { useMicLevel } from '@/hooks/useMicLevel';
import { cn } from '@/lib/utils';
import type { SpeechPhase } from './useSpeechFlow';

/**
 * Animasi khusus Alur B (suara → video isyarat).
 * Semua memakai framer-motion. MotionConfig reducedMotion="user" di App mematikan gerak
 * transform bila pengguna memilih "kurangi gerakan"; status tetap terbaca lewat teks.
 */
const EASE = [0.22, 1, 0.36, 1] as const;

// ------------------------------------------------------------------ 1. Penanda alur

const STEPS = [
  { id: 'suara', label: 'Suara', icon: Mic },
  { id: 'makna', label: 'Makna', icon: Sparkles },
  { id: 'isyarat', label: 'Isyarat', icon: Hand },
] as const;

function stepIndex(phase: SpeechPhase) {
  if (phase === 'LISTENING' || phase === 'TEXT_ONLY') return 0;
  if (phase === 'MATCHING' || phase === 'CONFIRM' || phase === 'NO_MATCH') return 1;
  if (phase === 'PLAYING') return 2;
  return -1;
}

export function FlowSteps({ phase }: { phase: SpeechPhase }) {
  const active = stepIndex(phase);
  return (
    <ol className="mb-3 flex items-center gap-1.5" aria-label="Tahap penerjemahan">
      {STEPS.map((s, i) => {
        const done = active > i;
        const on = active === i;
        const Icon = s.icon;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                'relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors duration-300',
                on ? 'text-white' : done ? 'bg-brand-100 text-brand-800' : 'bg-white text-muted',
              )}
              aria-current={on ? 'step' : undefined}
            >
              {on && (
                <motion.span
                  layoutId="flow-step-pill"
                  className="absolute inset-0 rounded-full bg-brand-600"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <motion.span
                key={on ? `${s.id}-on` : s.id}
                initial={on ? { scale: 0.4, rotate: -20 } : false}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                className="relative z-10"
                aria-hidden="true"
              >
                <Icon className="size-3.5" />
              </motion.span>
              <span className="relative z-10">{s.label}</span>
            </span>
            {i < STEPS.length - 1 && (
              <span className="h-0.5 w-4 shrink-0 overflow-hidden rounded-full bg-brand-100" aria-hidden="true">
                <motion.span
                  className="block h-full origin-left bg-brand-600"
                  initial={false}
                  animate={{ scaleX: active > i ? 1 : 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ 2. Level mic

const FALLBACK_H = [10, 18, 24, 14, 20, 12, 16];

/** Batang level suara. Pakai level mic asli; bila tidak bisa dibaca, pakai animasi CSS cadangan. */
export function MicLevel({ active }: { active: boolean }) {
  const levels = useMicLevel(active);
  return (
    <span className="flex h-8 items-center gap-1" aria-hidden="true">
      {FALLBACK_H.map((h, i) =>
        levels ? (
          <span
            key={i}
            className="block w-1.5 rounded-full bg-rec transition-[height] duration-75"
            style={{ height: `${6 + levels[i] * 26}px` }}
          />
        ) : (
          <i key={i} className="block w-1.5 rounded-full bg-rec anim-bar" style={{ height: h, animationDelay: `${i * 0.08}s` }} />
        ),
      )}
    </span>
  );
}

// ------------------------------------------------------------------ 3. Mencocokkan makna

/** Kata-kata ucapan muncul, lalu "ditarik" ke satu titik makna. */
export function MatchingViz({ utterance }: { utterance: string }) {
  const words = utterance.split(/\s+/).filter(Boolean).slice(0, 8);
  return (
    <div className="flex w-full flex-col items-center gap-5" role="status">
      <div className="flex max-w-sm flex-wrap justify-center gap-1.5">
        {words.map((w, i) => (
          <motion.span
            key={`${w}-${i}`}
            initial={{ opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: [0, 1, 1, 0.35], y: [14, 0, 0, 18], scale: [0.9, 1, 1, 0.85] }}
            transition={{ duration: 1.6, times: [0, 0.25, 0.6, 1], delay: i * 0.06, repeat: Infinity, repeatDelay: 0.3, ease: EASE }}
            className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand-800"
          >
            {w}
          </motion.span>
        ))}
      </div>

      <div className="relative grid size-16 place-items-center" aria-hidden="true">
        {[0, 1].map((r) => (
          <motion.span
            key={r}
            className="absolute inset-0 rounded-full border-2 border-brand-400"
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, delay: r * 0.8, ease: 'easeOut' }}
          />
        ))}
        <motion.span
          className="relative grid size-14 place-items-center rounded-full bg-brand-600 text-white"
          animate={{ rotate: [0, 8, -8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles className="size-6" />
        </motion.span>
      </div>

      <div>
        <p className="text-lg font-extrabold">Mencocokkan makna…</p>
        <p className="text-sm text-muted">Mencari frasa BISINDO terdekat</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 4. Avatar isyarat (placeholder video)

/** Hash sederhana agar tiap frasa punya pola gerak berbeda tapi konsisten. */
function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function choreography(text: string, side: 1 | -1) {
  const rnd = seeded(text + side);
  const pts = Array.from({ length: 4 }, () => ({
    x: side * (rnd() * 40 - 8),
    y: -(rnd() * 70 + 10),
    rotate: side * (rnd() * 40 - 20),
  }));
  // mulai & akhir di posisi istirahat agar loop/replay mulus
  return {
    x: [0, ...pts.map((p) => p.x), 0],
    y: [0, ...pts.map((p) => p.y), 0],
    rotate: [0, ...pts.map((p) => p.rotate), 0],
  };
}

/**
 * Placeholder video BISINDO: siluet + dua tangan yang bergerak sesuai pola frasa.
 * Hanya ilustrasi gerak, BUKAN isyarat BISINDO yang benar. Diganti video asli saat videoUrl tersedia.
 */
export function SignAvatar({ text, durationMs, run }: { text: string; durationMs: number; run: number }) {
  const right = choreography(text, 1);
  const left = choreography(text, -1);
  const transition = { duration: durationMs / 1000, ease: 'easeInOut' as const, times: [0, 0.15, 0.38, 0.6, 0.82, 1] };

  return (
    <div className="absolute inset-0 overflow-hidden" key={run}>
      {/* sorotan lembut di belakang */}
      <motion.div
        aria-hidden="true"
        className="absolute left-1/2 top-[38%] size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/25 blur-2xl"
        animate={{ scale: [1, 1.12, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* siluet badan */}
      <svg viewBox="0 0 240 180" className="absolute inset-x-0 bottom-0 w-full" aria-hidden="true">
        <circle cx="120" cy="62" r="24" className="fill-brand-600" />
        <path d="M58 180c0-48 26-78 62-78s62 30 62 78Z" className="fill-brand-600/80" />
      </svg>

      {/* tangan kanan & kiri penanda isyarat */}
      <motion.div
        className="absolute bottom-[10%] left-[18%] w-[22%] text-brand-200"
        initial={{ x: 0, y: 0, rotate: 0 }}
        animate={right}
        transition={transition}
        style={{ originX: 0.5, originY: 1 }}
      >
        <HandSkeleton className="w-full" dotClassName="fill-brand-900" />
      </motion.div>
      <motion.div
        className="absolute bottom-[10%] right-[18%] w-[22%] text-brand-200"
        initial={{ x: 0, y: 0, rotate: 0 }}
        animate={left}
        transition={{ ...transition, delay: 0.08 }}
        style={{ originX: 0.5, originY: 1 }}
      >
        <HandSkeleton className="w-full" mirrored dotClassName="fill-brand-900" />
      </motion.div>
    </div>
  );
}

/** Teks frasa yang menyala per kata mengikuti progres video, memudahkan pasien mengikuti. */
export function KaraokeText({ text, progress }: { text: string; progress: number }) {
  const words = text.split(' ');
  const lit = Math.min(words.length, Math.floor(progress * words.length + 0.35));
  return (
    <p className="mt-2 text-[1.75rem] font-extrabold leading-[1.1] tracking-[-0.035em] md:text-[2.125rem]">
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="mr-[0.25em] inline-block"
          initial={{ opacity: 0, y: '0.4em' }}
          animate={{ opacity: 1, y: 0, color: i < lit ? '#FFFFFF' : '#7F77DD' }}
          transition={{ opacity: { delay: 0.1 + i * 0.06 }, y: { delay: 0.1 + i * 0.06, ease: EASE }, color: { duration: 0.25 } }}
        >
          {w}
        </motion.span>
      ))}
    </p>
  );
}
