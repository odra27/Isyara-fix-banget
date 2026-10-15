import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Captions,
  CaptionsOff,
  Maximize,
  MessageCircleQuestion,
  Minimize,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Settings2,
  Volume2,
  X,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { SignCaption } from '@/components/ui/sign-caption';
import { SignerAvatar } from '@/components/ui/signer-avatar';
import { clock, durationSec, materiById, sectionAt, sectionSec, sectionStart, subjectLabel, type Materi } from '@/data/materi';
import { Bubble, Composer, ErrorNote, Typing } from '@/features/chatbot/ChatParts';
import { useChat } from '@/features/chatbot/useChat';
import { signWordsForText, SkeletonPlayer } from '@/features/skeleton-animation';
import { useSpeechOut } from '@/hooks/useSpeechOut';
import { useMateriStore } from '@/state/materi.store';
import { CAPTION_SIZE_LABEL, useSettings, type CaptionSize } from '@/state/SettingsContext';
import { cn } from '@/lib/utils';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;
/** Besar lompatan tombol ulangi / maju (detik). */
const SKIP_SEC = 10;

/**
 * Tonton video + tanya per detik (ADR-053 D3). Kiri: pemutar (caption gaya YouTube, bab di progress
 * bar, kecepatan, ulangi bagian, layar penuh). Kanan: chat khusus video ini; detik saat bertanya
 * otomatis menempel sebagai chip dan dikirim ke BE, yang menambahkan transkrip bagian itu ke prompt.
 * Video berhenti saat siswa mulai mengetik (siswa Tuli tidak bisa menonton sambil membaca chat).
 */
export default function VideoWatchPage() {
  const { id } = useParams();
  const m = materiById(id);
  if (!m) {
    return (
      <div className="grid min-h-64 place-items-center text-center">
        <div>
          <p className="text-lg font-extrabold">Video tidak ditemukan</p>
          <Link to="/video" className="mt-2 inline-block text-sm font-bold text-brand-600 hover:underline">
            Kembali ke Video Pelajaran
          </Link>
        </div>
      </div>
    );
  }
  return <Watch key={m.id} m={m} />;
}

