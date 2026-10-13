# PRD — Jembatan Komunikasi Dua Arah untuk Tuli di Layanan Publik

**Versi:** Final (menggabungkan seluruh revisi — kiosk 1-device, auto-capture gesture, semua perbaikan hasil review)
**Status:** Siap dipecah ke tugas FE / BE / AI

---

## 1. Ringkasan Eksekutif

Produk ini adalah **satu perangkat (kiosk)** yang ditempatkan di meja pendaftaran/konter Puskesmas untuk menjembatani komunikasi dua arah antara pasien Tuli dan petugas:

1. **Isyarat → teks + suara** — pasien mengisyaratkan ke kamera → sistem otomatis mendeteksi awal/akhir gestur → mencocokkan ke kosakata frasa yang sudah ditentukan → hasil ditampilkan sebagai teks di layar **dan** dibacakan lewat speaker, sehingga petugas tidak perlu melihat layar sama sekali.
2. **Suara/teks → isyarat** — petugas berbicara ke arah device → sistem mencocokkan ucapan secara semantik (bukan sekadar string) ke frasa terdekat → video rekaman asli BISINDO diputar di layar yang menghadap pasien.

Framing produk yang benar dan defensible di depan juri/pengguna: **"AI membantu mengenali sejumlah frasa BISINDO yang telah divalidasi untuk skenario layanan Puskesmas"** — bukan "AI menerjemahkan bahasa isyarat" secara umum. Alurnya adalah *gesture sequence → closed-vocabulary classifier → frasa Indonesia yang sudah ditentukan*, bukan penerjemahan bahasa isyarat secara umum yang sampai sekarang belum ada yang benar-benar memecahkannya.

---

## 2. Latar Belakang & Masalah

- Rasio juru bahasa isyarat (JBI) di Indonesia diperkirakan 1:3.840 orang Tuli, jauh dari standar WHO yaitu 1:100. Mayoritas interaksi penyandang Tuli dengan layanan publik terjadi **tanpa** pendampingan JBI sama sekali.
- Upaya sebelumnya (Signteraktif, dirilis 2017) mengandalkan video call ke JBI manusia, sulit di-scale karena jumlah interpreter sendiri terbatas, dan tampak sudah tidak aktif dikembangkan.
- Riset akademik lokal (skripsi/tugas akhir) sudah banyak mencoba deteksi isyarat berbasis AI (YOLOv8, CNN, MediaPipe, LSTM), tapi hampir semuanya terbatas pada **level alfabet/isyarat statis satu-satu**, bukan kalimat/frasa yang mengalir alami. Arah sebaliknya (teks/suara → animasi avatar isyarat) juga masih sangat mentah dan belum natural.
- Konsekuensi nyata dari gap ini: risiko miskomunikasi di layanan kesehatan (keluhan medis, dosis obat, jadwal kontrol) yang taruhannya bisa langsung ke keselamatan pasien.

**Masalah yang diselesaikan:** memungkinkan penyandang Tuli berkomunikasi mandiri dengan petugas Puskesmas untuk skenario umum, tanpa harus selalu menunggu ketersediaan JBI manusia — dengan tetap menyediakan jalur eskalasi ke JBI manusia untuk kasus di luar cakupan sistem.

---

## 3. Tujuan & Non-Tujuan

**Tujuan:**
1. Mengurangi ketergantungan mutlak pada JBI manusia untuk interaksi Puskesmas yang bersifat rutin/umum.
2. Memberi penyandang Tuli kemandirian berkomunikasi dasar di layanan publik.
3. Membangun fondasi kosakata & data yang bisa diperluas ke domain lain (kelurahan, kepolisian, dll) di fase berikutnya.

**Non-tujuan (di luar scope produk ini):**
- Bukan penerjemah bahasa isyarat umum/generik untuk semua topik.
- Bukan pengganti JBI manusia untuk kasus kompleks (diagnosis serius, kondisi darurat, percakapan bebas).
- Bukan avatar animasi 3D generatif — MVP menggunakan video rekaman asli, bukan animasi otomatis.
- Bukan sistem multi-device/multi-sesi pada fase MVP.

---

## 4. Keputusan Arsitektur Kunci: Kiosk 1-Device

