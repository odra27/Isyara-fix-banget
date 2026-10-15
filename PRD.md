# PRD: ISYARA, Platform Belajar Inklusif untuk Siswa Tuli

| | |
|---|---|
| Status | Berlaku sejak ADR-053 (2026-10-14) |
| Dokumen terkait | [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) (perilaku & kontrak), [ARCHITECTURE.md](ARCHITECTURE.md) (struktur & runtime), [decisions.md](decisions.md) (ADR), [ml/artifacts/MODEL_REPORT.md](ml/artifacts/MODEL_REPORT.md) |
| Urutan kebenaran | ADR-053 > ADR lain > code > dokumen lama |
| Menggantikan | `PRD-BE.md`, `PRD-modeling.md` / `PRD-Modeling.md`, `PRD-FE.md`, `note.md`, `REKOMENDASI_BACKEND_DAN_DATABASE.md`, `prompt-flow-animasi-jembatan-komunikasi.md`. Rujukan ke file-file itu di `decisions.md` bersifat historis (ADR append-only); isinya yang masih berlaku ada di tiga dokumen ini. |

Dokumen ini menjawab *apa* dan *mengapa*. Kontrak API, skema data, dan alur teknis ada di SYSTEM_DESIGN.md; struktur repo, stack, dan cara menjalankan ada di ARCHITECTURE.md.

---

## 1. Ringkasan

ISYARA adalah aplikasi belajar *chat-first* untuk siswa Tuli. Halaman utama adalah **Tanya ISYARA**: siswa bertanya dengan mengetik, dengan isyarat BISINDO lewat kamera, atau dengan mengunggah PDF materi dari guru. Jawaban tampil sebagai teks sederhana, suara (TTS), dan animasi isyarat. Video pelajaran bisa ditanyakan per detik: pertanyaan dikirim bersama posisi video sehingga jawaban mengacu ke bagian yang sedang ditonton.

Akun siswa dibuat sekolah dan login memakai NIS. Mode kiosk kelas (siswa ↔ guru di satu perangkat) tetap ada di `/kiosk`, tetapi tidak tampil di menu.

## 2. Sebelum vs Sesudah

"Sebelum" adalah keadaan sampai ADR-051/052. "Sesudah" adalah ADR-053.

| Aspek | Sebelum | Sesudah (ADR-053) |
|---|---|---|
| Domain | Awalnya kiosk konter Puskesmas (pasien Tuli ↔ petugas, ADR-001..050). ADR-051 pindah ke edukasi. | Edukasi, fokus siswa Tuli SD kelas 4–6. |
| Halaman utama | Beranda berisi video pelajaran; kiosk, video, dan chatbot tampil sebagai tiga fitur setara. | Tanya ISYARA (`/chat`) dengan maskot dan "Mau belajar apa hari ini?". |
| Kiosk | Produk inti (era Puskesmas), lalu menu "Mode Kiosk kelas" (ADR-051 D1). | Tersembunyi di `/kiosk`, hanya lewat URL, untuk demo kelas. |
| Input isyarat | Panel siswa di kiosk. | Tombol "Pakai isyarat" di kolom chat. Ukuran kosakata tidak ditampilkan. |
| Video pelajaran | Kartu di beranda, data dummy FE, tanpa konteks ke chatbot (ADR-051 D6). | Halaman Video Pelajaran, tanya per detik, caption gaya YouTube, konteks transkrip dari Backend. |
| Materi | Dummy FE + "Materi Saya" di localStorage. | Ditambah unggah PDF berbasis teks per percakapan (disimpan teksnya di Backend). |
| Chatbot | OpenRouter lewat Backend, riwayat per siswa (ADR-051 D3/D4). | Sama, ditambah konteks video/PDF dan key cadangan OpenRouter. |
| Eskalasi | "Panggil JBI" wajib di setiap layar (era Puskesmas). Dihapus dari FE oleh ADR-051 D7. | Tetap tanpa JBI di FE. Backend masih mengembalikan `escalated_to_jbi`; FE menampilkan "Isyarat belum dikenali". |
| Mode demo | Service mock (auth, chat, matching) dan teks "Mode demo" di FE. | Dihapus. FE selalu ke Backend. Login boleh menampilkan kotak "Akun siap pakai" dari env lokal. |
| Sesi siswa | Berakhir saat token Supabase (~1 jam) kedaluwarsa (ADR-051). | Refresh token, idle maksimum 14 hari (ADR-052). |
| Dashboard petugas | Login staf, status kiosk, panggil JBI (ADR-047). | Endpoint Backend tetap ada, tanpa konsumen FE. |
| Kosakata isyarat | 32 kata (ADR-045). | 43 kata (ADR-049), artefak `20261006-1528`. |

