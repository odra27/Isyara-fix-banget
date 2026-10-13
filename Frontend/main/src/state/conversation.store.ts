import type { ConversationItem } from '@/types/kiosk';

/**
 * Riwayat percakapan sesi ini.
 *
 * Disimpan di level modul (bukan di dalam KioskProvider) supaya riwayat tetap ada
 * saat petugas berpindah antara kiosk dan Dashboard Petugas. Tetap HANYA di memori:
 * tidak ditulis ke storage dan hilang saat halaman dimuat ulang (PRD §17).
 */
const MAX_ITEMS = 50;

/** Snapshot di-cache agar referensinya stabil untuk useSyncExternalStore. */
let snapshot: ConversationItem[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const conversationStore = {
  list: () => snapshot,

  add(item: ConversationItem) {
    snapshot = [...snapshot, item].slice(-MAX_ITEMS);
    emit();
  },

  clear() {
    if (snapshot.length === 0) return;
    snapshot = [];
    emit();
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
