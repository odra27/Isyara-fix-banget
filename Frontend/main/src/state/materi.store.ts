import { useCallback, useSyncExternalStore } from 'react';

/**
 * Video Pelajaran & Materi Saya, per siswa, di localStorage perangkat ini:
 *  - saved     video yang disimpan
 *  - recent    video yang terakhir dibuka
 *  - progress  posisi menonton per video (bagian terakhir + selesai), untuk "Lanjutkan menonton"
 *  - chats     percakapan "tanya dari video" per video (id sesi chat di BE)
 * Hanya id materi / id sesi yang disimpan, tanpa data pribadi lain.
 */
export type Progress = { section: number; done: boolean; at: number };
type Data = {
  saved: string[];
  recent: { id: string; at: number }[];
  progress: Record<string, Progress>;
  chats: Record<string, string>;
};

const EMPTY: Data = { saved: [], recent: [], progress: {}, chats: {} };
const key = (studentId: string) => `isyara.materi.${studentId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, Data>();

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function read(studentId: string): Data {
  const hit = cache.get(studentId);
  if (hit) return hit;
  let d = EMPTY;
  try {
    const raw = JSON.parse(localStorage.getItem(key(studentId)) ?? 'null') as Partial<Data> | null;
    if (raw && Array.isArray(raw.saved) && Array.isArray(raw.recent)) {
      d = {
        saved: raw.saved,
        recent: raw.recent,
        progress: isObj(raw.progress) ? (raw.progress as Data['progress']) : {},
        chats: isObj(raw.chats) ? (raw.chats as Data['chats']) : {},
      };
    }
  } catch {
    d = EMPTY;
  }
  cache.set(studentId, d);
  return d;
}

function write(studentId: string, d: Data) {
  cache.set(studentId, d);
  try {
    localStorage.setItem(key(studentId), JSON.stringify(d));
  } catch {
    // tetap berlaku di memori
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useMateriStore(studentId: string) {
  const data = useSyncExternalStore(subscribe, () => read(studentId), () => EMPTY);

  const toggleSaved = useCallback(
    (id: string) => {
      const d = read(studentId);
      write(studentId, { ...d, saved: d.saved.includes(id) ? d.saved.filter((x) => x !== id) : [id, ...d.saved] });
    },
    [studentId],
  );

  const markOpened = useCallback(
    (id: string) => {
      const d = read(studentId);
      write(studentId, { ...d, recent: [{ id, at: Date.now() }, ...d.recent.filter((r) => r.id !== id)].slice(0, 12) });
    },
    [studentId],
  );

  const setProgress = useCallback(
    (id: string, section: number, done: boolean) => {
      const d = read(studentId);
      const prev = d.progress[id];
      if (prev && prev.section === section && prev.done === done) return;
      // Sekali selesai tetap selesai (menonton ulang tidak menghapus centang).
      write(studentId, { ...d, progress: { ...d.progress, [id]: { section, done: done || !!prev?.done, at: Date.now() } } });
    },
    [studentId],
  );

  const setChat = useCallback(
    (videoId: string, sessionId: string | null) => {
      const d = read(studentId);
      const chats = { ...d.chats };
      if (sessionId) chats[videoId] = sessionId;
      else delete chats[videoId];
      write(studentId, { ...d, chats });
    },
    [studentId],
  );

  return {
    saved: data.saved,
    recent: data.recent,
    progress: data.progress,
    chats: data.chats,
    toggleSaved,
    markOpened,
    setProgress,
    setChat,
    isSaved: (id: string) => data.saved.includes(id),
  };
}