## 3. Masalah & Latar Belakang

- Siswa Tuli sering tertinggal karena materi kelas disampaikan secara lisan atau berupa teks panjang. Bahasa pertama banyak siswa Tuli adalah bahasa isyarat, sehingga teks Bahasa Indonesia baku sulit diikuti.
- Guru di sekolah umum maupun SLB tidak selalu bisa mendampingi tiap siswa saat siswa bingung.
- ADR-053 mencatat titik putus sekolah terbesar ada di transisi SD → SMP. Angka pendukung **wajib dikutip dari sumber resmi** (BPS, Susenas, Dapodik) sebelum dipakai di materi presentasi. Dokumen ini sengaja tidak mencantumkan angka.
- Review internal menilai versi sebelumnya tidak fokus: tiga fitur bersaing di halaman depan. Nilai inti ISYARA adalah membuat materi belajar bisa diikuti siswa Tuli (teks sederhana, caption, animasi isyarat, tanya jawab).

## 4. Target Pengguna

| Persona | Kebutuhan | Status |
|---|---|---|
| Siswa Tuli SD kelas 4–6 | Bertanya tentang materi dengan bahasa sederhana, lewat ketik atau isyarat; memahami video pelajaran. | Fokus MVP |
| Siswa Tuli SMP, SMA/SMK | Sama, dengan materi lebih berat. | Roadmap |
| Sekolah / operator | Mendaftarkan akun siswa (NIS + password). | MVP lewat skrip operator |
| Guru | Memakai kiosk kelas; kelak mengirim materi ke kelas. | Kiosk tersembunyi; akun guru belum ada (ADR-051 open item 4) |
| Admin vokabulari | Mengelola frasa dan video referensi. | API admin ada, tanpa UI |

Siswa tidak mendaftar sendiri. Satu akun = satu siswa.

## 5. Tujuan & Non-Tujuan

**Tujuan**
1. Siswa Tuli bisa bertanya tentang pelajaran dan menerima jawaban yang pendek, jelas, dan bisa dilihat sebagai isyarat.
2. Video pelajaran bisa ditanyakan tepat pada bagian yang membingungkan.
3. Materi PDF dari guru bisa dijadikan konteks jawaban.
4. Sistem jujur ketika tidak yakin: lebih baik "isyarat belum dikenali" daripada hasil salah yang meyakinkan.

**Non-tujuan**
- Bukan penerjemah BISINDO umum, tidak menerjemahkan kalimat bebas isyarat ke teks.
- Bukan pengganti guru atau juru bahasa isyarat.
- Bukan avatar 3D generatif; animasi kata di luar kosakata adalah gerakan buatan dan **bukan BISINDO**.
- Bukan OCR: PDF hasil scan/foto ditolak.
- Tidak ada multi-device session, room code, QR pairing, registrasi mandiri, dashboard B2G.

## 6. Framing yang Wajib

Kalimat resmi produk (ADR-051 D1):

> AI membantu mengenali sejumlah kosakata BISINDO yang telah divalidasi untuk kegiatan belajar.

