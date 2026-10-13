/**
 * Folder animasi kerangka BISINDO.
 *  - data/               JSON hasil ekspor ML (satu file per kata)
 *  - registry.ts         daftar kata yang punya animasi
 *  - skeleton.config.ts  kecepatan, warna, jeda, dll. (paling sering diedit)
 *  - processSkeleton.ts  perapian data (kiri/kanan, celah, tangan istirahat)
 *  - SkeletonPlayer.tsx  komponen yang menggambar animasinya
 */
export { SkeletonPlayer } from './SkeletonPlayer';
export { getSkeletonClip } from './registry';
export { SKELETON } from './skeleton.config';
export type { SkeletonClip } from './types';
