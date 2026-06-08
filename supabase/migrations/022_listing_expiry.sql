-- 022_listing_expiry.sql
-- Listing expiry (Agent 3 / PR 1 — Listing Lifecycle Controls).
--
-- ADDITIVE ONLY: adds listings.expires_at, an index, a BEFORE INSERT default
-- trigger, and backfills existing live listings. No RLS change, no data loss
-- (flagged in docs/source-of-truth/founder-approval-queue.md as A-MIG-022-EXPIRY).
--
-- ADAPTED FROM THE BRIEF: the brief's backfill referenced a `start_date`
-- column, but the canonical listings schema (006_listings.sql) names the
-- opportunity start `begins_at`. This migration uses `begins_at` accordingly.
--
-- Idempotent style follows 021_rls_complete.sql (IF NOT EXISTS + guarded
-- CREATE), so it is safe to re-run.

begin;

alter table public.listings
  add column if not exists expires_at timestamptz;

create index if not exists idx_listings_expires_at
  on public.listings (expires_at);

-- Backfill: seed expiry for existing live listings 90 days after their start.
update public.listings
   set expires_at = begins_at + interval '90 days'
 where expires_at is null
   and begins_at is not null
   and status = 'live';

-- BEFORE INSERT default: when a caller does not set expires_at, seed it 90 days
-- after begins_at (or after now() when no start date is known).
create or replace function public.set_listing_expiry()
returns trigger
language plpgsql
as $$
begin
  if new.expires_at is null then
    new.expires_at := coalesce(new.begins_at, now()) + interval '90 days';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_listings_set_expiry on public.listings;
create trigger trg_listings_set_expiry
  before insert on public.listings
  for each row execute function public.set_listing_expiry();

commit;
