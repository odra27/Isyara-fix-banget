import type { SignerTone } from '@/components/ui/signer-avatar';

/**
 * Video pelajaran (ADR-051 D6, ADR-053 D3). Sumber materi adalah BUKU PELAJARAN (bukan guru
 * pengampu): tiap bagian diperagakan dengan animasi isyarat dari teks `caption`.
 *
 * Judul buku, sumber, dan kelas memakai buku teks yang benar-benar ada (mayoritas buku Kurikulum
 * Merdeka terbitan Pusat Perbukuan Kemendikbudristek) supaya konteks materi terasa nyata. Teks
 * `caption` ditulis ulang sederhana untuk siswa Tuli, jadi BUKAN kutipan isi buku.
 *
 * Transkrip yang sama ada di backend/app/learning/catalog.py (dipakai sebagai konteks saat siswa
 * bertanya dari video): id, urutan bagian dan teksnya harus sama.
 */
export type Subject = 'Matematika' | 'Bahasa Indonesia' | 'IPA' | 'IPS' | 'Bahasa Inggris' | 'Lainnya';

export type MateriSection = { title: string; caption: string };

export type Materi = {
  id: string;
  /** Judul materi / bab, mis. 'Bangun Datar'. */
  title: string;
  subject: Subject;
  /** Untuk kelas berapa buku ini. */
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
  /** Judul buku pelajaran yang menjadi sumber materi. */
  bookTitle: string;
  /** Penerbit / sumber buku, mis. 'Kemendikbudristek, 2021'. */
  bookSource: string;
};

export const SUBJECTS: readonly Subject[] = ['Matematika', 'Bahasa Indonesia', 'IPA', 'IPS', 'Bahasa Inggris', 'Lainnya'];

