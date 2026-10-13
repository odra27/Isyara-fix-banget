import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Hand, Pause, Play, RotateCcw } from 'lucide-react';
import { signWordsForText, SkeletonPlayer } from '@/features/skeleton-animation';
import { useSettings } from '@/state/SettingsContext';
import { cn } from '@/lib/utils';

/**
 * Animasi isyarat untuk jawaban chatbot (ADR-051 D5). Kata kosakata memakai rekaman asli; kata
 * lain memakai gerakan buatan yang konsisten per kata dan dijamin berbeda dari 43 kata terlatih.
 *
 * Klip baru dibuat saat pertama diputar (bukan untuk semua pesan riwayat sekaligus), supaya
 * membuka riwayat panjang tetap ringan. Kata yang sedang diperagakan disorot di strip kata.
 */
export function AnswerSign({ text, autoPlay }: { text: string; autoPlay: boolean }) {
  const { signSpeed } = useSettings();
  const [started, setStarted] = useState(autoPlay);
  const [playing, setPlaying] = useState(autoPlay);
  const [run, setRun] = useState(0);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const strip = useRef<HTMLOListElement>(null);

  const words = useMemo(() => (started ? signWordsForText(text) : []), [started, text]);
  const clips = useMemo(() => words.map((w) => w.clip), [words]);

  // Strip kata ikut bergulir ke kata aktif.
  useEffect(() => {
    const el = strip.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active]);

  const play = () => {
    setStarted(true);
    setActive(0);
    setProgress(0);
    setRun((r) => r + 1);
    setPlaying(true);
  };

  if (!started) {
    return (
      <button
        type="button"
        onClick={play}
        className="group mt-3 flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-4 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/50"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-900 text-brand-200 transition-transform group-hover:scale-105">
          <Hand className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold text-brand-900">Putar isyarat BISINDO</span>
          <span className="block text-xs text-muted">Jawaban diperagakan kata demi kata</span>
        </span>
        <Play className="ml-auto size-4 text-brand-600" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-brand-900 text-white">
      <div className="relative aspect-[16/10] w-full bg-brand-800 sm:aspect-[16/9]">
        {playing && clips.length > 0 ? (
          <SkeletonPlayer
            clips={clips}
            run={run}
            speed={signSpeed}
            onProgress={setProgress}
            onSegment={setActive}
            onDone={() => setPlaying(false)}
            className="absolute inset-0 size-full p-2"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <button
              type="button"
              onClick={play}
              className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/20"
            >
              <RotateCcw className="size-4" aria-hidden="true" /> Putar ulang isyarat
            </button>
          </div>
        )}
        <AnimatePresence mode="wait">
          {playing && words[active] && (
            <motion.span
              key={`${active}-${words[active].text}`}
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute left-2.5 top-2.5 rounded-full bg-white/15 px-3 py-1 text-sm font-extrabold backdrop-blur"
            >
              {words[active].text}
            </motion.span>
          )}
        </AnimatePresence>
        {playing && (
          <button
            type="button"
            onClick={() => setPlaying(false)}
            aria-label="Hentikan isyarat"
            className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <Pause className="size-4" aria-hidden="true" />
          </button>
        )}
        <span className="absolute inset-x-2.5 bottom-2.5 h-1 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
          <span className="block h-full rounded-full bg-brand-200 transition-[width] duration-100" style={{ width: `${(playing ? progress : 1) * 100}%` }} />
        </span>
      </div>
      <ol ref={strip} className="flex gap-1 overflow-x-auto px-2.5 py-2 [scrollbar-width:none]" aria-label="Kata yang diperagakan">
        {words.map((w, i) => (
          <li
            key={`${i}-${w.text}`}
            aria-current={playing && i === active ? 'true' : undefined}
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold transition-colors duration-150',
              playing && i === active ? 'bg-white text-brand-900' : playing && i < active ? 'text-white/80' : 'text-white/45',
            )}
          >
            {w.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
