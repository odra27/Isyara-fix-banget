/**
 * Folder animasi kerangka BISINDO.
 *  - data/               JSON hasil ekspor ML (satu file per kata, 43 kata)
 *  - registry.ts         daftar kata yang punya animasi asli
 *  - generated.ts        gerakan buatan untuk kata di luar kosakata (dijamin beda dari yang asli)
 *  - sentence.ts         kalimat → urutan klip (asli + buatan)
 *  - skeleton.config.ts  kecepatan, warna, jeda, dll. (paling sering diedit)
 *  - processSkeleton.ts  perapian data (kiri/kanan, celah, tangan istirahat)
 *  - SkeletonPlayer.tsx  komponen yang menggambar animasinya
 */
export { SkeletonPlayer } from './SkeletonPlayer';
export { getSkeletonClip } from './registry';
export { generatedClip } from './generated';
export { clipsForSegments, signWordsForText, type SignWord } from './sentence';
export { SKELETON } from './skeleton.config';
export type { SkeletonClip } from './types';
