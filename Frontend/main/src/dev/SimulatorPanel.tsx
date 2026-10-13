import { useEffect, useRef, useState } from 'react';
import { Bug, X } from 'lucide-react';
import { logsService } from '@/services/logs.service';
import { isMockBackend, mockControls } from '@/services/matching.service';
import { playScenario, type ScenarioName } from '@/features/sign-to-text/synthetic';
import { listDevSamples, playDevSample, type DevSample } from '@/features/sign-to-text/replay';
import { useKiosk } from '@/state/KioskContext';
import type { LogEntry } from '@/types/kiosk';
import { cn } from '@/lib/utils';

/**
 * Panel simulator (hanya ?dev=1) untuk menguji Skenario 1–6 tanpa kamera/backend (PRD §22).
 */
const RESULTS: { label: string; value: number | null }[] = [
  { label: 'Acak', value: null },
  { label: 'Normal 92%', value: 0.92 },
  { label: 'Ambigu 72%', value: 0.72 },
  { label: 'Tak dikenal 40%', value: 0.4 },
];

const SCENES: { id: ScenarioName; label: string }[] = [
  { id: 'normal', label: 'Isyarat normal' },
  { id: 'falseStart', label: 'False start' },
  { id: 'jedaAlami', label: 'Jeda alami' },
  { id: 'tanganKeluar', label: 'Tangan keluar' },
  { id: 'timeout', label: 'Gerak terus (8 dtk)' },
];

export function SimulatorPanel() {
  const k = useKiosk();
  const [open, setOpen] = useState(true);
  const [forced, setForced] = useState<number | null>(mockControls.forcedConfidence);
  const [delay, setDelay] = useState(mockControls.delayMs ?? 800);
  const [failBackend, setFailBackend] = useState(mockControls.failBackend);
  const [playing, setPlaying] = useState<ScenarioName | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>(logsService.list());
  const stopRef = useRef<() => void>(undefined);

  const [samples, setSamples] = useState<DevSample[]>([]);
  const [playingSample, setPlayingSample] = useState<string | null>(null);

  useEffect(() => logsService.subscribe(setLogs), []);
  useEffect(() => () => stopRef.current?.(), []);
  useEffect(() => {
    listDevSamples().then(setSamples, () => setSamples([]));
  }, []);

  const run = (id: ScenarioName) => {
    stopRef.current?.();
    if (k.tab !== 'siswa') k.setTab('siswa');
    setPlayingSample(null);
    setPlaying(id);
    stopRef.current = playScenario(id, () => setPlaying(null));
  };

  const runSample = async (s: DevSample) => {
    stopRef.current?.();
    if (k.tab !== 'siswa') k.setTab('siswa');
    setPlaying(null);
    setPlayingSample(s.clip);
    stopRef.current = await playDevSample(s, () => setPlayingSample(null));
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-40 grid size-11 place-items-center rounded-full bg-black text-white shadow-soft"
        aria-label="Buka simulator"
      >
        <Bug className="size-5" />
      </button>
    );
  }

  const chip = (active: boolean) =>
    cn('rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors', active ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20');

  return (
    <aside
      aria-label="Simulator dev"
      className="fixed bottom-4 left-4 z-40 max-h-[70vh] w-[min(340px,calc(100vw-2rem))] overflow-y-auto rounded-2xl bg-black/90 p-4 text-[12px] text-white shadow-soft backdrop-blur"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 font-bold">
          <Bug className="size-4" /> Simulator
          <span className="rounded bg-white/15 px-1.5 text-[10px]">{isMockBackend ? 'mock' : 'http'}</span>
        </p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Tutup simulator">
          <X className="size-4" />
        </button>
      </div>

      <Section title="Frame tangan sintetis">
        <div className="flex flex-wrap gap-1.5">
          {SCENES.map((s) => (
            <button key={s.id} type="button" className={chip(playing === s.id)} onClick={() => run(s.id)}>
              {playing === s.id ? '▶ ' : ''}
              {s.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Contoh isyarat asli (dataset → model)">
        {samples.length === 0 ? (
          <p className="text-white/50">Tidak ada contoh di public/dev-samples.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {samples.map((s) => (
              <button key={s.clip} type="button" className={chip(playingSample === s.clip)} onClick={() => void runSample(s)} title={s.clip}>
                {playingSample === s.clip ? '▶ ' : ''}
                {s.text} · {s.clip.split('_')[0]}
              </button>
            ))}
          </div>
        )}
        <p className="mt-1 text-[10px] text-white/50">
          {isMockBackend ? 'Mode mock: hasil acak. Set VITE_API_BASE_URL agar dicek model asli.' : 'Landmark asli diputar ke auto-capture → backend → model.'}
        </p>
      </Section>

      <Section title="Paksa hasil matching (mock)">
        <div className="flex flex-wrap gap-1.5">
          {RESULTS.map((r) => (
            <button
              key={r.label}
              type="button"
              className={chip(forced === r.value)}
              onClick={() => {
                mockControls.forcedConfidence = r.value;
                setForced(r.value);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2">
          <span className="w-24 text-white/70">Delay {delay} ms</span>
          <input
            type="range"
            min={100}
            max={5000}
            step={100}
            value={delay}
            onChange={(e) => {
              const v = Number(e.target.value);
              mockControls.delayMs = v;
              setDelay(v);
            }}
            className="flex-1"
          />
        </label>
        <p className="mt-1 text-[10px] text-white/50">&gt; 4000 ms = timeout → mode fallback</p>
      </Section>

      <Section title="Gangguan (Skenario 4)">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(k.signFallback === 'camera')} onClick={() => k.setSignFallback(k.signFallback === 'camera' ? null : 'camera')}>
            Matikan kamera
          </button>
          <button type="button" className={chip(k.speechFallback === 'mic')} onClick={() => k.setSpeechFallback(k.speechFallback === 'mic' ? null : 'mic')}>
            Matikan mic
          </button>
          <button
            type="button"
            className={chip(failBackend)}
            onClick={() => {
              mockControls.failBackend = !failBackend;
              setFailBackend(!failBackend);
            }}
          >
            Matikan backend
          </button>
        </div>
      </Section>

      <Section title={`matching_logs (${logs.length})`}>
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto font-mono text-[10px]">
          {logs.length === 0 && <li className="text-white/50">Belum ada log.</li>}
          {logs.map((l) => (
            <li key={l.id} className="flex justify-between gap-2 border-b border-white/10 pb-1">
              <span className="truncate">
                {l.direction === 'sign_to_text' ? 'A' : 'B'} · {l.predictedPhraseId ?? '∅'}
              </span>
              <span className="shrink-0 text-white/70">
                {Math.round(l.confidence * 100)}% · {l.resultedAction} · {l.source}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 py-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/50">{title}</p>
      {children}
    </div>
  );
}
