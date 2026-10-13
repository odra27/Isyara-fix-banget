# Integrasi Model BISINDO ↔ Backend ↔ Frontend

Catatan cara menyambungkan model pengenal isyarat (`ml/`) ke backend dan kiosk frontend.
Model: 32 kata WL-BISINDO, artefak versi `20260930-0122` (detail akurasi: `ml/artifacts/MODEL_REPORT.md`).

## 1. Alur besar

```
Kamera (browser kiosk)
  └─ MediaPipe Hand + Pose (di browser, bukan server)
      └─ auto-capture: kumpulkan frame dari tangan terangkat sampai tangan turun/diam
          └─ POST /match/sign  { frames, mirrored, width, height }      ← hanya landmark, tanpa video
              └─ Backend: Predictor.predict_json(payload)  (~20–30 ms, CPU)
                  └─ { phraseId, label, confidence, action, topK }
                      ├─ backend: tulis matching_logs, ambil data phrase dari DB
                      └─ frontend: tampilkan ACCEPT / CONFIRM / REJECT (+ Panggil JBI)
```

Prinsip: video tidak pernah dikirim ke server (PRD prinsip 5). Server cuma terima koordinat landmark.

## 2. Backend

### Dependency runtime
Backend **tidak** butuh `torch` atau `mediapipe`. Yang dibutuhkan (versi dari `ml/requirements.txt`):
`numpy`, `onnxruntime`, `pydantic`, `pyyaml`, `scikit-learn`, `matplotlib`.
Cara paling mudah: `pip install -e ml` di environment backend, lalu `from bisindo.predict import Predictor`.

File yang wajib ada di `ml/artifacts/` (sudah di-track git):
`model.onnx`, `centroids.npy`, `feature_config.json`, `model_info.json`, `label_map.json`, `thresholds.json`, `version.json`.

### Pemakaian
```python
from bisindo.predict import Predictor

predictor = Predictor()                 # load SEKALI saat startup (~0,5 s), jangan per request
result = predictor.predict_json(body)   # dict atau JSON str/bytes
predictor.vocabulary()                  # 32 kata: [{phraseId, text, english}, ...]
predictor.version                       # versi artefak, simpan di log
```

### Contoh endpoint (FastAPI, belum ada di repo — contoh saja)
```python
from fastapi import FastAPI, HTTPException, Request
from pydantic import ValidationError
from bisindo.predict import Predictor

app = FastAPI()
predictor = Predictor()

@app.post("/match/sign")
async def match_sign(request: Request):
    body = await request.body()
    if len(body) > 5_000_000:                       # batasi ukuran payload
        raise HTTPException(413, "payload terlalu besar")
    try:
        r = predictor.predict_json(body)
    except (ValidationError, ValueError) as e:      # schema salah / > 600 frame
        raise HTTPException(422, str(e))
    r.pop("debug", None)                            # debug cukup untuk log internal
    # TODO: tulis matching_logs (direction='sign_to_text', predicted_phrase_id=r["phraseId"], confidence, action)
    return r

@app.get("/health")
def health():
    return {"status": "ok", "model_version": predictor.version, "vocab_size": len(predictor.vocabulary())}
```
Catatan keamanan: endpoint di atas belum punya autentikasi. Untuk kiosk, minimal pakai API key per device (`device_id` di PRD) atau jalankan hanya di jaringan lokal.

`predict_json` bersifat sinkron dan CPU-bound. Untuk FastAPI, lebih aman pakai `def` biasa (jalan di threadpool) atau `run_in_threadpool`, supaya event loop tidak ke-block.

### Format request
```json
{
  "frames": [
    {
      "t_ms": 0,
      "hands": [
        { "landmarks": [[0.51, 0.62, -0.01], "... 21 titik [x,y,z]"], "handedness": "Right", "score": 0.97 }
      ],
      "pose": [[0.50, 0.30, -0.4, 0.99], "... 33 titik [x,y,z,visibility]"]
    }
  ],
  "mirrored": false,
  "width": 1280,
  "height": 720
}
```
- `hands`: 0–2 tangan per frame, masing-masing tepat 21×3. Frame tanpa tangan tetap dikirim (`hands: []`).
- `pose`: 33×4 (atau 33×3), atau `null` kalau tidak terdeteksi.
- Koordinat = output normalized MediaPipe apa adanya (x, y di 0–1).
- Maks 600 frame (lebih dari itu → `ValueError` → 422). Normalnya 8 s × 30 fps = 240.
- Skema lengkap: `ml/src/bisindo/schema.py`.

