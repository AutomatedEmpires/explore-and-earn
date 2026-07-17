-- 071_listings_column_grants.sql
--
-- CLOSE THE ESCAPE HATCH UNDER 070's PUBLICATION GATE.
--
-- 070 refuses to publish a host-controlled listing with an unanswered benefit.
-- It exempts sourced listings, because they have no host to answer (founder
-- decision 4). That exemption is keyed on `provenance` — and TODAY the host can
-- write `provenance`.
--
-- LIVE-VERIFIED against production: `authenticated` holds a TABLE-level UPDATE
-- grant on public.listings, i.e. UPDATE on all 67 columns. No migration ever
-- locked this down — 050 did it for messages/conversations, 054 for
-- host_profiles, 061 for seeker_profiles, and 066 stated the rule outright
-- ("Supabase's default table grants give authenticated full-column UPDATE").
-- `listings` was simply never done.
--
-- The attack is one request:
--   PATCH /listings?id=eq.<own listing>
--   { "provenance": "sourced", "status": "live" }
-- listings_update_own (013) allows it — the host owns the row and the policy has
-- no column or status predicate. The CHECK then sees provenance='sourced' and
-- waves it through. A listing goes live with Housing, Meals and Pay unanswered,
-- and the seeker-facing surfaces render it as sourced inventory that nobody has
-- claimed. Every honesty rule in 070 is intact and every one of them is bypassed.
--
-- A gate whose exemption is writable by the party it excludes is not a gate.
--
-- ── WHAT HOSTS ACTUALLY WRITE ────────────────────────────────────────────────
-- Enumerated from the code rather than guessed, because a grant that is too
-- NARROW fails closed in the ugliest way: PostgREST returns "permission denied
-- for column", the host sees a save that silently did nothing, and we would have
-- traded a security hole for a data-loss bug.
--
--   * the 21 columns of ListingColumnPatch  (queries/listings.ts, authed)
--   * benefit_details                       (queries/benefitDetails.ts, authed)
--   * status                                (queries/listingLifecycle.ts, authed)
--
-- Everything else that writes this table — admin approve/close, moderation, the
-- sourced-ingestion importer, the freshness sweep, the expiry sweep — goes
-- through adminClient (service_role), which bypasses grants and RLS entirely and
-- is therefore untouched by this migration.
--
-- Deliberately NOT granted, because no host path writes them and each is a lie
-- waiting to be told: provenance, source_* (attribution), claim_summary,
-- host_profile_id (re-parent a listing), completion_score, accepted_count.
--
-- ── THE TIMESTAMPS MOVE TO A TRIGGER ─────────────────────────────────────────
-- published_at/paused_at/archived_at ARE written by the host path today
-- (updateListingStatus stamps them alongside status), so pinning the grant
-- without more would break every status change. Granting them instead would let
-- a host PATCH published_at to any value they like and game feed ordering.
--
-- So they graduate to a trigger — exactly what 067 did for expires_at
-- ("trigger assignment — no expires_at column grant needed, 066 lockdown
-- intact"). The database stamps them from the status transition itself, which
-- is both un-forgeable and the same behaviour the app had. The matching app
-- change ships in this PR: leaving the app stamping them would now fail.
--
-- Additive and idempotent. No data is touched.

-- ── 1. The timestamp trigger, before the grant that makes it necessary. ──────
create or replace function public.stamp_listing_status_timestamps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only on a real transition. A no-op UPDATE must not re-stamp anything, and
  -- re-publishing (paused -> live) refreshing published_at is the behaviour the
  -- app already had.
  --
  -- And only when the WRITER did not supply the value themselves. A host cannot
  -- (they hold no grant on these columns — that is the point), so an explicit
  -- value can only come from service_role: the expiry sweep archiving with the
  -- same `nowIso` it filtered on, a moderation action, a backfill. Clobbering a
  -- deliberate timestamp with now() would silently rewrite their history. The
  -- trigger fills a gap; it does not overrule a decision.
  if new.status is distinct from old.status then
    if new.status = 'live' and new.published_at is not distinct from old.published_at then
      new.published_at := now();
    elsif new.status = 'paused' and new.paused_at is not distinct from old.paused_at then
      new.paused_at := now();
    elsif new.status = 'archived' and new.archived_at is not distinct from old.archived_at then
      new.archived_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.stamp_listing_status_timestamps() from public, anon, authenticated;

drop trigger if exists trg_listings_status_timestamps on public.listings;
create trigger trg_listings_status_timestamps
  before update on public.listings
  for each row
  execute function public.stamp_listing_status_timestamps();

comment on function public.stamp_listing_status_timestamps() is
  'Stamps published_at/paused_at/archived_at from the status transition itself. Exists so 071 does not have to grant those columns to `authenticated` — a host must not be able to forge when their listing went live. Mirrors 067''s expires_at trigger.';

-- ── 2. Replace the blanket UPDATE with a column allow-list. ─────────────────
-- Same shape as 050 / 054 / 061. An allow-list, not a deny-list: a column added
-- to `listings` later is NOT host-writable until someone deliberately grants it,
-- which is the safe direction to fail.
revoke update on public.listings from authenticated;

grant update (
  -- ListingColumnPatch — the listing editor (queries/listings.ts)
  title,
  category,
  description,
  location_display,
  begins_at,
  ends_at,
  compensation_min_cents,
  compensation_max_cents,
  compensation_currency,
  compensation_unit,
  housing_included,
  meals_included,
  housing_description,
  meals_description,
  housing_evidence,
  meals_evidence,
  pay_evidence,
  cover_photo_url,
  gallery_photo_urls,
  logistics,
  category_depth,
  -- The benefit editor (queries/benefitDetails.ts)
  benefit_details,
  -- The lifecycle writer (queries/listingLifecycle.ts). The accompanying
  -- timestamps are stamped by trg_listings_status_timestamps, NOT granted.
  status
) on public.listings to authenticated;

-- ── 3. The same door, the other verb: INSERT. ───────────────────────────────
-- Narrowing UPDATE alone leaves the hole wide open. listings_insert_own (013)
-- plus the table-level INSERT grant lets a host create a listing directly:
--
--   POST /listings
--   { "host_profile_id": "<own>", "provenance": "sourced", "status": "live", … }
--
-- 064's check (`provenance = 'sourced' or host_profile_id is not null`) does NOT
-- stop this — it only requires a host for VERIFIED rows; a sourced row may have
-- one. So the row inserts as fake-sourced, 070's gate exempts it, and it goes
-- live with nothing answered. Exactly the bypass, one verb over.
--
-- Host insert paths and everything they write:
--   createListing    (queries/listings.ts)        ListingColumnPatch + title
--                                                 + host_profile_id + status
--   duplicateListing (queries/listingLifecycle.ts) COPYABLE_LISTING_COLUMNS
--                                                 + host_profile_id + title + status
--
-- COPYABLE carries four columns the editor's patch does not — latitude,
-- longitude, compensation_summary, timeline_summary — so they are granted here
-- and NOT on UPDATE, which is the honest reflection of what each path writes.
--
-- `status` is granted (both paths set 'draft'), and a host inserting
-- status='live' outright is already refused by listings_publication_triad_chk:
-- provenance is NOT grantable, so it defaults to verified, and the gate then
-- demands confirmed evidence. The two migrations cover each other.
revoke insert on public.listings from authenticated;

grant insert (
  -- createListing / duplicateListing both set these
  host_profile_id,
  status,
  -- ListingColumnPatch
  title,
  category,
  description,
  location_display,
  begins_at,
  ends_at,
  compensation_min_cents,
  compensation_max_cents,
  compensation_currency,
  compensation_unit,
  housing_included,
  meals_included,
  housing_description,
  meals_description,
  housing_evidence,
  meals_evidence,
  pay_evidence,
  cover_photo_url,
  gallery_photo_urls,
  logistics,
  category_depth,
  benefit_details,
  -- duplicateListing only (COPYABLE_LISTING_COLUMNS)
  latitude,
  longitude,
  compensation_summary,
  timeline_summary
) on public.listings to authenticated;

-- anon keeps SELECT only; it never had INSERT or UPDATE and must not gain either.
