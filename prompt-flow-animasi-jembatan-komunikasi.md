# PROMPT — Flow, State Machine & Animasi: Kiosk Jembatan Komunikasi Tuli

> Paste seluruh isi di bawah garis ini ke AI coding tool (Claude Code / Cursor / dll).
> Lampirkan juga `PRD-jembatan-komunikasi-tuli-final.md` sebagai sumber kebenaran.

---

## 0. PERAN & RUANG LINGKUP

Kamu adalah senior frontend engineer yang mengerjakan **lapisan interaksi (flow, state machine, animasi, timing)** untuk kiosk komunikasi dua arah Tuli ↔ petugas Puskesmas, sesuai PRD terlampir.

**YANG DIKERJAKAN:**
- State machine untuk Alur A (isyarat → teks/suara) dan Alur B (suara/teks → isyarat), plus eskalasi & fallback.
- Hook/logic auto-capture gesture (MediaPipe) dengan guard rail.
- Spesifikasi & implementasi animasi/transisi antar-state (GSAP).
- Service layer ter-mock agar flow bisa diuji tanpa backend.
- Panel simulator dev untuk memaksa state/confidence (untuk uji Skenario 1–6 di PRD §22).

**YANG TIDAK DIKERJAKAN (penting):**
- **Jangan mendesain UI/UX final** (layout, palet warna, tipografi, ilustrasi, branding). Itu dikerjakan terpisah.
- Komponen yang kamu buat harus **headless / minimal-styled**: struktur DOM semantik + class Tailwind seperlunya agar bisa dilihat, dengan `data-state` dan `data-*` attribute sebagai "kait" untuk animasi & styling nanti.
- Jangan membuat halaman marketing/landing, dashboard admin, atau backend FastAPI sungguhan.

Kalau ada keputusan yang ambigu, **tulis asumsi di awal jawaban lalu lanjut** — jangan berhenti bertanya kecuali benar-benar buntu.

---

## 1. STACK

- React 18 + TypeScript (strict) + Tailwind CSS
- **GSAP** untuk semua animasi (gunakan `gsap.context()` + cleanup di setiap komponen; hormati `prefers-reduced-motion` lewat `gsap.matchMedia()`)
- **MediaPipe Hands** (`@mediapipe/tasks-vision`) di browser
- **Web Speech API** (`SpeechRecognition` + `speechSynthesis`), locale `id-ID`
- State machine: pakai **XState v5** *atau* `useReducer` + tabel transisi eksplisit (pilih salah satu, jelaskan alasannya dalam 2 kalimat)
- Struktur mengikuti shadcn (`/components/ui` untuk primitif, komponen fitur di `/components/kiosk`)

Struktur folder yang diminta:

```
src/
  config/
    capture.config.ts      // semua angka timing & threshold (lihat §3)
    confidence.config.ts   // 85 / 60
    phrases.mock.ts        // 8 frasa demo + fallback (dari PRD §7)
  machines/
    signToText.machine.ts
    speechToSign.machine.ts
    kiosk.machine.ts       // orkestrasi kedua alur + eskalasi + fallback mode
  hooks/
    useHandTracking.ts     // wrapper MediaPipe → stream landmark per frame
    useAutoCapture.ts      // logika debounce/stop-condition (murni, bisa di-unit-test)
    useSpeechIn.ts         // STT
    useSpeechOut.ts        // TTS
    useReducedMotion.ts
  services/
    matching.service.ts    // interface + implementasi mock (delay & confidence bisa diatur)
  animations/
    timelines.ts           // semua timeline GSAP bernama (lihat §6)
    tokens.ts              // durasi & easing terpusat
  components/kiosk/        // komponen headless per state
  dev/
    SimulatorPanel.tsx     // hanya tampil jika ?dev=1
```

---

## 2. PRINSIP YANG TIDAK BOLEH DILANGGAR

