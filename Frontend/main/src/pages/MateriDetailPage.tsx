import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Bookmark, Captions, MessageCircle, Pause, Play, Volume2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { SignerAvatar } from '@/components/ui/signer-avatar';
import { materiById, subjectLabel } from '@/data/materi';
import { signWordsForText, SkeletonPlayer } from '@/features/skeleton-animation';
import { useSpeechOut } from '@/hooks/useSpeechOut';
import { useMateriStore } from '@/state/materi.store';
import { useSettings } from '@/state/SettingsContext';
import { cn } from '@/lib/utils';

/**
 * Halaman materi (dummy, ADR-051 D6). Video asli belum ada: poster memakai avatar placeholder dan
 * isi tiap bagian diperagakan dengan animasi isyarat dari teksnya. Teks & audio (TTS) selalu tersedia.
 */
export default function MateriDetailPage() {
  const { id } = useParams();
  const m = materiById(id);
  const { profile } = useAuth();
  const store = useMateriStore(profile!.id);
  const navigate = useNavigate();
  const { signSpeed } = useSettings();
  const tts = useSpeechOut();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const [progress, setProgress] = useState(0);
  const [word, setWord] = useState(0);

  useEffect(() => {
    if (m) store.markOpened(m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);
  const cancelSpeech = tts.cancel;
  useEffect(() => cancelSpeech, [cancelSpeech]);

  const section = m?.sections[active];
  const words = useMemo(() => (section && playing ? signWordsForText(section.caption) : []), [section, playing]);
  const clips = useMemo(() => words.map((w) => w.clip), [words]);

  if (!m || !section) {
    return (
      <div className="grid min-h-64 place-items-center text-center">
        <div>
          <p className="text-lg font-extrabold">Materi tidak ditemukan</p>
          <Link to="/" className="mt-2 inline-block text-sm font-bold text-brand-600 hover:underline">
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  const go = (i: number, autoplay = true) => {
    setActive(i);
    setWord(0);
    setProgress(0);
    setPlaying(autoplay);
    setRun((r) => r + 1);
  };

  const onDone = () => {
    if (active < m.sections.length - 1) window.setTimeout(() => go(active + 1), 500);
    else setPlaying(false);
  };

  const saved = store.isSaved(m.id);
  const overall = (active + (playing ? progress : 0)) / m.sections.length;

  return (
    <div>
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 rounded-xl text-sm font-bold text-brand-600 hover:text-brand-900">
        <ArrowLeft className="size-4" aria-hidden="true" /> Beranda
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.16em] text-brand-600">{subjectLabel(m)}</p>
          <h1 className="mt-1 text-[1.75rem] font-extrabold leading-[1.05] tracking-[-0.045em] md:text-[2.25rem]">{m.title}</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted">{m.summary}</p>
        </div>
        <div className="flex gap-2">
          <Button variant={saved ? 'soft' : 'outline'} onClick={() => store.toggleSaved(m.id)} aria-pressed={saved}>
            <Bookmark fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Tersimpan' : 'Simpan'}
          </Button>
          <Button onClick={() => navigate('/chatbot', { state: { prompt: m.ask, autoSend: false } })}>
            <MessageCircle /> Tanya chatbot
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
        {/* ---------- Pemutar ---------- */}
        <section aria-label="Video materi" className="h-fit self-start overflow-hidden rounded-[1.75rem] bg-brand-900 p-2.5 text-white">
          <div className={cn('relative aspect-video overflow-hidden rounded-[1.35rem] bg-gradient-to-br', playing ? 'from-brand-800 to-brand-800' : m.bg)}>
            {playing && clips.length > 0 ? (
              <SkeletonPlayer
                clips={clips}
                run={run}
                speed={signSpeed}
                onProgress={setProgress}
                onSegment={setWord}
                onDone={onDone}
                className="absolute inset-0 size-full p-4"
              />
            ) : (
              <>
                <SignerAvatar tone={m.tone} className="absolute inset-x-[28%] bottom-0 top-[8%]" />
                <button
                  type="button"
                  onClick={() => go(active)}
                  className="absolute inset-0 m-auto grid size-16 place-items-center rounded-full bg-brand-600 text-white shadow-soft transition-transform hover:scale-105"
                  aria-label={`Putar bagian ${section.title}`}
                >
                  <Play className="size-7 translate-x-0.5" fill="currentColor" aria-hidden="true" />
                </button>
              </>
            )}
            <span className="absolute left-3 top-3 rounded-full bg-brand-900/85 px-2.5 py-1 text-[0.6875rem] font-bold tabular-nums">{m.duration}</span>
            <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[0.625rem] font-extrabold tracking-[0.08em] text-brand-800">
              BISINDO
            </span>
            <AnimatePresence mode="wait">
              <motion.p
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute inset-x-3 bottom-4 mx-auto max-w-2xl rounded-2xl bg-brand-950/85 px-4 py-2.5 text-center text-sm font-semibold leading-snug md:text-base"
              >
                {playing && words.length
                  ? words.map((w, i) => (
                      <span key={`${i}-${w.text}`} className={cn('transition-colors', i === word ? 'text-white' : i < word ? 'text-white/85' : 'text-white/45')}>
                        {w.text}{' '}
                      </span>
                    ))
                  : section.caption}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-2 pb-1 pt-3">
            <Button variant="soft" size="sm" className="bg-white/10 text-white hover:bg-white/20" onClick={() => (playing ? setPlaying(false) : go(active))}>
              {playing ? <Pause /> : <Play />} {playing ? 'Jeda' : 'Putar'}
            </Button>
            <Button
              variant="soft"
              size="sm"
              className="bg-white/10 text-white hover:bg-white/20"
              onClick={() => (tts.speaking ? tts.cancel() : void tts.speak(section.caption))}
              disabled={!tts.supported}
            >
              <Volume2 /> {tts.speaking ? 'Hentikan audio' : 'Dengarkan'}
            </Button>
            <span className="ml-auto h-1.5 w-32 overflow-hidden rounded-full bg-white/15 sm:w-48" aria-hidden="true">
              <span className="block h-full rounded-full bg-brand-200 transition-[width] duration-150" style={{ width: `${overall * 100}%` }} />
            </span>
          </div>
        </section>

        {/* ---------- Bagian materi ---------- */}
        <aside aria-label="Bagian materi" className="rounded-[1.75rem] border border-line bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{m.sections.length} bagian</p>
          <ol className="mt-3 flex flex-col gap-2">
            {m.sections.map((s, i) => {
              const on = i === active;
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={on ? 'step' : undefined}
                    className={cn(
                      'relative flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
                      on ? 'text-white' : 'bg-tint text-brand-900 hover:bg-brand-50',
                    )}
                  >
                    {on && (
                      <motion.span
                        layoutId="section-pill"
                        className="absolute inset-0 rounded-2xl bg-brand-600 shadow-[0_8px_18px_rgba(83,74,183,0.28)]"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className={cn('relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold', on ? 'bg-white text-brand-600' : 'bg-white text-brand-600')}>
                      {i + 1}
                    </span>
                    <span className="relative min-w-0">
                      <span className="block text-sm font-extrabold">{s.title}</span>
                      <span className={cn('block truncate text-xs', on ? 'text-brand-100' : 'text-muted')}>{s.caption}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 rounded-2xl bg-tint p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-brand-800">
              <Captions className="size-3.5" aria-hidden="true" /> Teks bagian ini
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-brand-900">{section.caption}</p>
          </div>
          <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted">
            Video materi masih berupa avatar placeholder. Animasi isyarat memakai rekaman 43 kosakata BISINDO; kata lain diberi gerakan penanda.
          </p>
        </aside>
      </div>
    </div>
  );
}
