import { useCallback, useSyncExternalStore } from 'react';

/**
 * "Materi Saya": materi yang disimpan dan yang terakhir dibuka, per siswa, di localStorage
 * perangkat ini (dummy, ADR-051 D6). Hanya id materi yang disimpan, tanpa data pribadi lain.
 */
type Data = { saved: string[]; recent: { id: string; at: number }[] };

const EMPTY: Data = { saved: [], recent: [] };
const key = (studentId: string) => `isyara.materi.${studentId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, Data>();

function read(studentId: string): Data {
  const hit = cache.get(studentId);
  if (hit) return hit;
  let d = EMPTY;
  try {
    const raw = JSON.parse(localStorage.getItem(key(studentId)) ?? 'null') as Partial<Data> | null;
    if (raw && Array.isArray(raw.saved) && Array.isArray(raw.recent)) d = { saved: raw.saved, recent: raw.recent };
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

  return { saved: data.saved, recent: data.recent, toggleSaved, markOpened, isSaved: (id: string) => data.saved.includes(id) };
}
