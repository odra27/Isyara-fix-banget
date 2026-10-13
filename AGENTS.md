# AGENTS.md

## Jembatan Komunikasi Dua Arah untuk Tuli di Layanan Publik

Dokumen ini berisi aturan kerja engineering untuk AI coding agent dan developer dalam project ini.

Dokumen ini **bukan pengganti PRD**.

Jika terdapat konflik antara implementasi, instruksi task, dan dokumen project, agent wajib mengikuti aturan prioritas pada bagian **Source of Truth & Conflict Resolution**.

---

# 1. Project Context

Project ini adalah kiosk satu-device untuk membantu komunikasi dua arah antara pasien Tuli dan petugas Puskesmas.

Dua alur utama:

1. **Sign → Text/Speech**

   * Pasien mengisyaratkan ke kamera.
   * FE melakukan auto-capture landmark.
   * Backend menerima sequence landmark.
   * Modeling melakukan closed-vocabulary matching.
   * Backend menerapkan decision logic.
   * FE menampilkan teks dan dapat menggunakan TTS.

2. **Speech/Text → Sign**

   * Petugas berbicara atau mengetik.
   * FE menghasilkan teks.
   * Backend meneruskan utterance ke Modeling.
   * Modeling melakukan semantic matching.
   * Backend mengambil video BISINDO yang telah approved.
   * FE memutar video.

Sistem **bukan general-purpose BISINDO translator**.

Framing produk:

> AI membantu mengenali sejumlah frasa BISINDO yang telah divalidasi untuk skenario layanan Puskesmas.

---

# 2. Source of Truth

Gunakan urutan prioritas berikut ketika menentukan requirement:

1. Instruksi eksplisit user untuk task saat ini.
2. `decisions.md` / ADR yang telah disetujui.
3. PRD induk.
4. PRD khusus domain/tim.
5. Dokumentasi teknis.
6. Implementasi/code yang sudah ada.
7. Asumsi agent.

**Code yang sudah ada bukan otomatis benar.**

Jika code bertentangan dengan PRD atau ADR, jangan menganggap code sebagai source of truth.

---

# 3. Conflict Resolution

Jika menemukan konflik antara dua requirement atau keputusan:

1. **Jangan langsung mengubah code.**
2. Identifikasi konflik secara eksplisit.
3. Cari apakah konflik sudah diselesaikan oleh ADR di `decisions.md`.
4. Jika sudah ada keputusan yang relevan, ikuti keputusan tersebut.
5. Jika belum ada keputusan, laporkan konflik kepada user.
6. Jangan membuat keputusan arsitektural baru secara diam-diam.

Jika user secara eksplisit meminta perubahan terhadap keputusan yang sudah dicatat dalam ADR:

1. Jangan overwrite keputusan lama.
2. Buat ADR baru yang supersede/menggantikan keputusan lama setelah disetujui.
3. Update implementasi hanya setelah keputusan baru jelas.

Jika perubahan yang diminta bertentangan dengan ADR yang sudah disetujui dan user belum memberikan keputusan baru:

> **STOP dan laporkan konflik.**

Jangan melakukan partial implementation.

---

# 4. Read Before Modify

Sebelum mengubah file:

1. Baca `AGENTS.md`.
2. Baca PRD yang relevan dengan task.
3. Baca `decisions.md` jika tersedia.
4. Cari implementasi terkait.
5. Baca test terkait.
6. Identifikasi dependency terhadap FE, BE, Modeling, database, atau storage.

Jangan mengubah file hanya berdasarkan nama file atau asumsi struktur project.

---

# 5. Change Discipline

Setiap task harus dikerjakan dengan prinsip:

> **Smallest correct change.**

Jangan:

* refactor besar tanpa kebutuhan task,
* mengganti framework,
* mengganti database,
* mengganti arsitektur,
* menambah dependency besar,
* mengubah API contract,
* mengubah schema database,
* mengubah threshold,
* mengubah boundary antar service,

hanya karena menurut agent desain tersebut "lebih baik".

Perubahan semacam itu membutuhkan keputusan eksplisit.

---

# 6. Backend Responsibility

Backend menggunakan:

* Python
* FastAPI
* Supabase Postgres
* Supabase Storage
* Supabase Auth untuk admin

Backend bertanggung jawab atas:

* REST API.
* Request validation.
* Response contract.
* Business decision logic.
* Orkestrasi Modeling.
* Database access.
* Storage access.
* Logging.
* Admin authentication/authorization.
* Error handling.
* Timeout handling.

