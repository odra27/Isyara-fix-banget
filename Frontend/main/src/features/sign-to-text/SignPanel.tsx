import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Hand, LoaderCircle, RotateCcw, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PhrasePicker } from '@/components/kiosk/PhrasePicker';
import { ResultCard } from '@/components/kiosk/ResultCard';
import { CAPTURE } from '@/config/capture.config';
import { studentPhrases } from '@/data/phrases.mock';
import { useCamera } from '@/hooks/useCamera';
import { useKiosk } from '@/state/KioskContext';
import { cn, isDevMode } from '@/lib/utils';
import { useHandTracking } from './useHandTracking';
import { useSignFlow, type SignPhase } from './useSignFlow';

/**
 * Panel Siswa (Alur A, mode Kiosk kelas). Kamera + indikator status wajib (PRD-FE §4.2) + hasil (§6).
 * Semua status: warna + ikon + TEKS, dan diumumkan lewat aria-live.
 */
const STATUS: Record<SignPhase, { text: string; sub: string }> = {
  IDLE: { text: 'Silakan mulai mengisyaratkan', sub: 'Gerakan terdeteksi otomatis. Tidak perlu menekan tombol.' },
  HAND_DETECTED: { text: 'Tangan terdeteksi', sub: 'Tahan sebentar…' },
  RECORDING: { text: 'Merekam…', sub: 'Diam sejenak atau turunkan tangan bila sudah selesai.' },
  PROCESSING: { text: 'Memproses…', sub: 'Mencocokkan dengan kosakata BISINDO terlatih.' },
  RESULT: { text: 'Selesai', sub: '' },
};

const dev = isDevMode();