1. **Salah menerjemahkan lebih buruk daripada bilang "tidak yakin."** Tidak ada silent-accept di bawah 85%.
2. **Semua status sistem harus terlihat, bukan hanya terdengar.** Pengguna utama adalah Tuli — tidak boleh ada informasi penting yang hanya disampaikan lewat suara. Tidak ada tombol fisik untuk menandai "sedang mendengarkan", jadi indikator visual adalah satu-satunya sinyal.
3. **Tombol "Panggil JBI" selalu ada di DOM dan terjangkau dari state manapun.**
4. **Framing copy:** jangan pernah menulis "menerjemahkan BISINDO." Gunakan "mengenali frasa BISINDO yang telah divalidasi untuk layanan Puskesmas" bila copy semacam itu diperlukan.
5. **Tidak ada data pasien yang disimpan** (video/landmark) di sisi client selain buffer sementara di memori; buffer dibuang setelah PROCESSING selesai.
6. Animasi tidak boleh berkedip > 3 kali/detik (keamanan fotosensitif). Pulse "Merekam" harus **pelan**.
7. Semua angka timing/threshold berada di `config/`, **tidak di-hardcode di komponen** — karena PRD mewajibkan kalibrasi empiris sebelum hari-H.

---

## 3. CONFIG AWAL (nilai dari PRD §9 & §10 — semuanya harus mudah diubah)

```ts
// capture.config.ts
export const CAPTURE = {
  handStableMs: 250,          // debounce sebelum masuk RECORDING
  minRecordMs: 500,           // di bawah ini = noise, buang, kembali IDLE
  maxRecordMs: 8000,          // timeout paksa → tetap PROCESSING
  stillHoldMs: 1500,          // rentang 1000–2000, dikalibrasi
  handLostMs: 500,            // tangan hilang > ini = stop
  motionWindowFrames: 10,     // rata-rata perpindahan dihitung dari N frame terakhir
  motionThreshold: 0.008,     // perpindahan landmark ternormalisasi; WAJIB dikalibrasi
  minHandConfidence: 0.6,
} as const;

// confidence.config.ts
export const CONFIDENCE = { accept: 0.85, confirm: 0.60 } as const;
```

Buat juga **overlay debug** (aktif di `?dev=1`) yang menampilkan real-time: state saat ini, nilai motion rata-rata, timer diam, timer tangan hilang, durasi rekaman, jumlah frame terekam. Ini dipakai untuk kalibrasi.

---

## 4. ALUR A — ISYARAT → TEKS/SUARA (state machine)

```
IDLE → HAND_DETECTED → RECORDING → PROCESSING → RESULT_* → (kembali IDLE)
```

**Spesifikasi transisi:**

| Dari | Event / Kondisi | Ke | Catatan |
|---|---|---|---|
| IDLE | tangan terdeteksi (conf ≥ `minHandConfidence`) | HAND_DETECTED | mulai timer debounce |
| HAND_DETECTED | tangan hilang sebelum `handStableMs` | IDLE | ini false start (Skenario 5) |
| HAND_DETECTED | tangan stabil ≥ `handStableMs` | RECORDING | mulai rekam landmark per frame |
| RECORDING | rata-rata motion di bawah `motionThreshold` selama ≥ `stillHoldMs` | PROCESSING | stop condition (a) |
| RECORDING | tangan hilang > `handLostMs` | PROCESSING | stop condition (b); tolerir flicker < `handLostMs` |
| RECORDING | durasi ≥ `maxRecordMs` | PROCESSING | timeout |
| PROCESSING | durasi rekaman < `minRecordMs` | IDLE | buang, tidak kirim ke matching |
| PROCESSING | hasil matching diterima | RESULT_ACCEPT / RESULT_CONFIRM / RESULT_UNKNOWN | sesuai §5 |
| * (apa pun) | tombol "Ulangi Isyarat" | IDLE | reset paksa, buang buffer |
| * (apa pun) | tombol "Panggil JBI" | ESCALATED | lihat §7 |

**Detail penting yang harus benar:**
- Timer "diam" **reset** setiap motion melewati threshold → jeda alami di tengah frasa (< `stillHoldMs`) tidak boleh memutus rekaman (Skenario 6).
- Hitung motion dari **rata-rata beberapa frame terakhir**, bukan 1 frame, agar kebal noise kamera.
- Logic `useAutoCapture` harus **fungsi/reducer murni** yang menerima `(frame | null, timestamp)` dan mengembalikan state + event — supaya bisa di-unit-test dengan rekaman frame sintetis tanpa kamera.
- Tulis unit test untuk: false start, jeda alami, tangan flicker 200ms (tidak boleh stop), tangan hilang 600ms (harus stop), gerakan tanpa henti (harus kena timeout 8 detik).