Backend **tidak bertanggung jawab** atas:

* UI kiosk.
* MediaPipe capture.
* Auto-capture state machine.
* Speech recognition browser.
* Text-to-speech browser.
* Algoritma DTW.
* Sentence embedding.
* Training/kalibrasi model.

---

# 7. Modeling Boundary

Backend memperlakukan Modeling sebagai service/library terpisah.

Contract sign:

```text
matchSign(sequence: Landmark[][])
    -> { phrase_id: str | None, confidence: float }
```

Contract text:

```text
matchText(utterance: str)
    -> { phrase_id: str | None, confidence: float }
```

Backend:

* boleh memanggil Modeling,
* boleh menangani timeout/error,
* boleh meneruskan input,
* boleh mengambil data phrase/reference,
* boleh menerapkan business rule.

Backend **tidak boleh**:

* mengimplementasikan DTW,
* melakukan semantic embedding,
* melakukan landmark normalization,
* melakukan model preprocessing,
* menentukan prediction secara mandiri.

Modeling juga **tidak boleh menentukan product action**.

Modeling mengembalikan:

```text
phrase_id
confidence
```

Backend menentukan:

```text
accepted
confirmed
escalated_to_jbi
```

---

# 8. Confidence Decision Logic

Decision logic adalah business rule Backend.

```text
confidence >= 0.85
    -> accepted

0.60 <= confidence < 0.85
    -> confirmed

confidence < 0.60
    -> escalated_to_jbi
```

Threshold tidak boleh diduplikasi di banyak layer.

Jangan menaruh business decision ini hanya di FE.

FE boleh menampilkan state berdasarkan response Backend, tetapi Backend tetap menjadi enforcement layer.

Threshold harus configurable sesuai PRD.

Agent tidak boleh mengubah threshold tanpa keputusan eksplisit.

---

# 9. Public API Rules

Public kiosk endpoints tidak membutuhkan authentication.

Expected public endpoints:

```text
POST /api/match/sign
POST /api/match/text
POST /api/logs
GET  /api/phrases
```

Public endpoint harus:

* melakukan validation,
* mempunyai response contract yang jelas,
* tidak menyimpan raw patient data secara default,
* menangani Modeling failure,
* menangani timeout,
* mengembalikan error terstruktur.

---

# 10. Admin API Rules

Admin endpoints membutuhkan authentication.

Expected admin endpoints:

```text
GET    /api/admin/phrases
POST   /api/admin/phrases
PATCH  /api/admin/phrases/{id}
POST   /api/admin/phrases/{id}/references
GET    /api/admin/logs
GET    /api/admin/devices
```

Admin API tidak boleh digunakan sebagai shortcut untuk mengubah public API behavior.

---

# 11. Database Rules

Core entities:

```text
institutions
devices
phrases
sign_references
matching_logs
```

`community_submissions` adalah roadmap.

Jangan membuat endpoint community submission pada MVP kecuali ada keputusan baru yang secara eksplisit memasukkannya ke scope.

Database migration harus:

* reproducible,
* versioned,
* dapat dijalankan pada environment baru,
* tidak menghapus data production secara destructive tanpa explicit instruction.

Jangan melakukan destructive migration tanpa persetujuan eksplisit.

---

# 12. Matching Logs

`matching_logs` digunakan untuk evaluasi dan observability.

Minimal informasi:

```text
device_id
direction
predicted_phrase_id
confidence
resulted_action
created_at
```

Jangan menyimpan:

* raw landmark sequence,
* raw audio,
* video pasien,

sebagai bagian dari logging normal.

Jika task membutuhkan penyimpanan data mentah untuk evaluasi, perlakukan sebagai perubahan privacy-sensitive dan jangan mengimplementasikannya diam-diam.

---

# 13. Privacy Rules

Default behavior:

```text
Patient landmark/audio
        ↓
process in memory
        ↓
matching
        ↓
response
        ↓
discard
```

Data pasien tidak boleh:

* ditulis ke database,
* ditulis ke filesystem,
* dimasukkan ke application logs,
* dikirim ke third-party service,

kecuali memang sudah menjadi bagian dari requirement yang disetujui.

Jangan menambahkan logging request body secara global karena dapat menyebabkan data sensitif tersimpan tanpa sengaja.

---

# 14. API Contract Stability

API contract dianggap shared contract antara FE, BE, dan Modeling.

Sebelum mengubah:

