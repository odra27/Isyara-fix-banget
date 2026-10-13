import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Hand,
  History,
  LoaderCircle,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/ui/logo';
import { AnswerSign } from '@/features/chatbot/AnswerSign';
import { isMockChat, type ChatSession } from '@/features/chatbot/chat.service';
import { SignCapture } from '@/features/chatbot/SignCapture';
import { useChat, type ViewMessage } from '@/features/chatbot/useChat';
import { useSpeechOut } from '@/hooks/useSpeechOut';
import { useSettings } from '@/state/SettingsContext';
import { cn } from '@/lib/utils';
import { QUICK_PROMPTS } from '@/features/chatbot/prompts';

type IncomingState = { prompt?: string; autoSend?: boolean } | null;

/**
 * Chatbot ISYARA (ADR-051 D3/D4/D5). Kiri: riwayat percakapan (seperti Gemini). Kanan: percakapan.
 * Siswa bisa mengetik atau berisyarat (kamera → kata). Jawaban tampil sebagai teks, bisa
 * dibacakan, dan diperagakan sebagai animasi isyarat BISINDO.
 */
export default function ChatPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const settings = useSettings();
  const tts = useSpeechOut();
  const [historyOpen, setHistoryOpen] = useState(false);
  const activeId = sessionId ?? null;

  const onCreated = useCallback((id: string) => navigate(`/chatbot/${id}`, { replace: true }), [navigate]);
  const chat = useChat(activeId, onCreated);

  // ---- composer
  const [draft, setDraft] = useState('');
  const [usedSign, setUsedSign] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(
    async (text: string, mode: 'text' | 'sign') => {
      const ok = await chat.send(text, mode);
      if (ok) {
        setDraft('');
        setUsedSign(false);
      }
    },
    [chat],
  );

  // Pertanyaan dari Beranda / halaman materi (sekali saja).
  const incoming = useRef<IncomingState>(location.state as IncomingState);
  useEffect(() => {
    const st = incoming.current;
    if (!st?.prompt) return;
    incoming.current = null;
    navigate(location.pathname, { replace: true, state: null });
    if (st.autoSend) void submit(st.prompt, 'text');
    else {
      setDraft(st.prompt);
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- auto scroll ke pesan terbaru
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chat.messages.length, chat.sending]);

  // ---- jawaban baru dibacakan bila diatur
  const lastFresh = [...chat.messages].reverse().find((m) => m.role === 'assistant' && m.fresh);
  useEffect(() => {
    if (lastFresh && settings.autoSpeak) void tts.speak(lastFresh.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFresh?.id]);
  const cancelSpeech = tts.cancel;
  useEffect(() => cancelSpeech, [cancelSpeech, activeId]);

  const addWord = useCallback((w: string) => {
    setUsedSign(true);
    setDraft((d) => (d.trim() ? `${d.trimEnd()} ${w}` : w));
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) void submit(draft, usedSign ? 'sign' : 'text');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (draft.trim()) void submit(draft, usedSign ? 'sign' : 'text');
    }
  };

  // textarea tumbuh mengikuti isi (maks 6 baris)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const newChat = () => {
    setHistoryOpen(false);
    navigate('/chatbot');
    setDraft('');
    setUsedSign(false);
    inputRef.current?.focus();
  };

  const active = chat.sessions.find((s) => s.id === activeId);
  const firstName = profile?.name.split(' ')[0] ?? '';
  const empty = !chat.messagesLoading && chat.messages.length === 0;

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
      {/* ---------- Riwayat ---------- */}
      <AnimatePresence>
        {historyOpen && (
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setHistoryOpen(false)}
            className="fixed inset-0 z-40 bg-brand-950/40 lg:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      <aside
        aria-label="Riwayat percakapan"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[18rem] max-w-[85vw] flex-col border-r border-line bg-white p-4 transition-transform duration-300 ease-out',
          'lg:static lg:z-auto lg:w-72 lg:translate-x-0 lg:rounded-[1.75rem] lg:border',
          historyOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between lg:hidden">
          <p className="text-sm font-extrabold">Riwayat</p>
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(false)} aria-label="Tutup riwayat">
            <X />
          </Button>
        </div>
        <Button onClick={newChat} className="mt-2 w-full lg:mt-0">
          <MessageSquarePlus /> Chat baru
        </Button>
        <SessionList
          sessions={chat.sessions}
          loading={chat.sessionsLoading}
          activeId={activeId}
          onOpen={(id) => {
            setHistoryOpen(false);
            navigate(`/chatbot/${id}`);
          }}
          onRename={chat.rename}
          onDelete={async (id) => {
            const ok = await chat.remove(id);
            if (ok && id === activeId) navigate('/chatbot', { replace: true });
          }}
        />
        <p className="mt-3 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-muted">
          {isMockChat ? 'Mode demo: riwayat tersimpan di browser ini.' : 'Riwayat tersimpan di akunmu. Hanya teks yang disimpan, video kamera tidak pernah direkam.'}
        </p>
      </aside>

      {/* ---------- Percakapan ---------- */}
      <section aria-label="Percakapan" className="flex min-h-[70dvh] flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-line bg-white lg:min-h-0">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 md:px-5">
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)} className="lg:hidden" aria-label="Buka riwayat">
            <History />
          </Button>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50">
            <LogoMark className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">{active?.title ?? 'Tanya ISYARA'}</p>
            <p className="flex items-center gap-1 text-[0.6875rem] font-semibold text-muted">
              <span className={cn('size-1.5 rounded-full', chat.lastModel === 'offline' ? 'bg-brand-200' : 'bg-ok')} aria-hidden="true" />
              {isMockChat ? 'Mode demo' : chat.lastModel === 'offline' ? 'Model AI belum tersambung' : 'Asisten belajar · Online'}
            </p>
          </div>
        </header>

        <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-5 md:px-6" aria-live="polite" aria-busy={chat.sending}>
          {chat.messagesLoading ? (
            <div className="grid h-full place-items-center text-sm text-muted">
              <LoaderCircle className="size-5 anim-spin" aria-hidden="true" />
            </div>
          ) : empty ? (
            <EmptyState name={firstName} onAsk={(p) => void submit(p, 'text')} disabled={chat.sending} />
          ) : (
            <ol className="mx-auto flex max-w-3xl flex-col gap-4">
              <AnimatePresence initial={false}>
                {chat.messages.map((m) => (
                  <Bubble
                    key={m.id}
                    m={m}
                    autoPlay={!!m.fresh && settings.autoPlaySign}
                    speaking={tts.speaking}
                    onSpeak={() => (tts.speaking ? tts.cancel() : void tts.speak(m.content))}
                    onRetry={() => void chat.retry(m)}
                    onDiscard={() => chat.discard(m.id)}
                  />
                ))}
                {chat.sending && <Typing key="typing" />}
              </AnimatePresence>
            </ol>
          )}
        </div>

        {/* ---------- Composer ---------- */}
        <div className="border-t border-line bg-white px-3 pb-3 pt-2 md:px-5">
          <div className="mx-auto max-w-3xl">
            <AnimatePresence>{chat.error && <ErrorNote text={chat.error} onClose={chat.clearError} />}</AnimatePresence>
            <AnimatePresence>{signOpen && <SignCapture onWord={addWord} onClose={() => setSignOpen(false)} />}</AnimatePresence>
            <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-2xl border border-line bg-tint p-1.5 focus-within:border-brand-400 focus-within:bg-white">
              <label htmlFor="chat-input" className="sr-only">
                Tulis pesan
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={1000}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (!e.target.value.trim()) setUsedSign(false);
                }}
                onKeyDown={onKeyDown}
                placeholder={signOpen ? 'Kata dari isyarat muncul di sini…' : 'Tulis pesan…'}
                className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-base text-brand-900 placeholder:text-muted focus:outline-none"
              />
              <Button
                type="button"
                variant={signOpen ? 'primary' : 'soft'}
                className="size-11 px-0"
                onClick={() => setSignOpen((v) => !v)}
                aria-pressed={signOpen}
                aria-label={signOpen ? 'Tutup input isyarat' : 'Bertanya dengan isyarat'}
                title="Bertanya dengan isyarat"
              >
                <Hand />
              </Button>
              <Button type="submit" className="size-11 px-0" disabled={!draft.trim() || chat.sending} aria-label="Kirim pesan">
                {chat.sending ? <LoaderCircle className="anim-spin" /> : <Send />}
              </Button>
            </form>
            <p className="mt-1.5 px-1 text-[0.6875rem] text-muted">
              {usedSign ? (
                <span className="font-bold text-brand-600">Berisi kata dari isyarat · </span>
              ) : null}
              Enter untuk kirim, Shift+Enter untuk baris baru. ISYARA bisa keliru, tanyakan juga ke gurumu.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- bagian-bagian