export const MATERI: Materi[] = [
  {
    id: 'siklus-air',
    bookTitle: 'Ilmu Pengetahuan Alam dan Sosial (IPAS) untuk SD/MI Kelas V',
    bookSource: 'Kemendikbudristek, 2021',
    title: 'Siklus Air',
    subject: 'IPA',
    grade: 5,
    duration: '06:24',
    summary: 'Perjalanan air dari laut ke awan, turun jadi hujan, lalu kembali lagi.',
    tone: 'ink',
    bg: 'from-[#cbe8f3] via-[#e2f3f9] to-white',
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
    bookTitle: 'Belajar Bersama Temanmu: Matematika untuk SD Kelas IV',
    bookSource: 'Kemendikbudristek, 2021',
    title: 'Bangun Datar',
    subject: 'Matematika',
    grade: 4,
    duration: '08:12',
    summary: 'Mengenal persegi, persegi panjang, segitiga, dan lingkaran.',
    tone: 'brand',
    bg: 'from-[#f7ecd6] via-[#fcf5e8] to-white',
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
    bookTitle: 'Aku Bisa! Bahasa Indonesia untuk SD/MI Kelas I',
    bookSource: 'Kemendikbudristek, 2021',
    title: 'Perkenalan Diri',
    subject: 'Bahasa Indonesia',
    grade: 1,
    duration: '07:36',
    summary: 'Belajar menyapa dan memperkenalkan diri kepada teman.',
    tone: 'violet',
    bg: 'from-[#f8e2dd] via-[#fdefec] to-white',
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
    bookTitle: 'Ilmu Pengetahuan Alam dan Sosial (IPAS) untuk SD/MI Kelas VI',
    bookSource: 'Kemendikbudristek, 2022',
    title: 'Tata Surya',
    subject: 'IPA',
    grade: 6,
    duration: '05:18',
    summary: 'Matahari dan delapan planet yang mengelilinginya.',
    tone: 'ink',
    bg: 'from-[#dcdef5] via-[#eaecfa] to-white',
    sections: [
      { title: 'Matahari', caption: 'Matahari adalah bintang. Matahari ada di tengah tata surya.' },
      { title: 'Planet', caption: 'Ada delapan planet yang mengelilingi matahari.' },
      { title: 'Bumi', caption: 'Bumi adalah planet ketiga. Kita tinggal di bumi.' },
    ],
    ask: 'Sebutkan planet di tata surya',
  },
  {
    id: 'simple-present',
    bookTitle: 'English for Nusantara untuk SMP/MTs Kelas VII',
    bookSource: 'Kemendikbudristek, 2022',
    title: 'Simple Present Tense',
    subject: 'Bahasa Inggris',
    grade: 7,
    duration: '09:42',
    summary: 'Kalimat untuk kebiasaan dan fakta sehari-hari.',
    tone: 'violet',
    bg: 'from-[#d6ecea] via-[#e8f6f4] to-white',
    sections: [
      { title: 'Kebiasaan', caption: 'Simple present dipakai untuk kebiasaan. I study every day.' },
      { title: 'Rumus', caption: 'Subjek ditambah kata kerja. She studies, they study.' },
      { title: 'Contoh', caption: 'I go to school in the morning.' },
    ],
    ask: 'Beri contoh kalimat simple present tense',
  },
  {
    id: 'alat-transportasi',
    bookTitle: 'Ilmu Pengetahuan Alam dan Sosial (IPAS) untuk SD/MI Kelas III',
    bookSource: 'Kemendikbudristek, 2022',
    title: 'Alat Transportasi',
    subject: 'IPS',
    grade: 3,
    duration: '06:57',
    summary: 'Transportasi darat, laut, dan udara di sekitar kita.',
    tone: 'brand',
    bg: 'from-[#dcecdf] via-[#ecf6ee] to-white',
    sections: [
      { title: 'Darat', caption: 'Motor, mobil, dan bus adalah transportasi darat.' },
      { title: 'Laut', caption: 'Kapal dan perahu berjalan di laut.' },
      { title: 'Udara', caption: 'Pesawat terbang di udara.' },
    ],
    ask: 'Apa saja contoh alat transportasi darat?',
  },
  {
    id: 'persentase',
    bookTitle: 'Belajar Bersama Temanmu: Matematika untuk SD Kelas VI',
    bookSource: 'Kemendikbudristek, 2022',
    title: 'Mengenal Persentase',
    subject: 'Matematika',
    grade: 6,
    duration: '07:05',
    summary: 'Persen artinya per seratus. Contoh diskon dan nilai ulangan.',
    tone: 'ink',
    bg: 'from-[#f9e5d7] via-[#fdf2e9] to-white',
    sections: [
      { title: 'Arti persen', caption: 'Persen artinya per seratus. Lima puluh persen sama dengan setengah.' },
      { title: 'Contoh', caption: 'Ada seratus permen. Sepuluh permen merah. Berapa persen permen merah? Sepuluh persen.' },
    ],
    ask: 'Apa itu persentase?',
  },
  {
    id: 'warna',
    bookTitle: 'Seni Rupa untuk SD/MI Kelas I',
    bookSource: 'Kemendikbudristek, 2021',
    title: 'Mengenal Warna',
    subject: 'Lainnya',
    grade: 1,
    duration: '04:40',
    summary: 'Merah, kuning, hijau, dan hitam dalam bahasa isyarat.',
    tone: 'violet',
    bg: 'from-[#f1e0f5] via-[#f9eefb] to-white',
    sections: [
      { title: 'Merah', caption: 'Apel ini merah.' },
      { title: 'Kuning', caption: 'Pisang itu kuning.' },
      { title: 'Hijau', caption: 'Daun itu hijau.' },
      { title: 'Hitam', caption: 'Rambut saya hitam.' },
    ],
    ask: 'Benda apa saja yang berwarna hijau?',
  },
  {
    id: 'bagian-tumbuhan',
    bookTitle: 'Ilmu Pengetahuan Alam dan Sosial (IPAS) untuk SD/MI Kelas IV',
    bookSource: 'Kemendikbudristek, 2021',
    title: 'Bagian Tubuh Tumbuhan',
    subject: 'IPA',
    grade: 4,
    duration: '06:10',
    summary: 'Akar, batang, daun, dan bunga beserta tugasnya masing-masing.',
    tone: 'brand',
    bg: 'from-[#e0eaf6] via-[#eef2fb] to-white',
    sections: [
      { title: 'Akar', caption: 'Akar ada di dalam tanah. Akar mencari air untuk tumbuhan.' },
      { title: 'Batang', caption: 'Batang membawa air dari akar sampai ke daun.' },
      { title: 'Daun', caption: 'Daun itu hijau. Daun membuat makanan dengan bantuan matahari.' },
      { title: 'Bunga dan buah', caption: 'Bunga berubah menjadi buah. Buah itu bisa kita makan.' },
    ],
    ask: 'Apa tugas akar pada tumbuhan?',
  },
  {
    id: 'pecahan',
    bookTitle: 'Belajar Bersama Temanmu: Matematika untuk SD Kelas V',
    bookSource: 'Kemendikbudristek, 2022',
    title: 'Mengenal Pecahan',
    subject: 'Matematika',
    grade: 5,
    duration: '07:20',
    summary: 'Pecahan sebagai bagian dari satu benda yang utuh, lewat contoh kue.',
    tone: 'ink',
    bg: 'from-[#e4ddf5] via-[#efeafb] to-white',
    sections: [
      { title: 'Arti pecahan', caption: 'Pecahan artinya bagian dari satu benda yang utuh.' },
      { title: 'Setengah', caption: 'Satu kue dibagi dua sama besar. Satu bagian itu setengah.' },
      { title: 'Seperempat', caption: 'Kue yang sama dibagi empat. Satu bagian itu seperempat.' },
      { title: 'Latihan', caption: 'Berapa bagian kue yang kamu makan? Coba hitung lagi.' },
    ],
    ask: 'Apa itu pecahan?',
  },
  {
    id: 'pancasila',
    bookTitle: 'Pendidikan Pancasila untuk SD/MI Kelas IV',
    bookSource: 'Kemendikbudristek, 2021',
    title: 'Mengenal Pancasila',
    subject: 'IPS',
    grade: 4,
    duration: '05:40',
    summary: 'Lima sila Pancasila dan contoh melakukannya di rumah dan di sekolah.',
    tone: 'violet',
    bg: 'from-[#f1e4ea] via-[#f7eef2] to-white',
    sections: [
      { title: 'Lima sila', caption: 'Pancasila punya lima sila. Sila itu dasar negara kita.' },
      { title: 'Di rumah', caption: 'Di rumah, saya membantu keluarga. Itu latihan Pancasila.' },
      { title: 'Di sekolah', caption: 'Di sekolah, saya menghargai teman. Teman saya berbeda-beda.' },
      { title: 'Musyawarah', caption: 'Kalau ada masalah, kita bicara bersama. Itu namanya musyawarah.' },
    ],
    ask: 'Apa saja lima sila Pancasila?',
  },
  {
    id: 'sapaan-inggris',
    bookTitle: 'English for Nusantara untuk SD/MI Kelas IV',
    bookSource: 'Kemendikbudristek, 2022',
    title: 'Menyapa dan Berkenalan',
    subject: 'Bahasa Inggris',
    grade: 4,
    duration: '05:05',
    summary: 'Sapaan sehari-hari dalam bahasa Inggris, dari good morning sampai thank you.',
    tone: 'brand',
    bg: 'from-[#dde6f4] via-[#ebf0fa] to-white',
    sections: [
      { title: 'Sapaan', caption: 'Halo! Selamat pagi. Dalam bahasa Inggris, good morning.' },
      { title: 'Bertanya kabar', caption: 'Apa kabar? Dalam bahasa Inggris, how are you?' },
      { title: 'Menjawab', caption: 'Saya baik. Dalam bahasa Inggris, I am fine.' },
      { title: 'Berterima kasih', caption: 'Terima kasih. Dalam bahasa Inggris, thank you.' },
    ],
    ask: 'Bagaimana cara menyapa dalam bahasa Inggris?',
  },
];

export const materiById = (id: string | undefined) => MATERI.find((m) => m.id === id) ?? null;

export const subjectLabel = (m: Materi) => `${m.subject} · Kelas ${m.grade}`;

/** '06:24' → 384 detik. */
export function durationSec(m: Materi): number {
  const [min, sec] = m.duration.split(':').map(Number);
  return (min || 0) * 60 + (sec || 0);
}

/** Panjang tiap bagian (detik): durasi video dibagi rata ke semua bagian. */
export const sectionSec = (m: Materi) => durationSec(m) / m.sections.length;

/** Detik awal bagian ke-i. */
export const sectionStart = (m: Materi, i: number) => i * sectionSec(m);

/** Bagian yang sedang diputar pada detik t. */
export const sectionAt = (m: Materi, t: number) => Math.min(m.sections.length - 1, Math.max(0, Math.floor(t / sectionSec(m))));

/** 135 → '02:15'. */
export function clock(t: number): string {
  const s = Math.max(0, Math.round(t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