Konsekuensi:
- Jangan pernah menulis "AI menerjemahkan BISINDO". Alur sebenarnya adalah *urutan landmark → klasifikasi kosakata tertutup → kata yang sudah ditentukan*.
- Animasi untuk kata di luar kosakata adalah gerakan prosedural yang dijamin berbeda dari gerakan terlatih (ADR-051 D5). Atas permintaan pemilik produk, UI tidak memberi label khusus, tetapi materi presentasi tidak boleh menyebutnya isyarat BISINDO.
- Jawaban chatbot dibuat model bahasa dan bisa keliru. UI menulis "ISYARA bisa keliru, tanyakan juga ke gurumu."

## 7. Fitur MVP (sesudah ADR-053)

| # | Fitur | Rute | Ringkasan perilaku |
|---|---|---|---|
| F1 | Tanya ISYARA | `/chat`, `/chat/:sessionId` | Layar kosong dengan maskot harimau dan "Mau belajar apa hari ini?" plus pertanyaan cepat. Setelah pesan pertama, halaman yang sama menjadi percakapan. Judul sesi diambil dari pertanyaan pertama. Jawaban: teks, TTS (opsional), animasi isyarat. |
| F2 | Pakai isyarat | di kolom chat | Kamera → auto-capture → pengenalan kata. Kata ≥ 0,85 langsung ditambahkan ke kolom pesan, 0,60–0,84 minta konfirmasi, < 0,60 "Isyarat belum dikenali". Beberapa kata bisa disusun, ditambah ketikan, lalu dikirim. Pesan ditandai `input_mode = sign`. |
| F3 | Unggah PDF | tombol + di kolom chat | PDF berbasis teks, ≤ 5 MB, ≤ 10 halaman, maks. 5 file per percakapan. Teks dipakai sebagai konteks jawaban. Scan/foto ditolak dengan pesan jelas. UI mengingatkan agar tidak mengunggah data pribadi. |
| F4 | Video Pelajaran | `/video`, `/video/:id` | Daftar video dengan "Lanjutkan menonton" di atas, cari, filter mapel, nama guru per video. Halaman tonton: chat samping berukuran tetap, caption gaya YouTube (S/M/L, kata aktif disorot), bab di progress bar, kecepatan, ulangi bagian, layar penuh dengan panel "Tanya". |
| F5 | Tanya per detik | di halaman video | Pertanyaan dikirim bersama `{id video, bagian, detik}`. Backend menambahkan transkrip bagian itu dan bagian sekitarnya ke prompt. Riwayat menampilkan chip waktu (mis. "02:15"). |
| F6 | Materi Saya | `/materi` | PDF yang pernah diunggah (dari akun), video yang disimpan, video terakhir dibuka. |
| F7 | Riwayat | `/riwayat` | Semua percakapan: buka, ganti nama, hapus. Sidebar menampilkan 4 terbaru + "Lihat semua". |
| F8 | Profil + Kegiatan belajarku | `/profil` | Data siswa dari sekolah (hanya baca), pengaturan tampilan (ukuran teks, kecepatan isyarat, putar otomatis, suara, caption), dan ringkasan 7 hari: video ditonton, pertanyaan dari video, PDF diunggah. |
| F9 | Login NIS | `/login` | NIS + password. Siswa yang sesinya masih valid langsung masuk. Kotak "Akun siap pakai" hanya tampil bila env demo diisi (jangan untuk build publik). |
| F10 | Kiosk kelas (tersembunyi) | `/kiosk` | Satu perangkat, dua arah: isyarat siswa → teks/suara untuk guru; suara/ketikan guru → animasi isyarat. Tidak ada di menu. |

Tidak ada mode demo di aplikasi siswa. Bila Backend mati, UI menampilkan "Tidak bisa terhubung ke server". Simulator `?dev=1` hanya ada di dalam kiosk.

## 8. User Flow

