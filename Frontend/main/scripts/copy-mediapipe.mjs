// Salin aset MediaPipe ke public/mediapipe/ supaya app tidak butuh CDN/internet:
//   - wasm runtime dari node_modules/@mediapipe/tasks-vision/wasm
//   - model .task dari Frontend/main/models/ (di-commit, supaya build di Vercel/Railway yang hanya
//     melihat folder Frontend/main tetap jalan). Isinya HARUS sama dengan ml/mp_models (model yang
//     sama dengan training, lihat SYSTEM_DESIGN.md §9.3). Bila ml/mp_models ada (dev lokal), file di
//     models/ diperbarui otomatis dari sana.
// Dijalankan otomatis oleh `npm run dev` / `npm run build` (script predev/prebuild).
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'mediapipe');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const localModels = join(root, 'models');
const mlModels = resolve(root, '..', '..', 'ml', 'mp_models');
const models = ['hand_landmarker.task', 'pose_landmarker_lite.task'];

if (!existsSync(wasmSrc)) {
  console.error('[mediapipe] node_modules/@mediapipe/tasks-vision belum ada. Jalankan npm install.');
  process.exit(1);
}
mkdirSync(join(out, 'models'), { recursive: true });
mkdirSync(localModels, { recursive: true });
cpSync(wasmSrc, join(out, 'wasm'), { recursive: true });

const same = (a, b) => existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b));

for (const m of models) {
  const fromMl = join(mlModels, m);
  const local = join(localModels, m);
  // Dev lokal: ml/mp_models adalah sumber aslinya; salinan di models/ ikut diperbarui.
  if (existsSync(fromMl) && !same(fromMl, local)) {
    cpSync(fromMl, local);
    console.log(`[mediapipe] models/${m} diperbarui dari ml/mp_models (commit file ini)`);
  }
  if (!existsSync(local)) {
    console.error(`[mediapipe] ${local} tidak ditemukan. Salin dari ml/mp_models/${m}.`);
    process.exit(1);
  }
  cpSync(local, join(out, 'models', m));
}
console.log('[mediapipe] aset disalin ke public/mediapipe');
