-- Phase 1 schema verification.
-- Plain SQL (no pgTAP). Every check raises an exception on failure.
-- Run against a database where all migrations in Database/migrations have been
-- applied (check #8 expects the Phase 4 precision migration):
--   psql -v ON_ERROR_STOP=1 -d <db> -f Database/verify/phase1_schema_check.sql
-- All test data is created inside a transaction and rolled back.
-- Fixtures use test-only model ids (test_label_05, label_99) so the script also
-- runs after the Phase 3 vocabulary seed (which owns the real label_XX ids).

begin;

-- 1. Required tables exist; out-of-scope table does not ------------------------
do $$
declare t text;
begin
  foreach t in array array['institutions','devices','phrases','sign_references','matching_logs'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'FAIL: table % missing', t;
    end if;
  end loop;
  if to_regclass('public.community_submissions') is not null then
    raise exception 'FAIL: community_submissions must not exist in Phase 1';
  end if;
  raise notice 'PASS: required tables present, community_submissions absent';
end $$;

-- 2. All entity ids are UUID primary keys --------------------------------------
do $$
declare t text; typ text;
begin
  foreach t in array array['institutions','devices','phrases','sign_references','matching_logs'] loop
    select data_type into typ from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name = 'id';
    if typ is distinct from 'uuid' then
      raise exception 'FAIL: %.id is % (expected uuid)', t, typ;
    end if;
    if not exists (
      select 1 from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ('public.' || t)::regclass and i.indisprimary and a.attname = 'id'
    ) then
      raise exception 'FAIL: %.id is not the primary key', t;
    end if;
  end loop;
  raise notice 'PASS: uuid primary keys';
end $$;

-- 3. phrases.model_phrase_id: text, nullable, unique ---------------------------
do $$
declare r record;
begin
  select data_type, is_nullable into r from information_schema.columns
   where table_schema = 'public' and table_name = 'phrases' and column_name = 'model_phrase_id';
  if r.data_type <> 'text' or r.is_nullable <> 'YES' then
    raise exception 'FAIL: model_phrase_id must be nullable text (got %, nullable=%)', r.data_type, r.is_nullable;
  end if;
  if not exists (
    select 1 from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.phrases'::regclass and c.contype = 'u' and a.attname = 'model_phrase_id'
  ) then
    raise exception 'FAIL: model_phrase_id has no UNIQUE constraint';
  end if;
  if exists (
    select 1 from pg_constraint c
    join pg_attribute a on a.attrelid = c.confrelid and a.attnum = any(c.confkey)
    where c.contype = 'f' and c.confrelid = 'public.phrases'::regclass and a.attname = 'model_phrase_id'
  ) then
    raise exception 'FAIL: a foreign key references phrases.model_phrase_id';
  end if;
  raise notice 'PASS: model_phrase_id nullable unique text, not an FK target';
end $$;

-- Fixture rows (rolled back at the end) ----------------------------------------
insert into institutions (id, name) values ('00000000-0000-0000-0000-00000000a001', 'Test Puskesmas');
insert into devices (id, institution_id, label)
  values ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000a001', 'Kiosk Test');
insert into phrases (id, phrase_text, category, model_phrase_id, sign_recognizable)
  values ('00000000-0000-0000-0000-00000000f005', 'Test mapped phrase', 'Test', 'test_label_05', true);
-- Domain phrases without a Modeling class (two NULLs must coexist under UNIQUE)
insert into phrases (phrase_text, category) values ('Test domain phrase A', 'Test');
insert into phrases (phrase_text, category) values ('Test domain phrase B', 'Test');

-- 4. Mapping: model_phrase_id -> phrases.id ------------------------------------
do $$
declare pid uuid; n int;
begin
  select id into pid from phrases where model_phrase_id = 'test_label_05';
  if pid is distinct from '00000000-0000-0000-0000-00000000f005'::uuid then
    raise exception 'FAIL: test_label_05 did not resolve to its UUID (got %)', pid;
  end if;
  select count(*) into n from phrases where model_phrase_id = 'label_99';
  if n <> 0 then
    raise exception 'FAIL: unknown model_phrase_id resolved to % rows', n;
  end if;
  select count(*) into n from phrases where model_phrase_id is null and phrase_text like 'Test domain phrase %';
  if n <> 2 then
    raise exception 'FAIL: expected 2 domain phrases with NULL model_phrase_id, got %', n;
  end if;
  raise notice 'PASS: test_label_05 -> uuid, unknown id -> no row, NULL mapping allowed';
end $$;

-- 5. Defaults: active and sign_recognizable are independent --------------------
do $$
declare r record;
begin
  select active, sign_recognizable into r from phrases where phrase_text = 'Test domain phrase A';
  if r.active is distinct from true or r.sign_recognizable is distinct from false then
    raise exception 'FAIL: defaults active=% sign_recognizable=%', r.active, r.sign_recognizable;
  end if;
  insert into phrases (phrase_text, category, active, sign_recognizable)
    values ('Test inactive recognizable', 'Test', false, true);
  raise notice 'PASS: active/sign_recognizable defaults and independence';
end $$;

-- 6. Constraint violations -----------------------------------------------------
do $$
begin
  begin
    insert into phrases (phrase_text, category, model_phrase_id) values ('dup', 'Test', 'test_label_05');
    raise exception 'FAIL: duplicate model_phrase_id accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into devices (label) values ('orphan');
    raise exception 'FAIL: device without institution accepted';
  exception when not_null_violation then null;
  end;

  begin
    insert into devices (institution_id, label) values (gen_random_uuid(), 'bad fk');
    raise exception 'FAIL: device with unknown institution accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into sign_references (phrase_id, video_url) values (gen_random_uuid(), 'x');
    raise exception 'FAIL: sign_reference with unknown phrase accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into matching_logs (device_id, direction, confidence, resulted_action)
      values (gen_random_uuid(), 'sign_to_text', 0.9, 'accepted');
    raise exception 'FAIL: matching_log with unknown device accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into matching_logs (device_id, direction, confidence, resulted_action)
      values ('00000000-0000-0000-0000-00000000d001', 'sign_to_text', 0.7, 'pending_confirmation');
    raise exception 'FAIL: pending_confirmation accepted as final resulted_action';
  exception when check_violation then null;
  end;

  begin
    insert into matching_logs (device_id, direction, confidence, resulted_action)
      values ('00000000-0000-0000-0000-00000000d001', 'sideways', 0.7, 'accepted');
    raise exception 'FAIL: invalid direction accepted';
  exception when check_violation then null;
  end;

  raise notice 'PASS: unique / not-null / FK / check constraints enforced';
end $$;

-- 7. Valid relations work ------------------------------------------------------
insert into sign_references (phrase_id, video_url, approved)
  values ('00000000-0000-0000-0000-00000000f005', 'https://example.invalid/ref.mp4', true);
insert into matching_logs (device_id, direction, predicted_phrase_id, confidence, resulted_action)
  values ('00000000-0000-0000-0000-00000000d001', 'sign_to_text', '00000000-0000-0000-0000-00000000f005', 1.0, 'accepted');
insert into matching_logs (device_id, direction, predicted_phrase_id, confidence, resulted_action)
  values ('00000000-0000-0000-0000-00000000d001', 'sign_to_text', null, 0.0, 'escalated_to_jbi');

-- 8. Confidence precision is numeric(5,4) (Phase 4 migration, ADR-038 §8) ------
do $$
declare c numeric; p int; s int;
begin
  select numeric_precision, numeric_scale into p, s from information_schema.columns
   where table_schema = 'public' and table_name = 'matching_logs' and column_name = 'confidence';
  if p is distinct from 5 or s is distinct from 4 then
    raise exception 'FAIL: matching_logs.confidence is numeric(%,%) (expected numeric(5,4))', p, s;
  end if;
  insert into matching_logs (device_id, direction, confidence, resulted_action)
    values ('00000000-0000-0000-0000-00000000d001', 'sign_to_text', 0.8499, 'confirmed')
    returning confidence into c;
  if c <> 0.8499 then
    raise exception 'FAIL: expected 0.8499 stored exactly, got %', c;
  end if;
  raise notice 'PASS: confidence numeric(5,4) stores 0.8499 exactly';
end $$;

-- 9. Indexes from PRD-BE §7 ----------------------------------------------------
do $$
declare ix text;
begin
  foreach ix in array array[
    'matching_logs_device_id_created_at_idx',
    'sign_references_phrase_id_approved_idx',
    'phrases_active_idx'
  ] loop
    if to_regclass('public.' || ix) is null then
      raise exception 'FAIL: index % missing', ix;
    end if;
  end loop;
  raise notice 'PASS: indexes present';
end $$;

-- 10. Privacy: matching_logs holds metadata only --------------------------------
do $$
declare cols text[];
begin
  select array_agg(column_name::text order by column_name) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'matching_logs';
  if cols <> array['confidence','created_at','device_id','direction','id','predicted_phrase_id','resulted_action'] then
    raise exception 'FAIL: unexpected matching_logs columns %', cols;
  end if;
  raise notice 'PASS: matching_logs has metadata columns only';
end $$;

rollback;