**Keputusan:** satu tablet/laptop milik institusi (bukan device pribadi pasien atau petugas), ditempatkan di meja konter. Kamera & layar menghadap pasien, speaker cukup keras terdengar petugas, mic cukup sensitif menangkap suara petugas dari jarak meja.

```
┌─────────────────────────────┐
│      1 TABLET/LAPTOP        │
│   (milik Puskesmas, di meja)│
│                              │
│  📷 Kamera depan → pasien   │
│  🖥️ Layar → menghadap pasien│
│  🔊 Speaker → suara ke luar │
│  🎙️ Mic → tangkap suara     │
│      petugas dari jarak     │
│      dekat meja             │
└─────────────────────────────┘
```

**Kenapa bukan 2 device dengan sesi terpisah:**
- Menghilangkan seluruh kebutuhan session/room-code/QR pairing yang sebelumnya jadi celah desain terbesar (siapa bikin sesi, device mana masuk sesi mana, dsb).
- Tidak mensyaratkan pasien punya smartphone sendiri — penting untuk kesetaraan akses, karena tidak semua pasien Tuli (apalagi lansia atau ekonomi bawah) punya smartphone atau familiar meng-install aplikasi.
- Tidak butuh login harian — walk-up-and-use, cocok untuk alur antrian Puskesmas yang serba cepat.
- Demo hackathon jadi jauh lebih sederhana: cukup 1 device yang dites bolak-balik, tidak perlu simulasikan 2 device sekaligus.

**Trade-off yang diantisipasi (lihat juga §16 Risiko):**
- Privasi: suara text-to-speech dari speaker berpotensi terdengar pasien lain di sekitar konter → volume dikontrol/directional, atau device ditempatkan agak terpisah dari antrean umum.
- Noise lingkungan Puskesmas bisa mengganggu akurasi speech-to-text dari mic petugas.

**Target device:** tablet Android/iOS berbasis browser atau laptop dengan webcam, minimal resolusi kamera 720p, mic & speaker built-in yang layak (tidak memerlukan hardware tambahan untuk MVP).

---

## 5. Target Pengguna

| Persona | Kebutuhan |
|---|---|
| **Pasien Tuli** | Menyampaikan keluhan dasar & memahami respons petugas tanpa harus menunggu JBI |
| **Petugas Puskesmas** (perawat, admin pendaftaran) | Memahami keluhan pasien Tuli dan menyampaikan instruksi dasar tanpa pelatihan bahasa isyarat |
| **Admin/Validator institusi** | Mengelola kosakata & memantau log pencocokan (peran back office, bukan bagian alur komunikasi langsung) |

Pasien dan petugas **tidak perlu akun** untuk pemakaian harian (lihat §14 Role & Permission).

---

## 6. Scope: Product MVP vs Hackathon Prototype

| | **Product MVP** (visi paska-hackathon) | **Hackathon Prototype** (yang didemokan) |
|---|---|---|
| Jumlah frasa | 30–50 frasa | **5–10 frasa** |
| Rekaman referensi/frasa | 3–5 rekaman dari beberapa penanda tangan berbeda | Cukup 3 rekaman dari 1–2 penanda tangan |
| Target reliability | Diuji formal sebelum dipakai institusi nyata | Cukup reliable untuk didemokan live berulang kali tanpa gagal |

Alasan pemisahan: 40 frasa × 3–5 rekaman = 90–250 sequence referensi, ditambah variasi orang/angle/pencahayaan — jauh melebihi kapasitas waktu hackathon. **5 frasa yang benar-benar reliable lebih baik dari 40 frasa yang sering salah prediksi.**

---

## 7. Kategori Kosakata

Disusun berdasarkan alur percakapan nyata di Puskesmas, bukan daftar acak. Untuk demo hackathon, pilih 5–10 frasa dari daftar ini:

**A. Pendaftaran**
- Saya ingin berobat
- Saya punya janji
- Saya ingin bertemu dokter

**B. Keluhan**
- Saya sakit di sini *(+ isyarat menunjuk bagian tubuh)*
- Sudah berapa hari?
- Saya demam / Saya batuk / Saya pusing

**C. Obat**
- Saya alergi obat ini
- Saya butuh resep
- Cara minumnya bagaimana?

**D. Administrasi**
- Kapan kontrol berikutnya?
- Di mana ruang obat?

