/**
 * Kosakata demo (PRD §7). Ini data mock untuk FE. Sumber kebenaran nanti tabel `phrases` di Supabase.
 * - `speaker`: siapa yang biasanya menyampaikan frasa. Pasien → dicocokkan dari isyarat, petugas → dari suara.
 * - `keywords`: HANYA untuk mock matchText (pengganti embedding). BE asli memakai sentence embedding.
 * - `videoUrl`: diisi URL Supabase Storage. null = placeholder video.
 */
export type Category = 'Sapaan' | 'Pertanyaan' | 'Umum' | 'Pendaftaran' | 'Keluhan' | 'Obat' | 'Administrasi' | 'Fallback';

export type Phrase = {
  id: string;
  text: string;
  category: Category;
  speaker: 'pasien' | 'petugas' | 'keduanya';
  keywords: string[];
  videoUrl: string | null;
};

export const PHRASES: Phrase[] = [
  // id = label ML (label_10) → punya animasi kerangka asli di features/skeleton-animation
  { id: 'label_10', text: 'Terima kasih', category: 'Sapaan', speaker: 'keduanya', keywords: ['kasih'], videoUrl: null },

  // Pasien → petugas (isyarat)
  { id: 'p-berobat', text: 'Saya ingin berobat', category: 'Pendaftaran', speaker: 'pasien', keywords: ['ingin', 'berobat'], videoUrl: null },
  { id: 'p-janji', text: 'Saya punya janji', category: 'Pendaftaran', speaker: 'pasien', keywords: ['punya', 'janji'], videoUrl: null },
  { id: 'p-sakit-sini', text: 'Saya sakit di sini', category: 'Keluhan', speaker: 'pasien', keywords: ['sakit', 'sini'], videoUrl: null },
  { id: 'p-demam', text: 'Saya demam', category: 'Keluhan', speaker: 'pasien', keywords: ['demam', 'panas'], videoUrl: null },
  { id: 'p-pusing', text: 'Saya pusing', category: 'Keluhan', speaker: 'pasien', keywords: ['pusing'], videoUrl: null },
  { id: 'p-alergi', text: 'Saya alergi obat ini', category: 'Obat', speaker: 'pasien', keywords: ['alergi', 'obat'], videoUrl: null },
  { id: 'p-resep', text: 'Saya butuh resep', category: 'Obat', speaker: 'pasien', keywords: ['butuh', 'resep'], videoUrl: null },

  // Petugas → pasien: frasa cepat = kata umum dari kosakata model (ADR-049 §5).
  // id = label ML (ml/artifacts/label_map.json), supaya cocok dengan tabel `phrases` di BE.
  { id: 'label_36', text: 'Halo', category: 'Sapaan', speaker: 'petugas', keywords: ['halo', 'hai'], videoUrl: null },
  { id: 'label_32', text: 'Apa kabar', category: 'Sapaan', speaker: 'petugas', keywords: ['apa', 'kabar'], videoUrl: null },
  { id: 'label_33', text: 'Baik', category: 'Sapaan', speaker: 'petugas', keywords: ['baik'], videoUrl: null },
  { id: 'label_41', text: 'Selamat pagi', category: 'Sapaan', speaker: 'petugas', keywords: ['selamat', 'pagi'], videoUrl: null },
  { id: 'label_39', text: 'Selamat siang', category: 'Sapaan', speaker: 'petugas', keywords: ['selamat', 'siang'], videoUrl: null },
  { id: 'label_40', text: 'Selamat sore', category: 'Sapaan', speaker: 'petugas', keywords: ['selamat', 'sore'], videoUrl: null },
  { id: 'label_42', text: 'Selamat malam', category: 'Sapaan', speaker: 'petugas', keywords: ['selamat', 'malam'], videoUrl: null },
  { id: 'label_12', text: 'Apa', category: 'Pertanyaan', speaker: 'petugas', keywords: ['apa'], videoUrl: null },
  { id: 'label_17', text: 'Bagaimana', category: 'Pertanyaan', speaker: 'petugas', keywords: ['bagaimana', 'gimana'], videoUrl: null },
  { id: 'label_34', text: 'Berapa', category: 'Pertanyaan', speaker: 'petugas', keywords: ['berapa'], videoUrl: null },
  { id: 'label_14', text: 'Kapan', category: 'Pertanyaan', speaker: 'petugas', keywords: ['kapan'], videoUrl: null },
  { id: 'label_09', text: 'Saya', category: 'Umum', speaker: 'petugas', keywords: ['saya', 'aku'], videoUrl: null },
  { id: 'label_37', text: 'Kamu', category: 'Umum', speaker: 'petugas', keywords: ['kamu', 'anda'], videoUrl: null },
  { id: 'label_35', text: 'Bingung', category: 'Umum', speaker: 'petugas', keywords: ['bingung'], videoUrl: null },
  { id: 'label_38', text: 'Tidur', category: 'Umum', speaker: 'petugas', keywords: ['tidur'], videoUrl: null },

  // Pasien → petugas (pilihan manual)
  { id: 's-kontrol', text: 'Kapan kontrol berikutnya?', category: 'Administrasi', speaker: 'pasien', keywords: ['kontrol', 'kapan', 'lagi', 'berikutnya'], videoUrl: null },
  { id: 's-ruang-obat', text: 'Di mana ruang obat?', category: 'Administrasi', speaker: 'pasien', keywords: ['mana', 'ruang', 'obat', 'apotek'], videoUrl: null },

  // Fallback (wajib ada)
  { id: 'f-tidak-mengerti', text: 'Saya tidak mengerti', category: 'Fallback', speaker: 'keduanya', keywords: ['tidak', 'mengerti', 'paham'], videoUrl: null },
  { id: 'f-ulangi', text: 'Tolong ulangi', category: 'Fallback', speaker: 'keduanya', keywords: ['tolong', 'ulangi', 'lagi'], videoUrl: null },
  { id: 'f-jbi', text: 'Panggil JBI', category: 'Fallback', speaker: 'keduanya', keywords: ['panggil', 'jbi', 'juru', 'bahasa'], videoUrl: null },
];

export const phraseById = (id: string | null) => PHRASES.find((p) => p.id === id) ?? null;

export const patientPhrases = PHRASES.filter((p) => p.speaker !== 'petugas' && p.id !== 'f-jbi');
/** Frasa cepat petugas: kata umum dari kosakata model + "Terima kasih". */
export const officerPhrases = PHRASES.filter((p) => p.speaker === 'petugas' || p.id === 'label_10');
