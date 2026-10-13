import { VOCABULARY } from '@/data/vocabulary';
import type { TextSegment } from '@/types/kiosk';

/**
 * Tokenizer teks guru / jawaban chatbot → urutan kata kosakata (ADR-050, sementara di FE).
 *
 *   "Halo, selamat pagi! Apa kabarnya?" → [Halo] [Selamat pagi] [Apa kabar]
 *
 * Aturan:
 *  - Huruf kecil, tanda baca dibuang, dipecah per spasi.
 *  - Cocokkan bentuk TERPANJANG dulu (frasa 2–3 kata sebelum 1 kata), jadi "apa kabar" tidak pecah jadi "apa".
 *  - Bentuk = teks kata + `aliases` dari label_map.json (mis. "gimana" → Bagaimana, "makasih" → Terima kasih).
 *  - Akhiran -nya / -lah / -kah / -pun boleh menempel (mis. "kapankah" → Kapan).
 *  - Kata yang tidak ada di kosakata TIDAK ditebak: tetap tampil sebagai teks, tanpa isyarat.
 * Ini pencocokan kamus persis, bukan tebakan model, sehingga hasil yang cocok tidak perlu konfirmasi.
 */
const SUFFIXES = ['nya', 'lah', 'kah', 'pun'];

export const normalizeTokens = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

type Form = { phraseId: string; text: string; tokens: string[] };

const FORMS: Form[] = VOCABULARY.flatMap((v) =>
  [v.text, ...v.aliases].map((f) => ({ phraseId: v.phraseId, text: v.text, tokens: normalizeTokens(f) })),
)
  .filter((f) => f.tokens.length > 0)
  .sort((a, b) => b.tokens.length - a.tokens.length);

const sameWord = (spoken: string, form: string) => spoken === form || SUFFIXES.some((s) => spoken === form + s);

/**
 * Seperti tokenizeUtterance, tetapi kata di luar kosakata TIDAK digabung: tiap kata jadi segmen
 * sendiri, supaya masing-masing bisa diberi gerakan buatan (ADR-051 D5).
 */
export function tokenizeWords(utterance: string): TextSegment[] {
  const tokens = normalizeTokens(utterance);
  const out: TextSegment[] = [];
  let i = 0;
  while (i < tokens.length) {
    const hit = FORMS.find((f) => f.tokens.length <= tokens.length - i && f.tokens.every((t, k) => sameWord(tokens[i + k], t)));
    if (hit) {
      out.push({ phraseId: hit.phraseId, text: hit.text });
      i += hit.tokens.length;
    } else {
      out.push({ phraseId: null, text: tokens[i] });
      i++;
    }
  }
  return out;
}

export function tokenizeUtterance(utterance: string): TextSegment[] {
  const tokens = normalizeTokens(utterance);
  const out: TextSegment[] = [];
  const pushText = (w: string) => {
    const last = out[out.length - 1];
    if (last && last.phraseId === null) last.text += ` ${w}`;
    else out.push({ phraseId: null, text: w });
  };
  let i = 0;
  while (i < tokens.length) {
    const hit = FORMS.find((f) => f.tokens.length <= tokens.length - i && f.tokens.every((t, k) => sameWord(tokens[i + k], t)));
    if (hit) {
      out.push({ phraseId: hit.phraseId, text: hit.text });
      i += hit.tokens.length;
    } else {
      pushText(tokens[i]);
      i++;
    }
  }
  return out;
}
