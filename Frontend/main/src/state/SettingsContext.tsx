import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Pengaturan tampilan siswa (halaman Profil). Disimpan di localStorage perangkat ini.
 *  - textScale    perbesar teks (root font-size; semua ukuran memakai rem)
 *  - signSpeed    kecepatan animasi isyarat
 *  - autoPlaySign jawaban chatbot baru langsung diperagakan
 *  - autoSpeak    jawaban chatbot baru langsung dibacakan (TTS)
 *  - captions     tampilkan caption di atas animasi isyarat / video
 *  - captionSize  ukuran caption: S, M, L
 */
export type CaptionSize = 'S' | 'M' | 'L';
export type Settings = {
  textScale: 0 | 1 | 2;
  signSpeed: 0.75 | 1 | 1.25;
  autoPlaySign: boolean;
  autoSpeak: boolean;
  captions: boolean;
  captionSize: CaptionSize;
};

const DEFAULTS: Settings = { textScale: 0, signSpeed: 1, autoPlaySign: true, autoSpeak: false, captions: true, captionSize: 'M' };
const KEY = 'isyara.settings';

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return {
      textScale: [0, 1, 2].includes(raw.textScale as number) ? (raw.textScale as Settings['textScale']) : DEFAULTS.textScale,
      signSpeed: [0.75, 1, 1.25].includes(raw.signSpeed as number) ? (raw.signSpeed as Settings['signSpeed']) : DEFAULTS.signSpeed,
      autoPlaySign: typeof raw.autoPlaySign === 'boolean' ? raw.autoPlaySign : DEFAULTS.autoPlaySign,
      autoSpeak: typeof raw.autoSpeak === 'boolean' ? raw.autoSpeak : DEFAULTS.autoSpeak,
      captions: typeof raw.captions === 'boolean' ? raw.captions : DEFAULTS.captions,
      captionSize: ['S', 'M', 'L'].includes(raw.captionSize as string) ? (raw.captionSize as CaptionSize) : DEFAULTS.captionSize,
    };
  } catch {
    return DEFAULTS;
  }
}

type Ctx = Settings & { update: (patch: Partial<Settings>) => void; reset: () => void };
const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(load);

  useEffect(() => {
    document.documentElement.style.fontSize = ['100%', '112.5%', '125%'][s.textScale];
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // penyimpanan diblokir: pengaturan tetap berlaku sampai halaman ditutup
    }
  }, [s]);

  const value = useMemo<Ctx>(() => ({ ...s, update: (patch) => setS((p) => ({ ...p, ...patch })), reset: () => setS(DEFAULTS) }), [s]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings harus dipakai di dalam <SettingsProvider>');
  return ctx;
}

export const TEXT_SCALE_LABEL = ['Normal', 'Besar', 'Sangat besar'] as const;
export const CAPTION_SIZE_LABEL: Record<CaptionSize, string> = { S: 'Kecil', M: 'Sedang', L: 'Besar' };
