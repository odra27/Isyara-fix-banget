import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FileText, Hand, LoaderCircle, MapPin, Paperclip, Play, RotateCcw, Send, TriangleAlert, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/ui/logo';
import { clock } from '@/data/materi';
import { cn } from '@/lib/utils';
import { AnswerSign } from './AnswerSign';
import type { ChatDocument } from './chat.service';
import { SignCapture } from './SignCapture';
import type { ViewMessage } from './useChat';

const time = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- pesan

export function Bubble({
  m,
  autoPlay,
  speaking,
  onSpeak,
  onRetry,
  onDiscard,
  onSeek,
  rewatch,
}: {
  m: ViewMessage;
  autoPlay: boolean;
  speaking: boolean;
  onSpeak: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  /** Halaman video: klik chip waktu di pertanyaan → lompat ke detik itu. */
  onSeek?: (t: number) => void;
  /** Halaman video: tautan "Lihat lagi" di bawah jawaban. */
  rewatch?: { t: number; onClick: () => void } | null;
}) {
  if (m.role === 'user') {
    const t = m.videoTSec;
    return (
      <motion.li
        layout="position"
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex max-w-[85%] flex-col items-end self-end"
      >
        <span className="mb-1 flex flex-wrap items-center justify-end gap-1.5 text-[0.6875rem] font-bold text-muted">
          {t != null && (
            <button
              type="button"
              onClick={() => onSeek?.(t)}
              disabled={!onSeek}
              className="flex items-center gap-1 rounded-full bg-[#FFF4CC] px-2 py-0.5 text-[#7A5A00] enabled:hover:bg-[#FFEBA3]"
              aria-label={`Ditanyakan di ${clock(t)}`}
            >
              <MapPin className="size-3" aria-hidden="true" /> {clock(t)}
            </button>
          )}
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
      className="flex w-full max-w-[94%] gap-2.5 self-start sm:max-w-[82%]"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-50">
        <LogoMark className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3">
          <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-brand-900">{m.content}</p>
          <AnswerSign text={m.content} autoPlay={autoPlay} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1 px-1">
          <button
            type="button"
            onClick={onSpeak}
            className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[0.6875rem] font-bold text-brand-600 transition-colors hover:bg-brand-50"
          >
            {speaking ? <VolumeX className="size-3.5" aria-hidden="true" /> : <Volume2 className="size-3.5" aria-hidden="true" />}
            {speaking ? 'Hentikan' : 'Dengarkan'}
          </button>
          {rewatch && (
            <button
              type="button"
              onClick={rewatch.onClick}
              className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[0.6875rem] font-bold text-brand-600 transition-colors hover:bg-brand-50"
            >
              <Play className="size-3" fill="currentColor" aria-hidden="true" /> Lihat lagi di {clock(rewatch.t)}
            </button>
          )}
          <span className="text-[0.6875rem] text-muted">· {time(m.createdAt)}</span>
        </div>
      </div>
    </motion.li>
  );
}

export function Typing() {
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2.5 self-start" role="status">
      <span className="grid size-8 place-items-center rounded-full bg-brand-50">
        <LogoMark className="size-5" />
      </span>
      <span className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3.5">
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

export function ErrorNote({ text, onClose }: { text: string; onClose: () => void }) {
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

export function DocumentChips({ docs, uploading }: { docs: ChatDocument[]; uploading: boolean }) {
  if (!docs.length && !uploading) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Materi PDF di percakapan ini">
      {docs.map((d) => (
        <motion.li
          key={d.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex max-w-[16rem] items-center gap-1.5 rounded-full border border-line bg-white py-1 pl-2 pr-3 text-xs font-bold text-brand-800"
          title={`${d.filename} · ${d.pageCount} halaman`}
        >
          <FileText className="size-3.5 shrink-0 text-rec" aria-hidden="true" />
          <span className="truncate">{d.filename}</span>
          <span className="shrink-0 font-semibold text-muted">· {d.pageCount} hlm</span>
        </motion.li>
      ))}
      {uploading && (
        <li className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600" role="status">
          <LoaderCircle className="size-3.5 anim-spin" aria-hidden="true" /> Membaca PDF…
        </li>
      )}
    </ul>
  );
}

// ---------------------------------------------------------------- input

/** Tombol "Pakai isyarat": melambai sekali saat muncul, bergoyang saat disorot. */
function SignButton({ open, onToggle, wave, compact }: { open: boolean; onToggle: () => void; wave: boolean; compact?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      aria-label={open ? 'Tutup kamera isyarat' : 'Pakai isyarat'}
      title="Tunjukkan isyarat ke kamera"
      whileHover="wiggle"
      whileTap={{ scale: 0.95 }}
      className={cn(
        'flex h-11 shrink-0 items-center gap-1.5 rounded-2xl px-3.5 text-sm font-extrabold transition-colors',
        open ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-800 hover:bg-brand-100',
      )}
    >
      <motion.span
        className="inline-flex origin-[70%_85%]"
        initial={reduced || !wave ? false : { rotate: 0 }}
        animate={reduced || !wave ? undefined : { rotate: [0, 22, -8, 18, -4, 0] }}
        transition={{ duration: 1.3, delay: 0.6, ease: 'easeInOut' }}
        variants={reduced ? undefined : { wiggle: { rotate: [0, 18, -10, 12, 0], transition: { duration: 0.6 } } }}
      >
        <Hand className="size-[1.15rem]" aria-hidden="true" />
      </motion.span>
      {!compact && <span>{open ? 'Tutup' : 'Pakai isyarat'}</span>}
    </motion.button>
  );
}

export function Composer({
  value,
  onChange,
  onSend,
  sending,
  uploading,
  onUpload,
  chip,
  placeholder = 'Tulis pertanyaanmu…',
  onTyping,
  waveOnMount = false,
  compact = false,
  autoFocus = false,
  inputRef: externalRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string, mode: 'text' | 'sign') => Promise<boolean>;
  sending: boolean;
  uploading?: boolean;
  /** Ada = tombol + (unggah PDF) tampil. */
  onUpload?: (file: File) => void;
  /** Chip di atas kolom (mis. waktu video saat bertanya). */
  chip?: { label: string; onRemove: () => void } | null;
  placeholder?: string;
  /** true saat kolom fokus / sedang diketik (maskot melihat ke kolom; video berhenti). */
  onTyping?: (typing: boolean) => void;
  waveOnMount?: boolean;
  compact?: boolean;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [usedSign, setUsedSign] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = externalRef ?? ownRef;
  const file = useRef<HTMLInputElement>(null);

  // textarea tumbuh mengikuti isi (maks 6 baris)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, ref]);

  const submit = async () => {
    if (!value.trim() || sending) return;
    const ok = await onSend(value, usedSign ? 'sign' : 'text');
    if (ok) setUsedSign(false);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };
  const addWord = (w: string) => {
    setUsedSign(true);
    onTyping?.(true);
    onChange(value.trim() ? `${value.trimEnd()} ${w}` : w);
  };

  return (
    <div>
      <AnimatePresence>{signOpen && <SignCapture onWord={addWord} onClose={() => setSignOpen(false)} />}</AnimatePresence>
      <form
        onSubmit={onSubmit}
        className="rounded-[1.6rem] border border-line bg-white p-1.5 shadow-[0_10px_30px_rgba(38,33,92,0.07)] transition-colors focus-within:border-brand-200"
      >
        <AnimatePresence>
          {chip && (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="ml-2 mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#FFF4CC] py-0.5 pl-2 pr-1 text-xs font-bold text-[#7A5A00]"
            >
              <MapPin className="size-3" aria-hidden="true" /> {chip.label}
              <button type="button" onClick={chip.onRemove} aria-label="Hapus penanda waktu" className="grid size-5 place-items-center rounded-full hover:bg-[#FFE68A]">
                <X className="size-3" aria-hidden="true" />
              </button>
            </motion.span>
          )}
        </AnimatePresence>
        <label htmlFor="chat-input" className="sr-only">
          Tulis pesan
        </label>
        <textarea
          id="chat-input"
          ref={ref}
          rows={1}
          value={value}
          maxLength={1000}
          autoFocus={autoFocus}
          onFocus={() => onTyping?.(true)}
          onBlur={() => onTyping?.(!!value.trim())}
          onChange={(e) => {
            onChange(e.target.value);
            onTyping?.(true);
            if (!e.target.value.trim()) setUsedSign(false);
          }}
          onKeyDown={onKeyDown}
          placeholder={signOpen ? 'Kata dari isyarat muncul di sini…' : placeholder}
          className="block max-h-40 min-h-12 w-full resize-none bg-transparent px-3.5 py-3 text-base text-brand-900 placeholder:text-muted focus:outline-none"
        />
        <div className="flex items-center gap-1.5 px-1 pb-0.5">
          {onUpload && (
            <>
              <input
                ref={file}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) onUpload(f);
                }}
              />
              <button
                type="button"
                onClick={() => file.current?.click()}
                disabled={uploading}
                aria-label="Tambah materi PDF"
                title="Tambah materi PDF (maks 10 halaman)"
                className="grid size-11 shrink-0 place-items-center rounded-2xl text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-50"
              >
                {uploading ? <LoaderCircle className="size-5 anim-spin" aria-hidden="true" /> : <Paperclip className="size-5" aria-hidden="true" />}
              </button>
            </>
          )}
          <SignButton open={signOpen} onToggle={() => setSignOpen((v) => !v)} wave={waveOnMount} compact={compact} />
          {usedSign && <span className="hidden text-[0.6875rem] font-bold text-brand-600 sm:inline">Berisi kata dari isyarat</span>}
          <Button type="submit" className="ml-auto size-11 rounded-2xl px-0" disabled={!value.trim() || sending} aria-label="Kirim pesan">
            {sending ? <LoaderCircle className="anim-spin" /> : <Send />}
          </Button>
        </div>
      </form>
    </div>
  );
}