**Masuk**
1. Siswa membuka aplikasi. Bila sesi tersimpan masih valid, token diperbarui diam-diam dan siswa langsung ke `/chat`.
2. Bila tidak, form login NIS. Gagal kredensial → pesan umum; 5 kali gagal → tombol dikunci 30 detik.

**Bertanya (inti)**
1. `/chat` kosong → siswa mengetik, menekan "Pakai isyarat", atau mengunggah PDF.
2. Pesan dikirim → jawaban muncul sebagai teks, lalu animasi isyarat (dan TTS bila diaktifkan).
3. Percakapan tersimpan dan muncul di sidebar serta Riwayat.

**Dari video**
1. `/video` → pilih video → menonton dengan caption.
2. Bingung di detik tertentu → tekan Tanya (atau pakai panel samping) → pertanyaan dikirim dengan posisi video.
3. Jawaban mengacu ke isi bagian itu. Percakapan per video diingat di perangkat.

**Kiosk kelas** (hanya lewat URL): siswa mengisyaratkan ke kamera → teks + suara untuk guru; guru bicara/mengetik → animasi isyarat untuk siswa.

Diagram urutan teknis tiap alur ada di [SYSTEM_DESIGN.md §3](SYSTEM_DESIGN.md#3-alur-end-to-end).

## 9. Confidence Decision Logic

Aturan bisnis milik Backend. Threshold **tidak berubah** sejak ADR-006/007 dan tidak boleh diubah tanpa ADR baru.

| Confidence dari Modeling | `action` Backend | Tampilan FE |
|---|---|---|
| ≥ 0,85 | `accepted` | Kata langsung dipakai (chat: masuk ke kolom pesan; kiosk: teks + TTS). |
| 0,60 – 0,84 | `pending_confirmation` | "Maksudmu ini?" dengan Konfirmasi / Coba lagi. Setelah Konfirmasi, kiosk mencatat `confirmed` lewat `/api/logs`. |
| < 0,60, atau Modeling menolak | `escalated_to_jbi` | "Isyarat belum dikenali" + Coba lagi / ketik. Tidak ada JBI di FE (ADR-051 D7). |

Prinsip: tidak ada *silent acceptance* di bawah 0,85 dan tidak ada nearest-match paksa. Detail implementasi: [SYSTEM_DESIGN.md §6](SYSTEM_DESIGN.md#6-confidence-decision-logic).

## 10. Kosakata, Dataset & Evaluasi Model

**Dataset.** Training dan evaluasi hanya memakai dataset publik **WL-BISINDO** (tingkat kata). Tidak ada rekaman sendiri. Artefak aktif `20261006-1528` dilatih dari 2.652 klip, 10 penanda tangan (dari `ml/artifacts/version.json`). Lisensi dataset belum terkonfirmasi (open item).

**Kosakata aktif (43 kata, `label_00`…`label_42`).** Air, Belajar, Cari, Hari, Ingat, Lagi, Maaf, Makan, Motor, Saya, Terima kasih, Tuli, Apa, Siapa, Kapan, Di mana, Mengapa, Bagaimana, Merah, Kuning, Hijau, Hitam, Dengar, Berangkat, Datang, Teman, Keluarga, Rumah, Pagi, Siang, Sore, Malam, Apa kabar, Baik, Berapa, Bingung, Halo, Kamu, Tidur, Selamat siang, Selamat sore, Selamat pagi, Selamat malam.

- `phraseId` (`label_XX`) adalah kunci stabil, dipetakan ke `phrases.model_phrase_id`. Kategori lama (Pendaftaran, Keluhan, Obat, Administrasi, Fallback) masih nilai teknis di database dan API admin.
- Pengenalan isyarat hanya untuk kata-kata ini. Kata di luar kosakata tidak pernah ditebak.
- Arah sebaliknya (teks → animasi) memakai rekaman asli untuk 43 kata dan gerakan buatan untuk kata lain.

**Metodologi evaluasi** (berlaku untuk setiap artefak baru, dari PRD Modeling lama):

| Aspek | Ketentuan |
|---|---|
| Split utama | Leave-one-signer-out (LOSO); penanda tangan hold-out tidak pernah dilihat saat training. |
| Penolakan | Kelas `none` (diam, transisi, gerakan acak) + eksperimen leave-labels-out untuk kata asing. |
| Kalibrasi | Temperature scaling + jarak ke centroid kelas; threshold dipetakan ke 0,85 / 0,60 Backend. |
| Metrik | top-1, top-3, macro-F1, F1 per kelas, confusion matrix, ECE, AUROC known vs unknown, tabel coverage accept/confirm/reject. |
| Gerbang kualitas | macro-F1 LOSO ≥ 0,80; presisi `accept` ≥ 97%; mayoritas `none` dan kata asing ditolak; inferensi < 100 ms per sekuens di CPU. Bila tidak tercapai, kurangi kosakata demo ke kata dengan F1 tertinggi. |

**Hasil terdokumentasi terakhir** ada di MODEL_REPORT.md, tetapi untuk artefak 32 kata (`20260930-0122`): top-1 penanda tangan baru 90,3%, presisi accept kata dikenal 99,8%, kata di luar kosakata masih lolos accept 16,1%. Laporan untuk artefak 43 kata belum ada (open item). Kata dengan F1 rendah (mis. Cari, Makan, Keluarga) dan pasangan yang sering tertukar (Siang/Sore, Terima kasih/Kapan) sebaiknya dihindari saat demo.

## 11. Privasi & Etika

- Landmark, audio, dan video siswa diproses di memori lalu dibuang. Tidak ditulis ke database, file, atau log.
- Yang disimpan: teks chat, `input_mode`, posisi video saat bertanya, dan teks hasil ekstraksi PDF (byte PDF dibuang).
- Teks chat dan teks PDF dikirim ke OpenRouter. Transfer pihak ketiga ini disetujui oleh ADR-051 D4 dan ADR-053 D4. UI meminta siswa tidak mengunggah data pribadi.
- Model diarahkan menolak pertanyaan tidak pantas dan tidak meminta data pribadi. Kebijakan moderasi lengkap belum diputuskan.
- Kosakata dan UX perlu divalidasi bersama komunitas Tuli. Cakupan dialek dibatasi; tidak ada klaim universal.

Aturan teknis privasi: [SYSTEM_DESIGN.md §12](SYSTEM_DESIGN.md#12-privasi).

## 12. Kebutuhan Non-Fungsional

| Area | Kebutuhan |
|---|---|
| Latensi isyarat | `/api/match/sign` p95 < 2,5 s; Modeling dibatasi 3 s; target total < 3 s dari akhir isyarat ke hasil. |
| Latensi chat | Model dibatasi 25 s di Backend; UI menampilkan status menunggu dan pesan bisa dikirim ulang bila gagal. |
| Keandalan | Error terstruktur dengan kode stabil supaya FE bisa memberi fallback (ketik manual). Tidak ada prediksi palsu saat error. |
| Aksesibilitas | Semua status terlihat (bukan hanya suara), ikon selalu berlabel, teks bisa diperbesar, kontras cukup, `prefers-reduced-motion` dihormati, animasi tidak berkedip > 3 kali/detik. |
| Perangkat | Browser modern dengan kamera ≥ 720p; kamera/mic butuh secure context (HTTPS atau localhost). |
| Keamanan | Endpoint siswa wajib JWT `siswa`; data selalu dibatasi ke siswa pemanggil; API key model hanya di Backend. |

## 13. Batasan MVP

- Pengenalan isyarat tingkat kata, 43 kata, satu dataset. Tidak ada kalimat isyarat bebas.
- Katalog video dan transkrip masih data statis yang diduplikasi FE/BE; belum ada CMS materi.
- PDF hanya berbasis teks, tanpa OCR.
- Tidak ada akun guru, tidak ada pengiriman materi ke kelas.
- Pendaftaran siswa lewat skrip operator, belum ada endpoint/UI sekolah.
- Belum ada kebijakan retensi riwayat chat dan dokumen.
- `/api/match/text` belum ada; kiosk memakai tokenizer kamus di FE (ADR-050).
- Tidak ada multi-device, multi-dialek, community submission, dashboard B2G.

## 14. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Isyarat salah dikenali dengan yakin | Threshold 0,85/0,60 di Backend, langkah konfirmasi wajib, kata ditambahkan ke kolom pesan (bisa dihapus) bukan langsung dikirim. |
| Kata di luar kosakata lolos sebagai `accept` | Kelas `none` + gerbang centroid; UI konfirmasi; demo memakai kata ber-F1 tinggi. |
| Model chat menjawab salah atau tidak pantas | System prompt (kalimat pendek, fokus pelajaran, tolak yang tidak pantas), catatan "ISYARA bisa keliru". Moderasi lanjutan: open item. |
| Prompt injection lewat PDF | Teks PDF dipagari `<<< >>>` dengan instruksi mengabaikan perintah di dalamnya. |
| Data pribadi dikirim ke pihak ketiga | Hanya teks; peringatan di UI; tidak ada landmark/audio/video ke OpenRouter. |
| Kuota/limit OpenRouter habis saat demo | `OPENROUTER_API_KEYS` cadangan dicoba pada 401/402/403/429; tanpa key Backend memakai mode offline yang jujur. |
| Gerakan buatan dikira BISINDO | Framing wajib §6; generator menjamin jarak dari semua gerakan terlatih. |
| Kebingungan karena terlalu banyak fitur | Chat-first, kiosk disembunyikan, satu halaman utama. |
| Domain gap kamera dataset vs webcam | Normalisasi berbasis bahu, aturan capture yang sama dengan training, uji di perangkat asli sebelum demo. |
| Jam Windows melenceng membuat token ditolak | Sinkronkan jam (lihat ARCHITECTURE.md §8). |
| Klaim statistik tanpa sumber | Semua angka latar belakang wajib dari BPS/Susenas/Dapodik. |

## 15. Metrik Keberhasilan

| Metrik | Cara ukur | Target |
|---|---|---|
| Akurasi pengenalan | 5 kata × 10 percobaan di perangkat demo; prediksi benar / 50 | ≥ 90% |
| Prediksi salah yang diterima | Percobaan dengan hasil `accepted` tapi salah | Mendekati 0; dihitung terpisah |
| Tingkat "belum dikenali" | Proporsi `escalated_to_jbi` di `matching_logs` | Dipantau, bukan ditekan dengan memaksa hasil |
| Latensi isyarat | Akhir isyarat → hasil | < 3 s |
| Keberhasilan chat | Pesan terkirim tanpa 503/504 | Dipantau per sesi demo |
| Pemakaian tanya dari video | `GET /api/chat/activity` → `video_questions` | Indikator adopsi fitur inti |
| Kualitas jawaban | Review manual guru terhadap sampel jawaban (pendek, benar, sesuai kelas) | Kriteria disepakati sebelum uji sekolah |

## 16. Skenario Uji

| # | Skenario | Hasil yang diharapkan |
|---|---|---|
| 1 | Isyarat jelas, kata dalam kosakata | ≥ 0,85, kata masuk ke kolom pesan. |
| 2 | Isyarat ambigu | 0,60–0,84, kartu konfirmasi. |
| 3 | Gerakan tidak dikenal | "Isyarat belum dikenali", opsi coba lagi/ketik. |
| 4 | Tangan lewat sekilas (< 250 ms) atau rekaman < 500 ms | Kembali IDLE tanpa matching, tanpa pesan error. |
| 5 | Jeda alami < 1,5 s di tengah isyarat | Rekaman tidak berhenti prematur. |
| 6 | Kamera ditolak / Backend pengenal mati | Pesan jelas, siswa tetap bisa mengetik. |
| 7 | Tanya dari video di detik tertentu | Jawaban mengacu ke bagian video; chip waktu tampil di riwayat; hitungan "Pertanyaan dari video" bertambah. |
| 8 | Unggah PDF teks | Dokumen tercantum di percakapan dan di Materi Saya; jawaban memakai isinya. |
| 9 | Unggah PDF scan / > 10 halaman / > 5 MB / file ke-6 | Ditolak dengan pesan spesifik (`DOCUMENT_NO_TEXT` / `DOCUMENT_TOO_LARGE`). |
| 10 | Model chat timeout atau mati | Pesan gagal bisa dikirim ulang; tidak ada yang tersimpan setengah. |
| 11 | Buka ulang aplikasi setelah > 1 jam | Langsung masuk (refresh token); setelah 14 hari idle → form login. |
| 12 | Backend mati | "Tidak bisa terhubung ke server", tidak ada data palsu. |

## 17. Rencana Demo

**Harus berjalan live**
- Login NIS (akun siap pakai hanya di build lokal), langsung ke Tanya ISYARA.
- Pertanyaan teks → jawaban teks + animasi isyarat.
- "Pakai isyarat" dengan 2–3 kata ber-F1 tinggi, termasuk satu kasus konfirmasi atau "belum dikenali" untuk menunjukkan sistem jujur.
- Tanya dari video di detik tertentu.
- Unggah PDF teks, lalu bertanya tentang isinya; tunjukkan PDF scan ditolak.

**Cadangan**
- `/kiosk` untuk peragaan dua arah siswa ↔ guru di kelas; `?dev=1` untuk simulator bila kamera bermasalah.
- Tanpa key OpenRouter, chat tetap berjalan dengan jawaban offline yang menyatakan model belum tersambung.

## 18. Roadmap

1. **Sekarang (MVP):** chat-first, SD kelas 4–6, 43 kata, video katalog statis, PDF teks.
2. **Berikutnya:** endpoint/UI sekolah untuk mendaftarkan siswa dan reset password; tabel materi/CMS menggantikan katalog ganda FE/BE; kebijakan retensi; laporan model 43 kata.
3. **Lanjutan:** akun guru dan pengiriman materi ke kelas; SMP–SMA/SMK; `matchText` dari tim Modeling; perluasan kosakata bersama komunitas Tuli; OCR (perlu keputusan privasi); eksplorasi multi-dialek.

## 19. Open Items

| # | Item | Asal |
|---|---|---|
| 1 | Model OpenRouter konkret dan kebijakan moderasi chat siswa | ADR-051 OI-1 |
| 2 | Endpoint sekolah untuk registrasi siswa + reset password | ADR-051 OI-2 |
| 3 | Retensi/penghapusan riwayat chat dan dokumen | ADR-051 OI-3, ADR-053 OI-3 |
| 4 | Peran dan akun guru, termasuk kirim materi ke kelas | ADR-051 OI-4, ADR-053 OI-4 |
| 5 | Katalog transkrip duplikat FE/BE sampai ada tabel materi | ADR-053 OI-1 |
| 6 | OCR untuk foto lembar kerja (butuh model vision + keputusan privasi) | ADR-053 OI-2 |
| 7 | Kontrak `matchText` dari Modeling; `/api/match/text` masih diblokir | ADR-044, ADR-047 D10 |
| 8 | MODEL_REPORT.md belum diperbarui untuk artefak 43 kata | Temuan dokumentasi |
| 9 | Lisensi dataset WL-BISINDO | PRD Modeling lama |
| 10 | Data resmi angka putus sekolah siswa disabilitas (BPS/Susenas/Dapodik) | ADR-053 konteks |
| 11 | Sisa open item ADR-047 (rate limit login, auth heartbeat, siklus status `jbi_dispatches`) | ADR-047 |