**E. Fallback (wajib ada di setiap set demo)**
- Saya tidak mengerti
- Tolong ulangi
- Panggil JBI

---

## 8. Fitur Produk

### Fitur A — Isyarat ke Teks/Suara
Pasien Tuli mengisyaratkan ke kamera → sistem otomatis mendeteksi awal & akhir gestur (lihat §9) → mengekstrak landmark tangan → mencocokkan ke frasa terdekat (lihat §10) → menampilkan teks dan membacakannya (text-to-speech) ke petugas.

### Fitur B — Teks/Suara ke Isyarat
Petugas berbicara atau mengetik → sistem mengubah ke teks (speech-to-text) → mencocokkan secara semantik ke frasa terdekat (lihat §11) → memutar video rekaman asli bahasa isyarat (BISINDO) untuk frasa tersebut ke layar yang menghadap pasien.

### Fitur C — Eskalasi ke JBI Manusia *(wajib ada)*
Ketika gerakan/ucapan tidak cocok dengan frasa manapun di kosakata (di bawah ambang confidence tertentu), sistem secara eksplisit menyarankan opsi "Panggil JBI" — bukan memaksakan hasil cocok yang salah.

### Fitur D — Perluasan Kosakata via Komunitas *(ROADMAP, bukan bagian MVP teknis)*
Relawan/anggota komunitas Tuli dapat mengunggah rekaman frasa baru untuk memperluas kosakata dari waktu ke waktu. **Tidak dibangun sebagai bagian arsitektur MVP** karena sebenarnya sudah menjadi "produk kedua" tersendiri (perlu moderation, versioning, approval, data quality, consent, storage, deduplikasi gestur) yang terlalu besar untuk masuk scope hackathon.

---

## 9. Pipeline Gesture Recognition — Auto-Capture

### Kenapa auto-capture, bukan push-to-talk

Mekanisme "tekan & tahan tombol → isyarat → lepas" (push-to-talk) sempat dipertimbangkan karena lebih mudah dikontrol secara sistem, tapi **cacat dari sisi kenyataan pemakaian**: banyak isyarat BISINDO memakai dua tangan sekaligus. Menekan & menahan tombol berarti salah satu tangan tidak bebas mengisyaratkan — ini membuat mekanismenya tidak natural untuk dipakai. Solusinya: **auto-capture berbasis deteksi tangan**, dengan guard rail eksplisit supaya tetap terkontrol dan reliable.

### State Machine

```
IDLE (menunggu tangan, kamera aktif)
   ↓ tangan terdeteksi ≥ threshold, bertahan ≥ 250ms
HAND_DETECTED (debounce — memastikan bukan gerakan sekilas)
   ↓ dikonfirmasi valid
RECORDING (rekam landmark tiap frame, indikator "Merekam..." aktif)
   ↓ salah satu stop condition terpenuhi
STOP → PROCESSING (kirim sequence ke matching engine)
   ↓
RESULT (tampilkan sesuai confidence logic, §10)
```

**Stop condition (salah satu terpenuhi):**
- **(a) Diam:** rata-rata perpindahan landmark antar-frame di bawah ambang gerakan, bertahan selama **1–2 detik berturut-turut** (dihitung dari buffer beberapa frame terakhir, bukan hanya 1 frame, agar tidak sensitif terhadap noise kamera).
- **(b) Tangan hilang dari frame:** MediaPipe tidak lagi mendeteksi tangan selama **> 500ms** (bukan langsung di frame pertama tangan hilang, untuk menghindari stop instan karena flicker deteksi sesaat).

### Guard Rails

| Guard rail | Nilai awal | Tujuan |
|---|---|---|
| Debounce mulai rekam | Tangan terdeteksi stabil ≥ 250ms sebelum masuk RECORDING | Mencegah gerakan tangan sekilas (lewat, menggaruk kepala) memicu rekaman penuh |
| Durasi minimum rekaman | 0.5 detik | Rekaman di bawah ini dianggap noise, tidak dikirim ke matching engine |
| Durasi maksimum rekaman (timeout) | 8 detik | Kalau tangan terus bergerak tanpa berhenti, sistem tetap memproses apa yang terekam alih-alih menggantung tanpa akhir |
| Ambang diam sebelum stop | 1–2 detik (dikalibrasi empiris) | Terlalu pendek → berhenti prematur di tengah jeda alami antar-gerakan dalam satu frasa; terlalu panjang → terasa lambat merespons |

