import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP } from '@/config/app.config';
import { clipsForSegments, SkeletonPlayer } from '@/features/skeleton-animation';
import { useSettings } from '@/state/SettingsContext';
import { cn } from '@/lib/utils';
import type { TextSegment } from '@/types/kiosk';
import { KaraokeText, SignAvatar } from './SpeechAnimations';

/**
 * Pemutar isyarat untuk siswa (SYSTEM_DESIGN.md §3.6). Teks SELALU tampil berdampingan.
 * Urutan sumber: 1) video asli (videoUrl, hanya untuk satu kata)
 *                2) animasi kerangka: kata kosakata = rekaman asli, kata lain = gerakan buatan (ADR-051 D5)
 *                3) placeholder avatar (hanya bila tidak ada kata sama sekali)
 */
type Props = { segments: TextSegment[]; text: string; videoUrl: string | null | undefined; onDone: () => void; label?: string };

export function SignVideo({ segments, text, videoUrl, onDone, label = 'Guru menyampaikan' }: Props) {
  const { signSpeed } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [run, setRun] = useState(0);
  const [active, setActive] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // clips harus stabil (SkeletonPlayer memakai referensinya).
  const key = segments.map((s) => `${s.phraseId}:${s.text}`).join('|');
  const words = useMemo(() => clipsForSegments(segments), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const clips = useMemo(() => words.map((w) => w.clip), [words]);

  const mode = videoUrl && segments.length === 1 ? 'video' : clips.length ? 'skeleton' : 'placeholder';

  useEffect(() => {
    if (mode !== 'placeholder') return;
    setProgress(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / APP.placeholderVideoMs);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else doneRef.current();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, run, text]);

  const replay = () => {
    if (mode === 'video' && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play();
    }
    setProgress(0);
    setActive(0);
    setRun((r) => r + 1);
  };

  const finished = progress >= 1;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="grid gap-4 rounded-3xl bg-brand-900 p-3 text-white sm:grid-cols-[1.2fr_1fr] sm:items-center sm:p-4"
      data-result="playing"
      data-sign-source={mode}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-brand-800">
        {mode === 'video' && (
          <video
            ref={videoRef}
            src={videoUrl!}
            autoPlay
            muted
            playsInline
            className="size-full object-cover"
            onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
            onEnded={() => doneRef.current()}
            aria-label={`Video isyarat BISINDO: ${text}`}
          />
        )}
        {mode === 'skeleton' && (
          <SkeletonPlayer
            clips={clips}
            run={run}
            speed={signSpeed}
            onProgress={setProgress}
            onSegment={setActive}
            onDone={() => doneRef.current()}
            className="absolute inset-0 size-full p-3"
          />
        )}
        {mode === 'placeholder' && (
          <div className="relative size-full" role="img" aria-label={`Placeholder video isyarat: ${text}`}>
            <SignAvatar text={text} durationMs={APP.placeholderVideoMs} run={run} />
          </div>
        )}
        {mode === 'skeleton' && words[active] && (
          <motion.span
            key={`${active}-${words[active].text}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-3 top-3 rounded-full bg-white/15 px-3 py-1 text-sm font-extrabold text-white backdrop-blur"
          >
            {words[active].text}
          </motion.span>
        )}
        <span className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
          <span className="block h-full rounded-full bg-brand-200" style={{ width: `${progress * 100}%` }} />
        </span>
      </div>

      <div className="px-2 pb-2 sm:px-0 sm:pb-0">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-200">{label}</p>
        {mode === 'skeleton' ? (
          <SentenceText words={words.map((w) => w.text)} active={active} finished={finished} />
        ) : (
          <KaraokeText text={text} progress={progress} />
        )}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-4">
          <Button variant="soft" onClick={replay} className="bg-white/10 text-white hover:bg-white/20">
            <RotateCcw /> Ulangi {mode === 'video' ? 'video' : 'isyarat'}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Teks kalimat: kata yang sedang diperagakan menyala. */
function SentenceText({ words, active, finished }: { words: string[]; active: number; finished: boolean }) {
  return (
    <p className="mt-2 text-[2rem] font-extrabold leading-[1.1] tracking-[-0.035em] md:text-[2.25rem]" aria-live="polite">
      {words.map((w, i) => {
        const lit = finished || i <= active;
        return (
          <span
            key={`${i}-${w}`}
            className={cn(
              'mr-[0.3em] inline-block rounded-lg transition-colors duration-150',
              lit ? 'text-white' : 'text-white/30',
              i === active && !finished && 'bg-white/10 px-1',
            )}
          >
            {w}
          </span>
        );
      })}
    </p>
  );
}
