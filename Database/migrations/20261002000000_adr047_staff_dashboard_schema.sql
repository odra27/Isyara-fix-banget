-- ADR-047 / ADR-048 — Staff dashboard, staff authentication & kiosk operations (schema only)
--
-- Sources:
--   ADR-047 D2   staff_profiles.role is a DB mirror of app_metadata.role ('admin' | 'petugas');
--                authorization still comes only from the verified JWT.
--   ADR-047 D3   staff_profiles.institution_id drives institution isolation for staff endpoints.
--   ADR-047 D6   no patients table, no matching_logs.patient_id.
--   ADR-047 D7   matching_logs.staff_id is nullable; NULL for unauthenticated kiosk requests.
--   ADR-047 D8   devices.last_heartbeat_at only; online/offline is computed, no status column.
--   ADR-047 D9   jbi_dispatches records "Panggil JBI" calls.
--   ADR-048      column list, NOT NULL / CHECK constraints, ON DELETE RESTRICT, RLS.
--
-- Non-destructive and idempotent: only CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- ENABLE ROW LEVEL SECURITY. No existing column, constraint, index or row is changed or dropped.
--
-- Requires the Supabase `auth` schema (auth.users) to exist.

-- staff_profiles -------------------------------------------------------------
-- nip / username are indexed by their UNIQUE constraints (no separate index).
-- Staff removal is a soft delete (active = false). Deleting the auth user cascades
-- here, but is blocked by ON DELETE RESTRICT once logs/dispatches reference the profile.
create table if not exists staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid not null references institutions(id),
  nip varchar(50) unique,
  username varchar(50) unique,
  full_name text not null,
  role text not null check (role in ('admin', 'petugas')),
  unit_kerja text not null,
  job_title text not null,
  shift_schedule text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists staff_profiles_institution_id_idx on staff_profiles (institution_id);

-- devices --------------------------------------------------------------------
alter table devices add column if not exists last_heartbeat_at timestamptz;

-- matching_logs --------------------------------------------------------------
alter table matching_logs
  add column if not exists staff_id uuid references staff_profiles(id) on delete restrict;

-- jbi_dispatches -------------------------------------------------------------
-- status values: REKOMENDASI_BACKEND_DAN_DATABASE.md §2.5 (ADR-048).
create table if not exists jbi_dispatches (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  device_id uuid not null references devices(id),
  staff_id uuid not null references staff_profiles(id) on delete restrict,
  notes text,
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'completed', 'cancelled')),
  created_at timestamptz default now()
);

-- RLS (ADR-048): enabled without policies. Supabase Data API roles (anon/authenticated)
-- get no rows; the Backend's direct table-owner connection is unaffected.
alter table staff_profiles enable row level security;
alter table jbi_dispatches enable row level security;
