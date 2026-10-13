// Salin animasi kerangka dari ml/exports/skeleton (hasil ml/scripts/export_skeleton.py) ke
// src/features/skeleton-animation/data/, dalam format yang dibaca SkeletonPlayer.
//
// Pemakaian (dari Frontend/main):  node scripts/sync-skeletons.mjs
//
// Ekspor ML sudah di-mirror (x' = 1 - x) dengan tangan {right, left}. Player kiosk memakai koordinat
// gambar asli (tidak di-mirror) dan daftar tangan [{side, pts}], jadi di sini x dibalik lagi.
// Hanya titik kerangka, tanpa piksel / wajah.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, '..', '..', 'ml', 'exports', 'skeleton');
const out = join(root, 'src', 'features', 'skeleton-animation', 'data');

// Kata di "Frasa cepat" petugas (src/data/phrases.mock.ts) yang ada di kosakata model.
const IDS = [
  'label_09', 'label_10', 'label_12', 'label_14', 'label_17',
  'label_32', 'label_33', 'label_34', 'label_35', 'label_36', 'label_37', 'label_38',
  'label_39', 'label_40', 'label_41', 'label_42',
];

const unmirror = (p) => [Math.round((1 - p[0]) * 1e4) / 1e4, p[1]];

mkdirSync(out, { recursive: true });
const missing = [];
for (const id of IDS) {
  const f = join(src, `${id}.json`);
  if (!existsSync(f)) {
    missing.push(id);
    continue;
  }
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const clip = {
    phraseId: d.phraseId,
    text: d.text,
    clip: d.clip,
    source: d.source,
    fps: d.fps,
    durationMs: d.durationMs,
    width: d.width,
    height: d.height,
    mirrored: false,
    posePoints: d.posePoints,
    frames: d.frames.map((fr) => ({
      t: fr.t,
      pose: fr.pose ? fr.pose.map(unmirror) : null,
      hands: [
        ...(fr.hands.right ? [{ side: 'Right', pts: fr.hands.right.map(unmirror) }] : []),
        ...(fr.hands.left ? [{ side: 'Left', pts: fr.hands.left.map(unmirror) }] : []),
      ],
    })),
  };
  writeFileSync(join(out, `${id}.json`), JSON.stringify(clip));
  console.log(`ok ${id} ${d.text} (${d.clip}, ${d.frames.length} frame)`);
}
if (missing.length) {
  console.warn(`belum ada ekspor untuk: ${missing.join(', ')}`);
  console.warn('  minta tim modeling jalankan: python scripts/export_skeleton.py --label <nomor>, lalu commit ml/exports/skeleton/');
}