---

## 5. KEPUTUSAN CONFIDENCE (dipakai kedua alur)

| Confidence | State hasil | Aksi |
|---|---|---|
| ≥ 85% | `RESULT_ACCEPT` | Tampilkan teks + **TTS otomatis** ke petugas |
| 60–84% | `RESULT_CONFIRM` | Tampilkan "Kemungkinan maksud: …" + confidence + 3 tombol: **Konfirmasi / Coba Lagi / Panggil JBI**. TTS **hanya jalan setelah Konfirmasi** |
| < 60% | `RESULT_UNKNOWN` | "Tidak ada frasa yang cocok" + tombol utama **Panggil JBI** + **Coba Lagi** |

Setiap hasil menulis satu entri log (mock di console/array) dengan `direction`, `predicted_phrase_id`, `confidence`, `resulted_action` (`accepted | confirmed | escalated_to_jbi`) sesuai skema `matching_logs`.

`RESULT_*` otomatis kembali ke IDLE setelah timeout wajar (usulkan angka, taruh di config) **kecuali** `RESULT_CONFIRM` yang menunggu aksi pengguna.

---

## 6. ALUR B — SUARA/TEKS → ISYARAT (state machine)

```
B_IDLE → B_LISTENING → B_TRANSCRIBING → B_MATCHING → B_PLAYING_SIGN → B_DONE
                                   ↘ B_CONFIRM      ↘ B_NO_MATCH
```

- Petugas memicu dengan **tombol besar "Bicara"** atau input ketik. (Wake-word tidak masuk scope.) Tampilkan transkrip interim secara live saat `B_LISTENING`.
- Matching semantik: di service mock, kembalikan frasa + similarity dari tabel yang bisa diatur simulator. Interface-nya harus identik dengan versi asli (embedding + cosine similarity) supaya tinggal ditukar.
- Threshold sama dengan §5. Untuk 60–84%: tampilkan "Maksud Anda: …?" ke **petugas** (bukan pasien) dengan Konfirmasi/Coba Lagi sebelum video diputar ke pasien.
- `B_PLAYING_SIGN`: putar video referensi (placeholder video lokal), dengan kontrol **Ulangi** dan indikator progres. Setelah selesai → `B_DONE` → kembali `B_IDLE`.
- Teks frasa ditampilkan **berdampingan** dengan video (pasien bisa membaca; petugas bisa memverifikasi).

---

## 7. ORKESTRASI, ESKALASI & FALLBACK (`kiosk.machine.ts`)

**Dua alur berjalan independen di device yang sama, tetapi perlu aturan arbitrase:**
1. **Cegah feedback loop:** saat TTS berbunyi (Alur A hasil), **pause STT** (Alur B) sampai TTS selesai + 300ms jeda. Kalau tidak, mic menangkap suara speaker sendiri.
2. Jika pasien sedang `RECORDING`, tombol "Bicara" petugas dinonaktifkan sementara (tampilkan alasan lewat teks, bukan hanya disabled abu-abu). Sebaliknya, saat `B_LISTENING`/`B_PLAYING_SIGN`, auto-capture kamera **di-pause** (tangan pasien yang lewat tidak boleh memicu rekaman saat video isyarat sedang diputar).
3. Definisikan & dokumentasikan aturan prioritas ini di komentar `kiosk.machine.ts`.

**ESCALATED (Panggil JBI):**
- Bisa dipicu dari state mana pun oleh tombol global, atau otomatis dari `*_UNKNOWN`.
- Menampilkan instruksi jelas bahwa JBI manusia dipanggil/diminta, dengan opsi "Kembali" (→ IDLE). Untuk MVP cukup mock (belum ada integrasi nyata) — tapi log `escalated_to_jbi` tetap tercatat.

