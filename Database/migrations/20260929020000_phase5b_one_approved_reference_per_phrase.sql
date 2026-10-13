-- Phase 5B — at most one approved sign reference per phrase (ADR-042 §1–§3).
--
-- Enforces ADR-010 "one canonical approved video per phrase" at DB level. No
-- tie-breaking: a second approved reference for the same phrase is a unique
-- violation (the admin API maps it to 409 CONFLICT, ADR-040/042 §6).
-- Unapproved (false / NULL) references are unaffected. No column, table or other
-- constraint changes.

create unique index sign_references_one_approved_per_phrase_idx
  on sign_references (phrase_id)
  where approved = true;
