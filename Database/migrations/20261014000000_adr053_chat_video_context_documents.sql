-- ADR-053 — Chat-first app: questions from a learning video + PDF material in a chat session.
--
-- Additive and idempotent only (no data is changed or removed):
--   chat_messages.video_id / video_t_sec  which video and playback second a USER question was
--                                         asked from (NULL for normal chat and for assistant rows).
--                                         Used to show the "02:15" chip in history and to count
--                                         video questions on the profile page.
--   chat_documents                        TEXT extracted from an uploaded, text-based PDF, attached
--                                         to one chat session. The PDF bytes are never stored.
--                                         Deleting the session deletes its documents.

alter table chat_messages add column if not exists video_id text
  check (video_id is null or length(video_id) between 1 and 60);
alter table chat_messages add column if not exists video_t_sec integer
  check (video_t_sec is null or video_t_sec between 0 and 36000);

create table if not exists chat_documents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  filename text not null check (length(filename) between 1 and 120),
  page_count smallint not null check (page_count between 1 and 10),
  content text not null check (length(content) between 1 and 20100),
  created_at timestamptz not null default now()
);

create index if not exists chat_documents_session_created_idx on chat_documents (session_id, created_at);

-- Same RLS model as ADR-048 / ADR-051: enabled without policies (Data API roles see nothing;
-- the Backend's table-owner connection is unaffected).
alter table chat_documents enable row level security;