**Fallback mode ketik manual (Skenario 4):**
- Deteksi otomatis: izin kamera ditolak / stream mati, izin mic ditolak / `SpeechRecognition` tidak tersedia, atau service matching gagal/timeout.
- Bila terjadi, tampilkan notifikasi non-modal yang jelas, lalu alihkan sisi yang gagal ke input ketik (kedua arah tetap berfungsi). Sisi yang masih sehat tetap berjalan normal.
- Sediakan tombol "Coba aktifkan kamera/mic lagi".

---

## 8. SPESIFIKASI ANIMASI (GSAP)

Semua timeline didefinisikan bernama di `animations/timelines.ts`, durasi & easing di `tokens.ts`. Animasi dipicu oleh **perubahan state machine** (subscribe ke state → play timeline), bukan dari event handler tersebar. Setiap timeline harus **reversible/killable** agar transisi cepat antar-state tidak bertumpuk.

| Timeline | Dipicu saat | Perilaku (deskripsi gerak — bukan gaya visual) | Durasi kira-kira |
|---|---|---|---|
| `idlePresence` | masuk IDLE | Ikon tangan "bernapas" (scale/opacity halus, loop pelan) sebagai tanda siap; teks "Silakan mulai mengisyaratkan" fade-in | loop 3–4 dtk |
| `handAcquired` | HAND_DETECTED | Bingkai kamera "menangkap": outline menyempit/mengunci ke bingkai (micro-feedback bahwa tangan terbaca), **belum** merah | 0.2 dtk |
| `recordingPulse` | RECORDING | Border kamera merah dengan pulse **pelan** (≥ 1,2 dtk per siklus, tidak berkedip cepat); teks "Merekam…" muncul; timer/progres tipis menunjukkan durasi (berguna karena ada batas 8 dtk) | loop |
| `stillCountdown` | RECORDING saat gerakan mulai diam | Indikator halus (mis. ring mengisi) yang menandakan "sistem akan segera berhenti" — reset mulus bila gerakan berlanjut. Ini yang membuat pasien paham kenapa sistem berhenti | = `stillHoldMs` |
| `toProcessing` | PROCESSING | Transisi dari merekam ke spinner + "Memproses…"; border merah memudar keluar | 0.3 dtk |
| `resultAccept` | RESULT_ACCEPT | Teks hasil muncul (reveal per kata, staggered), lalu indikator "sedang dibacakan" (visual gelombang suara) sinkron dengan durasi TTS | ~0.6 dtk + TTS |
| `resultConfirm` | RESULT_CONFIRM | Kartu konfirmasi masuk dengan gerak lebih tenang; bar confidence terisi animatif; tiga tombol muncul berurutan | ~0.5 dtk |
| `resultUnknown` | RESULT_UNKNOWN | Gerak netral (bukan "error" yang dramatis); tombol Panggil JBI mendapat penekanan gerak halus sekali | ~0.4 dtk |
| `falseStartReset` | HAND_DETECTED→IDLE / noise dibuang | Reset senyap dan cepat — **tanpa** pesan error; pasien tidak boleh merasa salah | 0.2 dtk |
| `speechListening` | B_LISTENING | Visualisasi level suara mic (dari `AnalyserNode`) + transkrip interim mengalir | loop |
| `signVideoIn` | B_PLAYING_SIGN | Panel video masuk (scale + fade), teks frasa muncul di samping, kontrol Ulangi fade-in setelah video mulai | 0.5 dtk |
| `escalateIn` | ESCALATED | Transisi layar penuh yang tegas tapi tidak menakutkan; instruksi terbaca jelas | 0.4 dtk |
| `modeFallbackNotice` | masuk mode ketik | Notifikasi slide-in non-blocking, input ketik menggantikan area kamera/mic dengan transisi crossfade | 0.4 dtk |

**Aturan animasi umum:**
- Gunakan easing dari `tokens.ts` (mis. satu ease masuk, satu ease keluar, satu untuk loop) — jangan tersebar.
- `prefers-reduced-motion: reduce` → ganti semua loop/gerak spasial dengan perubahan opacity/warna statis; **indikator status tetap harus ada** (jangan dihilangkan, hanya disederhanakan).
- Semua indikator status juga ditulis sebagai **teks + ikon**, dan mengubah `aria-live="polite"` region agar bisa dibaca screen reader; `data-state` di root kiosk mencerminkan state aktif.
- Animasi tidak boleh menambah latensi: hasil tidak boleh tertahan menunggu animasi selesai (target total < 3 detik dari akhir isyarat ke hasil).

