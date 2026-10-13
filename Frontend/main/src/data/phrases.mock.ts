/**
 * Frasa kiosk kelas (ADR-051). Data FE untuk pilihan manual & frasa cepat.
 * - `speaker`: siapa yang biasanya menyampaikan. Siswa → dicocokkan dari isyarat, guru → dari suara/ketik.
 * - id `label_XX` = label ML (ml/artifacts/label_map.json) → punya animasi kerangka asli.
 * - `videoUrl`: diisi URL Supabase Storage. null = animasi kerangka / gerakan buatan.
 */
export type Category = 'Sapaan' | 'Pertanyaan' | 'Di kelas' | 'Perasaan' | 'Umum' | 'Bantuan';

export type Phrase = {
  id: string;
  text: string;
  category: Category;
  speaker: 'siswa' | 'guru' | 'keduanya';
  keywords: string[];
  videoUrl: string | null;
};

export const PHRASES: Phrase[] = [
  { id: 'label_10', text: 'Terima kasih', category: 'Sapaan', speaker: 'keduanya', keywords: ['kasih'], videoUrl: null },

  // Siswa → guru (kosakata terlatih, bisa dari isyarat)
  { id: 'label_36', text: 'Halo', category: 'Sapaan', speaker: 'keduanya', keywords: ['halo', 'hai'], videoUrl: null },
  { id: 'label_41', text: 'Selamat pagi', category: 'Sapaan', speaker: 'keduanya', keywords: ['selamat', 'pagi'], videoUrl: null },
  { id: 'label_35', text: 'Bingung', category: 'Perasaan', speaker: 'siswa', keywords: ['bingung'], videoUrl: null },
  { id: 'label_01', text: 'Belajar', category: 'Di kelas', speaker: 'siswa', keywords: ['belajar'], videoUrl: null },
  { id: 'label_04', text: 'Ingat', category: 'Di kelas', speaker: 'siswa', keywords: ['ingat'], videoUrl: null },
  { id: 'label_05', text: 'Lagi', category: 'Di kelas', speaker: 'siswa', keywords: ['lagi', 'ulang'], videoUrl: null },
  { id: 'label_06', text: 'Maaf', category: 'Sapaan', speaker: 'keduanya', keywords: ['maaf'], videoUrl: null },
  { id: 'label_25', text: 'Teman', category: 'Umum', speaker: 'siswa', keywords: ['teman'], videoUrl: null },
  { id: 'label_33', text: 'Baik', category: 'Perasaan', speaker: 'keduanya', keywords: ['baik'], videoUrl: null },

  // Siswa → guru (pilihan manual, kalimat kelas)
  { id: 's-ulangi', text: 'Bu/Pak, tolong ulangi', category: 'Bantuan', speaker: 'siswa', keywords: ['tolong', 'ulangi'], videoUrl: null },
  { id: 's-belum-paham', text: 'Saya belum paham', category: 'Bantuan', speaker: 'siswa', keywords: ['belum', 'paham', 'mengerti'], videoUrl: null },
  { id: 's-izin', text: 'Boleh saya izin ke toilet?', category: 'Di kelas', speaker: 'siswa', keywords: ['izin', 'toilet'], videoUrl: null },
  { id: 's-sudah', text: 'Saya sudah selesai', category: 'Di kelas', speaker: 'siswa', keywords: ['sudah', 'selesai'], videoUrl: null },

  // Guru → siswa: frasa cepat = kata umum dari kosakata model (ADR-049 §5).
  { id: 'label_32', text: 'Apa kabar', category: 'Sapaan', speaker: 'guru', keywords: ['apa', 'kabar'], videoUrl: null },
  { id: 'label_39', text: 'Selamat siang', category: 'Sapaan', speaker: 'guru', keywords: ['selamat', 'siang'], videoUrl: null },
  { id: 'label_12', text: 'Apa', category: 'Pertanyaan', speaker: 'guru', keywords: ['apa'], videoUrl: null },
  { id: 'label_17', text: 'Bagaimana', category: 'Pertanyaan', speaker: 'guru', keywords: ['bagaimana', 'gimana'], videoUrl: null },
  { id: 'label_34', text: 'Berapa', category: 'Pertanyaan', speaker: 'guru', keywords: ['berapa'], videoUrl: null },
  { id: 'label_14', text: 'Kapan', category: 'Pertanyaan', speaker: 'guru', keywords: ['kapan'], videoUrl: null },
  { id: 'label_16', text: 'Mengapa', category: 'Pertanyaan', speaker: 'guru', keywords: ['mengapa', 'kenapa'], videoUrl: null },
  { id: 'label_09', text: 'Saya', category: 'Umum', speaker: 'guru', keywords: ['saya', 'aku'], videoUrl: null },
  { id: 'label_37', text: 'Kamu', category: 'Umum', speaker: 'guru', keywords: ['kamu', 'anda'], videoUrl: null },
  { id: 'label_02', text: 'Cari', category: 'Di kelas', speaker: 'guru', keywords: ['cari'], videoUrl: null },
];

export const phraseById = (id: string | null) => PHRASES.find((p) => p.id === id) ?? null;

/** Pilihan manual siswa (kamera mati / server terputus). */
export const studentPhrases = PHRASES.filter((p) => p.speaker !== 'guru');
/** Frasa cepat guru. */
export const teacherPhrases = PHRASES.filter((p) => p.speaker !== 'siswa');
