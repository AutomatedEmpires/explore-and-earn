-- 0000_init: the app schema, PostGIS, the migration registry and shared trigger functions.
--
-- Conventions for every later migration:
--   * tables live in schema `app`, with `enable row level security` and no policies;
--   * ids are uuid (UUIDv7 from the app), timestamps timestamptz, money integer cents;
--   * enumerations are text with a CHECK constraint;
--   * every table has created_at and updated_at, with the app.set_updated_at() trigger.

create schema if not exists app;

create extension if not exists postgis;

create table if not exists app.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table app.schema_migrations enable row level security;

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- On Supabase, keep the API roles out of the app schema entirely. (The roles don't exist on
-- PGlite or a plain Postgres, so this is skipped there.)
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema app from %I', r);
      execute format('alter default privileges in schema app revoke all on tables from %I', r);
      execute format('alter default privileges in schema app revoke all on functions from %I', r);
      execute format('alter default privileges in schema app revoke all on sequences from %I', r);
    end if;
  end loop;
end;
$$;
