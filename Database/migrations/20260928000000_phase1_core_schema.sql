-- Phase 1 — Database Foundation (ADR-024)
--
-- Sources:
--   PRD-BE §7        base DDL for institutions, devices, phrases, sign_references, matching_logs
--   ADR-008          phrases.model_phrase_id (TEXT UNIQUE NULL) + phrases.sign_recognizable
--   ADR-009          active and sign_recognizable are independent concepts
--   ADR-011          devices.id UUID; each device belongs to an institution
--   ADR-012          no raw patient video/audio/landmark columns
--
-- Deliberately NOT included:
--   community_submissions  (PRD-BE §7/§11 roadmap; not in AGENTS §19 core entities)
--   vocabulary seed        (blocked: source label map for the 32 entries not available)
--
-- Known open decision (see Phase 1 report):
--   matching_logs.confidence is numeric(4,3) as written in PRD-BE §7.
--   Modeling returns 4 decimal places (ADR-007), so e.g. 0.8499 is stored as 0.850.
--   Kept as specified until a decision is recorded.

-- institutions ---------------------------------------------------------------
create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text
);

-- devices --------------------------------------------------------------------
-- ADR-011: each device belongs to an institution → institution_id is NOT NULL.
create table devices (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  label text not null,
  active boolean default true
);

-- phrases --------------------------------------------------------------------
-- id stays the UUID domain key (ADR-008). model_phrase_id holds the Modeling
-- identifier (e.g. 'label_05'); nullable because domain phrases may have no
-- Modeling class. No FK anywhere references model_phrase_id.
create table phrases (
  id uuid primary key default gen_random_uuid(),
  phrase_text text not null,
  category text not null,
  language_variant text not null default 'BISINDO-Jakarta',
  active boolean default true,
  model_phrase_id text unique,
  sign_recognizable boolean default false
);

-- sign_references ------------------------------------------------------------
-- Approved output assets for Flow B (ADR-010). landmark_data belongs to the
-- reference signer recording, not patient input.
create table sign_references (
  id uuid primary key default gen_random_uuid(),
  phrase_id uuid not null references phrases(id),
  video_url text not null,
  landmark_data jsonb,
  signer_id text,
  approved boolean default false
);

-- matching_logs --------------------------------------------------------------
-- Metadata only (ADR-012). resulted_action holds final actions (ADR-018);
-- pending_confirmation is an inference state, not a logged final action.
create table matching_logs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id),
  direction text not null check (direction in ('sign_to_text', 'speech_to_sign')),
  predicted_phrase_id uuid references phrases(id),
  confidence numeric(4,3) not null,
  resulted_action text not null check (resulted_action in ('accepted', 'confirmed', 'escalated_to_jbi')),
  created_at timestamptz default now()
);

-- indexes (PRD-BE §7) --------------------------------------------------------
-- phrases.model_phrase_id is already indexed by its UNIQUE constraint.
create index matching_logs_device_id_created_at_idx on matching_logs (device_id, created_at);
create index sign_references_phrase_id_approved_idx on sign_references (phrase_id, approved);
create index phrases_active_idx on phrases (active);
