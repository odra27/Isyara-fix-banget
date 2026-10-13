# PRD — Backend (API & Data Layer)
## Jembatan Komunikasi Dua Arah untuk Tuli di Layanan Publik

**Turunan dari:** PRD Induk (Final)
**Tim pemilik:** Backend
**Status:** Siap dikerjakan

---

## 1. Lingkup Tim Ini

BE bertanggung jawab atas:

- REST API yang dipanggil FE (matching, logging, pengambilan video)
- Orkestrasi ke **service Modeling** (matching engine isyarat & teks) — BE tidak mengimplementasikan algoritma matching itu sendiri, hanya memanggilnya (lihat §5 & `PRD-Modeling.md`)
- Skema database & migrasi (Supabase Postgres)
- Integrasi Supabase Storage (video referensi) dan Supabase Auth (admin/validator saja)
- Endpoint CRUD kosakata untuk admin (back office, bukan bagian alur real-time)

BE **tidak** mengerjakan: UI kiosk (FE), training/kalibrasi model matching (Modeling), dashboard admin (di luar scope MVP teknis).

---

## 2. Stack

| Layer | Teknologi |
|---|---|
| API server | Python + FastAPI |
| Database | Supabase Postgres |
| Storage | Supabase Storage (video rekaman frasa) |
| Auth | Supabase Auth (admin/validator saja — **bukan** untuk pasien/petugas) |
| Matching engine | Dipanggil sebagai service terpisah (lihat §5) — interface, bukan diimplementasikan di sini |

---

## 3. Prinsip Desain API

1. **Stateless per request** — tidak ada session/room untuk pasien/petugas, sesuai keputusan kiosk 1-device (PRD Induk §4). `device_id` cukup untuk identifikasi asal request.
2. **Tidak pernah silent-accept** di bawah confidence 85% — logika threshold ada di BE (bukan hanya FE) sebagai lapisan pertahanan kedua, supaya klien lain di masa depan tidak bisa membypass aturan ini.
3. **Tidak menyimpan data mentah pasien secara default.** Landmark sequence & audio mentah **tidak** disimpan permanen kecuali fitur evaluasi akurasi diaktifkan eksplisit dengan consent (lihat §8).
4. Semua endpoint publik (dipakai pasien/petugas) **tidak memerlukan auth**. Endpoint admin **wajib** auth Supabase.

---

## 4. Endpoint API

### 4.1 `POST /api/match/sign` *(publik, dipakai FE Alur A)*

**Request:**
```json
{
  "device_id": "uuid",
  "sequence": [
    { "t": 0, "landmarks": [[0.42, 0.51, -0.02], "..."] }
  ],
  "duration_ms": 1830
}
```

**Alur proses:**
1. Validasi `duration_ms` ≥ 500ms (durasi minimum) — kalau tidak, tolak dengan 422 (FE seharusnya sudah menyaring ini, ini lapisan kedua).
2. Kirim `sequence` ke Modeling service (lihat kontrak §5.1).
3. Terima `{ phrase_id, confidence }` dari Modeling.
4. Terapkan decision logic (§6) → tentukan `action`.
5. Tulis baris ke `matching_logs`.
6. Kembalikan response ke FE.

**Response (200):**
```json
{
  "phrase_id": "string | null",
  "phrase_text": "string | null",
  "confidence": 0.92,
  "action": "accepted | confirmed | escalated_to_jbi"
}
```

**Target latensi endpoint ini: < 2.5 detik p95** (bagian dari total budget 3 detik di FE).

### 4.2 `POST /api/match/text` *(publik, dipakai FE Alur B)*

**Request:**
```json
{ "device_id": "uuid", "utterance": "kontrolnya kapan lagi ya" }
```

**Alur proses:** sama seperti 4.1 tapi memanggil kontrak Modeling §5.2 (semantic similarity), dan response ditambah `video_url` yang diambil dari `sign_references` (video dengan `approved = true` untuk `phrase_id` terpilih). Satu phrase paling banyak punya **satu** reference `approved = true`, ditegakkan di DB (partial unique index) — tidak ada tie-break antar beberapa reference approved (ADR-010, ADR-042).