* endpoint,
* HTTP method,
* request field,
* response field,
* field type,
* enum,
* error format,

cek dependency terhadap client/service lain.

Jangan melakukan breaking API change hanya untuk merapikan code.

Jika breaking change memang diperlukan:

1. Laporkan dampaknya.
2. Update contract.
3. Update consumer terkait.
4. Update tests.
5. Catat keputusan jika bersifat arsitektural.

---

# 15. Error Handling

Jangan mengandalkan generic:

```text
500 Internal Server Error
```

untuk semua failure.

Backend harus membedakan error yang dapat membantu FE menentukan fallback.

Contoh kategori:

```text
VALIDATION_ERROR
DEVICE_NOT_FOUND
DEVICE_INACTIVE
PHRASE_NOT_FOUND
MODELING_TIMEOUT
MODELING_UNAVAILABLE
DATABASE_ERROR
STORAGE_ERROR
INTERNAL_ERROR
```

Error response harus konsisten.

Untuk Modeling timeout/unavailable:

> FE harus dapat mengetahui bahwa sistem dapat masuk fallback manual.

---

# 16. Timeout & Reliability

Endpoint matching memiliki target:

> p95 < 2.5 detik.

Modeling call harus memiliki timeout eksplisit.

Jangan membuat request menunggu tanpa batas.

Jika Modeling timeout:

```text
request
  ↓
timeout
  ↓
structured error
  ↓
FE fallback
```

Jangan mengembalikan prediction palsu hanya untuk menghindari error.

---

# 17. Validation Rules

Input harus divalidasi di Backend walaupun FE sudah melakukan validation.

Contoh sign matching:

```text
duration_ms >= 500
sequence tidak kosong
landmark structure valid
device_id valid
```

FE validation adalah UX layer.

BE validation adalah security/integrity layer.

Jangan mengasumsikan request dari FE selalu valid.

---

# 18. Video Reference Rules

Video yang dikembalikan untuk `speech_to_sign` harus berasal dari:

```text
sign_references
```

dengan:

```text
approved = true
```

Backend bertanggung jawab menentukan reference yang valid.

FE tidak boleh memilih arbitrary video URL sebagai hasil matching.

Tie-break rule harus mengikuti keputusan yang sudah disepakati.

Jika tie-break belum diputuskan dan task membutuhkannya:

> STOP dan minta keputusan.

Jangan mengarang aturan bisnis.

---

# 19. Testing Requirements

Setiap perubahan Backend yang memengaruhi behavior harus mempunyai test yang relevan.

Minimal test layer:

```text
unit tests
integration tests
API/contract tests
```

Untuk decision logic wajib menguji:

```text
0.00
0.59
0.60
0.84
0.85
1.00
```

Boundary value harus diuji secara eksplisit.

Untuk endpoint matching wajib menguji:

* valid request,
* invalid request,
* low confidence,
* medium confidence,
* high confidence,
* Modeling timeout,
* Modeling unavailable,
* phrase not found.

---

# 20. No Silent Acceptance

Jangan pernah mengubah:

```text
confidence < 0.85
```

menjadi automatic acceptance.

Untuk:

```text
60%–84%
```

hasil harus:

```text
confirmed
```

Untuk:

```text
<60%
```

hasil harus:

```text
escalated_to_jbi
```

Jangan membuat fallback nearest-match yang memaksa prediction ketika confidence rendah.

---

# 21. Scope Control

MVP hanya mencakup:

* kiosk satu device,
* domain Puskesmas,
* 5–10 demo phrases,
* sign → text/speech,
* speech/text → sign,
* JBI escalation,
* auto-capture integration,
* logging,
* admin API dasar,
* fallback manual.

Di luar scope:

* multi-device session,
* room code,
* QR pairing,
* patient account,
* petugas account,
* general BISINDO translation,
* generative 3D avatar,
* community submission API,
* B2G dashboard,
* multi-dialect production support.

Jangan mengimplementasikan fitur di luar scope hanya karena terlihat mudah.

---

# 22. No Premature Abstraction

Jangan membuat abstraction hanya karena:

> "nanti mungkin diperlukan."

Prioritaskan implementasi yang:

* jelas,
* mudah dites,
* sesuai contract,
* mudah diubah jika requirement berubah.

Abstraction harus mempunyai alasan konkret.

---

# 23. Dependency Rules

Sebelum menambahkan package:

1. Pastikan kebutuhan memang tidak dapat dipenuhi dependency yang sudah ada.
2. Cek apakah package diperlukan untuk MVP.
3. Hindari dependency besar untuk kebutuhan kecil.
4. Jangan mengganti dependency utama tanpa keputusan eksplisit.

Jika menambahkan dependency yang memengaruhi architecture atau deployment:

> Laporkan terlebih dahulu.

---

# 24. Git / Change Hygiene

Setiap task harus menghasilkan perubahan yang mudah direview.

Hindari:

* perubahan file tidak terkait,
* formatting seluruh repository,
* rename massal,
* refactor unrelated,
* generated files yang tidak diperlukan.

Jika menemukan masalah unrelated:

> Catat sebagai finding, jangan otomatis memperbaikinya.

---

# 25. Working Procedure

Untuk setiap task:

### Step 1 — Understand

Baca:

```text
AGENTS.md
PRD terkait
ADR terkait
code terkait
tests terkait
```

### Step 2 — Plan

Identifikasi:

```text
files affected
dependencies
API impact
database impact
cross-team impact
```

### Step 3 — Check Conflicts

Pastikan tidak bertentangan dengan:

```text
ADR
PRD
API contract
Modeling contract
privacy rules
MVP scope
```

### Step 4 — Implement

Lakukan perubahan terkecil yang memenuhi requirement.

### Step 5 — Test

Jalankan test yang relevan.

### Step 6 — Review

Periksa:

```text
behavior
contract
security
privacy
error handling
scope
```

### Step 7 — Report

Laporkan:

* perubahan,
* test yang dijalankan,
* hasil test,
* risiko,
* hal yang belum selesai.

---

# 26. Stop Conditions

Agent **WAJIB berhenti sebelum melakukan perubahan** jika:

1. Requirement bertentangan dengan ADR yang sudah disetujui.
2. Dua PRD memiliki kontradiksi yang belum diselesaikan.
3. Perubahan membutuhkan keputusan arsitektur baru.
4. Perubahan akan mengubah API contract tanpa persetujuan.
5. Perubahan akan mengubah database contract secara breaking.
6. Perubahan membutuhkan keputusan privacy baru.
7. Scope task tidak jelas dan implementasi berpotensi menghasilkan behavior yang tidak diinginkan.
8. Agent harus menebak business rule yang belum ditentukan.

Dalam kondisi tersebut, agent harus:

```text
STOP
↓
jelaskan konflik
↓
tunjukkan file/contract yang bertentangan
↓
jelaskan keputusan yang dibutuhkan
↓
tunggu instruksi
```

Jangan membuat workaround diam-diam.

---

# 27. Phase-Based Development

Project dikembangkan melalui fase berikut:

```text
Phase 0 — Contract & Architecture Freeze
Phase 1 — Backend Foundation
Phase 2 — Matching API Contract
Phase 3 — Modeling Integration
Phase 4 — Vocabulary & Reference Data
Phase 5 — Decision & Logging
Phase 6 — Admin API & Authentication
Phase 7 — Frontend ↔ Backend End-to-End
Phase 8 — Reliability, Error Handling & Privacy
Phase 9 — Calibration & Evaluation
Phase 10 — Demo Hardening & Freeze
```

Agent harus mengetahui phase aktif sebelum mengerjakan task.

Jangan mengambil pekerjaan dari phase berikutnya jika belum diperlukan untuk dependency phase saat ini.

---

# 28. Definition of Done

Task Backend dianggap selesai hanya jika:

```text
[ ] Requirement terpenuhi
[ ] Tidak bertentangan dengan PRD
[ ] Tidak bertentangan dengan ADR
[ ] API contract konsisten
[ ] Validation tersedia
[ ] Error handling sesuai
[ ] Test relevan tersedia
[ ] Privacy requirement terpenuhi
[ ] Tidak ada raw patient data yang tersimpan tanpa alasan
[ ] Tidak ada unrelated change
[ ] Tidak ada TODO kritis yang disembunyikan
```

---

# 29. Final Principle

Prinsip utama project:

> **Correctness > feature count.**

Dan khusus untuk sistem komunikasi kesehatan:

> **Mengatakan "tidak yakin" lebih baik daripada memberikan hasil yang salah dengan percaya diri.**

Agent harus memprioritaskan:

```text
Contract correctness
        ↓
Data/privacy safety
        ↓
Predictable behavior
        ↓
Testability
        ↓
Reliability
        ↓
Feature completeness
```

Jangan mengorbankan correctness dan privacy demi menambah fitur demo.
