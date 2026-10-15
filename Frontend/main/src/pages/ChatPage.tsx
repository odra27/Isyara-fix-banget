import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle, MessageSquarePlus } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { TigerMascot, type MascotMood } from '@/components/mascot/TigerMascot';
import { Button } from '@/components/ui/button';
import { PenUnderline } from '@/components/ui/pen-underline';
import { Bubble, Composer, DocumentChips, ErrorNote, Typing } from '@/features/chatbot/ChatParts';
import { QUICK_PROMPTS } from '@/features/chatbot/prompts';
import { useChat } from '@/features/chatbot/useChat';
import { useSpeechOut } from '@/hooks/useSpeechOut';
import { useSettings } from '@/state/SettingsContext';

type IncomingState = { prompt?: string; autoSend?: boolean } | null;

/**
 * Tanya ISYARA (ADR-053): halaman utama. Layar awal seperti Gemini (maskot, "Mau belajar apa hari
 * ini?", kolom tanya, saran). Setelah bertanya, halaman yang sama menjadi percakapan; maskot kecil
 * pindah ke atas dan "berpikir" saat menunggu jawaban. Siswa bisa mengetik, berisyarat (kamera →
 * kata) atau menambah materi PDF. Jawaban tampil sebagai teks + animasi isyarat bercaption.
 */
export default function ChatPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const settings = useSettings();
  const tts = useSpeechOut();
  const activeId = sessionId ?? null;

  const onCreated = useCallback((id: string) => navigate(`/chat/${id}`, { replace: true }), [navigate]);
  const chat = useChat(activeId, onCreated);

  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = useCallback(
    async (text: string, mode: 'text' | 'sign') => {
      const ok = await chat.send(text, mode);
      if (ok) {
        setDraft('');
        setTyping(false);
      }
      return ok;
    },
    [chat],
  );

  // Pertanyaan dari halaman lain (sekali saja).
  const incoming = useRef<IncomingState>(location.state as IncomingState);
  useEffect(() => {
    const st = incoming.current;
    if (!st?.prompt) return;
    incoming.current = null;
    navigate(location.pathname, { replace: true, state: null });
    if (st.autoSend) void send(st.prompt, 'text');
    else {
      setDraft(st.prompt);
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Chat baru" dari sidebar saat sudah di /chat: kosongkan kolom.
  useEffect(() => {
    if (!activeId) setDraft('');
  }, [activeId]);

  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chat.messages.length, chat.sending]);

  const lastFresh = [...chat.messages].reverse().find((m) => m.role === 'assistant' && m.fresh);
  useEffect(() => {
    if (lastFresh && settings.autoSpeak) void tts.speak(lastFresh.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFresh?.id]);
  const cancelSpeech = tts.cancel;
  useEffect(() => cancelSpeech, [cancelSpeech, activeId]);

  const mood: MascotMood = chat.sending || chat.uploading ? 'thinking' : typing ? 'typing' : 'idle';
  const firstName = profile?.name.split(' ')[0] ?? '';
  const active = chat.sessions.find((s) => s.id === activeId);
  const empty = !activeId && chat.messages.length === 0;

  const composer = (
    <>
      <AnimatePresence>{chat.error && <ErrorNote text={chat.error} onClose={chat.clearError} />}</AnimatePresence>
      <DocumentChips docs={chat.documents} uploading={chat.uploading} />
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={send}
        sending={chat.sending}
        uploading={chat.uploading}
        onUpload={(f) => void chat.upload(f)}
        onTyping={setTyping}
        waveOnMount={empty}
        inputRef={inputRef}
        placeholder={chat.documents.length ? 'Tanyakan isi materi PDF-mu…' : 'Tulis pertanyaanmu…'}
      />
    </>
  );

  // ---------- layar awal
  if (empty) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center pb-10 pt-[6vh] text-center lg:pt-[9vh]">
        <motion.div initial={{ opacity: 0, y: 12, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
          <TigerMascot mood={mood} />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="mt-4 text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.045em] md:text-[2.5rem]"
        >
          {firstName ? `Halo, ${firstName}! ` : ''}Mau <PenUnderline>belajar</PenUnderline> apa hari ini?
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-2 max-w-md text-sm text-muted">
          Ketik pertanyaanmu, pakai isyarat, atau tambahkan materi PDF dari gurumu.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.35 }} className="mt-6 w-full text-left">
          {composer}
        </motion.div>

        <ul className="mt-5 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
          {QUICK_PROMPTS.map((p, i) => (
            <motion.li key={p.text} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.06 }}>
              <button
                type="button"
                disabled={chat.sending}
                onClick={() => void send(p.text, 'text')}
                className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft disabled:opacity-50"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tint text-brand-600 transition-colors group-hover:bg-brand-50">
                  <p.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-brand-900">{p.text}</span>
                  <span className="block text-xs text-muted">{p.hint}</span>
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      </div>
    );
  }

  // ---------- percakapan
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col lg:h-full lg:min-h-0">
      <div ref={scroller} className="flex-1 overflow-y-auto pb-4 lg:min-h-0" aria-live="polite" aria-busy={chat.sending}>
        <div className="flex flex-col items-center pb-6 pt-2">
          <TigerMascot mood={mood} size="sm" />
          <p className="mt-2 max-w-full truncate px-4 text-sm font-extrabold text-brand-900">{active?.title ?? 'Percakapan baru'}</p>
          <p className="text-[0.6875rem] font-semibold text-muted">
            {chat.lastModel === 'offline' ? 'Model AI belum tersambung di server' : 'Riwayat tersimpan di akunmu'}
          </p>
        </div>

        {chat.messagesLoading ? (
          <div className="grid min-h-40 place-items-center text-sm text-muted">
            <LoaderCircle className="size-5 anim-spin" aria-hidden="true" />
          </div>
        ) : chat.notFound ? (
          <div className="mx-auto max-w-sm rounded-3xl border-2 border-dashed border-brand-100 bg-white/60 p-6 text-center">
            <p className="font-extrabold">Percakapan ini sudah tidak ada</p>
            <p className="mt-1 text-sm text-muted">Mungkin sudah dihapus. Mulai percakapan baru, yuk.</p>
            <Button className="mt-4" onClick={() => navigate('/chat')}>
              <MessageSquarePlus /> Chat baru
            </Button>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
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

      <div className="sticky bottom-20 bg-gradient-to-t from-tint via-tint to-tint/0 pt-3 lg:static lg:bottom-auto">
        {composer}
        <p className="mt-1.5 px-2 text-center text-[0.6875rem] text-muted">
          ISYARA bisa keliru, tanyakan juga ke gurumu. Lihat semua percakapan di{' '}
          <Link to="/riwayat" className="font-bold text-brand-600 hover:underline">
            Riwayat
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
