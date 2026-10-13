import { createContext, useCallback, useContext, useMemo, useReducer, useSyncExternalStore, type ReactNode } from 'react';
import { useSpeechOut } from '@/hooks/useSpeechOut';
import { conversationStore } from '@/state/conversation.store';
import type { ConversationItem, FallbackReason, TabId } from '@/types/kiosk';
import { uid } from '@/lib/utils';

/**
 * Orkestrasi mode Kiosk kelas (PRD-FE §7). Kedua alur berjalan independen, dengan aturan arbitrase:
 *  1. TTS berbunyi  → STT (Bicara) nonaktif sampai TTS selesai + ttsCooldownMs.   [ttsSpeaking]
 *  2. Siswa RECORDING → tombol Bicara guru nonaktif dengan alasan tertulis.      [signRecording]
 *  3. B_LISTENING / animasi isyarat diputar → auto-capture kamera di-pause.       [speechActive]
 * Fallback per sisi (PRD-FE §8): sisi yang gagal beralih ke input manual, sisi lain tetap normal.
 * Eskalasi JBI dihapus (ADR-051): hasil yang tidak dikenali cukup diulang atau diketik.
 */
type State = {
  tab: TabId;
  signRecording: boolean;
  speechActive: boolean;
  signFallback: FallbackReason | null;
  speechFallback: FallbackReason | null;
};

type Action =
  | { type: 'tab'; tab: TabId }
  | { type: 'signRecording'; on: boolean }
  | { type: 'speechActive'; on: boolean }
  | { type: 'signFallback'; reason: FallbackReason | null }
  | { type: 'speechFallback'; reason: FallbackReason | null };

const TABS: TabId[] = ['siswa', 'guru', 'percakapan'];

function initialTab(): TabId {
  if (typeof window === 'undefined') return 'siswa';
  const t = new URLSearchParams(window.location.search).get('tab');
  return TABS.includes(t as TabId) ? (t as TabId) : 'siswa';
}

const initial = (): State => ({ tab: initialTab(), signRecording: false, speechActive: false, signFallback: null, speechFallback: null });

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'tab':
      return { ...s, tab: a.tab };
    case 'signRecording':
      return { ...s, signRecording: a.on };
    case 'speechActive':
      return { ...s, speechActive: a.on };
    case 'signFallback':
      return { ...s, signFallback: a.reason };
    case 'speechFallback':
      return { ...s, speechFallback: a.reason };
  }
}

type Ctx = State & {
  conversation: ConversationItem[];
  /** true = ditampilkan sebagai pratinjau; kamera/mic TIDAK boleh menyala. */
  preview: boolean;
  ttsSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  setTab: (t: TabId) => void;
  setSignRecording: (on: boolean) => void;
  setSpeechActive: (on: boolean) => void;
  setSignFallback: (r: FallbackReason | null) => void;
  setSpeechFallback: (r: FallbackReason | null) => void;
  say: (item: Omit<ConversationItem, 'id' | 'at'>) => void;
  clearConversation: () => void;
};

const KioskContext = createContext<Ctx | null>(null);

export function KioskProvider({ children, preview = false }: { children: ReactNode; preview?: boolean }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const tts = useSpeechOut();
  const conversation = useSyncExternalStore(conversationStore.subscribe, conversationStore.list, conversationStore.list);

  const say = useCallback<Ctx['say']>((item) => conversationStore.add({ ...item, id: uid(), at: Date.now() }), []);

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      conversation,
      preview,
      ttsSpeaking: tts.speaking,
      speak: tts.speak,
      setTab: (tab) => dispatch({ type: 'tab', tab }),
      setSignRecording: (on) => dispatch({ type: 'signRecording', on }),
      setSpeechActive: (on) => dispatch({ type: 'speechActive', on }),
      setSignFallback: (reason) => dispatch({ type: 'signFallback', reason }),
      setSpeechFallback: (reason) => dispatch({ type: 'speechFallback', reason }),
      say,
      clearConversation: () => conversationStore.clear(),
    }),
    [state, conversation, preview, tts.speaking, tts.speak, say],
  );

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error('useKiosk harus dipakai di dalam <KioskProvider>');
  return ctx;
}