**Catatan penting:** ambang gerakan dan durasi diam **wajib diuji langsung terhadap frasa-frasa demo sebelum hari-H**, bukan diasumsikan benar dari awal — ini variabel paling menentukan reliability keseluruhan sistem.

### Indikator Visual Status

Karena tidak ada tombol fisik yang memberi sinyal "sistem sedang mendengarkan", sistem **wajib** menampilkan status jelas:
- **IDLE:** ikon tangan abu-abu + teks "Silakan mulai mengisyaratkan"
- **HAND_DETECTED / RECORDING:** border kamera merah berkedip pelan + teks "Merekam..."
- **PROCESSING:** spinner + teks "Memproses..."
- **RESULT:** sesuai confidence logic (§10)

Fallback manual: tombol **"Ulangi Isyarat"** untuk reset paksa ke IDLE kapan pun, jika auto-capture berhenti terlalu awal/telat atau pasien ingin mengulang.

---

## 10. Confidence & Decision Logic

Prinsip utama: **salah menerjemahkan lebih berbahaya daripada mengatakan "saya tidak yakin"** — khususnya untuk produk komunikasi kesehatan. Sistem tidak boleh memaksakan nearest-match sebagai jawaban final tanpa indikasi keraguan.

**Decision boundary (nilai awal, dikalibrasi saat testing):**

| Confidence | Aksi Sistem |
|---|---|
| ≥ 85% | Tampilkan hasil langsung sebagai teks + suara |
| 60–84% | Tampilkan sebagai **konfirmasi**, bukan hasil final |
| < 60% | Tampilkan "tidak dikenali" → arahkan ke Panggil JBI |

**Tampilan untuk kasus 60–84%:**

```
Kemungkinan maksud:
"Saya butuh obat"
Confidence: 72%

[ Konfirmasi ]   [ Coba Lagi ]   [ Panggil JBI ]
```

---

## 11. Semantic Matching untuk Arah Suara → Isyarat

Ucapan petugas di dunia nyata sangat bervariasi secara kalimat meski maksudnya sama, contoh:
- "Kapan jadwal kontrol berikutnya?" *(kalimat di database)*
- "Kontrolnya datang lagi kapan ya?" *(ucapan asli petugas)*

**String matching sederhana akan gagal** untuk kasus ini. Solusi: gunakan **semantic similarity**, bukan exact/nearest text matching literal:

```
Ucapan petugas (hasil speech-to-text)
        ↓
Sentence embedding (model embedding Bahasa Indonesia yang ringan)
        ↓
Cosine similarity ke embedding tiap frasa di kosakata
        ↓
Frasa dengan similarity tertinggi (dengan threshold sama prinsipnya dengan §10)
```

Untuk hackathon-scale, gunakan model sentence-embedding pretrained Bahasa Indonesia yang ringan dijalankan tanpa training tambahan.

---

## 12. User Flow End-to-End

**Alur 1 — Isyarat ke Teks (Fitur A):**
Pasien mendekat ke kiosk → sistem di state IDLE → pasien mulai mengisyaratkan → auto-detect masuk RECORDING → pasien selesai (diam 1-2 detik atau tangan keluar frame) → PROCESSING → hasil ditampilkan sesuai confidence (§10) → teks + suara keluar untuk didengar/dilihat petugas.

**Alur 2 — Suara/Teks ke Isyarat (Fitur B):**
Petugas berbicara ke arah device → speech-to-text menangkap ucapan → semantic matching (§11) mencari frasa terdekat → video isyarat diputar di layar yang menghadap pasien.

**Eskalasi (kapan saja):** jika confidence rendah di kedua alur, atau pasien/petugas menekan "Panggil JBI" secara manual, sistem menampilkan instruksi memanggil JBI manusia — bukan memaksakan hasil.

Kedua alur berjalan independen di device yang sama; hasil dari proses pencocokan langsung ditampilkan di layar/speaker kiosk yang sama tanpa perlu koordinasi lintas device.

---

## 13. Arsitektur Teknis

