-- Migration 054: auto-flag a host for admin review after repeated spam reports.
--
-- Founder decision (2026-07-03): a host is automatically flagged for admin
-- review once they cross MORE THAN 3 reports with reason = 'spam' within a
-- rolling 30-day window. This is a moderation signal, independent of (and
-- does not gate) the subscription-based Verified Host badge (see migration
-- history around PR #220) and independent of host_profiles.attestation_status
-- (a separate, manually-driven trust-review flag).
--
-- Also splits the combined "Scam or spam" report reason into two distinct
-- values ('scam', 'spam') so spam can be counted precisely; the report drawer
-- and moderation UI are updated in the same PR to match.
--
-- Idempotent: DROP/ADD CONSTRAINT, ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, and DROP/CREATE TRIGGER are all safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1) 'spam' becomes a distinct reports.reason value (028 named this
--    constraint implicitly as reports_reason_check, Postgres' default name
--    for an inline column CHECK — same drop/re-add pattern as 046).
-- ---------------------------------------------------------------------------
alter table public.reports
  drop constraint if exists reports_reason_check;

alter table public.reports
  add constraint reports_reason_check
  check (reason in (
    'unsafe', 'inaccurate', 'scam', 'spam',
    'inappropriate', 'housing_pay', 'other'
  ));

-- ---------------------------------------------------------------------------
-- 2) host_profiles flag columns
-- ---------------------------------------------------------------------------
alter table public.host_profiles
  add column if not exists flagged_for_review boolean not null default false,
  add column if not exists flagged_reason      text,
  add column if not exists flagged_at          timestamptz;

comment on column public.host_profiles.flagged_for_review is
  'Set automatically by trg_flag_host_on_spam_reports when a host crosses the '
  'spam-report threshold. Surfaced on the admin dashboard; not host-editable '
  '(see the column-privilege lockdown below) — an admin clears it by hand.';

create index if not exists idx_host_profiles_flagged_for_review
  on public.host_profiles (flagged_for_review)
  where flagged_for_review;

-- ---------------------------------------------------------------------------
-- 3) Column-privilege lockdown, same shape as 050's messages/conversations
--    fix: host_profiles_update_own (013) is a ROW-level policy — once it
--    passes, the `authenticated` role's TABLE-level UPDATE grant lets a host
--    PATCH ANY column on their own row via PostgREST, not just the ones the
--    app's updateHostProfileDetails() writes. Verified live (2026-07-03):
--    `authenticated` currently holds table-level UPDATE on host_profiles with
--    no column restriction, so a host could otherwise self-clear
--    flagged_for_review (or, pre-existing, self-set attestation_status/
--    subscription_tier) with a raw request outside the app.
--
--    This revokes the blanket grant and re-grants UPDATE on exactly the
--    columns updateHostProfileDetails() (packages/db/src/queries/
--    hostProfiles.ts) writes today. flagged_for_review/flagged_reason/
--    flagged_at, attestation_status, subscription_tier, and every other
--    admin/service-role/trigger-only column are excluded — service_role
--    writes (Stripe webhooks, admin actions, this migration's trigger) are
--    unaffected since service_role bypasses grants and RLS entirely.
-- ---------------------------------------------------------------------------
revoke update on public.host_profiles from authenticated;
grant update (
  company_name,
  host_name,
  tagline,
  about,
  primary_location_name,
  website_url,
  photo_url,
  social_links,
  housing_offered_generally,
  meals_offered_generally,
  category_scopes
) on public.host_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Trigger: after a spam report is inserted, count that host's non-dismissed
--    spam reports in the trailing 30 days; flag the host once the count
--    exceeds 3. SECURITY DEFINER + search_path pinned empty, mirroring
--    set_host_attestation() (003) — the only way for `authenticated` to reach
--    this write is through the trigger, never a direct call, and `returns
--    trigger` makes the function uncallable outside a trigger context anyway.
-- ---------------------------------------------------------------------------
create or replace function flag_host_on_spam_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host_profile_id uuid;
  v_spam_count       integer;
begin
  if new.reason is distinct from 'spam' then
    return new;
  end if;

  select l.host_profile_id
    into v_host_profile_id
    from public.listings l
   where l.id = new.listing_id;

  if v_host_profile_id is null then
    return new;
  end if;

  select count(*)
    into v_spam_count
    from public.reports r
    join public.listings l on l.id = r.listing_id
   where l.host_profile_id = v_host_profile_id
     and r.reason = 'spam'
     and r.status != 'dismissed'
     and r.created_at > now() - interval '30 days';

  if v_spam_count > 3 then
    update public.host_profiles
       set flagged_for_review = true,
           flagged_reason     = 'spam_reports',
           flagged_at         = now()
     where id = v_host_profile_id
       and flagged_for_review = false;
  end if;

  return new;
end;
$$;

revoke execute on function flag_host_on_spam_reports() from public;

drop trigger if exists trg_flag_host_on_spam_reports on public.reports;
create trigger trg_flag_host_on_spam_reports
  after insert on public.reports
  for each row execute function flag_host_on_spam_reports();

commit;
