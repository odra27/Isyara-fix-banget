# Rekomendasi & Spesifikasi Teknis Penambahan Backend & Database
## Proyek "Jembatan" — Kiosk Dua Arah Komunikasi Tuli di Layanan Publik (Puskesmas)

Dokumen ini merangkum seluruh analisis kebutuhan penambahan pada **sisi Backend (FastAPI)** dan **Database (Supabase PostgreSQL)** untuk mendukung antarmuka pengguna (UI) dashboard petugas/admin, alur multi-tenancy institusi, serta operasional kiosk dua arah.

---

## 1. Ringkasan Kebutuhan & Filosofi Arsitektur

### 1.1 Model Akun & Keamanan
* **Model yang Diterapkan:** **Institusi / Puskesmas → Membuat Akun Pegawai → Pegawai Login**.
* **Bukan:** Public self-registration (sign up bebas ditutup untuk publik).
* **Bukan:** Satu akun dipakai bersama (shared account).
* **Tujuan:** Menghadirkan standar sistem kesehatan (*Enterprise Healthcare B2B/B2G*). Setiap interaksi medis/komunikasi tercatat akuntabilitasnya: *Puskesmas mana, Kiosk/Meja nomor berapa, Dokter/Petugas siapa yang mendampingi, dan Pasien nomor berapa yang dilayani.*

---

## 2. Rencana Penambahan Skema Database (Supabase PostgreSQL)

Berikut adalah rancangan migrasi DDL yang disarankan untuk ditambahkan ke `supabase/migrations/`:

### 2.1 Tabel Baru: Profil Staf (`staff_profiles`)
Menghubungkan akun bawaan Supabase (`auth.users`) dengan institusi Puskesmas (`institutions`) serta menyimpan metadata operasional.

```sql
create table staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid not null references institutions(id),
  nip varchar(50) unique,                  -- Nomor Induk Pegawai (e.g. "19890512 202012 2 001")
  username varchar(50) unique,             -- Username login alternatif selain email
  full_name text not null,                 -- e.g. "dr. Sarah Wijaya"
  role text not null check (role in ('admin', 'petugas')),
  unit_kerja text not null,                -- e.g. "Puskesmas Krobokan" atau "Poli Umum"
  job_title text not null,                 -- e.g. "Dokter Umum", "Perawat Pendaftaran"
  shift_schedule text,                     -- e.g. "08:00 - 14:00"
  avatar_url text,                         -- URL foto profil
  active boolean default true,
  created_at timestamptz default now()
);

-- Indeks performa pencarian
create index staff_profiles_institution_idx on staff_profiles(institution_id);
create index staff_profiles_nip_idx on staff_profiles(nip);
create index staff_profiles_username_idx on staff_profiles(username);
```

### 2.2 Penyesuaian Tabel `devices` (Status Kiosk Online)
Mendukung indikator **"🟢 Kiosk Online"** pada header dashboard dokter.

```sql
alter table devices add column if not exists last_heartbeat_at timestamptz;
alter table devices add column if not exists status text default 'offline' check (status in ('online', 'offline', 'in_use'));
```

### 2.3 Tabel Baru: Data Pasien & Antrean (`patients`)
Mendukung widget **"Informasi Pasien" (Pasien 001 / ID: 20250526001)** dan menu sidebar **"Pasien"**.

```sql
create table patients (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  patient_number varchar(50) not null,   -- Nomor Rekam Medis / Identitas Pasien
  display_name text not null,            -- e.g. "Pasien 001"
  category text default 'Pengunjung Baru' check (category in ('Pengunjung Baru', 'Pasien Lama')),
  created_at timestamptz default now()
);

create index patients_institution_idx on patients(institution_id);
```

### 2.4 Penyesuaian Tabel `matching_logs` (Audit Trail Sesi)
Menghubungkan interaksi komunikasi dengan staf yang sedang login dan pasien yang sedang dilayani.

```sql
alter table matching_logs add column if not exists staff_id uuid references staff_profiles(id);
alter table matching_logs add column if not exists patient_id uuid references patients(id);
```

### 2.5 Tabel Opsional: Eskalasi Panggilan JBI (`jbi_dispatches`)
Mendukung tombol darurat **"Panggil JBI"**.

```sql
create table jbi_dispatches (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  device_id uuid not null references devices(id),
  staff_id uuid not null references staff_profiles(id),
  notes text,
  status text default 'requested' check (status in ('requested', 'accepted', 'completed', 'cancelled')),
  created_at timestamptz default now()
);
```

---

## 3. Rencana Penambahan Endpoint Backend (FastAPI)

### 3.1 Modul Autentikasi & Profil (`app/api/auth.py`)
1. **`POST /api/auth/login`**
   - **Tujuan:** Menerima login dengan fleksibilitas (Email, NIP, atau Username) + Password.
   - **Mekanisme:** Jika input adalah NIP/Username, backend men-lookup email pemilik akun terlebih dahulu dari tabel `staff_profiles`, lalu memverifikasi credential ke Supabase Auth.
   - **Response:** Bearer JWT access token + refresh token.
2. **`GET /api/me`**
   - **Tujuan:** Mengembalikan data profil staf yang sedang login untuk mengisi layar sambutan (Screen 2) dan header layar utama (Screen 3).
   - **Response (200):**
     ```json
     {
       "id": "uuid",
       "full_name": "dr. Sarah Wijaya",
       "role": "petugas",
       "job_title": "Dokter Umum",
       "nip": "19890512 202012 2 001",
       "unit_kerja": "Puskesmas Krobokan",
       "shift_schedule": "08:00 - 14:00",
       "avatar_url": "https://...",
       "institution": {
         "id": "uuid",
         "name": "Puskesmas Krobokan"
       }
     }
     ```