export function SignPanel() {
  //throw new Error('tes error boundary'); //Ini kizana lg ngecheck fitur error boundary, jgn diapa-apain.
  const k = useKiosk();
  const flow = useSignFlow(true);
  // Di ?dev=1 kegagalan kamera tidak memicu fallback otomatis, supaya skenario auto-capture
  // tetap bisa diuji dengan frame sintetis. Fallback kamera diuji lewat tombol "Matikan kamera" di simulator.
  const cam = useCamera({ onFailure: () => !dev && k.setSignFallback('camera') });
  const tracking = useHandTracking(cam.videoRef, flow.captureEnabled && cam.status === 'ready');

  const manual = k.signFallback !== null;

  // Kamera hanya menyala saat mode normal. Mode manual / preview (belum login) / unmount
  // → stream dimatikan. Preview di balik LoginGate tidak boleh meminta izin kamera.
  useEffect(() => {
    if (!manual && !k.preview) void cam.start();
    else cam.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, k.preview]);
  const phase = flow.phase;
  const status = STATUS[phase];
  const recording = phase === 'RECORDING';
  const paused = !flow.captureEnabled && (phase === 'IDLE' || phase === 'HAND_DETECTED') && !manual;
  const stillRatio = Math.min(1, flow.debug.stillMs / CAPTURE.stillHoldMs);
  const durRatio = Math.min(1, flow.debug.durationMs / CAPTURE.maxRecordMs);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:gap-6">
      {/* ---------- Kamera ---------- */}
      <section aria-label="Kamera siswa" className="flex flex-col gap-3">
        {manual ? (
          <div className="rounded-[1.75rem] border border-line bg-white p-4 md:p-5">
            <p className="text-lg font-extrabold tracking-tight">Pilih yang ingin disampaikan</p>
            <p className="mb-4 mt-1 text-sm text-muted">Mode manual aktif. Ketuk frasa, lalu frasa akan dibacakan untuk guru.</p>
            <PhrasePicker label="Frasa siswa" phrases={studentPhrases} onPick={(p) => flow.pickManual(p.id, p.text)} />
          </div>
        ) : (
          <div
            className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-100 via-brand-50 to-white sm:aspect-[16/11]"
            data-state={phase}
          >
            <video
              ref={cam.videoRef}
              muted
              playsInline
              className={cn('absolute inset-0 size-full -scale-x-100 object-cover transition-opacity', cam.status === 'ready' ? 'opacity-100' : 'opacity-0')}
            />
            {cam.status !== 'ready' && (
              <div className="absolute inset-0 grid place-items-center text-brand-400">
                <div className="flex flex-col items-center gap-2 text-sm font-semibold">
                  {cam.status === 'starting' ? <LoaderCircle className="size-7 anim-spin" /> : <Camera className="size-7" />}
                  {cam.status === 'starting' ? 'Menyalakan kamera…' : 'Kamera belum aktif'}
                </div>
              </div>
            )}

            {/* Bingkai kunci: menyempit saat tangan terbaca */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-5 text-brand-600"
              animate={{ scale: phase === 'IDLE' ? 1.04 : 1, opacity: phase === 'IDLE' ? 0.45 : 1 }}
              transition={{ duration: 0.2 }}
            >
              {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'left-0 bottom-14 border-l-4 border-b-4 rounded-bl-2xl', 'right-0 bottom-14 border-r-4 border-b-4 rounded-br-2xl'].map((c) => (
                <span key={c} className={cn('absolute size-8 border-current', c)} />
              ))}
            </motion.div>

            {/* Border merah pulse pelan saat merekam (≥ 1.2 dtk/siklus) */}
            <AnimatePresence>
              {recording && (
                <motion.div
                  key="rec"
                  aria-hidden="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0"
                >
                  <div className="anim-rec absolute inset-0 rounded-[1.75rem] border-[5px] border-rec" />
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-rec/20">
                    <div className="h-full bg-rec transition-[width] duration-100" style={{ width: `${durRatio * 100}%` }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ring "akan berhenti" saat gerakan mulai diam */}
            <AnimatePresence>
              {recording && stillRatio > 0 && (
                <motion.div
                  key="still"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-white/95 py-1.5 pl-1.5 pr-3 text-xs font-bold text-brand-800 shadow-soft"
                >
                  <svg viewBox="0 0 28 28" className="size-6 -rotate-90" aria-hidden="true">
                    <circle cx="14" cy="14" r="11" className="fill-none stroke-brand-100" strokeWidth="3" />
                    <circle
                      cx="14"
                      cy="14"
                      r="11"
                      className="fill-none stroke-rec"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={69.1}
                      strokeDashoffset={69.1 * (1 - stillRatio)}
                    />
                  </svg>
                  Hampir selesai
                </motion.div>
              )}
            </AnimatePresence>

            {/* Caption status di atas kamera */}
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-2xl bg-brand-900/85 px-3 py-2.5 text-sm font-bold text-white backdrop-blur">
              {recording ? (
                <span className="size-2.5 rounded-full bg-rec anim-rec" aria-hidden="true" />
              ) : phase === 'PROCESSING' ? (
                <LoaderCircle className="size-4 anim-spin" aria-hidden="true" />
              ) : phase === 'HAND_DETECTED' ? (
                <ScanLine className="size-4" aria-hidden="true" />
              ) : (
                <Hand className="size-4" aria-hidden="true" />
              )}
              {tracking.status === 'loading' && cam.status === 'ready'
                ? 'Memuat pendeteksi tangan…'
                : tracking.status === 'error'
                  ? 'Pendeteksi tangan gagal dimuat'
                  : paused
                    ? k.speechActive
                      ? 'Menunggu guru selesai…'
                      : 'Kamera dijeda'
                    : status.text}
            </div>

            {dev && <DebugOverlay debug={flow.debug} enabled={flow.captureEnabled} />}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={flow.retry}>
            <RotateCcw /> Ulangi isyarat
          </Button>
        </div>
      </section>

      {/* ---------- Status & hasil ---------- */}
      <section aria-label="Hasil untuk guru" className="flex flex-col">
        <div aria-live="polite" className="sr-only">
          {phase === 'RESULT' && flow.result
            ? flow.result.action === 'escalated_to_jbi'
              ? 'Isyarat belum dikenali'
              : `${flow.result.action === 'confirmed' ? 'Kemungkinan maksud: ' : ''}${flow.result.phraseText}`
            : status.text}
        </div>

        <AnimatePresence mode="wait">
          {phase === 'RESULT' && flow.result ? (
            <ResultCard
              key="result"
              result={flow.result}
              acceptedLabel="Siswa menyampaikan"
              confirmLabel="Maksudmu ini?"
              speakingLabel="Sedang dibacakan untuk guru"
              speaking={k.ttsSpeaking}
              onConfirm={flow.confirm}
              onRetry={flow.retry}
              unknownBody="Kami tidak mau menebak. Coba isyaratkan sekali lagi dengan pelan, atau pilih frasa secara manual."
            />
          ) : (
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="rounded-3xl bg-white p-5 md:p-6"
            >
              <StatusGlyph phase={phase} />
              <p className="mt-4 text-[1.75rem] font-extrabold leading-[1.05] tracking-[-0.04em] md:text-[2.25rem]">
                {manual ? 'Pilih frasa di samping' : status.text}
              </p>
              <p className="mt-2 max-w-sm text-sm text-muted">{manual ? 'Frasa yang dipilih akan tampil di sini dan dibacakan.' : status.sub}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <ol className="mt-4 hidden gap-2 text-xs font-semibold text-muted md:grid md:grid-cols-4" aria-label="Tahapan">
          {(['IDLE', 'RECORDING', 'PROCESSING', 'RESULT'] as const).map((p, i) => {
            const order = ['IDLE', 'HAND_DETECTED', 'RECORDING', 'PROCESSING', 'RESULT'];
            const done = order.indexOf(phase) >= order.indexOf(p);
            return (
              <li key={p} className="flex flex-col gap-1.5">
                <span className={cn('h-1 rounded-full transition-colors duration-300', done ? 'bg-brand-600' : 'bg-brand-100')} />
                <span className={done ? 'text-brand-800' : undefined}>
                  {i + 1}. {['Siap', 'Merekam', 'Memproses', 'Hasil'][i]}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function StatusGlyph({ phase }: { phase: SignPhase }) {
  const base = 'grid size-14 place-items-center rounded-2xl';
  if (phase === 'RECORDING')
    return (
      <span className={cn(base, 'bg-rec-soft')}>
        <span className="size-5 rounded-full bg-rec anim-rec" />
      </span>
    );
  if (phase === 'PROCESSING')
    return (
      <span className={cn(base, 'bg-brand-50')}>
        <span className="size-7 rounded-full border-[3px] border-brand-100 border-t-brand-600 anim-spin" />
      </span>
    );
  return (
    <span className={cn(base, phase === 'HAND_DETECTED' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-muted')}>
      <Hand className={cn('size-6', phase === 'IDLE' && 'anim-breathe')} aria-hidden="true" />
    </span>
  );
}

function DebugOverlay({ debug, enabled }: { debug: ReturnType<typeof useSignFlow>['debug']; enabled: boolean }) {
  const rows: [string, string][] = [
    ['state', debug.phase + (enabled ? '' : ' (paused)')],
    ['motion', `${debug.avgMotion.toFixed(4)} / ${CAPTURE.motionThreshold}`],
    ['diam', `${Math.round(debug.stillMs)} / ${CAPTURE.stillHoldMs} ms`],
    ['hilang', `${Math.round(debug.lostMs)} / ${CAPTURE.handLostMs} ms`],
    ['durasi', `${Math.round(debug.durationMs)} / ${CAPTURE.maxRecordMs} ms`],
    ['frame', String(debug.frameCount)],
  ];
  return (
    <dl className="absolute left-3 top-3 grid grid-cols-[auto_auto] gap-x-3 rounded-xl bg-black/70 px-3 py-2 font-mono text-[0.625rem] leading-relaxed text-white">
      {rows.map(([a, b]) => (
        <div key={a} className="contents">
          <dt className="text-white/60">{a}</dt>
          <dd>{b}</dd>
        </div>
      ))}
    </dl>
  );
}
