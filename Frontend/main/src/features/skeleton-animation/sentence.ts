import { tokenizeWords } from '@/services/textMatch';
import type { TextSegment } from '@/types/kiosk';
import { generatedClip } from './generated';
import { getSkeletonClip } from './registry';
import type { SkeletonClip } from './types';

/** Satu kata dalam animasi kalimat. `trained` = gerakan asli dari rekaman BISINDO. */
export type SignWord = { text: string; phraseId: string | null; clip: SkeletonClip; trained: boolean };

/** Batas kata yang diperagakan dalam satu jawaban, supaya animasi tidak terlalu panjang. */
export const MAX_SIGNED_WORDS = 80;

/**
 * Segmen teks → klip untuk SkeletonPlayer. Kata kosakata memakai rekaman asli; kata lain
 * (atau kosakata yang belum punya ekspor) memakai gerakan buatan yang dijamin berbeda.
 */
export function clipsForSegments(segments: TextSegment[]): SignWord[] {
  return segments.slice(0, MAX_SIGNED_WORDS).map((s) => {
    const real = getSkeletonClip(s.phraseId);
    return real
      ? { text: s.text, phraseId: s.phraseId, clip: real, trained: true }
      : { text: s.text, phraseId: s.phraseId, clip: generatedClip(s.text), trained: false };
  });
}

/** Kalimat bebas (mis. jawaban chatbot) → urutan kata beranimasi. */
export const signWordsForText = (text: string): SignWord[] => clipsForSegments(tokenizeWords(text));
