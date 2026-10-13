-- ADR-049 — 43-label vocabulary (Modeling "modeling 4.0", artifact 20261006-1528).
--
-- Adds the 11 labels that artifact 20261006-1528 recognizes on top of the 32 phrases
-- seeded in Phase 3 + ADR-045 (which are left untouched).
--
-- Sources:
--   model_phrase_id, phrase_text  ml/artifacts/label_map.json @ 20261006-1528
--                                 (model_info.json known_labels 0–42, none_index 43)
--   category                      ADR-049 §2 (general-use words; owner may re-assign later)
--   sign_recognizable = true      ADR-049 §1
--   active = true                 ADR-049 §1
--   language_variant              schema default
--
-- Idempotent: keyed by the unique model_phrase_id; re-running inserts nothing and
-- never overwrites existing rows (e.g. later admin edits).
insert into phrases (model_phrase_id, phrase_text, category, active, sign_recognizable)
values
  ('label_32', 'Apa kabar',     'Fallback',     true, true),
  ('label_33', 'Baik',          'Fallback',     true, true),
  ('label_34', 'Berapa',        'Administrasi', true, true),
  ('label_35', 'Bingung',       'Fallback',     true, true),
  ('label_36', 'Halo',          'Fallback',     true, true),
  ('label_37', 'Kamu',          'Fallback',     true, true),
  ('label_38', 'Tidur',         'Keluhan',      true, true),
  ('label_39', 'Selamat siang', 'Fallback',     true, true),
  ('label_40', 'Selamat sore',  'Fallback',     true, true),
  ('label_41', 'Selamat pagi',  'Fallback',     true, true),
  ('label_42', 'Selamat malam', 'Fallback',     true, true)
on conflict (model_phrase_id) do nothing;
