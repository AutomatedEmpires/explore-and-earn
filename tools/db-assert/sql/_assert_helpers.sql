-- _assert_helpers.sql
-- Shared assertion machinery for the DB-connected authorization suites.
-- Included with \ir from inside an open transaction; creates only pg_temp
-- objects, so it leaves nothing behind when that transaction rolls back.
--
-- WHAT THESE HELPERS REFUSE TO DO
--
-- They never accept "something went wrong" as proof. expect_denied requires the
-- exact SQLSTATE and a substring of the exact message, so a refusal caused by a
-- typo, a missing fixture or an unrelated constraint fails loudly instead of
-- being counted as the refusal under test. expect_rows(…, 0) is only ever half
-- an assertion, which is why every suite that uses it pairs it with a positive
-- control on the same fixture.
--
-- THE SECTION CHECKPOINT
--
-- A suite that stops running half its assertions still exits zero. A tally with
-- slack in it ("at least N ran") cannot see that: it passes as long as the
-- surviving sections add up. checkpoint_section is the structural version --
-- each section declares exactly how many assertions it contributes, and the
-- count is taken against the running total, so a section that loses one
-- assertion fails at its own checkpoint and a section that stops running
-- entirely fails the final section count. Numbers here are exact by design:
-- adding an assertion is supposed to require saying so.

create table pg_temp.authz_log (
  kind text not null,
  label text not null
);

create table pg_temp.authz_section (
  name text primary key,
  assertions integer not null
);

-- Helper functions are SECURITY INVOKER on purpose: the dynamic statement must
-- run with the privileges of whichever role the caller has assumed, or the
-- helper would test nothing. They are created here by the connecting superuser
-- and their EXECUTE grant is opened below, because migration 023 revoked the
-- default EXECUTE on functions from anon/authenticated/public.

create function pg_temp.expect_denied(
  p_label text,
  p_sql text,
  p_message_like text,
  p_sqlstate text default '42501'
)
returns void
language plpgsql
as $fn$
declare
  v_state text;
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics
      v_state = returned_sqlstate,
      v_message = message_text;
    if v_state <> p_sqlstate then
      raise exception 'authz[%]: expected SQLSTATE %, got % (%)',
        p_label, p_sqlstate, v_state, v_message;
    end if;
    if position(p_message_like in v_message) = 0 then
      raise exception 'authz[%]: expected message containing %, got %',
        p_label, quote_literal(p_message_like), quote_literal(v_message);
    end if;
    insert into pg_temp.authz_log values ('refusal', p_label);
    return;
  end;
  raise exception 'authz[%]: statement was ALLOWED but must be refused', p_label;
end;
$fn$;

create function pg_temp.expect_allowed(p_label text, p_sql text)
returns void
language plpgsql
as $fn$
declare
  v_state text;
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics
      v_state = returned_sqlstate,
      v_message = message_text;
    raise exception 'authz[%]: positive control was REFUSED with % (%)',
      p_label, v_state, v_message;
  end;
  insert into pg_temp.authz_log values ('positive', p_label);
end;
$fn$;

-- Row visibility. p_expected = 0 is a refusal; anything higher is a positive
-- control proving the fixture exists and the rightful reader can see it.
create function pg_temp.expect_rows(p_label text, p_sql text, p_expected bigint)
returns void
language plpgsql
as $fn$
declare
  v_actual bigint;
  v_state text;
  v_message text;
begin
  begin
    execute format('select count(*) from (%s) authz_probe', p_sql) into v_actual;
  exception when others then
    get stacked diagnostics
      v_state = returned_sqlstate,
      v_message = message_text;
    raise exception 'authz[%]: visibility probe errored with % (%)',
      p_label, v_state, v_message;
  end;
  if v_actual <> p_expected then
    raise exception 'authz[%]: expected % visible row(s), got %',
      p_label, p_expected, v_actual;
  end if;
  insert into pg_temp.authz_log
  values (case when p_expected = 0 then 'refusal' else 'positive' end, p_label);
end;
$fn$;

-- Write reach. RLS refuses an UPDATE/DELETE by matching no rows rather than by
-- raising, so the row count IS the assertion.
create function pg_temp.expect_write_rows(p_label text, p_sql text, p_expected bigint)
returns void
language plpgsql
as $fn$
declare
  v_actual bigint;
  v_state text;
  v_message text;
