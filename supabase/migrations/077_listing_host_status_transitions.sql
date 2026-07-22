-- Enforce the host-owned listing lifecycle at the database boundary.
--
-- The application already limits hosts to the canonical transition graph, but
-- authenticated clients can write public.listings through PostgREST directly.
-- RLS proves ownership; it does not constrain status. Without this trigger, an
-- owner can insert a complete live listing or move draft/under_review/closed to
-- live without admin moderation.
--
-- This is intentionally role-aware. Authenticated browser writes are confined
-- to host transitions. service_role and trusted database workers retain the
-- moderation transitions used to approve, hold, reject, expire, and ingest.

begin;

create schema if not exists private;

-- Before this migration, authenticated owners held direct INSERT/UPDATE access
-- to status. There is no durable way to distinguish an admin-approved live row
-- (or a paused row descended from one) from a client-forged state. Establish a
-- fail-closed provenance boundary while writes are locked: complete verified
-- live rows return to the admin queue, paused rows return to editable drafts,
-- and sourced inventory remains under its separate founder-controlled
-- ingestion lifecycle.
lock table public.listings in share row exclusive mode;

do $$
declare
  v_reset_count integer;
begin
  update public.listings l
     set status = case
       when l.status = 'live' then 'under_review'
       else 'draft'
     end
   where l.provenance <> 'sourced'
     and l.status in ('live', 'paused');

  get diagnostics v_reset_count = row_count;
  raise notice 'listing_status_provenance_reset=%', v_reset_count;
end;
$$;

create or replace function private.enforce_listing_host_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_is_authenticated_request boolean :=
    current_user = 'authenticated'
    or coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
begin
  if not v_is_authenticated_request then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception using
        errcode = '23514',
        message = 'listing_initial_status_must_be_draft';
    end if;
    return new;
  end if;

  -- Ordinary edits do not change lifecycle state and remain host-writable.
  if new.status is not distinct from old.status then
    return new;
  end if;

  if (old.status = 'draft' and new.status = 'under_review')
    or (old.status = 'under_review' and new.status = 'draft')
    or (old.status = 'live' and new.status in ('paused', 'archived'))
    or (old.status = 'paused' and new.status in ('live', 'archived')) then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = 'listing_host_status_transition_forbidden',
    detail = format('authenticated host cannot move listing from %s to %s', old.status, new.status);
end;
$$;

revoke execute on function private.enforce_listing_host_status_transition()
  from public, anon, authenticated;

drop trigger if exists trg_listings_host_status_transition on public.listings;
create trigger trg_listings_host_status_transition
  before insert or update on public.listings
  for each row
  execute function private.enforce_listing_host_status_transition();

comment on function private.enforce_listing_host_status_transition() is
  'Database backstop for host listing moderation: authenticated inserts start in draft and authenticated updates follow only the canonical host transition graph. Trusted service-role moderation is unaffected.';

commit;
