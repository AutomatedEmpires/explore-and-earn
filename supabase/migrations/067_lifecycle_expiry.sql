-- Migration 067: application & invite lifecycle expiry.
--
-- LIFECYCLE_EXPIRY_DAYS (contracts lifecycles.ts) promises application 30d /
-- invite 14d / offer 7d, and the on-read expiry UI (InviteActions,
-- OfferedActions) plus the offer_expiring reminder pipeline all read
-- expires_at — but NOTHING ever wrote it (007 deferred to "a scheduled jobs
-- layer" that was never built). Every window was unenforced, 'expired' was
-- unreachable, and the reminder crons scanned a permanently-null column.
--
-- This migration is the schema half (the sweep cron ships alongside it):
--   1. BEFORE INSERT defaults: applications.expires_at = now()+30d,
--      invites.expires_at = now()+14d (only when the insert left it null).
--   2. BEFORE UPDATE: entering 'offered' stamps the SHORTER 7-day offer
--      window (the offer clock replaces the application clock). Trigger
--      assignment mutates the in-flight row, so no expires_at column grant
--      is needed and the 066 column-grant lockdown stays intact.
--   3. Backfill for pre-existing rows (empty in prod today; keeps dev and
--      disposable environments consistent): anchored to submitted_at /
--      created_at so old rows don't all get a fresh full window.
--
-- The lifecycle triggers (001) pass same-status updates through, so the
-- backfill UPDATEs cannot trip them. Additive + idempotent. Apply via the
-- db-migrate pipeline on merge — never by an agent.

begin;

-- 1. Insert defaults -------------------------------------------------------

create or replace function public.set_application_default_expiry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.expires_at is null then
    new.expires_at := now() + interval '30 days';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_applications_default_expiry on public.applications;
create trigger trg_applications_default_expiry
  before insert on public.applications
  for each row
  execute function public.set_application_default_expiry();

create or replace function public.set_invite_default_expiry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.expires_at is null then
    new.expires_at := now() + interval '14 days';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invites_default_expiry on public.invites;
create trigger trg_invites_default_expiry
  before insert on public.invites
  for each row
  execute function public.set_invite_default_expiry();

-- 2. The offer window ------------------------------------------------------

create or replace function public.set_offer_expiry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Entering 'offered' starts the 7-day offer clock, unconditionally
  -- replacing the application window: the seeker's deadline to respond is
  -- always measured from when THIS offer was extended.
  new.expires_at := now() + interval '7 days';
  return new;
end;
$$;

drop trigger if exists trg_applications_offer_expiry on public.applications;
create trigger trg_applications_offer_expiry
  before update on public.applications
  for each row
  when (new.status = 'offered' and old.status is distinct from new.status)
  execute function public.set_offer_expiry();

-- 3. Backfill (no-op on empty tables) --------------------------------------

update public.applications
   set expires_at = submitted_at + interval '30 days'
 where expires_at is null
   and status in ('applied', 'reviewing', 'saved_by_host');

-- Pre-existing offers get a fresh 7-day window from NOW (their extension
-- time was never recorded) rather than an instant retroactive expiry.
update public.applications
   set expires_at = now() + interval '7 days'
 where expires_at is null
   and status = 'offered';

update public.invites
   set expires_at = created_at + interval '14 days'
 where expires_at is null
   and status in ('created', 'delivered', 'viewed');

commit;
