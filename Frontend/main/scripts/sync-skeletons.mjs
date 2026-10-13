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

// Semua 43 kata model (ADR-051): jawaban chatbot & kalimat guru bisa memakai kata mana pun.
const IDS = Array.from({ length: 43 }, (_, i) => `label_${String(i).padStart(2, '0')}`);

// File yang sudah ada TIDAK ditimpa (kecuali --force), karena sebagian sudah diberi titik muka asli
// oleh scripts/add-skeleton-face.py dan ekspor ML tidak membawa muka.
const force = process.argv.includes('--force');

const unmirror = (p) => [Math.round((1 - p[0]) * 1e4) / 1e4, p[1]];

mkdirSync(out, { recursive: true });
const missing = [];
for (const id of IDS) {
  const f = join(src, `${id}.json`);
  if (!existsSync(f)) {
    missing.push(id);
    continue;
  }
  if (!force && existsSync(join(out, `${id}.json`))) {
    console.log(`skip ${id} (sudah ada, pakai --force untuk menimpa)`);
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