| Layer | Teknologi | Peran |
|---|---|---|
| **Client** | React + Tailwind CSS | UI kiosk: kamera, indikator status capture, tampilan hasil teks/suara, pemutar video isyarat, animasi transisi antar-state |
| **Client — capture** | MediaPipe Hands/Holistic | Ekstraksi landmark tangan & pose secara real-time di browser; basis perhitungan state machine auto-capture (§9) |
| **Client — speech** | Web Speech API (browser) | Speech-to-text (ucapan petugas → teks) dan text-to-speech (teks → suara ke  petugas) |
| **Backend** | Python + FastAPI | Endpoint pencocokan sequence landmark/teks ke frasa referensi, endpoint logging |
| **Matching engine (isyarat)** | Dynamic Time Warping (DTW) / nearest-neighbor | Membandingkan sequence landmark input dengan beberapa rekaman referensi per frasa, tanpa perlu dataset besar/training deep learning |
| **Matching engine (teks)** | Sentence embedding + cosine similarity | Semantic matching ucapan petugas ke frasa terdekat (§11) |
| **Supabase — Storage** | Supabase Storage | Menyimpan video rekaman frasa (Fitur B) |
| **Supabase — Database** | Supabase Postgres | Metadata kosakata, log pencocokan (untuk evaluasi akurasi) |
| **Supabase — Auth** | Supabase Auth | Autentikasi admin/validator institusi (bukan untuk pasien/petugas harian) |

---

## 14. Role & Permission

Karena tidak ada sesi multi-device dan pemakaian bersifat walk-up-and-use, role jauh lebih sederhana:

| Role | Kebutuhan Akun? | Akses |
|---|---|---|
| **Pasien** | Tidak perlu akun | Menggunakan kamera & menerima output di kiosk |
| **Petugas** | Tidak perlu akun untuk pemakaian harian | Bicara ke device, menerima output suara |
| **Admin/Validator** (institusi) | Perlu akun (Supabase Auth) | Kelola kosakata, lihat matching logs, kelola device institusi — kebutuhan *back office*, bukan bagian alur komunikasi langsung |

---

## 15. Skema Database

```
institutions
-------------
id
name
address

devices
-------------
id
institution_id (FK)
label            -- misal "Kiosk Meja 1"
active

phrases
-------------
id
phrase_text
category          -- Pendaftaran / Keluhan / Obat / Administrasi / Fallback
language_variant  -- dialek BISINDO
active

sign_references
-------------
id
phrase_id (FK)
video_url
landmark_data
signer_id
approved

matching_logs
-------------
id
device_id (FK)
direction         -- 'sign_to_text' atau 'speech_to_sign'
predicted_phrase_id (FK, nullable)
confidence
resulted_action   -- 'accepted' / 'confirmed' / 'escalated_to_jbi'
created_at

community_submissions   -- ROADMAP, tidak dibangun di MVP teknis
-------------
id
phrase_text (usulan)
video_url
contributor_id
status            -- pending / approved / rejected
```

`matching_logs` penting bukan cuma untuk debugging, tapi jadi sumber data untuk metrik akurasi (§18).

---

## 16. Framing BISINDO yang Defensible

**Hindari klaim:**
> ❌ "AI menerjemahkan BISINDO"

**Gunakan framing:**
> ✅ "AI membantu mengenali sejumlah frasa BISINDO yang telah divalidasi untuk skenario layanan Puskesmas"

Alasan: sistem sebenarnya bukan *Bahasa Isyarat → Bahasa Indonesia* secara umum, melainkan *gesture sequence → closed-vocabulary classifier → frasa Indonesia yang sudah ditentukan sebelumnya*. Satu gesture tidak boleh diklaim setara satu kata/frasa secara universal — penting secara etis maupun untuk kredibilitas di depan juri.

---

## 17. Data & Pertimbangan Etis