begin
  begin
    execute p_sql;
    get diagnostics v_actual = row_count;
  exception when others then
    get stacked diagnostics
      v_state = returned_sqlstate,
      v_message = message_text;
    raise exception 'authz[%]: write probe errored with % (%)',
      p_label, v_state, v_message;
  end;
  if v_actual <> p_expected then
    raise exception 'authz[%]: statement reached % row(s), expected %',
      p_label, v_actual, p_expected;
  end if;
  insert into pg_temp.authz_log
  values (case when p_expected = 0 then 'refusal' else 'positive' end, p_label);
end;
$fn$;

create function pg_temp.readable_columns(p_role text, p_table regclass)
returns text[]
language sql
stable
as $fn$
  select coalesce(array_agg(a.attname::text order by a.attname), '{}'::text[])
    from pg_attribute a
   where a.attrelid = p_table
     and a.attnum > 0
     and not a.attisdropped
     and has_column_privilege(p_role, a.attrelid, a.attname, 'SELECT')
$fn$;

create function pg_temp.granted_columns(p_role text, p_table regclass, p_privilege text)
returns text[]
language sql
stable
as $fn$
  select coalesce(array_agg(a.attname::text order by a.attname), '{}'::text[])
    from pg_attribute a
   where a.attrelid = p_table
     and a.attnum > 0
     and not a.attisdropped
     and has_column_privilege(p_role, a.attrelid, a.attname, p_privilege)
$fn$;

-- Exactly how many assertions this section contributed. Not "at least".
create function pg_temp.checkpoint_section(p_name text, p_expected integer)
returns void
language plpgsql
as $fn$
declare
  v_logged integer;
  v_claimed integer;
  v_seen integer;
begin
  select count(*) into v_logged from pg_temp.authz_log;
  select coalesce(sum(assertions), 0) into v_claimed from pg_temp.authz_section;
  v_seen := v_logged - v_claimed;

  if v_seen <> p_expected then
    raise exception
      'authz[section %]: ran % assertion(s), expected exactly % -- a check was added or stopped running',
      p_name, v_seen, p_expected;
  end if;

  insert into pg_temp.authz_section (name, assertions) values (p_name, p_expected);
end;
$fn$;

-- The end-of-suite guard: exact totals, and exactly the sections that were
-- meant to run. Both halves matter -- a deleted section takes its own
-- checkpoint with it, which only the section count can see.
create function pg_temp.assert_suite_complete(
  p_suite text,
  p_sections integer,
  p_positive integer,
  p_refusals integer
)
returns void
language plpgsql
as $fn$
declare
  v_sections integer;
  v_positive integer;
  v_refusal integer;
begin
  select count(*) into v_sections from pg_temp.authz_section;
  select count(*) filter (where kind = 'positive'),
         count(*) filter (where kind = 'refusal')
    into v_positive, v_refusal
    from pg_temp.authz_log;

  if v_sections <> p_sections then
    raise exception
      'authz[%]: % section(s) checkpointed, expected exactly % -- a whole section stopped running',
      p_suite, v_sections, p_sections;
  end if;
  if v_positive <> p_positive then
    raise exception 'authz[%]: % positive control(s) ran, expected exactly %',
      p_suite, v_positive, p_positive;
  end if;
  if v_refusal <> p_refusals then
    raise exception 'authz[%]: % refusal(s) ran, expected exactly %',
      p_suite, v_refusal, p_refusals;
  end if;

  raise notice 'authz[%]: PASSED with % section(s), % positive control(s), % refusal(s)',
    p_suite, v_sections, v_positive, v_refusal;
end;
$fn$;

-- Open EXECUTE on the helpers. Without this the assertions would themselves be
-- refused the moment a suite assumes anon or authenticated, and the failure
-- would look like a policy problem rather than a plumbing one.
do $do$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = pg_my_temp_schema()::regnamespace::text
  loop
    execute format('grant execute on function %s to public', r.signature);
  end loop;
end;
$do$;
grant insert, select on pg_temp.authz_log to public;
grant insert, select on pg_temp.authz_section to public;
