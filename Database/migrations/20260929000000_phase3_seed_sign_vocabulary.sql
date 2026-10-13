-- Phase 3 — sign-recognition vocabulary seed (10 phrases).
--
-- Sources:
--   model_phrase_id, phrase_text  ml/artifacts/label_map.json @ Modeling commit 35eb871
--                                 (artifact 20260928-1331; model_info.json known_labels
--                                 5, 6, 9, 10, 11, 13, 15, 17, 24, 31)
--   category                      explicit product/vocabulary-owner assignment (2026-09-29)
--   sign_recognizable = true      ADR-009 (current artifact recognizes exactly these 10)
--   active = true                 no approved document requires otherwise
--   language_variant              schema default (dialect of WL-BISINDO is not documented)
--
-- Not seeded: the 22 non-recognizable dataset labels, aliases, any other metadata.
-- The Modeling `none` class is never a phrase.
--
-- Idempotent: rows are keyed by the unique model_phrase_id; re-running inserts
-- nothing and never overwrites an existing row (e.g. later admin edits).
-- phrases.id stays a generated UUID.

insert into phrases (model_phrase_id, phrase_text, category, active, sign_recognizable)
values
  ('label_05', 'Lagi',         'Fallback',     true, true),
  ('label_06', 'Maaf',         'Fallback',     true, true),
  ('label_09', 'Saya',         'Pendaftaran',  true, true),
  ('label_10', 'Terima kasih', 'Fallback',     true, true),
  ('label_11', 'Tuli',         'Pendaftaran',  true, true),
  ('label_13', 'Siapa',        'Pendaftaran',  true, true),
  ('label_15', 'Di mana',      'Administrasi', true, true),
  ('label_17', 'Bagaimana',    'Obat',         true, true),
  ('label_24', 'Datang',       'Pendaftaran',  true, true),
  ('label_31', 'Malam',        'Obat',         true, true)
on conflict (model_phrase_id) do nothing;