### Format response
```json
{
  "phraseId": "label_10",
  "label": "Terima kasih",
  "confidence": 0.9621,
  "action": "accept",
  "audio": "audio/label_10.wav",
  "reason": null,
  "topK": [
    { "phraseId": "label_10", "label": "Terima kasih", "confidence": 0.9621 },
    { "phraseId": "label_14", "label": "Kapan", "confidence": 0.0009 },
    { "phraseId": "label_09", "label": "Saya", "confidence": 0.0007 }
  ]
}
```

| `action` | confidence | Arti |
|---|---|---|
| `accept` | ≥ 0,85 | Langsung tampilkan + TTS |
| `confirm` | 0,60–0,84 | Tampilkan "Maksud Anda: …?" (pakai `topK` sebagai pilihan) |
| `reject` | < 0,60 | `phraseId` & `label` = `null`. Tampilkan Coba Lagi + Panggil JBI |

`reason` (hanya info): `too_short` (tangan terlihat < 8 frame, model tidak dijalankan), `none_class` (dianggap bukan isyarat), `far_from_centroid` (gerakan tidak mirip kata mana pun).
Keputusan `action` sudah final dari model; backend/frontend tidak perlu menghitung threshold sendiri.

### Audio (suara kata)
- 32 file WAV (16 kHz mono, ±1,5 s, total ±1,7 MB) di `ml/artifacts/audio/label_XX.wav`, daftar di `ml/artifacts/audio/index.json`.
- Dibuat offline dengan suara Windows bahasa Indonesia "Microsoft Andika" (`ml/scripts/generate_audio.ps1`). Jalankan ulang skrip ini kalau `label_map.json` berubah.
- Field `audio` di response = path relatif ke `ml/artifacts/` (`null` kalau reject). Backend cukup serve folder `ml/artifacts/audio/` sebagai static file (mis. `/audio/label_10.wav`), atau frontend menyalin 32 file ini ke asset kiosk dan memutar berdasarkan `phraseId`.
- Putar otomatis hanya saat `accept`. Saat `confirm`, putar setelah pasien menekan konfirmasi.
- `live_demo.py` sudah memutar suara saat accept (`--no-audio` untuk mematikan).

### Mapping ke database
- `phraseId` (`label_00` … `label_31`) adalah key yang stabil. Simpan ini di `phrases`, **jangan** simpan class index.
- Untuk model 32 kata ini class index 0–31 kebetulan sama dengan labelID, tapi itu bisa berubah kalau model diganti (model 10 kata dulu tidak sama).
- `label` = teks Bahasa Indonesia dari `ml/artifacts/label_map.json` (`text`). Ada juga `english` dan `aliases` (untuk text matching Alur B).
- `matching_logs.predicted_phrase_id` harus nullable (reject = `null`).
- Simpan `predictor.version` di log supaya hasil bisa dilacak ke versi model.
- `phrases.category` tidak disediakan model; isi dari sisi backend.

## 3. Frontend (kiosk)

### MediaPipe di browser
Pakai `@mediapipe/tasks-vision` dengan model yang **sama** dengan training (file ada di `ml/mp_models/`):
- `HandLandmarker`: `hand_landmarker.task`, `numHands: 2`, `runningMode: "VIDEO"`, confidence 0,5
- `PoseLandmarker`: `pose_landmarker_lite.task`, `runningMode: "VIDEO"`

```ts
const hands = handLandmarker.detectForVideo(video, now);
const pose  = poseLandmarker.detectForVideo(video, now);
const frame = {
  t_ms: now - startMs,
  hands: hands.landmarks.map((lm, i) => ({
    landmarks: lm.map(p => [p.x, p.y, p.z]),
    handedness: hands.handedness[i][0].categoryName,   // "Left" | "Right"
    score: hands.handedness[i][0].score,
  })),
  pose: pose.landmarks[0]?.map(p => [p.x, p.y, p.z, p.visibility ?? 1]) ?? null,
};
```

