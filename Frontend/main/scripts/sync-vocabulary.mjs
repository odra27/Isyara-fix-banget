// Salin kosakata model (ml/artifacts/label_map.json + model_info.json) ke src/data/vocabulary.ts.
// Dipakai tokenizer teks petugas (src/services/textMatch.ts). Jalankan ulang bila model diganti:
//   node scripts/sync-vocabulary.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const art = resolve(root, '..', '..', 'ml', 'artifacts');
const labelMap = JSON.parse(readFileSync(join(art, 'label_map.json'), 'utf8'));
const info = JSON.parse(readFileSync(join(art, 'model_info.json'), 'utf8'));
const version = JSON.parse(readFileSync(join(art, 'version.json'), 'utf8')).version;

const rows = info.known_labels.map((l) => {
  const e = labelMap[String(l)];
  return { phraseId: e.phraseId, text: e.text, aliases: e.aliases ?? [] };
});

const body = `/**
 * Kosakata model (${rows.length} kata), artefak ${version}. JANGAN diedit manual:
 * dibuat oleh scripts/sync-vocabulary.mjs dari ml/artifacts/label_map.json.
 */
export type VocabEntry = { phraseId: string; text: string; aliases: string[] };

export const VOCABULARY: VocabEntry[] = ${JSON.stringify(rows, null, 2)};
`;
writeFileSync(join(root, 'src', 'data', 'vocabulary.ts'), body);
console.log(`ok ${rows.length} kata (${version})`);