---

## 9. MOCK SERVICE & SIMULATOR (untuk menguji tanpa backend)

`matching.service.ts`:

```ts
interface MatchResult { phraseId: string | null; confidence: number; }
interface MatchingService {
  matchSign(sequence: Landmark[][]): Promise<MatchResult>;
  matchText(utterance: string): Promise<MatchResult>;
}
```

Implementasi mock: delay acak 400–1200 ms, hasil bisa di-override oleh SimulatorPanel.

`SimulatorPanel` (hanya `?dev=1`) minimal punya:
- Tombol paksa hasil: **Normal (92%) / Ambigu (72%) / Tak dikenal (40%)**
- Slider delay matching & tombol "matikan kamera / matikan mic / matikan backend" (untuk Skenario 4)
- Tombol "simulasikan false start" & "simulasikan jeda alami"
- Tampilan log `matching_logs` mock secara live

---

## 10. KRITERIA SELESAI (mapping ke PRD §22)

Setiap skenario harus bisa didemokan dari SimulatorPanel *dan* (untuk 1, 5, 6) dari kamera nyata:

1. **Normal:** conf ≥ 85% → teks + TTS langsung.
2. **Ambigu:** 60–84% → kartu konfirmasi, TTS baru jalan setelah Konfirmasi.
3. **Unknown:** < 60% → "tidak ada frasa yang cocok" → Panggil JBI.
4. **Gangguan:** kamera/mic/backend mati → beralih otomatis ke input ketik.
5. **False start:** tangan lewat < 250 ms atau rekaman < 500 ms → kembali IDLE tanpa matching, tanpa pesan error.
6. **Jeda alami:** jeda < `stillHoldMs` di tengah gerakan → tidak berhenti prematur.

Tambahan: tidak ada memory leak timeline GSAP/MediaPipe saat unmount, tidak ada dua timeline bertabrakan saat state berganti cepat, dan unit test `useAutoCapture` lulus.

---

## 11. (OPSIONAL, TERPISAH) INTRO SCROLL UNTUK HALAMAN PITCH

Hanya kerjakan **setelah** semua di atas selesai, dan **pisahkan dari kiosk** (route berbeda, mis. `/pitch`) — kiosk adalah walk-up-and-use dan tidak boleh punya intro scroll.

Jika dikerjakan, gunakan komponen `hero-scroll-video-pin-reveal.tsx` (GSAP ScrollTrigger + SplitText, video circle-reveal):
- Letakkan di `/components/ui/` (path default shadcn; buat foldernya bila belum ada), `npm i gsap`.
- Ganti teks/tag default dengan narasi produk dari PRD §1–2 dan **framing defensible §16**. Contoh tag: kategori kosakata (Pendaftaran, Keluhan, Obat, Administrasi).
- Video: gunakan placeholder lokal; jangan hotlink.
- **Perbaiki 2 hal di komponen sebelum dipakai:** (1) cleanup-nya memanggil `ScrollTrigger.getAll().forEach(t => t.kill())` yang mematikan *semua* trigger di aplikasi — ganti dengan `gsap.context()` yang di-revert; (2) paket `@studio-freight/lenis` sudah deprecated — gunakan `lenis`, atau hapus Lenis bila tidak perlu.

---

## 12. FORMAT JAWABAN YANG DIMINTA

1. **Asumsi & keputusan** (maks. 10 baris): pilihan XState vs reducer, catatan versi library.
2. **Rencana bertahap** (checklist): urutkan — config → useAutoCapture + test → machines → services mock → hooks speech → animations → komponen headless → SimulatorPanel.
3. Implementasi per tahap, mulai dari yang paling berisiko: **`useAutoCapture` + unit test**.
4. Di akhir: daftar **angka yang perlu dikalibrasi manual** di device asli (motionThreshold, stillHoldMs) dan cara memakai overlay debug untuk mengkalibrasinya.
