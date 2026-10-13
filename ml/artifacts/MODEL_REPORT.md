# Model Report — BISINDO skeleton recognizer (WL-BISINDO)

Artifacts version: `20260930-0122` · evaluation run: `gru_base` (LOSO) + `gru_hidden` (unseen words) · deployed model: `final` (all 32 words, all signers, 3-seed ensemble).
Previous 10-word demo artifacts are backed up in `ml/runs/artifacts_backup_demo10/`.

## What the model does
Input: MediaPipe Hand (2×21) + Pose landmarks per frame, no pixels. Output: one of the **32 WL-BISINDO words** (Indonesian text in `label`, e.g. "Terima kasih") with a calibrated confidence and `accept / confirm / reject`. Non-sign movement and unknown signs are rejected via the `none` class + centroid gate.

**Vocabulary (32 words, `phraseId = label_XX`):** Air, Belajar, Cari, Hari, Ingat, Lagi, Maaf, Makan, Motor, Saya, Terima kasih, Tuli, Apa, Siapa, Kapan, Di mana, Mengapa, Bagaimana, Merah, Kuning, Hijau, Hitam, Dengar, Berangkat, Datang, Teman, Keluarga, Rumah, Pagi, Siang, Sore, Malam (label_00 … label_31, see `label_map.json`).

## Evaluation (leave-one-signer-out on signers 1–4; signer 0 = extra unseen signer, labels 0–11 only)
- Unseen signer: top-1 **90.3%**, top-3 98.4%, macro-F1 0.928 (s1 0.962 / s2 0.967 / s3 0.769 / s4 0.878); signer 0 top-1 92.9%
- Weakest words (F1): Cari 0.54, Makan 0.82, Keluarga 0.82, Berangkat 0.84, Siang 0.85, Hari 0.86, Apa 0.86, Merah 0.88, Sore 0.88
- Known confusions: Terima kasih/Kapan, Siang/Sore, Keluarga/Cari, Apa/Berangkat

## Decisions (thresholds calibrated out-of-fold, unseen signers)
- Temperature 0.761 · ECE 0.123 → 0.037
- Raw thresholds: accept ≥ 0.955, confirm ≥ 0.40, centroid cosine ≥ 0.730; remapped to the kiosk's 0.85 / 0.60.
- Known words: accept 70.6% (precision 99.8%), confirm 20.7% (precision 87.3%), reject 8.7%
- Signs outside the 32 words (`gru_hidden`): accept 16.1%, confirm 26.8%, reject 57.1%
- Non-sign movement: accept 0%, confirm 4.4%, reject 95.6%
- Accept precision assuming 10% out-of-vocabulary inputs: **97.0%**
- Compared with the 10-word demo model: more words, but fewer instant accepts (70.6% vs 93.8%) and more `confirm`; the confirm step in the UI is required.

## Integration (for the backend / frontend teams)
```python
from bisindo.predict import Predictor
p = Predictor()                 # ml/artifacts/
r = p.predict_json(payload)     # dict or JSON str/bytes; raises pydantic.ValidationError / ValueError
# r = {phraseId, label, confidence, action: accept|confirm|reject, reason, topK, debug}
p.vocabulary()                  # 32 words, in class order (class index 0..31 == labelID 0..31)
```
`phraseId`/`label` are null on reject. ~20–30 ms per call on CPU. Payload and frontend capture rules are unchanged (see `ml/src/bisindo/schema.py`, `ml/config/default.yaml` → `capture:`, `scripts/live_demo.py`).

## Rebuild
```powershell
python -m bisindo.train --name final --final          # 32 classes, all signers (already in runs/final)
python -m bisindo.calibrate --run runs/gru_base --hidden-run runs/gru_hidden
python -m bisindo.export --run runs/final
```
Calibration uses `confirm_reject_groups: [none]` (config default): with `[none, unknown_word, negative_word]` the confirm band collapses for the 32-word model.

## Limitations
- Word-level vocabulary, not full Puskesmas sentences (PRD §7).
- 5 signers, one recording setup each; not yet tested with real people on the kiosk camera.
- Signs outside the 32 words are the weakest point; keep Konfirmasi / Coba Lagi / Panggil JBI.
- Dataset license not found in the provided files; confirm before public demo.