> **Alignment (ADR-044):** semantic text matching adalah milik Modeling; BE hanya orkestrasi, keputusan threshold, lookup phrase & reference. Endpoint ini **belum diimplementasikan** karena kontrak `matchText` Modeling belum tersedia. Video reference ada di bucket private, jadi `video_url` untuk kiosk nantinya berupa signed URL, bukan URL publik permanen (ADR-042).

**Response (200):**
```json
{
  "phrase_id": "string | null",
  "phrase_text": "string | null",
  "confidence": 0.78,
  "action": "confirmed",
  "video_url": "https://.../sign-references/xxxx.mp4"
}
```

### 4.3 `POST /api/logs` *(publik)*

Untuk mencatat aksi lanjutan dari FE yang tidak otomatis tertangkap oleh 4.1/4.2 (misalnya user menekan "Konfirmasi" setelah hasil `confirmed`, atau "Panggil JBI" manual dari state manapun).

**Request:**
```json
{
  "device_id": "uuid",
  "direction": "sign_to_text | speech_to_sign",
  "predicted_phrase_id": "string | null",
  "confidence": 0.72,
  "resulted_action": "accepted | confirmed | escalated_to_jbi"
}
```
**Response:** `204 No Content`

### 4.4 `GET /api/phrases` *(publik, read-only)*

Dipakai FE untuk memuat daftar kosakata aktif (misalnya untuk mode fallback ketik — supaya bisa menampilkan pilihan frasa, bukan free text yang harus di-parse ulang).

**Response:**
```json
[
  { "id": "string", "phrase_text": "Saya sakit di sini", "category": "Keluhan" }
]
```
Hanya kembalikan `phrases` dengan `active = true`.

### 4.5 Endpoint Admin (auth wajib — Supabase Auth)

