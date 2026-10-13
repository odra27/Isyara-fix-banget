import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Check, Hand, LoaderCircle, RotateCcw, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VOCABULARY } from '@/data/vocabulary';
import type { CaptureEvent } from '@/features/sign-to-text/autoCapture';
import { useAutoCapture } from '@/features/sign-to-text/useAutoCapture';
import { useHandTracking } from '@/features/sign-to-text/useHandTracking';
import { useCamera } from '@/hooks/useCamera';
import { matchingService } from '@/services/matching.service';
import { cn } from '@/lib/utils';
import type { MatchResult } from '@/types/kiosk';

/**
 * Input isyarat untuk chatbot: kamera → auto-capture → POST /api/match/sign → kata.
 * Setiap kata yang dikenali ditambahkan ke kolom pesan (bukan langsung dikirim), jadi siswa bisa
 * menyusun beberapa isyarat menjadi satu pertanyaan, menambah ketikan, lalu menekan Kirim.
 *
 * Pita confidence sama dengan kiosk (BE yang memutuskan): ≥85% langsung ditambahkan, 60–84% minta
 * konfirmasi, <60% "belum dikenali" (tanpa JBI, ADR-051). Video kamera hanya diproses di memori.
 */
type Stage = { kind: 'capture' } | { kind: 'processing' } | { kind: 'confirm'; r: MatchResult } | { kind: 'unknown' } | { kind: 'error' };

