import { useSyncExternalStore } from 'react';
import { chatService, type ChatSession } from './chat.service';

/**
 * Daftar percakapan siswa, dipakai bersama oleh sidebar (Percakapan terakhir), halaman Riwayat dan
 * Tanya ISYARA. Satu sumber data di memori; diisi dari GET /api/chat/sessions.
 */
type State = { sessions: ChatSession[]; loading: boolean; loaded: boolean; error: boolean };

let state: State = { sessions: [], loading: false, loaded: false, error: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

let inflight: Promise<void> | null = null;

export const sessionsStore = {
  refresh(): Promise<void> {
    if (inflight) return inflight;
    set({ loading: true });
    inflight = chatService
      .listSessions()
      .then((sessions) => set({ sessions, loaded: true, error: false }))
      .catch(() => set({ error: true, loaded: true }))
      .finally(() => {
        set({ loading: false });
        inflight = null;
      });
    return inflight;
  },
  /** Sesi baru/diperbarui pindah ke paling atas. */
  upsert(s: ChatSession) {
    set({ sessions: [s, ...state.sessions.filter((x) => x.id !== s.id)] });
  },
  replace(s: ChatSession) {
    set({ sessions: state.sessions.map((x) => (x.id === s.id ? s : x)) });
  },
  drop(id: string) {
    set({ sessions: state.sessions.filter((x) => x.id !== id) });
  },
  /** Saat keluar akun: jangan tampilkan riwayat siswa sebelumnya. */
  reset() {
    state = { sessions: [], loading: false, loaded: false, error: false };
    listeners.forEach((l) => l());
  },
};

export function useSessions() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