Back office, di luar alur real-time kiosk. Cukup didefinisikan sebagai CRUD standar, detail UI-nya di luar scope MVP teknis (PRD Induk §19):

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/admin/phrases` | List semua frasa (termasuk nonaktif) |
| `POST` | `/api/admin/phrases` | Tambah frasa baru |
| `PATCH` | `/api/admin/phrases/{id}` | Edit/aktif-nonaktifkan frasa |
| `POST` | `/api/admin/phrases/{id}/references` | Upload video referensi ke Storage private; langsung `approved = true`; tanpa ekstraksi landmark (ADR-042) |
| `GET` | `/api/admin/logs` | Lihat `matching_logs` untuk evaluasi akurasi |
| `GET` | `/api/admin/devices` | List device per institusi |

> **Alignment (ADR-039–ADR-043):** kontrak detail endpoint admin (auth Supabase JWT ES256 + `app_metadata.role == "admin"`, validasi 422, 409 `CONFLICT`, pagination `page`/`page_size` 1/50 maks 100, bentuk list `{items, page, page_size, total}`, field yang boleh diedit, filter logs, urutan default) ditetapkan di ADR-039 s.d. ADR-043, bukan di tabel ini. Tidak ada endpoint DELETE; penghapusan phrase lewat `active = false` (ADR-041).
>
> **Reference upload (ADR-042):** maksimal satu reference approved per phrase (409 `CONFLICT` jika sudah ada, tanpa auto-unapprove), bucket Supabase Storage **private**, object path dibuat BE, tidak boleh overwrite, object reference disimpan di `video_url`, akses lewat signed URL. BE **tidak** memicu ekstraksi landmark dan tidak mengisi `landmark_data`. Konfigurasi (ADR-046): bucket `sign-references` (private), `video/mp4` / `video/webm`, maks. 50 MB, signed URL 3600 detik; env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side saja), `SUPABASE_STORAGE_BUCKET`. Request: `multipart/form-data` dengan tepat satu part `file`; response 201 berisi `video_url` (object path) + `signed_url`.

---

## 5. Kontrak dengan Modeling Service (WAJIB dibaca bersama `PRD-Modeling.md`)

> **Catatan dokumentasi (belum diselesaikan):** saat ini ada dua dokumen PRD Modeling yang isinya berbeda — `PRD-Modeling.md` di branch `main` (DTW terhadap reference, `matchText` embedding) dan `PRD-modeling.md` di branch Modeling (klasifikasi GRU untuk Fitur A). Mana yang berlaku belum diputuskan; kontrak teknis mengikuti implementasi Modeling aktual (ADR-044 §14).

BE memanggil Modeling sebagai **service/library terpisah** (boleh in-process function call untuk MVP, atau internal HTTP call — keputusan implementasi BE, asal interface berikut dipegang):

### 5.1 Matching Isyarat
```
matchSign(sequence: Landmark[][]) -> { phrase_id: str | None, confidence: float }
```
- `sequence` adalah landmark per frame (hasil dari FE, diteruskan mentah oleh BE).
- Modeling bertanggung jawab penuh atas algoritma inferensi.
  > **Alignment (ADR-010, ADR-042):** Modeling **tidak** memakai `sign_references` saat inferensi runtime; video reference adalah aset output untuk Alur B saja. Kalimat lama "perbandingan ke seluruh `sign_references` yang `approved = true`" tidak berlaku. (Bentuk `sequence` juga sudah diganti canonical `Sequence`, ADR-004.)
- BE **tidak** melakukan preprocessing/normalisasi landmark — itu tanggung jawab Modeling, supaya BE tetap sebagai orkestrator tipis.

### 5.2 Matching Teks
```
matchText(utterance: str) -> { phrase_id: str | None, confidence: float }
```
- Modeling bertanggung jawab atas embedding + cosine similarity terhadap seluruh `phrases` yang `active = true`.
  > **Alignment (ADR-044):** kepemilikan ini dikonfirmasi — semantic matching milik Modeling, BE tidak mengimplementasikan embedding/similarity/ranking sendiri. Signature di atas belum diverifikasi terhadap artefak Modeling; interface `matchText` belum ada di branch Modeling, sehingga `/api/match/text` masih terblokir.

**Kontrak penting:** Modeling **tidak** menerapkan threshold 85%/60% — itu keputusan produk yang diterapkan di BE (§6), supaya satu tempat saja yang menentukan aturan bisnis ini dan mudah dikalibrasi ulang tanpa menyentuh kode model.

---

## 6. Decision Logic (Confidence Threshold) — Implementasi di BE

Ini **bukan** keputusan model, tapi aturan bisnis yang wajib hidup di layer BE (lapisan pertahanan agar tidak bisa dibypass client):

```python
def decide_action(confidence: float) -> str:
    if confidence >= 0.85:
        return "accepted"
    elif confidence >= 0.60:
        return "confirmed"
    else:
        return "escalated_to_jbi"
```

Nilai `0.85` dan `0.60` harus berupa **config yang bisa diubah tanpa deploy ulang kode** (env var atau baris di tabel config/DB) — PRD Induk menekankan nilai ini wajib dikalibrasi empiris sebelum hari-H.

---

## 7. Skema Database (Supabase Postgres)

```sql
-- institutions
create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text
);

-- devices
create table devices (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id),
  label text not null,           -- misal "Kiosk Meja 1"
  active boolean default true
);

-- phrases
create table phrases (
  id uuid primary key default gen_random_uuid(),
  phrase_text text not null,
  category text not null,        -- Pendaftaran / Keluhan / Obat / Administrasi / Fallback
  language_variant text not null default 'BISINDO-Jakarta',
  active boolean default true
);

-- sign_references
create table sign_references (
  id uuid primary key default gen_random_uuid(),
  phrase_id uuid references phrases(id) not null,
  video_url text not null,
  landmark_data jsonb,            -- tidak diisi BE di MVP; tidak ada ekstraksi landmark (ADR-042 §14)
  signer_id text,
  approved boolean default false  -- maks. satu true per phrase (partial unique index, ADR-042)
);