function Watch({ m }: { m: Materi }) {
  const { profile } = useAuth();
  const store = useMateriStore(profile!.id);
  const settings = useSettings();
  const tts = useSpeechOut();

  // ---------------------------------------------------------------- pemutar
  const startAt = store.progress[m.id] && !store.progress[m.id].done ? store.progress[m.id].section : 0;
  const [active, setActive] = useState(startAt);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const [progress, setProgressPct] = useState(0);
  /** Posisi awal pemutaran di dalam bagian (0..1): dipakai saat melanjutkan & melompat ±10 detik. */
  const [startFrac, setStartFrac] = useState(0);
  const [word, setWord] = useState(-1);
  const [speed, setSpeed] = useState<number>(settings.signSpeed);
  const [loop, setLoop] = useState(false);
  const [menu, setMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  const section = m.sections[active];
  const total = durationSec(m);
  const tNow = sectionStart(m, active) + progress * sectionSec(m);
  const words = useMemo(() => (playing ? signWordsForText(section.caption) : []), [section, playing]);
  const clips = useMemo(() => words.map((w) => w.clip), [words]);
  const captionWords = useMemo(() => (playing ? words.map((w) => w.text) : section.caption.split(/\s+/).filter(Boolean)), [playing, words, section]);

  useEffect(() => {
    store.markOpened(m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);
  const cancelSpeech = tts.cancel;
  useEffect(() => cancelSpeech, [cancelSpeech]);

  const go = useCallback(
    (i: number, autoplay = true, frac = 0) => {
      const at = Math.min(0.999, Math.max(0, frac));
      setActive(i);
      setWord(-1);
      setProgressPct(at);
      setStartFrac(at);
      setStarted(true);
      setPlaying(autoplay);
      setRun((r) => r + 1);
      store.setProgress(m.id, i, false);
    },
    [m.id, store],
  );

  /** Lompat ke detik tertentu: bagian yang memuatnya, diputar dari posisi detik itu. */
  const seek = useCallback(
    (t: number) => {
      const at = Math.min(total - 0.05, Math.max(0, t));
      const i = sectionAt(m, at);
      go(i, true, (at - sectionStart(m, i)) / sectionSec(m));
    },
    [go, m, total],
  );
  /** Tombol −10 / +10 detik (tNow berubah tiap frame, jadi tidak perlu di-memo). */
  const jump = (delta: number) => seek(tNow + delta);

  const onDone = () => {
    if (loop) return go(active);
    if (active < m.sections.length - 1) return void window.setTimeout(() => go(active + 1), 450);
    setPlaying(false);
    setProgressPct(1);
    store.setProgress(m.id, active, true);
  };

  const pause = useCallback(() => setPlaying(false), []);
  // Lanjut dari posisi terakhir; kalau bagiannya sudah habis, mulai bagian itu dari awal.
  const toggle = () => (playing ? pause() : go(active, true, progress >= 0.999 ? 0 : progress));

  // layar penuh
  useEffect(() => {
    const on = () => {
      const fs = document.fullscreenElement === stage.current;
      setFullscreen(fs);
      if (!fs) setAskOpen(false);
    };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.current?.requestFullscreen?.().catch(() => undefined);
  };

  // ---------------------------------------------------------------- chat video
  const sessionId = store.chats[m.id] ?? null;
  const onCreated = useCallback((sid: string) => store.setChat(m.id, sid), [m.id, store]);
  const chat = useChat(sessionId, onCreated, { newTitle: `Video: ${m.title}` });
  useEffect(() => {
    if (chat.notFound) store.setChat(m.id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.notFound]);

  const [draft, setDraft] = useState('');
  const [pin, setPin] = useState(true);

  const send = async (text: string, mode: 'text' | 'sign') => {
    const ok = await chat.send(text, mode, pin && started ? { id: m.id, section: active, tSec: tNow } : null);
    if (ok) {
      setDraft('');
      setPin(true);
    }
    return ok;
  };
  const onTyping = (t: boolean) => {
    if (t && playing) pause();
  };

  const markers = chat.messages.filter((x) => x.role === 'user' && x.videoTSec != null).map((x) => x.videoTSec as number);

  const panel = (
    <VideoChat
      m={m}
      chat={chat}
      draft={draft}
      setDraft={setDraft}
      send={send}
      onTyping={onTyping}
      chip={pin && started ? { label: `${clock(tNow)} · ${section.title}`, onRemove: () => setPin(false) } : null}
      seek={seek}
      speaking={tts.speaking}
      speak={(t) => (tts.speaking ? tts.cancel() : void tts.speak(t))}
      autoPlaySign={settings.autoPlaySign}
      dark={fullscreen}
      onClose={fullscreen ? () => setAskOpen(false) : undefined}
    />
  );

  const saved = store.isSaved(m.id);

  return (
    <div>
      <Link to="/video" className="mb-3 inline-flex items-center gap-1.5 rounded-xl text-sm font-bold text-brand-600 hover:text-brand-900">
        <ArrowLeft className="size-4" aria-hidden="true" /> Video Pelajaran
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-w-0">
          {/* ---------- pemutar ---------- */}
          <div ref={stage} className={cn('relative overflow-hidden bg-black', fullscreen ? 'h-full w-full' : 'rounded-[1.5rem]')}>
            <div className={cn('relative w-full', fullscreen ? 'h-full' : 'aspect-video')}>
              <div className={cn('absolute inset-0 bg-gradient-to-br', playing ? 'from-brand-950 to-brand-900' : m.bg)} />
              {playing && clips.length > 0 ? (
                <SkeletonPlayer
                  clips={clips}
                  run={run}
                  speed={speed}
                  startProgress={startFrac}
                  onProgress={setProgressPct}
                  onSegment={setWord}
                  onDone={onDone}
                  className="absolute inset-0 size-full p-4 pb-16"
                />
              ) : (
                <>
                  <SignerAvatar tone={m.tone} animated={false} className="absolute inset-x-[30%] bottom-0 top-[8%] opacity-90" />
                  <button
                    type="button"
                    onClick={() => go(active)}
                    className="absolute inset-0 m-auto grid size-16 place-items-center rounded-full bg-white/95 text-brand-600 shadow-soft transition-transform hover:scale-105"
                    aria-label={started ? `Putar lagi bagian ${section.title}` : `Putar ${m.title}`}
                  >
                    <Play className="size-7 translate-x-0.5" fill="currentColor" aria-hidden="true" />
                  </button>
                </>
              )}

              {settings.captions && (started || playing) && (
                <SignCaption words={captionWords} active={playing ? word : -1} size={settings.captionSize} big={fullscreen} className="bottom-[16%]" />
              )}

              {/* kontrol */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-10 text-white">
                <Timeline m={m} t={tNow} total={total} markers={markers} onSeek={seek} />
                <div className="mt-1.5 flex items-center gap-1">
                  <SkipBtn back label={`Ulangi ${SKIP_SEC} detik`} onClick={() => jump(-SKIP_SEC)} disabled={tNow <= 0.05} />
                  <IconBtn label={playing ? 'Jeda' : 'Putar'} onClick={toggle}>
                    {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}
                  </IconBtn>
                  <SkipBtn label={`Maju ${SKIP_SEC} detik`} onClick={() => jump(SKIP_SEC)} disabled={tNow >= total - 0.1} />
                  <span className="ml-1 text-xs font-bold tabular-nums">
                    {clock(tNow)} <span className="text-white/60">/ {clock(total)}</span>
                  </span>
                  <span className="ml-2 hidden truncate text-xs font-semibold text-white/80 sm:inline">· {section.title}</span>
                  <span className="ml-auto" />
                  <IconBtn label={loop ? 'Matikan ulangi bagian' : 'Ulangi bagian ini'} onClick={() => setLoop((v) => !v)} on={loop}>
                    <Repeat className="size-[1.1rem]" />
                  </IconBtn>
                  <IconBtn label={settings.captions ? 'Sembunyikan caption' : 'Tampilkan caption'} onClick={() => settings.update({ captions: !settings.captions })} on={settings.captions}>
                    {settings.captions ? <Captions className="size-[1.1rem]" /> : <CaptionsOff className="size-[1.1rem]" />}
                  </IconBtn>
                  <div className="relative">
                    <IconBtn label="Pengaturan video" onClick={() => setMenu((v) => !v)} on={menu}>
                      <Settings2 className="size-[1.1rem]" />
                    </IconBtn>
                    <AnimatePresence>
                      {menu && (
                        <PlayerMenu
                          speed={speed}
                          setSpeed={setSpeed}
                          captionSize={settings.captionSize}
                          setCaptionSize={(captionSize) => settings.update({ captionSize })}
                          onClose={() => setMenu(false)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                  {fullscreen && (
                    <button
                      type="button"
                      onClick={() => {
                        pause();
                        setAskOpen((v) => !v);
                      }}
                      className="ml-1 flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-extrabold text-brand-900 hover:bg-brand-50"
                    >
                      <MessageCircleQuestion className="size-4" aria-hidden="true" /> Tanya
                    </button>
                  )}
                  <IconBtn label={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'} onClick={toggleFullscreen}>
                    {fullscreen ? <Minimize className="size-[1.1rem]" /> : <Maximize className="size-[1.1rem]" />}
                  </IconBtn>
                </div>
              </div>
            </div>

            {/* chat di dalam layar penuh */}
            <AnimatePresence>
              {fullscreen && askOpen && (
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  className="absolute bottom-24 right-4 top-4 w-[min(26rem,calc(100%-2rem))]"
                >
                  {panel}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ---------- info video ---------- */}
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[1.5rem] font-extrabold leading-tight tracking-[-0.035em] md:text-[1.75rem]">{m.title}</h1>
              {/* Sumber materi: buku pelajaran (judul buku, sumber, kelas). */}
              <div className="mt-2 flex items-start gap-2.5">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600" aria-hidden="true">
                  <BookOpen className="size-[1.15rem]" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-brand-900">{m.bookTitle}</p>
                  <p className="text-xs text-muted">
                    {m.bookSource} · {subjectLabel(m)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant={saved ? 'soft' : 'outline'} onClick={() => store.toggleSaved(m.id)} aria-pressed={saved}>
                <Bookmark fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Tersimpan' : 'Simpan'}
              </Button>
              <Button variant="outline" onClick={() => (tts.speaking ? tts.cancel() : void tts.speak(section.caption))} disabled={!tts.supported}>
                <Volume2 /> {tts.speaking ? 'Hentikan' : 'Dengarkan'}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted">{m.summary}</p>

          <ol className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Bagian video">
            {m.sections.map((s, i) => {
              const on = i === active;
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={on ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors',
                      on ? 'border-brand-200 bg-brand-50' : 'border-line bg-white hover:border-brand-100',
                    )}
                  >
                    <span className={cn('mt-0.5 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-extrabold tabular-nums', on ? 'bg-brand-600 text-white' : 'bg-tint text-brand-800')}>
                      {clock(sectionStart(m, i))}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold text-brand-900">{s.title}</span>
                      <span className="line-clamp-2 text-xs text-muted">{s.caption}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* ---------- chat samping ---------- */}
        {!fullscreen && <aside className="lg:sticky lg:top-6 lg:h-[min(44rem,calc(100dvh-6rem))]">{panel}</aside>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bagian-bagian

function IconBtn({ label, onClick, on, children }: { label: string; onClick: () => void; on?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={cn('grid size-9 place-items-center rounded-full transition-colors hover:bg-white/15', on && 'text-[#FFD84D]')}
    >
      {children}
    </button>
  );
}

/** Ulangi / maju 10 detik: panah melingkar dengan angka di tengahnya (pola pemutar video). */
function SkipBtn({ label, onClick, disabled, back = false }: { label: string; onClick: () => void; disabled?: boolean; back?: boolean }) {
  const Icon = back ? RotateCcw : RotateCw;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="relative grid size-9 place-items-center rounded-full transition-colors hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon className="size-[1.35rem]" aria-hidden="true" />
      {/* Pusat busur ikon ada di y=13 (viewBox 24), jadi angkanya digeser sedikit ke bawah. */}
      <span aria-hidden="true" className="absolute translate-y-px text-[0.5rem] font-extrabold leading-none tabular-nums">
        {SKIP_SEC}
      </span>
    </button>
  );
}

/** Progress bar dengan pemisah bab (klik = lompat ke bab) dan titik kuning di detik yang pernah ditanyakan. */
function Timeline({ m, t, total, markers, onSeek }: { m: Materi; t: number; total: number; markers: number[]; onSeek: (t: number) => void }) {
  return (
    <div className="group relative flex h-3 items-center">
      <div className="flex h-1 w-full gap-[3px] transition-[height] group-hover:h-1.5">
        {m.sections.map((s, i) => {
          const from = sectionStart(m, i);
          const len = sectionSec(m);
          const fill = Math.min(1, Math.max(0, (t - from) / len));
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => onSeek(from)}
              aria-label={`Lompat ke ${s.title}, ${clock(from)}`}
              className="relative h-full flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <span className="absolute inset-y-0 left-0 bg-[#E5484D]" style={{ width: `${fill * 100}%` }} />
            </button>
          );
        })}
      </div>
      {markers.map((x, i) => (
        <span
          key={`${x}-${i}`}
          className="pointer-events-none absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FFD84D] ring-2 ring-black/40"
          style={{ left: `${Math.min(100, (x / total) * 100)}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function PlayerMenu({
  speed,
  setSpeed,
  captionSize,
  setCaptionSize,
  onClose,
}: {
  speed: number;
  setSpeed: (v: number) => void;
  captionSize: CaptionSize;
  setCaptionSize: (v: CaptionSize) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6 }}
      className="absolute bottom-11 right-0 z-10 w-56 rounded-2xl bg-black/90 p-3 text-white shadow-xl backdrop-blur"
      role="dialog"
      aria-label="Pengaturan video"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-extrabold">Pengaturan</p>
        <button type="button" onClick={onClose} aria-label="Tutup" className="grid size-6 place-items-center rounded-full hover:bg-white/15">
          <X className="size-3.5" />
        </button>
      </div>
      <p className="text-[0.6875rem] font-bold text-white/60">Kecepatan isyarat</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            aria-pressed={speed === s}
            className={cn('rounded-full px-2.5 py-1 text-xs font-bold', speed === s ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20')}
          >
            {s === 1 ? 'Normal' : `${s}×`}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[0.6875rem] font-bold text-white/60">Ukuran caption</p>
      <div className="mt-1 flex gap-1">
        {(['S', 'M', 'L'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setCaptionSize(s)}
            aria-pressed={captionSize === s}
            className={cn('rounded-full px-2.5 py-1 text-xs font-bold', captionSize === s ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20')}
          >
            {CAPTION_SIZE_LABEL[s]}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function VideoChat({
  m,
  chat,
  draft,
  setDraft,
  send,
  onTyping,
  chip,
  seek,
  speaking,
  speak,
  autoPlaySign,
  dark,
  onClose,
}: {
  m: Materi;
  chat: ReturnType<typeof useChat>;
  draft: string;
  setDraft: (v: string) => void;
  send: (text: string, mode: 'text' | 'sign') => Promise<boolean>;
  onTyping: (t: boolean) => void;
  chip: { label: string; onRemove: () => void } | null;
  seek: (t: number) => void;
  speaking: boolean;
  speak: (text: string) => void;
  autoPlaySign: boolean;
  dark: boolean;
  onClose?: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chat.messages.length, chat.sending]);

  // Jawaban → tautan "Lihat lagi" ke detik pertanyaan sebelumnya.
  let lastT: number | null = null;
  const rows = chat.messages.map((x) => {
    if (x.role === 'user') lastT = x.videoTSec ?? null;
    return { x, t: x.role === 'assistant' ? lastT : null };
  });

  return (
    <section
      aria-label="Tanya tentang video ini"
      className={cn('flex h-full min-h-[30rem] flex-col overflow-hidden rounded-[1.5rem] border', dark ? 'border-white/10 bg-white/95 backdrop-blur' : 'border-line bg-white')}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <MessageCircleQuestion className="size-[1.15rem]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-brand-900">Tanya tentang video ini</p>
          <p className="truncate text-[0.6875rem] text-muted">Bingung di menit tertentu? Tanyakan saja.</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Tutup chat" className="grid size-8 place-items-center rounded-full hover:bg-tint">
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-3.5 py-4" aria-live="polite" aria-busy={chat.sending}>
        {chat.messages.length === 0 && !chat.messagesLoading ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <p className="text-sm font-extrabold text-brand-900">Belum ada pertanyaan</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Tonton videonya, lalu ketik pertanyaanmu. Waktu video otomatis ikut terkirim, jadi ISYARA tahu bagian mana yang kamu maksud.
            </p>
            <button
              type="button"
              onClick={() => setDraft(`Maksudnya bagian ${m.sections[0].title.toLowerCase()} itu apa?`)}
              className="mt-3 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-brand-800 hover:border-brand-200 hover:bg-brand-50"
            >
              Contoh: “Maksudnya bagian ini apa?”
            </button>
          </div>
        ) : (
          <ol className="flex flex-col gap-3.5">
            <AnimatePresence initial={false}>
              {rows.map(({ x, t }) => (
                <Bubble
                  key={x.id}
                  m={x}
                  autoPlay={!!x.fresh && autoPlaySign}
                  speaking={speaking}
                  onSpeak={() => speak(x.content)}
                  onRetry={() => void chat.retry(x)}
                  onDiscard={() => chat.discard(x.id)}
                  onSeek={seek}
                  rewatch={t != null ? { t, onClick: () => seek(t) } : null}
                  compact
                />
              ))}
              {chat.sending && <Typing key="typing" />}
            </AnimatePresence>
          </ol>
        )}
      </div>

      <div className="border-t border-line p-2.5">
        <AnimatePresence>{chat.error && <ErrorNote text={chat.error} onClose={chat.clearError} />}</AnimatePresence>
        <Composer value={draft} onChange={setDraft} onSend={send} sending={chat.sending} chip={chip} onTyping={onTyping} compact placeholder="Tanya tentang video…" />
      </div>
    </section>
  );
}
