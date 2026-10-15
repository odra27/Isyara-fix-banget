"""Learning video catalog used as chatbot context (ADR-053 D3).

The videos themselves are still the sign animations of the FE (Frontend/main/src/data/materi.ts).
This module is the Backend's copy of their transcript: the section texts. When a student asks a
question while watching, the FE sends `video_id` + the section index + the playback second, and
the Backend (never the FE) picks the transcript text that goes into the model prompt.

Keep the ids, section order and captions in sync with materi.ts;
tests/test_chat_context.py::test_catalog_shape guards the ids and shape, and the FE→BE contract
is the id + section index only.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class VideoSection:
    title: str
    text: str


@dataclass(frozen=True)
class Video:
    id: str
    title: str
    subject: str
    grade: int
    sections: tuple[VideoSection, ...]


def _v(id: str, title: str, subject: str, grade: int, *sections: tuple[str, str]) -> Video:
    return Video(id, title, subject, grade, tuple(VideoSection(t, x) for t, x in sections))


VIDEOS: dict[str, Video] = {v.id: v for v in (
    _v("siklus-air", "Siklus Air", "IPA", 5,
       ("Evaporasi", "Hari ini kita belajar siklus air. Matahari memanaskan air, lalu air menguap."),
       ("Kondensasi", "Uap air naik ke langit, menjadi dingin, lalu berubah menjadi awan."),
       ("Presipitasi", "Awan menjadi berat, lalu air turun sebagai hujan."),
       ("Infiltrasi", "Air hujan meresap ke dalam tanah dan kembali ke sungai dan laut.")),
    _v("bangun-datar", "Bangun Datar", "Matematika", 4,
       ("Persegi", "Persegi punya empat sisi yang sama panjang."),
       ("Persegi panjang", "Persegi panjang punya dua sisi panjang dan dua sisi pendek."),
       ("Segitiga", "Segitiga punya tiga sisi dan tiga sudut."),
       ("Lingkaran", "Lingkaran tidak punya sudut. Bentuknya bulat.")),
    _v("perkenalan-diri", "Perkenalan Diri", "Bahasa Indonesia", 1,
       ("Menyapa", "Halo, selamat pagi. Apa kabar?"),
       ("Nama", "Saya Nadia. Siapa nama kamu?"),
       ("Rumah", "Rumah saya dekat sekolah."),
       ("Penutup", "Senang bertemu kamu, teman. Terima kasih.")),
    _v("tata-surya", "Tata Surya", "IPA", 6,
       ("Matahari", "Matahari adalah bintang. Matahari ada di tengah tata surya."),
       ("Planet", "Ada delapan planet yang mengelilingi matahari."),
       ("Bumi", "Bumi adalah planet ketiga. Kita tinggal di bumi.")),
    _v("simple-present", "Simple Present Tense", "Bahasa Inggris", 7,
       ("Kebiasaan", "Simple present dipakai untuk kebiasaan. I study every day."),
       ("Rumus", "Subjek ditambah kata kerja. She studies, they study."),
       ("Contoh", "I go to school in the morning.")),
    _v("alat-transportasi", "Alat Transportasi", "IPS", 3,
       ("Darat", "Motor, mobil, dan bus adalah transportasi darat."),
       ("Laut", "Kapal dan perahu berjalan di laut."),
       ("Udara", "Pesawat terbang di udara.")),
    _v("persentase", "Mengenal Persentase", "Matematika", 6,
       ("Arti persen", "Persen artinya per seratus. Lima puluh persen sama dengan setengah."),
       ("Contoh", "Ada seratus permen. Sepuluh permen merah. Berapa persen permen merah? Sepuluh persen.")),
    _v("warna", "Mengenal Warna", "Lainnya", 1,
       ("Merah", "Apel ini merah."),
       ("Kuning", "Pisang itu kuning."),
       ("Hijau", "Daun itu hijau."),
       ("Hitam", "Rambut saya hitam.")),
    _v("bagian-tumbuhan", "Bagian Tubuh Tumbuhan", "IPA", 4,
       ("Akar", "Akar ada di dalam tanah. Akar mencari air untuk tumbuhan."),
       ("Batang", "Batang membawa air dari akar sampai ke daun."),
       ("Daun", "Daun itu hijau. Daun membuat makanan dengan bantuan matahari."),
       ("Bunga dan buah", "Bunga berubah menjadi buah. Buah itu bisa kita makan.")),
    _v("pecahan", "Mengenal Pecahan", "Matematika", 5,
       ("Arti pecahan", "Pecahan artinya bagian dari satu benda yang utuh."),
       ("Setengah", "Satu kue dibagi dua sama besar. Satu bagian itu setengah."),
       ("Seperempat", "Kue yang sama dibagi empat. Satu bagian itu seperempat."),
       ("Latihan", "Berapa bagian kue yang kamu makan? Coba hitung lagi.")),
    _v("pancasila", "Mengenal Pancasila", "IPS", 4,
       ("Lima sila", "Pancasila punya lima sila. Sila itu dasar negara kita."),
       ("Di rumah", "Di rumah, saya membantu keluarga. Itu latihan Pancasila."),
       ("Di sekolah", "Di sekolah, saya menghargai teman. Teman saya berbeda-beda."),
       ("Musyawarah", "Kalau ada masalah, kita bicara bersama. Itu namanya musyawarah.")),
    _v("sapaan-inggris", "Menyapa dan Berkenalan", "Bahasa Inggris", 4,
       ("Sapaan", "Halo! Selamat pagi. Dalam bahasa Inggris, good morning."),
       ("Bertanya kabar", "Apa kabar? Dalam bahasa Inggris, how are you?"),
       ("Menjawab", "Saya baik. Dalam bahasa Inggris, I am fine."),
       ("Berterima kasih", "Terima kasih. Dalam bahasa Inggris, thank you.")),
)}


def clock(t_sec: int) -> str:
    """42 → '00:42', 135 → '02:15'."""
    m, s = divmod(max(0, int(t_sec)), 60)
    return f"{m:02d}:{s:02d}"


def video_context(video: Video, section: int, t_sec: int) -> str:
    """System context for a question asked at `t_sec` while `section` was playing."""
    cur = video.sections[section]
    lines = [
        f'Siswa sedang menonton video pelajaran "{video.title}" ({video.subject}, kelas {video.grade}) '
        f'dan bertanya pada {clock(t_sec)}, saat bagian "{cur.title}".',
        f'Isi bagian itu: "{cur.text}"',
    ]
    if section > 0:
        prev = video.sections[section - 1]
        lines.append(f'Bagian sebelumnya ("{prev.title}"): "{prev.text}"')
    if section + 1 < len(video.sections):
        nxt = video.sections[section + 1]
        lines.append(f'Bagian sesudahnya ("{nxt.title}"): "{nxt.text}"')
    lines.append(
        "Jawab pertanyaan siswa berdasarkan isi video ini dengan bahasa sederhana.")
    return "\n".join(lines)