export function SignCapture({ onWord, onClose }: { onWord: (text: string) => void; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'capture' });
  const [added, setAdded] = useState<string | null>(null);
  const [showVocab, setShowVocab] = useState(false);
  const cam = useCamera({ onFailure: () => undefined });
  const captureOn = stage.kind === 'capture' && cam.status === 'ready';
  const tracking = useHandTracking(cam.videoRef, captureOn);
  const req = useRef(0);
  const addedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void cam.start();
    return () => cam.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => window.clearTimeout(addedTimer.current), []);

  const accept = useCallback(
    (text: string) => {
      onWord(text);
      setAdded(text);
      window.clearTimeout(addedTimer.current);
      addedTimer.current = window.setTimeout(() => setAdded(null), 1800);
      setStage({ kind: 'capture' });
    },
    [onWord],
  );

  const onCapture = useCallback(
    async (e: CaptureEvent) => {
      if (e.type !== 'stop') return;
      setStage({ kind: 'processing' });
      const id = ++req.current;
      try {
        const r = await matchingService.matchSign(e.frames, e.durationMs);
        if (id !== req.current) return;
        if (r.action === 'accepted' && r.phraseText) accept(r.phraseText);
        else if (r.action === 'confirmed' && r.phraseText) setStage({ kind: 'confirm', r });
        else setStage({ kind: 'unknown' });
      } catch {
        if (id === req.current) setStage({ kind: 'error' });
      }
    },
    [accept],
  );

  const capture = useAutoCapture(captureOn, onCapture);
  const again = () => {
    req.current++;
    capture.reset();
    setStage({ kind: 'capture' });
  };

  const phase = stage.kind === 'capture' ? capture.phase : null;
  const recording = phase === 'RECORDING';
  const camFailed = cam.status === 'denied' || cam.status === 'unavailable' || cam.status === 'ended';

  const caption = camFailed
    ? 'Kamera tidak tersedia. Ketik pertanyaanmu saja, ya.'
    : cam.status !== 'ready'
      ? 'Menyalakan kamera…'
      : tracking.status === 'loading'
        ? 'Memuat pendeteksi tangan…'
        : tracking.status === 'error'
          ? 'Pendeteksi tangan gagal dimuat'
          : stage.kind === 'processing'
            ? 'Mengenali isyarat…'
            : recording
              ? 'Merekam… turunkan tangan bila selesai'
              : phase === 'HAND_DETECTED'
                ? 'Tangan terdeteksi, tahan sebentar…'
                : 'Isyaratkan satu kata ke kamera';

  return (
    <motion.section
      aria-label="Input isyarat"
      initial={{ opacity: 0, y: 12, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: 8, height: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="mb-2 grid gap-3 rounded-3xl border border-line bg-white p-3 sm:grid-cols-[minmax(0,15rem)_1fr] sm:p-3.5">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-brand-100 via-brand-50 to-white">
          <video
            ref={cam.videoRef}
            muted
            playsInline
            className={cn('absolute inset-0 size-full -scale-x-100 object-cover transition-opacity', cam.status === 'ready' ? 'opacity-100' : 'opacity-0')}
          />
          {cam.status !== 'ready' && (
            <div className="absolute inset-0 grid place-items-center text-brand-400">
              {cam.status === 'starting' ? <LoaderCircle className="size-6 anim-spin" aria-hidden="true" /> : <Camera className="size-6" aria-hidden="true" />}
            </div>
          )}
          <AnimatePresence>
            {recording && (
              <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0">
                <div className="anim-rec absolute inset-0 rounded-2xl border-4 border-rec" />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {added && (
              <motion.span
                key={added}
                initial={{ opacity: 0, scale: 0.8, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute inset-x-0 top-3 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-ok px-3 py-1 text-xs font-extrabold text-white shadow-soft"
              >
                <Check className="size-3.5" aria-hidden="true" /> “{added}” ditambahkan
              </motion.span>
            )}
          </AnimatePresence>
          <p className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-xl bg-brand-900/85 px-2 py-1.5 text-center text-[0.6875rem] font-bold text-white">
            {recording ? (
              <span className="size-2 rounded-full bg-rec anim-rec" aria-hidden="true" />
            ) : stage.kind === 'processing' ? (
              <LoaderCircle className="size-3.5 anim-spin" aria-hidden="true" />
            ) : phase === 'HAND_DETECTED' ? (
              <ScanLine className="size-3.5" aria-hidden="true" />
            ) : (
              <Hand className="size-3.5" aria-hidden="true" />
            )}
            {caption}
          </p>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-extrabold">Bertanya dengan isyarat</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Satu isyarat = satu kata. Kata yang dikenali masuk ke kolom pesan, lalu tekan Kirim.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Tutup input isyarat">
              <X />
            </Button>
          </div>

          <div className="mt-3 min-h-[4.5rem]" aria-live="polite">
            <AnimatePresence mode="wait">
              {stage.kind === 'confirm' ? (
                <motion.div key="confirm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border-2 border-brand-200 p-3">
                  <p className="text-xs font-bold text-muted">Maksudmu ini? · {Math.round(stage.r.confidence * 100)}%</p>
                  <p className="mt-0.5 text-lg font-extrabold">“{stage.r.phraseText}”</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => accept(stage.r.phraseText!)}>
                      <Check /> Ya, tambahkan
                    </Button>
                    <Button size="sm" variant="outline" onClick={again}>
                      <RotateCcw /> Ulangi
                    </Button>
                  </div>
                </motion.div>
              ) : stage.kind === 'unknown' || stage.kind === 'error' ? (
                <motion.div key="unknown" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl bg-tint p-3">
                  <p className="text-sm font-extrabold">{stage.kind === 'error' ? 'Server pengenal isyarat tidak terhubung' : 'Isyarat belum dikenali'}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {stage.kind === 'error' ? 'Ketik pertanyaanmu dulu, atau coba lagi sebentar.' : 'Coba sekali lagi dengan pelan, atau ketik saja.'}
                  </p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={again}>
                    <RotateCcw /> Coba lagi
                  </Button>
                </motion.div>
              ) : (
                <motion.p key="tip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-muted">
                  Tidak perlu menekan tombol. Rekaman mulai otomatis saat tangan terangkat dan berhenti saat tangan diam atau turun.
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={() => setShowVocab((v) => !v)}
            aria-expanded={showVocab}
            className="mt-auto w-fit rounded-lg px-1 text-xs font-bold text-brand-600 underline-offset-4 hover:underline"
          >
            {showVocab ? 'Sembunyikan' : 'Lihat'} {VOCABULARY.length} kata yang bisa dikenali
          </button>
          <AnimatePresence>
            {showVocab && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 flex max-h-28 flex-wrap gap-1 overflow-y-auto"
              >
                {VOCABULARY.map((v) => (
                  <li key={v.phraseId} className="rounded-full bg-tint px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-800">
                    {v.text}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  );
}