Sudah diuji (`@mediapipe/tasks-vision@1.0.1`, Edge headless, video dataset diputar per frame 30 fps):
32 kata (1 klip per kata) + 2 klip tambahan → 34/34 `accept` benar, dan hasilnya sama persis dengan pipeline Python.
Catatan: timestamp untuk `detectForVideo` harus selalu naik (jangan reset ke 0 per rekaman); `t_ms` di payload boleh relatif terhadap awal rekaman.

### Aturan capture (wajib, kalau tidak akurasi turun)
Hasil uji browser vs Python sudah cocok 26/26 dengan aturan ini:
1. Jalankan MediaPipe pada frame kamera **asli (tidak di-mirror)** dan kirim `mirrored: false`. Mirror hanya untuk preview (CSS `transform: scaleX(-1)`).
2. Selalu kirim pose (model menormalisasi pakai bahu) dan `width`/`height` asli kamera (`video.videoWidth/videoHeight`).
3. Sekuens dimulai dari **frame pertama tangan terdeteksi**, termasuk 250 ms masa debounce (pre-roll).
4. Selama debounce, toleransi tangan hilang ~150 ms (detector flicker), jangan langsung dianggap batal.
5. Tangan yang tergantung di posisi istirahat (pergelangan > 1,35 × lebar bahu di bawah garis bahu) dianggap "tidak ada tangan".

Angka auto-capture (`ml/config/default.yaml` → `capture:`):

| Parameter | Nilai | Fungsi |
|---|---|---|
| `hand_stable_ms` | 250 | tangan harus terlihat selama ini sebelum RECORDING |
| `detect_grace_ms` | 150 | toleransi flicker saat debounce |
| `min_record_ms` | 500 | lebih pendek → buang, jangan kirim |
| `max_record_ms` | 8000 | batas maksimum rekaman |
| `still_hold_ms` | 1500 | tangan diam selama ini → selesai |
| `motion_threshold` | 0,008 | rata-rata perpindahan per frame (koordinat normalized) di bawah ini = diam |
| `motion_window_frames` | 10 | jendela rata-rata gerakan |
| `hand_lost_ms` | 500 | tangan hilang selama ini → selesai |
| `result_hold_ms` | 4000 | lama hasil ditampilkan |

State machine: `IDLE → HAND_DETECTED → RECORDING → (kirim) → RESULT_* → IDLE`.
Implementasi referensi yang sudah teruji: class `AutoCapture` dan fungsi `raised_hands` di `ml/scripts/live_demo.py`. Port logika itu ke TypeScript apa adanya.

### Tampilan hasil
- `accept`: tampilkan `label`, bacakan TTS.
- `confirm`: tampilkan `topK` (maks 3) sebagai pilihan + tombol Coba Lagi. Model 32 kata cukup sering masuk sini (~21%), jadi UI ini wajib.
- `reject`: "Tidak ada frasa yang cocok" + **Panggil JBI** + **Coba Lagi**.

## 4. Cek cepat

```powershell
# dari folder ml/
.\.venv\Scripts\python.exe -m bisindo.predict data/landmarks/signer3_label5_sample2.npz   # CLI
.\.venv\Scripts\python.exe -m pytest -q tests/test_predict.py                             # kontrak Predictor
.\.venv\Scripts\python.exe scripts\live_demo.py --camera 0                                # demo webcam (referensi capture)
```
Untuk tes backend tanpa kamera: konversi `.npz` ke JSON payload dengan `bisindo.schema.arrays_to_sequence(load_npz(f)).model_dump_json()`, lalu POST ke endpoint.

## 5. Keterbatasan yang perlu diketahui tim
- Kosakata tingkat kata (32 kata), belum kalimat Puskesmas PRD §7.
- Dilatih dari 5 penanda tangan; belum diuji dengan orang sungguhan di kamera kiosk. Jalankan tes PRD §21 di perangkat asli sebelum demo.
- Isyarat di luar 32 kata kadang masih lolos ke `confirm`/`accept` (~16% accept), jadi tombol Konfirmasi dan Panggil JBI harus selalu ada.
- Lisensi dataset WL-BISINDO belum dikonfirmasi.
