import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useSyncExternalStore, type ReactNode } from 'react';
import { useSpeechOut } from '@/hooks/useSpeechOut';
import { logsService } from '@/services/logs.service';
import { conversationStore } from '@/state/conversation.store';
import type { ConversationItem, FallbackReason, TabId } from '@/types/kiosk';
import { uid } from '@/lib/utils';

/**
 * Orkestrasi kiosk (PRD-FE §7). Kedua alur berjalan independen, dengan aturan arbitrase:
 *  1. TTS berbunyi  → STT (Bicara) nonaktif sampai TTS selesai + ttsCooldownMs.   [ttsSpeaking]
 *  2. Pasien RECORDING → tombol Bicara nonaktif dengan alasan tertulis.           [signRecording]
 *  3. B_LISTENING / video isyarat diputar → auto-capture kamera di-pause.         [speechActive]
 *  4. ESCALATED (Panggil JBI) → kedua alur di-pause sampai "Kembali".             [escalated]
 * Fallback per sisi (PRD-FE §8): sisi yang gagal beralih ke input manual, sisi lain tetap normal.
 */
type State = {
  tab: TabId;
  escalated: boolean;
  signRecording: boolean;
  speechActive: boolean;
  signFallback: FallbackReason | null;
  speechFallback: FallbackReason | null;
  textScale: 0 | 1 | 2;
};

type Action =
  | { type: 'tab'; tab: TabId }
  | { type: 'escalate'; on: boolean }
  | { type: 'signRecording'; on: boolean }
  | { type: 'speechActive'; on: boolean }
  | { type: 'signFallback'; reason: FallbackReason | null }
  | { type: 'speechFallback'; reason: FallbackReason | null }
  | { type: 'textScale' };

const TABS: TabId[] = ['pasien', 'petugas', 'percakapan'];

/** Tab awal boleh ditentukan lewat `?tab=` (dipakai tautan riwayat dari Dashboard Petugas). */
function initialTab(): TabId {
  if (typeof window === 'undefined') return 'pasien';
  const t = new URLSearchParams(window.location.search).get('tab');
  return TABS.includes(t as TabId) ? (t as TabId) : 'pasien';
}

const initial: State = {
  tab: initialTab(),
  escalated: false,
  signRecording: false,
  speechActive: false,
  signFallback: null,
  speechFallback: null,
  textScale: 0,
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'tab':
      return { ...s, tab: a.tab };
    case 'escalate':
      return { ...s, escalated: a.on };
    case 'signRecording':
      return { ...s, signRecording: a.on };
    case 'speechActive':
      return { ...s, speechActive: a.on };
    case 'signFallback':
      return { ...s, signFallback: a.reason };
    case 'speechFallback':
      return { ...s, speechFallback: a.reason };
    case 'textScale':
      return { ...s, textScale: ((s.textScale + 1) % 3) as State['textScale'] };
  }
}

type Ctx = State & {
  /** Riwayat percakapan dari conversationStore (bertahan saat pindah ke dashboard). */
  conversation: ConversationItem[];
  /**
   * Kiosk sedang ditampilkan sebagai pratinjau di balik LoginGate (belum login).
   * Saat true, fitur yang meminta izin perangkat (kamera/mic) TIDAK boleh menyala.
   */
  preview: boolean;
  ttsSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  setTab: (t: TabId) => void;
  callJbi: (source: 'sign_to_text' | 'speech_to_sign', phraseId?: string | null, confidence?: number) => void;
  closeJbi: () => void;
  setSignRecording: (on: boolean) => void;
  setSpeechActive: (on: boolean) => void;
  setSignFallback: (r: FallbackReason | null) => void;
  setSpeechFallback: (r: FallbackReason | null) => void;
  say: (item: Omit<ConversationItem, 'id' | 'at'>) => void;
  clearConversation: () => void;
  cycleTextScale: () => void;
};

const KioskContext = createContext<Ctx | null>(null);

export function KioskProvider({ children, preview = false }: { children: ReactNode; preview?: boolean }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const tts = useSpeechOut();
  const conversation = useSyncExternalStore(conversationStore.subscribe, conversationStore.list, conversationStore.list);

  const say = useCallback<Ctx['say']>((item) => conversationStore.add({ ...item, id: uid(), at: Date.now() }), []);

  const callJbi = useCallback<Ctx['callJbi']>(
    (direction, phraseId = null, confidence = 0) => {
      tts.cancel();
      logsService.add({ direction, predictedPhraseId: phraseId, confidence, resultedAction: 'escalated_to_jbi', source: 'user' });
      say({ from: 'sistem', text: 'JBI dipanggil ke meja layanan' });
      dispatch({ type: 'escalate', on: true });
    },
    [tts, say],
  );

  // Perbesar teks (PRD §18): skala root font-size, semua ukuran memakai rem.
  useEffect(() => {
    document.documentElement.style.fontSize = ['100%', '112.5%', '125%'][state.textScale];
  }, [state.textScale]);

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      conversation,
      preview,
      ttsSpeaking: tts.speaking,
      speak: tts.speak,
      setTab: (tab) => dispatch({ type: 'tab', tab }),
      callJbi,
      closeJbi: () => dispatch({ type: 'escalate', on: false }),
      setSignRecording: (on) => dispatch({ type: 'signRecording', on }),
      setSpeechActive: (on) => dispatch({ type: 'speechActive', on }),
      setSignFallback: (reason) => dispatch({ type: 'signFallback', reason }),
      setSpeechFallback: (reason) => dispatch({ type: 'speechFallback', reason }),
      say,
      clearConversation: () => conversationStore.clear(),
      cycleTextScale: () => dispatch({ type: 'textScale' }),
    }),
    [state, conversation, preview, tts.speaking, tts.speak, callJbi, say],
  );

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error('useKiosk harus dipakai di dalam <KioskProvider>');
  return ctx;
}
