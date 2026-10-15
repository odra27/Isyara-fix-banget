// Salin aset MediaPipe ke public/mediapipe/ supaya kiosk tidak butuh CDN/internet:
//   - wasm runtime dari node_modules/@mediapipe/tasks-vision/wasm
//   - model .task dari ml/mp_models (model yang SAMA dengan training, lihat SYSTEM_DESIGN.md §9.3)
// Dijalankan otomatis oleh `npm run dev` / `npm run build` (script predev/prebuild).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'mediapipe');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const modelsSrc = resolve(root, '..', '..', 'ml', 'mp_models');
const models = ['hand_landmarker.task', 'pose_landmarker_lite.task'];

if (!existsSync(wasmSrc)) {
  console.error('[mediapipe] node_modules/@mediapipe/tasks-vision belum ada. Jalankan npm install.');
  process.exit(1);
}
mkdirSync(join(out, 'models'), { recursive: true });
cpSync(wasmSrc, join(out, 'wasm'), { recursive: true });
for (const m of models) {
  const src = join(modelsSrc, m);
  if (!existsSync(src)) {
    console.error(`[mediapipe] ${src} tidak ditemukan. Pastikan folder ml/ (branch modeling) ada.`);
    process.exit(1);
  }
  cpSync(src, join(out, 'models', m));
}
console.log('[mediapipe] aset disalin ke public/mediapipe');