-- matching_logs
create table matching_logs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references devices(id) not null,
  direction text not null check (direction in ('sign_to_text', 'speech_to_sign')),
  predicted_phrase_id uuid references phrases(id),
  confidence numeric(5,4) not null,   -- 4 desimal sesuai Modeling (ADR-007, ADR-038 §8)
  resulted_action text not null check (resulted_action in ('accepted', 'confirmed', 'escalated_to_jbi')),
  created_at timestamptz default now()
);

-- community_submissions (ROADMAP — buat tabel kosong/skip di MVP, jangan bangun endpoint-nya)
create table community_submissions (
  id uuid primary key default gen_random_uuid(),
  phrase_text text,
  video_url text,
  contributor_id text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected'))
);
```

**Indeks yang disarankan:**
- `matching_logs(device_id, created_at)` — untuk query evaluasi per device/periode.
- `sign_references(phrase_id, approved)` — dipanggil tiap kali matching berjalan.
- `phrases(active)` — dipanggil tiap `GET /api/phrases`.

**Catatan penting:** `community_submissions` dibuat sebagai tabel saja (skema siap), **tanpa endpoint API** — sesuai PRD Induk §8 Fitur D & §19, fitur ini bukan bagian arsitektur MVP teknis.

---

## 8. Data & Privasi (kewajiban BE)

- **`matching_logs` tidak menyimpan landmark/audio mentah** — hanya `confidence`, `predicted_phrase_id`, `resulted_action`. Ini cukup untuk metrik akurasi (§9) tanpa menyimpan data sensitif pasien.
- Sequence landmark & audio yang dikirim FE ke `/api/match/*` **diproses in-memory dan dibuang setelah response dikirim** — tidak ditulis ke disk/DB kecuali fitur evaluasi eksplisit (di luar MVP) diaktifkan dengan consent terdokumentasi.
- Video di `sign_references` adalah rekaman **penerjemah/relawan** (bukan pasien) dan memerlukan consent terpisah yang dikelola di luar sistem teknis (proses administratif, dicatat statusnya lewat kolom `approved`).

---

## 9. Non-Functional Requirements (BE)

- **Latensi:** p95 < 2.5 detik untuk `/api/match/*` (termasuk waktu panggil Modeling).
- **Reliability saat demo:** endpoint match harus punya timeout eksplisit (misal 4 detik) dan mengembalikan error terstruktur yang jelas agar FE bisa trigger fallback mode ketik, bukan hang tanpa respons.
- **Idempotency tidak kritis** untuk MVP (tidak ada retry otomatis kompleks), tapi tiap request logging harus tetap konsisten meski dipanggil dua kali oleh FE karena retry jaringan.
- **CORS:** izinkan origin dari domain kiosk FE saja.

---

## 10. Metrik yang Harus Bisa Dihitung dari Data BE (untuk evaluasi, PRD Induk §21)

```
Recognition Accuracy = (jumlah matching_logs dengan resulted_action='accepted' 
                         DAN prediksi benar secara manual / total percobaan) × 100%
Escalation Rate       = (jumlah resulted_action='escalated_to_jbi' / total) × 100%
```
Sediakan query/endpoint admin sederhana (`GET /api/admin/logs`) yang bisa diexport untuk dihitung manual oleh tim evaluasi — **tidak perlu dashboard visual di MVP**.

---

## 11. Di Luar Scope BE (MVP)

- Dashboard admin visual (hanya endpoint data mentah yang disediakan).
- Endpoint untuk `community_submissions` (tabel ada, API tidak).
- Multi-tenant billing/quota antar institusi.
- Rate limiting kompleks (device tunggal per konter, volume rendah).

---

## 12. Pertanyaan Terbuka untuk Tim Produk

- ~~Siapa yang menandai `sign_references.approved = true` — otomatis setelah upload admin, atau perlu approval berjenjang?~~ **Terjawab (ADR-042):** upload oleh admin terautentikasi langsung `approved = true`; tidak ada role validator/approval berjenjang di MVP.
- Apakah `matching_logs` perlu kolom tambahan untuk menandai "evaluasi akurasi manual" (benar/salah menurut penguji), atau itu dihitung terpisah di spreadsheet?
- Berapa lama `matching_logs` disimpan (retensi)?
