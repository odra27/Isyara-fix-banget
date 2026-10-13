-- ADR-051 — Pivot to education: student accounts (NIS) + chatbot history.
--
-- Sources:
--   ADR-051 D2  student_profiles: one row per Supabase Auth user with app_metadata.role = 'siswa'.
--               Accounts are registered by the school (no self sign-up). Login identifier = NIS.
--   ADR-051 D4  chat_sessions / chat_messages: text-only chatbot history per student.
--               No landmarks, audio or video are ever stored (ADR-012 still applies).
--
-- NIS is globally UNIQUE so a student can log in with NIS alone (one-school MVP). If several
-- schools ever share one deployment with clashing NIS values, a new ADR must change this.
--
-- Provisioning (school / operator, until an admin endpoint exists):
--   1. Supabase Auth: create the user (email may be synthetic, e.g. <nis>@siswa.isyara.local),
--      set app_metadata = {"role": "siswa"}.
--   2. insert into student_profiles (id, institution_id, nis, full_name, class_name, grade)
--      values ('<auth user id>', '<institution id>', '<nis>', '<nama>', '5A', 5);

-- student_profiles -----------------------------------------------------------
create table if not exists student_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid not null references institutions(id),
  nis varchar(30) not null unique check (length(btrim(nis)) > 0),
  full_name text not null,
  class_name text,
  grade smallint check (grade between 1 and 12),
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists student_profiles_institution_id_idx on student_profiles (institution_id);

-- chat_sessions --------------------------------------------------------------
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references student_profiles(id) on delete cascade,
  title text not null default 'Percakapan baru' check (length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_student_updated_idx on chat_sessions (student_id, updated_at desc);

-- chat_messages --------------------------------------------------------------
-- input_mode: how a user message was entered ('text' typed, 'sign' recognized from BISINDO).
-- Only the resulting TEXT is stored, never the landmark sequence. Assistant rows have NULL.
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) between 1 and 8000),
  input_mode text check (input_mode in ('text', 'sign')),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists chat_messages_session_created_idx on chat_messages (session_id, created_at);

-- RLS (same model as ADR-048): enabled without policies. Supabase Data API roles get no rows;
-- the Backend's direct table-owner connection is unaffected.
alter table student_profiles enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
