import type { SignerTone } from '@/components/ui/signer-avatar';

/**
 * Materi pembelajaran DUMMY (ADR-051 D6). Belum ada CMS / upload materi: video asli diganti
 * avatar placeholder, dan tiap bagian diperagakan dengan animasi isyarat dari teks `caption`.
 * Ganti dengan data dari BE saat tabel materi tersedia.
 */
export type Subject = 'Matematika' | 'Bahasa Indonesia' | 'IPA' | 'IPS' | 'Bahasa Inggris' | 'Lainnya';

export type MateriSection = { title: string; caption: string };

export type Materi = {
  id: string;
  title: string;
  subject: Subject;
  grade: number;
  /** Durasi video asli (placeholder). */
  duration: string;
  summary: string;
  tone: SignerTone;
  /** Gradien thumbnail. */
  bg: string;
  sections: MateriSection[];
  /** Pertanyaan pembuka untuk tombol "Tanya chatbot". */
  ask: string;
};

export const SUBJECTS: readonly Subject[] = ['Matematika', 'Bahasa Indonesia', 'IPA', 'IPS', 'Bahasa Inggris', 'Lainnya'];

export const MATERI: Materi[] = [
  {
    id: 'siklus-air',
    title: 'Siklus Air',
    subject: 'IPA',
    grade: 5,
    duration: '06:24',
    summary: 'Perjalanan air dari laut ke awan, turun jadi hujan, lalu kembali lagi.',
    tone: 'ink',
    bg: 'from-[#e6e4f7] via-[#efeefa] to-white',
    sections: [
      { title: 'Evaporasi', caption: 'Hari ini kita belajar siklus air. Matahari memanaskan air, lalu air menguap.' },
      { title: 'Kondensasi', caption: 'Uap air naik ke langit, menjadi dingin, lalu berubah menjadi awan.' },
      { title: 'Presipitasi', caption: 'Awan menjadi berat, lalu air turun sebagai hujan.' },
      { title: 'Infiltrasi', caption: 'Air hujan meresap ke dalam tanah dan kembali ke sungai dan laut.' },
    ],
    ask: 'Jelaskan siklus air dengan sederhana',
  },
  {
    id: 'bangun-datar',
    title: 'Bangun Datar',
    subject: 'Matematika',
    grade: 4,
    duration: '08:12',
    summary: 'Mengenal persegi, persegi panjang, segitiga, dan lingkaran.',
    tone: 'brand',
    bg: 'from-[#ddd5f5] via-[#ebe6fb] to-white',
    sections: [
      { title: 'Persegi', caption: 'Persegi punya empat sisi yang sama panjang.' },
      { title: 'Persegi panjang', caption: 'Persegi panjang punya dua sisi panjang dan dua sisi pendek.' },
      { title: 'Segitiga', caption: 'Segitiga punya tiga sisi dan tiga sudut.' },
      { title: 'Lingkaran', caption: 'Lingkaran tidak punya sudut. Bentuknya bulat.' },
    ],
    ask: 'Apa bedanya persegi dan persegi panjang?',
  },
  {
    id: 'perkenalan-diri',
    title: 'Perkenalan Diri',
    subject: 'Bahasa Indonesia',
    grade: 1,
    duration: '07:36',
    summary: 'Belajar menyapa dan memperkenalkan diri kepada teman.',
    tone: 'violet',
    bg: 'from-[#e9e3f8] via-[#f2eefc] to-white',
    sections: [
      { title: 'Menyapa', caption: 'Halo, selamat pagi. Apa kabar?' },
      { title: 'Nama', caption: 'Saya Nadia. Siapa nama kamu?' },
      { title: 'Rumah', caption: 'Rumah saya dekat sekolah.' },
      { title: 'Penutup', caption: 'Senang bertemu kamu, teman. Terima kasih.' },
    ],
    ask: 'Bantu aku membuat kalimat perkenalan diri',
  },
  {
    id: 'tata-surya',
    title: 'Tata Surya',
    subject: 'IPA',
    grade: 6,
    duration: '05:18',
    summary: 'Matahari dan delapan planet yang mengelilinginya.',
    tone: 'ink',
    bg: 'from-[#e3e1f2] via-[#eeedf8] to-white',
    sections: [
      { title: 'Matahari', caption: 'Matahari adalah bintang. Matahari ada di tengah tata surya.' },
      { title: 'Planet', caption: 'Ada delapan planet yang mengelilingi matahari.' },
      { title: 'Bumi', caption: 'Bumi adalah planet ketiga. Kita tinggal di bumi.' },
    ],
    ask: 'Sebutkan planet di tata surya',
  },
  {
    id: 'simple-present',
    title: 'Simple Present Tense',
    subject: 'Bahasa Inggris',
    grade: 7,
    duration: '09:42',
    summary: 'Kalimat untuk kebiasaan dan fakta sehari-hari.',
    tone: 'violet',
    bg: 'from-[#e8e0f7] via-[#f1ecfb] to-white',
    sections: [
      { title: 'Kebiasaan', caption: 'Simple present dipakai untuk kebiasaan. I study every day.' },
      { title: 'Rumus', caption: 'Subjek ditambah kata kerja. She studies, they study.' },
      { title: 'Contoh', caption: 'I go to school in the morning.' },
    ],
    ask: 'Beri contoh kalimat simple present tense',
  },
  {
    id: 'alat-transportasi',
    title: 'Alat Transportasi',
    subject: 'IPS',
    grade: 3,
    duration: '06:57',
    summary: 'Transportasi darat, laut, dan udara di sekitar kita.',
    tone: 'brand',
    bg: 'from-[#dfdaf3] via-[#ece9f9] to-white',
    sections: [
      { title: 'Darat', caption: 'Motor, mobil, dan bus adalah transportasi darat.' },
      { title: 'Laut', caption: 'Kapal dan perahu berjalan di laut.' },
      { title: 'Udara', caption: 'Pesawat terbang di udara.' },
    ],
    ask: 'Apa saja contoh alat transportasi darat?',
  },
  {
    id: 'persentase',
    title: 'Mengenal Persentase',
    subject: 'Matematika',
    grade: 6,
    duration: '07:05',
    summary: 'Persen artinya per seratus. Contoh diskon dan nilai ulangan.',
    tone: 'ink',
    bg: 'from-[#e4e0f6] via-[#efedfa] to-white',
    sections: [
      { title: 'Arti persen', caption: 'Persen artinya per seratus. Lima puluh persen sama dengan setengah.' },
      { title: 'Contoh', caption: 'Ada seratus permen. Sepuluh permen merah. Berapa persen permen merah? Sepuluh persen.' },
    ],
    ask: 'Apa itu persentase?',
  },
  {
    id: 'warna',
    title: 'Mengenal Warna',
    subject: 'Lainnya',
    grade: 1,
    duration: '04:40',
    summary: 'Merah, kuning, hijau, dan hitam dalam bahasa isyarat.',
    tone: 'violet',
    bg: 'from-[#ece4f8] via-[#f4effc] to-white',
    sections: [
      { title: 'Merah', caption: 'Apel ini merah.' },
      { title: 'Kuning', caption: 'Pisang itu kuning.' },
      { title: 'Hijau', caption: 'Daun itu hijau.' },
      { title: 'Hitam', caption: 'Rambut saya hitam.' },
    ],
    ask: 'Benda apa saja yang berwarna hijau?',
  },
];

export const materiById = (id: string | undefined) => MATERI.find((m) => m.id === id) ?? null;

export const subjectLabel = (m: Materi) => `${m.subject} · Kelas ${m.grade}`;