function EmptyState({ name, onAsk, disabled }: { name: string; onAsk: (p: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center py-6 text-center">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="grid size-16 place-items-center rounded-3xl bg-brand-50"
      >
        <LogoMark className="size-10" />
      </motion.span>
      <h2 className="mt-4 text-[1.5rem] font-extrabold tracking-[-0.035em]">Halo{name ? `, ${name}` : ''}! Mau belajar apa?</h2>
      <p className="mt-1.5 text-sm text-muted">
        Tanyakan materi pelajaran dengan mengetik, atau tekan tombol <Hand className="inline size-3.5 align-[-2px] text-brand-600" aria-label="isyarat" /> untuk bertanya
        dengan isyarat. Jawaban tampil sebagai teks dan animasi BISINDO.
      </p>
      <ul className="mt-5 flex flex-wrap justify-center gap-2">
        {QUICK_PROMPTS.map((p, i) => (
          <motion.li key={p} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06 }}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAsk(p)}
              className="rounded-full border border-brand-100 bg-white px-4 py-2 text-sm font-bold text-brand-800 transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
            >
              {p}
            </button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

function Bubble({
  m,
  autoPlay,
  speaking,
  onSpeak,
  onRetry,
  onDiscard,
}: {
  m: ViewMessage;
  autoPlay: boolean;
  speaking: boolean;
  onSpeak: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  if (m.role === 'user') {
    return (
      <motion.li
        layout="position"
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex max-w-[85%] flex-col items-end self-end"
      >
        <span className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-bold text-muted">
          {m.inputMode === 'sign' && (
            <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-brand-600">
              <Hand className="size-3" aria-hidden="true" /> via isyarat
            </span>
          )}
          {m.status === 'sending' ? 'Mengirim…' : m.status === 'failed' ? <span className="text-rec">Gagal terkirim</span> : time(m.createdAt)}
        </span>
        <p
          className={cn(
            'whitespace-pre-wrap rounded-2xl rounded-tr-md px-4 py-2.5 text-[0.9375rem] font-semibold leading-relaxed text-white',
            m.status === 'failed' ? 'bg-brand-400' : 'bg-brand-600',
            m.status === 'sending' && 'opacity-80',
          )}
        >
          {m.content}
        </p>
        {m.status === 'failed' && (
          <span className="mt-1.5 flex gap-1.5">
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw /> Kirim ulang
            </Button>
            <Button size="sm" variant="ghost" onClick={onDiscard}>
              Hapus
            </Button>
          </span>
        )}
      </motion.li>
    );
  }
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex max-w-[92%] gap-2.5 self-start sm:max-w-[80%]"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-50">
        <LogoMark className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-md bg-tint px-4 py-3">
          <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-brand-900">{m.content}</p>
          <AnswerSign text={m.content} autoPlay={autoPlay} />
        </div>
        <div className="mt-1 flex items-center gap-1 px-1">
          <button
            type="button"
            onClick={onSpeak}
            className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[0.6875rem] font-bold text-brand-600 transition-colors hover:bg-brand-50"
          >
            {speaking ? <VolumeX className="size-3.5" aria-hidden="true" /> : <Volume2 className="size-3.5" aria-hidden="true" />}
            {speaking ? 'Hentikan' : 'Dengarkan'}
          </button>
          <span className="text-[0.6875rem] text-muted">· {time(m.createdAt)}</span>
        </div>
      </div>
    </motion.li>
  );
}

function Typing() {
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2.5 self-start" role="status">
      <span className="grid size-8 place-items-center rounded-full bg-brand-50">
        <LogoMark className="size-5" />
      </span>
      <span className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-tint px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <motion.i
            key={i}
            className="block size-1.5 rounded-full bg-brand-400"
            animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
        <span className="sr-only">ISYARA sedang menulis jawaban</span>
      </span>
    </motion.li>
  );
}

function ErrorNote({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <motion.p
      role="alert"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mb-2 flex items-start gap-2 rounded-2xl bg-rec-soft px-3.5 py-2.5 text-sm font-semibold text-rec"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{text}</span>
      <button type="button" onClick={onClose} aria-label="Tutup pesan" className="rounded-md p-0.5 hover:bg-white/60">
        <X className="size-4" aria-hidden="true" />
      </button>
    </motion.p>
  );
}

// ---------------------------------------------------------------- riwayat

function groupLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return 'Hari ini';
  if (days === 1) return 'Kemarin';
  if (days < 7) return '7 hari terakhir';
  return 'Lebih lama';
}

function SessionList({
  sessions,
  loading,
  activeId,
  onOpen,
  onRename,
  onDelete,
}: {
  sessions: ChatSession[];
  loading: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  if (loading) {
    return (
      <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-10 animate-pulse rounded-xl bg-tint" />
        ))}
      </div>
    );
  }
  if (sessions.length === 0) {
    return <p className="mt-4 px-1 text-sm text-muted">Belum ada percakapan. Pertanyaan pertamamu akan tersimpan di sini.</p>;
  }

  const groups: { label: string; items: ChatSession[] }[] = [];
  for (const s of sessions) {
    const label = groupLabel(s.updatedAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(s);
    else groups.push({ label, items: [s] });
  }

  return (
    <nav aria-label="Daftar percakapan" className="-mx-1 mt-4 flex-1 overflow-y-auto px-1">
      {groups.map((g) => (
        <div key={g.label} className="mb-3">
          <p className="mb-1 px-2 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">{g.label}</p>
          <ul className="flex flex-col gap-0.5">
            <AnimatePresence initial={false}>
              {g.items.map((s) => {
                const on = s.id === activeId;
                return (
                  <motion.li key={s.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="group relative">
                    {editing === s.id ? (
                      <form
                        className="flex items-center gap-1 rounded-xl bg-brand-50 p-1"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (title.trim()) await onRename(s.id, title.trim());
                          setEditing(null);
                        }}
                      >
                        <label htmlFor={`rename-${s.id}`} className="sr-only">
                          Nama percakapan
                        </label>
                        <input
                          id={`rename-${s.id}`}
                          autoFocus
                          value={title}
                          maxLength={120}
                          onChange={(e) => setTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                          className="h-8 min-w-0 flex-1 rounded-lg bg-white px-2 text-sm focus:outline-none"
                        />
                        <button type="submit" aria-label="Simpan nama" className="grid size-8 place-items-center rounded-lg text-brand-600 hover:bg-white">
                          <Check className="size-4" aria-hidden="true" />
                        </button>
                      </form>
                    ) : confirming === s.id ? (
                      <div className="flex items-center gap-1 rounded-xl bg-rec-soft p-1 pl-2.5 text-xs font-bold text-rec">
                        <span className="flex-1">Hapus percakapan ini?</span>
                        <button
                          type="button"
                          onClick={async () => {
                            await onDelete(s.id);
                            setConfirming(null);
                          }}
                          className="rounded-lg bg-rec px-2 py-1.5 text-white"
                        >
                          Hapus
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="rounded-lg px-2 py-1.5 hover:bg-white/60">
                          Batal
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpen(s.id)}
                          aria-current={on ? 'page' : undefined}
                          className={cn(
                            'flex h-10 w-full items-center rounded-xl pl-3 pr-16 text-left text-sm transition-colors',
                            on ? 'bg-brand-50 font-extrabold text-brand-900' : 'font-semibold text-brand-800 hover:bg-tint',
                          )}
                        >
                          <span className="truncate">{s.title}</span>
                        </button>
                        <span className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                          <button
                            type="button"
                            onClick={() => {
                              setTitle(s.title);
                              setEditing(s.id);
                            }}
                            aria-label={`Ganti nama ${s.title}`}
                            className="grid size-7 place-items-center rounded-lg text-muted hover:bg-white hover:text-brand-800"
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(s.id)}
                            aria-label={`Hapus ${s.title}`}
                            className="grid size-7 place-items-center rounded-lg text-muted hover:bg-white hover:text-rec"
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </button>
                        </span>
                      </>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      ))}
    </nav>
  );
}