- **Wajib melibatkan komunitas Tuli/JBI BISINDO sejak awal** untuk merekam data referensi dan memvalidasi kosakata — produk ini tidak boleh dibangun sepihak oleh tim dengar tanpa masukan langsung dari calon pengguna.
- **Transparansi soal cakupan dialek** — BISINDO memiliki variasi regional; MVP secara eksplisit membatasi diri ke satu dialek/wilayah (misal BISINDO Jakarta) dan tidak mengklaim universal.
- **Consent untuk rekaman video** — video wajah/tangan penerjemah yang direkam untuk kosakata harus melalui persetujuan eksplisit dan jelas kegunaannya.
- **Data pasien** — video/landmark yang ditangkap dari pasien Tuli saat pemakaian sebaiknya tidak disimpan permanen kecuali untuk keperluan evaluasi akurasi dengan consent, mengingat sensitivitas data kesehatan.

---

## 18. Kebutuhan Non-Fungsional

- **Device target:** 1 tablet/laptop per konter (§4), bukan device pribadi pasien/petugas.
- **Latensi:** hasil pencocokan (kedua arah) idealnya < 3 detik.
- **Audio:** speaker cukup jelas terdengar petugas dari jarak konter normal (~50–80 cm) tanpa volume berlebihan yang mengganggu privasi pasien lain.
- **Mic:** cukup sensitif menangkap suara petugas dari jarak yang sama, idealnya dengan noise suppression dasar.
- **Aksesibilitas UI:** kontras warna cukup, teks dapat diperbesar, ikon selalu disertai label teks.
- **Indikator status capture wajib real-time dan jelas terlihat** (IDLE/Merekam/Memproses), karena tidak ada sinyal fisik (tombol) yang menandakan sistem sedang "mendengarkan".
- **Fallback manual:** jika kamera/mic gagal, sediakan mode ketik manual di kedua arah.

---

## 19. Batasan MVP

- Tidak mendukung kalimat bebas di luar kosakata yang ditentukan (diarahkan ke eskalasi JBI).
- Tidak mendukung banyak dialek BISINDO sekaligus.
- Tidak menggunakan avatar animasi 3D generatif.
- Fitur komunitas (submission kosakata) tidak dibangun sebagai bagian arsitektur MVP teknis — hanya roadmap.
- Tidak ada dashboard B2G di fase MVP.
- Tidak ada dukungan multi-device/multi-sesi.

---

## 20. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Akurasi rendah untuk gestur yang mirip satu sama lain | Batasi kosakata demo ke frasa dengan gestur cukup berbeda; gunakan decision boundary §10 |
| Variasi gaya isyarat antar-individu (kecepatan, sudut) | Kumpulkan referensi dari beberapa penanda tangan berbeda, bukan hanya 1 orang |
| Sistem "memaksakan" jawaban yang salah | Wajib tampilkan confidence dan opsi Konfirmasi/Coba Lagi/Panggil JBI — tidak pernah silent-accept di bawah 85% |
| False start — gerakan tangan tak disengaja memicu rekaman | Debounce 250ms sebelum mulai rekam + durasi minimum 0.5 detik |
| Berhenti prematur di tengah jeda alami dalam satu frasa | Ambang diam 1–2 detik dikalibrasi empiris terhadap frasa demo aktual sebelum hari-H |
| Rekaman tidak pernah berhenti (gerakan terus-menerus) | Timeout maksimum 8 detik, sistem tetap memproses apa yang terekam |
| Pasien bingung kapan sistem "mendengarkan" (tidak ada tombol fisik) | Indikator visual status wajib selalu terlihat (§9, §18) |
| Deteksi tangan gagal karena pencahayaan/sudut kamera buruk | Indikator IDLE yang jelas membantu pasien menyesuaikan posisi; dokumentasikan kondisi pencahayaan minimum untuk demo |
| Privasi — suara text-to-speech terdengar pasien lain di sekitar konter | Volume terbatas/speaker directional; posisi device tidak persis di tengah antrean umum |
| Noise lingkungan Puskesmas mengganggu speech-to-text | Noise suppression dasar; instruksi jarak bicara ke device |
| Semantic matching gagal untuk parafrase yang terlalu jauh dari frasa asli | Threshold similarity + fallback ke konfirmasi/JBI, sama seperti §10 |
| Ketergantungan berlebihan pada sistem untuk kasus yang butuh JBI manusia | Tombol "Panggil JBI" selalu terlihat & mudah diakses, tidak tersembunyi |
| Representasi BISINDO tidak akurat/menyinggung komunitas Tuli | Validasi kosakata & UX bersama komunitas Tuli/JBI sebelum rilis |
| Klaim berlebihan ("AI menerjemahkan BISINDO") menyesatkan ekspektasi | Gunakan framing defensible di §16 secara konsisten di semua materi produk |

