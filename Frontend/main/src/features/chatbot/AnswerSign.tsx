import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Captions, CaptionsOff, Hand, Pause, Play, RotateCcw } from 'lucide-react';
import { SignCaption } from '@/components/ui/sign-caption';
import { signWordsForText, SkeletonPlayer } from '@/features/skeleton-animation';
import { useSettings } from '@/state/SettingsContext';
import { cn } from '@/lib/utils';

/**
 * Animasi isyarat untuk jawaban chatbot (ADR-051 D5). Kata kosakata memakai rekaman asli; kata
 * lain memakai gerakan penanda yang konsisten per kata.
 *
 * Klip baru dibuat saat pertama diputar (bukan untuk semua pesan riwayat sekaligus), supaya
 * membuka riwayat panjang tetap ringan. Teksnya tampil sebagai caption gaya YouTube (ADR-053).
 */
export function AnswerSign({ text, autoPlay }: { text: string; autoPlay: boolean }) {
  const settings = useSettings();
  const [started, setStarted] = useState(autoPlay);
  const [playing, setPlaying] = useState(autoPlay);
  const [run, setRun] = useState(0);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);

  const words = useMemo(() => (started ? signWordsForText(text) : []), [started, text]);
  const clips = useMemo(() => words.map((w) => w.clip), [words]);
  const captionWords = useMemo(() => words.map((w) => w.text), [words]);

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
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-transform group-hover:scale-105">
          <Hand className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold text-brand-900">Putar isyarat</span>
          <span className="block text-xs text-muted">Jawaban diperagakan kata demi kata, dengan caption</span>
        </span>
        <Play className="ml-auto size-4 text-brand-600" aria-hidden="true" />
      </button>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 overflow-hidden rounded-2xl bg-brand-950 text-white">
      <div className="relative aspect-[16/10] w-full sm:aspect-[16/9]">
        {playing && clips.length > 0 ? (
          <SkeletonPlayer
            clips={clips}
            run={run}
            speed={settings.signSpeed}
            onProgress={setProgress}
            onSegment={setActive}
            onDone={() => setPlaying(false)}
            className="absolute inset-0 size-full p-2 pb-10"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <button
              type="button"
              onClick={play}
              className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/20"
            >
              <RotateCcw className="size-4" aria-hidden="true" /> Putar ulang
            </button>
          </div>
        )}

        {settings.captions && playing && <SignCaption words={captionWords} active={active} size={settings.captionSize} />}

        <div className="absolute right-2 top-2 flex gap-1">
          <button
            type="button"
            onClick={() => settings.update({ captions: !settings.captions })}
            aria-pressed={settings.captions}
            aria-label={settings.captions ? 'Sembunyikan caption' : 'Tampilkan caption'}
            className="grid size-8 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            {settings.captions ? <Captions className="size-4" aria-hidden="true" /> : <CaptionsOff className="size-4" aria-hidden="true" />}
          </button>
          {playing && (
            <button
              type="button"
              onClick={() => setPlaying(false)}
              aria-label="Hentikan isyarat"
              className="grid size-8 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            >
              <Pause className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/15" aria-hidden="true">
          <span className={cn('block h-full bg-brand-200 transition-[width] duration-100')} style={{ width: `${(playing ? progress : 1) * 100}%` }} />
        </span>
      </div>
      {/* Pembaca layar: teks lengkap tanpa perlu mengikuti animasi. */}
      <p className="sr-only">{text}</p>
    </motion.div>
  );
}
