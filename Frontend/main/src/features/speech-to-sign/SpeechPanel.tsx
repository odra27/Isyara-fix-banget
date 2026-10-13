import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, Mic, Send, Square, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PhrasePicker } from '@/components/kiosk/PhrasePicker';
import { ResultCard } from '@/components/kiosk/ResultCard';
import { officerPhrases } from '@/data/phrases.mock';
import { useKiosk } from '@/state/KioskContext';
import { cn } from '@/lib/utils';
import { SignVideo } from './SignVideo';
import { FlowSteps, MatchingViz, MicLevel } from './SpeechAnimations';
import { useSpeechFlow } from './useSpeechFlow';

/**
 * Panel Petugas (Alur B). Kiri: input petugas (Bicara / ketik / frasa cepat).
 * Kanan: output yang menghadap pasien (video isyarat + teks).
 */
export function SpeechPanel() {
  const k = useKiosk();
  const f = useSpeechFlow();
  const [typed, setTyped] = useState('');

  const micOff = k.speechFallback === 'mic' || !f.micSupported;
  const backendOff = k.speechFallback === 'backend';
  const blocked = f.talkBlockedReason;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim()) return;
    void f.submitText(typed);
    setTyped('');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:gap-6">
      {/* ---------- Input petugas ---------- */}
      <section aria-label="Input petugas" className="flex flex-col gap-3">
        <div className="rounded-[1.75rem] bg-white p-5 md:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Untuk petugas</p>

          {!micOff ? (
            <div className="mt-4 flex flex-col items-center gap-4 text-center">
              <motion.button
                type="button"
                onClick={f.listening ? f.stopTalking : f.startTalking}
                disabled={!!blocked && !f.listening}
                whileTap={{ scale: 0.95 }}
                aria-pressed={f.listening}
                aria-describedby={blocked ? 'talk-blocked' : undefined}
                className={cn(
                  'relative grid size-28 place-items-center rounded-full text-white transition-colors md:size-32',
                  f.listening ? 'bg-rec' : 'bg-brand-600 hover:bg-brand-800',
                  'disabled:bg-brand-200',
                )}
              >
                {f.listening && <span className="absolute inset-0 rounded-full border-4 border-rec/30 anim-rec" aria-hidden="true" />}
                <span className="flex flex-col items-center gap-1">
                  {f.listening ? <Square className="size-7" fill="currentColor" aria-hidden="true" /> : <Mic className="size-9" aria-hidden="true" />}
                  <span className="text-sm font-extrabold">{f.listening ? 'Selesai' : 'Bicara'}</span>
                </span>
              </motion.button>

              <div className="min-h-12 w-full" aria-live="polite">
                {f.listening ? (
                  <div className="flex flex-col items-center gap-2">
                    <MicLevel active={f.listening} />
                    <p className="text-lg font-bold text-brand-900">
                      {f.interim
                        ? f.interim.split(' ').map((w, i) => (
                          <motion.span key={`${i}-${w}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mr-[0.25em] inline-block">
                            {w}
                          </motion.span>
                        ))
                        : 'Mendengarkan…'}
                    </p>
                  </div>
                ) : blocked ? (
                  <p id="talk-blocked" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-600">
                    <Info className="size-4" aria-hidden="true" /> {blocked}
                  </p>
                ) : f.micError === 'no-speech' ? (
                  <p className="text-sm text-muted">Suara tidak terdengar. Coba dekatkan ke perangkat.</p>
                ) : (
                  <p className="text-sm text-muted">Tekan sekali, bicara, lalu tekan Selesai atau diam sebentar.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-tint p-3 text-sm text-brand-800">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {f.micSupported ? 'Mic tidak tersedia.' : 'Browser ini belum mendukung pengenalan suara.'} Ketik kalimat di bawah.
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-4 flex gap-2">
            <label htmlFor="officer-text" className="sr-only">
              Ketik kalimat petugas
            </label>
            <input
              id="officer-text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Ketik kalimat, mis. “halo, selamat pagi, apa kabar?”"
              autoComplete="off"
              className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-tint px-4 text-base text-brand-900 placeholder:text-muted focus:border-brand-400 focus:bg-white focus:outline-none"
            />
            <Button type="submit" size="md" className="h-12" disabled={!typed.trim() || f.phase === 'MATCHING'} aria-label="Kirim kalimat">
              <Send />
            </Button>
          </form>
        </div>

        <details className="group rounded-[1.75rem] bg-white p-5 open:pb-5 md:p-6" open={backendOff}>
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-extrabold">
            Frasa cepat
            <span className="text-xs font-semibold text-muted group-open:hidden">Tampilkan</span>
            <span className="hidden text-xs font-semibold text-muted group-open:inline">Sembunyikan</span>
          </summary>
          <div className="mt-4">
            <PhrasePicker compact label="Frasa cepat petugas" phrases={officerPhrases} onPick={(p) => f.playPhrase(p.id)} />
          </div>
        </details>
      </section>

      {/* ---------- Output ke pasien ---------- */}
      <section aria-label="Tampilan untuk pasien" className="flex flex-col">
        <FlowSteps phase={f.phase} />
        <AnimatePresence mode="wait">
          {f.phase === 'PLAYING' && f.result?.phraseText ? (
            <motion.div key={`play-${f.playId}`} exit={{ opacity: 0 }}>
              <SignVideo
                segments={f.result.segments ?? [{ phraseId: f.result.phraseId, text: f.result.phraseText }]}
                text={f.result.phraseText}
                videoUrl={f.result.videoUrl}
                onDone={f.onVideoDone}
              />
              {f.lastUtterance && f.lastUtterance !== f.result.phraseText && (
                <p className="mt-3 px-2 text-sm text-muted">
                  Ucapan asli: <span className="font-semibold text-brand-800">“{f.lastUtterance}”</span>
                </p>
              )}
            </motion.div>
          ) : (f.phase === 'CONFIRM' || f.phase === 'NO_MATCH') && f.result ? (
            <div key="result">
              <ResultCard
                result={f.result}
                acceptedLabel="Petugas menyampaikan"
                confirmLabel="Maksud Anda (untuk petugas)"
                onConfirm={f.confirm}
                onRetry={f.reset}
                onJbi={f.callJbi}
              />
              <p className="mt-3 px-2 text-sm text-muted">
                Ucapan: <span className="font-semibold text-brand-800">“{f.lastUtterance}”</span>
              </p>
            </div>
          ) : f.phase === 'TEXT_ONLY' ? (
            <motion.div key="text" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-brand-900 p-6 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-200">Pesan dari petugas</p>
              <p className="mt-2 text-[2rem] font-extrabold leading-[1.1] tracking-[-0.035em]">{f.lastUtterance}</p>
              <p className="mt-4 text-sm text-brand-100">Video isyarat tidak tersedia saat koneksi terputus.</p>
            </motion.div>
          ) : (
            <motion.div
              key={f.phase}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="grid min-h-64 flex-1 place-items-center rounded-3xl border-2 border-dashed border-brand-100 bg-white/60 p-6 text-center"
            >
              {f.phase === 'MATCHING' ? (
                <MatchingViz utterance={f.lastUtterance} />
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-400">
                    <Video className="size-6" aria-hidden="true" />
                  </span>
                  <p className="text-lg font-extrabold">Video isyarat tampil di sini</p>
                  <p className="max-w-xs text-sm text-muted">Ucapan petugas dicocokkan ke frasa terdekat, lalu video BISINDO diputar untuk pasien.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