---

## 21. Metrik Keberhasilan

**Metodologi uji:**
```
5 frasa × 10 percobaan/frasa = 50 total percobaan

Recognition Accuracy = (jumlah prediksi benar / 50) × 100%
Target: ≥ 90%
```

**Metrik lain:**
- **Latency:** target < 3 detik dari akhir isyarat/ucapan sampai hasil muncul.
- **False prediction rate:** sistem tidak boleh memaksakan prediksi ketika confidence < 60% — dihitung terpisah dari accuracy di atas.
- **Escalation rate:** persentase percobaan yang berakhir di "Panggil JBI" — indikator seberapa sering sistem jujur mengaku tidak yakin vs assertive salah.

---

## 22. Skenario Uji

**Skenario 1 — Normal:** Pasien isyarat "Saya sakit di sini" → confidence ≥85% → petugas langsung melihat & mendengar teks yang benar.

**Skenario 2 — Ambiguous:** Pasien melakukan gestur yang mirip dua frasa → confidence 60–84% → sistem menampilkan "Apakah maksud Anda...?" dengan opsi Konfirmasi/Coba Lagi/Panggil JBI.

**Skenario 3 — Unknown:** Gestur tidak dikenali sama sekali → confidence <60% → "Tidak ada frasa yang cocok" → arahkan ke Panggil JBI.

**Skenario 4 — Gangguan (kamera/mic/koneksi):** Kamera/mic gagal atau koneksi backend terputus → sistem otomatis beralih ke mode ketik manual di kedua sisi.

**Skenario 5 — False start:** Tangan pasien lewat sekilas tanpa niat mengisyaratkan → durasi di bawah ambang minimum (0.5 detik) → sistem tidak memicu proses matching yang keliru, kembali ke IDLE.

**Skenario 6 — Jeda alami di tengah frasa:** Pasien melakukan frasa dengan jeda singkat di antara dua gerakan → jeda di bawah ambang diam 1–2 detik yang dikalibrasi → sistem tidak berhenti prematur, tetap merekam sampai frasa selesai utuh.

Skenario 5 & 6 penting didemokan karena langsung menjawab kekhawatiran utama soal auto-capture: sistem bisa salah pemicu (start) atau salah berhenti (stop) di waktu yang tidak tepat.

---

## 23. Rencana Demo Hackathon

**Yang harus berfungsi live:**
- 5–10 frasa dua arah dengan decision logic (§10) benar-benar berjalan — tunjukkan juga skenario ambiguous/unknown, bukan hanya jalur mulus, karena ini menunjukkan kematangan produk.
- Auto-capture (§9) berjalan stabil; usahakan mendemokan Skenario 5 (false start) dan Skenario 6 (jeda alami) minimal sekali untuk membuktikan sistem benar-benar teruji.

**Yang boleh berupa mockup/placeholder:**
- Sisa kosakata di luar 5–10 yang didemokan (dikomunikasikan sebagai "ini contoh dari rencana 30-50 frasa produksi").
- Dashboard admin/validator institusi.
- Fitur submission komunitas — cukup disebut sebagai roadmap, tidak perlu backend penuh.

---

## 24. Roadmap Pasca-MVP

1. **Fase 1 (MVP ini):** 1 device kiosk, 1 domain (Puskesmas), 5–10 frasa demo → 30–50 frasa produksi, 1 dialek BISINDO.
2. **Fase 2:** fitur community submission (dengan moderation penuh), perluasan domain (kelurahan, kepolisian).
3. **Fase 3:** dashboard B2G untuk institusi, eksplorasi multi-dialek, kemitraan dinas kesehatan/sosial.

---

## Lampiran

Diagram (`flow-isyarat-ke-teks.svg`, `flow-teks-ke-isyarat.svg`, `arsitektur-jembatan-isyarat.svg`, `mindmap-jembatan-isyarat.svg`) yang dibuat sebelumnya masih menggambarkan model 2-device dengan push-to-talk lama dan **perlu diperbarui** untuk mencerminkan kiosk 1-device dan state machine auto-capture (§9) sebelum dipakai presentasi final.