### 3.2 Manajemen Pegawai oleh Admin Institusi (`app/api/admin.py`)
1. **`POST /api/admin/staff`** (Khusus role `admin`)
   - **Tujuan:** Admin Puskesmas mendaftarkan pegawai baru (dokter/perawat/petugas konter).
   - **Mekanisme:** Backend menggunakan Supabase Admin Client (`service_role`) untuk memanggil `auth.admin.create_user()`, lalu menyimpan profil ke `staff_profiles` dengan `institution_id` yang terikat.
2. **`GET /api/admin/staff`**
   - **Tujuan:** Menampilkan daftar seluruh staf di Puskesmas tersebut.
3. **`PATCH /api/admin/staff/{id}`** & **`POST /api/admin/staff/{id}/reset-password`**
   - **Tujuan:** Mengubah status aktif/nonaktif pegawai dan mereset password staf jika lupa.

### 3.3 Hardware Kiosk & Heartbeat (`app/api/devices.py`)
1. **`POST /api/devices/{device_id}/heartbeat`**
   - **Tujuan:** Dipanggil secara berkala oleh tablet kiosk (misal tiap 30 detik).
   - **Aksi:** Memperbarui kolom `last_heartbeat_at` dan mengubah status menjadi `'online'`.
2. **`GET /api/devices/{device_id}/status`**
   - **Tujuan:** Dipanggil oleh dashboard petugas untuk mengecek apakah kiosk online atau offline.

### 3.4 Operasional Alur Dua Arah & Tombol Dashboard Dokter
1. **`POST /api/match/text` (Speech/Text → Sign Video)**
   - **Status Saat Ini:** Tertulis pada PRD-BE §4.2 namun belum diimplementasikan.
   - **Tujuan:** Menjalankan tombol *"Mulai Interaksi Suara"* dan *"Ketik Manual"*.
   - **Input:** `{ "device_id": "...", "utterance": "Silakan duduk dan tunggu panggilan resep" }`
   - **Output:** `{ "phrase_id": "...", "phrase_text": "...", "confidence": 0.94, "action": "accepted", "video_url": "https://...signed-url.mp4" }`
2. **`POST /api/kiosk/call-jbi`**
   - **Tujuan:** Menjalankan tombol *"Panggil JBI"*. Mencatat kebutuhan eskalasi manual ke juru bahasa isyarat.
3. **`GET /api/references`**
   - **Tujuan:** Memuat katalog video referensi BISINDO yang sudah disetujui untuk shortcut/menu sidebar *"Video Referensi"*.

### 3.5 Manajemen Pasien & Riwayat Antrean (`app/api/patients.py` & `app/api/logs.py`)
1. **`GET /api/patients`** & **`GET /api/patients/{id}/history`**
   - Menampilkan daftar pasien dan riwayat log komunikasi pasien tertentu.
2. **`GET /api/staff/logs`**
   - Berbeda dengan `/api/admin/logs` yang hanya bisa diakses admin, endpoint ini memungkinkan dokter/petugas melihat interaksi yang mereka lakukan hari ini.

---

## 4. Matriks Pemetaan Mockup UI ke Backend

| Elemen pada Desain UI | Kebutuhan Database | Kebutuhan Backend API |
|---|---|---|
| **Form Login (Email/Username + Password)** | `staff_profiles.username`, `staff_profiles.nip` | `POST /api/auth/login` (Resolver username/NIP ke email) |
| **Kartu Pegawai (dr. Sarah, NIP, Poli, Jadwal)** | `staff_profiles` | `GET /api/me` |
| **Status "🟢 Kiosk Online" & Sinyal** | `devices.last_heartbeat_at`, `devices.status` | `POST /api/devices/{id}/heartbeat`, `GET /api/devices/{id}/status` |
| **Widget Informasi Pasien (Pasien 001, Pengunjung Baru)** | Tabel `patients` | `GET /api/patients/current` atau `GET /api/patients/{id}` |
| **Tombol "Mulai Interaksi Suara"** | Relasi ke `phrases` & `sign_references` | `POST /api/match/text` |
| **Tombol "Ketik Manual"** | `phrases.phrase_text` | `GET /api/phrases` & `POST /api/match/text` |
| **Tombol "Panggil JBI"** | Tabel `jbi_dispatches` atau `matching_logs` | `POST /api/kiosk/call-jbi` |
| **Menu Sidebar "Riwayat Interaksi"** | `matching_logs` (dengan `staff_id`) | `GET /api/staff/logs` |
| **Menu Sidebar "Video Referensi"** | `sign_references` (`approved = true`) | `GET /api/references` |
| **Menu Sidebar "Pasien"** | Tabel `patients` | `GET /api/patients` |

---

## 5. Prioritas Langkah Pengerjaan (Roadmap)

1. **Prioritas 1 (Wajib untuk Presentasi Demo):**
   - Migrasi tabel `staff_profiles`.
   - Endpoint login & `GET /api/me` agar login di frontend berjalan dinamis.
   - Endpoint `POST /api/match/text` agar tombol suara/ketik di sisi dokter bisa menghasilkan video isyarat ke pasien.
   - Endpoint status kiosk (`last_heartbeat_at`) agar indikator online/offline berfungsi.
2. **Prioritas 2 (Kelengkapan Dashboard Operasional):**
   - Mock endpoint pasien (`patients`) dan riwayat interaksi staf (`/api/staff/logs`).
   - Endpoint aksi pemanggilan JBI (`/api/kiosk/call-jbi`).
3. **Prioritas 3 (Back Office Admin Puskesmas):**
   - CRUD manajemen staf Puskesmas (`/api/admin/staff`) untuk pembuatan akun dokter baru oleh IT Puskesmas.
