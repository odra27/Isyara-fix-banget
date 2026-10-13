import type { SkeletonClip } from './types';

/**
 * Daftar animasi kerangka, dikunci dengan phraseId (= id label ML, mis. label_10).
 * Semua file di data/ otomatis terdaftar. Untuk menambah / memperbarui kata:
 *   1. Tim modeling: `ml/scripts/export_skeleton.py --label <nomor>` → ml/exports/skeleton/label_XX.json
 *   2. Dari Frontend/main: `node scripts/sync-skeletons.mjs`
 * Kata di luar kosakata memakai gerakan buatan (generated.ts).
 */
const files = import.meta.glob<SkeletonClip>('./data/label_*.json', { eager: true, import: 'default' });

const CLIPS: Record<string, SkeletonClip> = Object.fromEntries(
  Object.values(files).map((clip) => [clip.phraseId, clip]),
);

export function getSkeletonClip(phraseId: string | null | undefined): SkeletonClip | null {
  return phraseId ? (CLIPS[phraseId] ?? null) : null;
}

/** Semua klip terlatih (dipakai generated.ts untuk memastikan gerakan buatan tidak sama). */
export const allSkeletonClips = (): SkeletonClip[] => Object.values(CLIPS);
