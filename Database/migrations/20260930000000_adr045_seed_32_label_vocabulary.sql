-- ADR-045 — 32-label MVP vocabulary (Modeling commit 00397cd, artifact 20260930-0122).
--
-- Adds the 22 labels that the adopted artifact recognizes in addition to the 10
-- phrases seeded in Phase 3 (which are left untouched).
--
-- Sources:
--   model_phrase_id, phrase_text  ml/artifacts/label_map.json @ 00397cd
--                                 (unchanged vs 35eb871; model_info.json known_labels 0–31)
--   category                      owner assignment recorded in ADR-045 §3
--   sign_recognizable = true      ADR-045 §2 (all 32 labels recognizable)
--   active = true                 ADR-045 §2
--   language_variant              schema default
--
-- Idempotent: keyed by the unique model_phrase_id; re-running inserts nothing and
-- never overwrites existing rows (e.g. later admin edits).

insert into phrases (model_phrase_id, phrase_text, category, active, sign_recognizable)
values
  ('label_00', 'Air',       'Fallback',     true, true),
  ('label_01', 'Belajar',   'Fallback',     true, true),
  ('label_02', 'Cari',      'Administrasi', true, true),
  ('label_03', 'Hari',      'Administrasi', true, true),
  ('label_04', 'Ingat',     'Fallback',     true, true),
  ('label_07', 'Makan',     'Fallback',     true, true),
  ('label_08', 'Motor',     'Fallback',     true, true),
  ('label_12', 'Apa',       'Administrasi', true, true),
  ('label_14', 'Kapan',     'Administrasi', true, true),
  ('label_16', 'Mengapa',   'Administrasi', true, true),
  ('label_18', 'Merah',     'Fallback',     true, true),
  ('label_19', 'Kuning',    'Fallback',     true, true),
  ('label_20', 'Hijau',     'Fallback',     true, true),
  ('label_21', 'Hitam',     'Fallback',     true, true),
  ('label_22', 'Dengar',    'Keluhan',      true, true),
  ('label_23', 'Berangkat', 'Administrasi', true, true),
  ('label_25', 'Teman',     'Fallback',     true, true),
  ('label_26', 'Keluarga',  'Pendaftaran',  true, true),
  ('label_27', 'Rumah',     'Fallback',     true, true),
  ('label_28', 'Pagi',      'Administrasi', true, true),
  ('label_29', 'Siang',     'Administrasi', true, true),
  ('label_30', 'Sore',      'Administrasi', true, true)
on conflict (model_phrase_id) do nothing;
