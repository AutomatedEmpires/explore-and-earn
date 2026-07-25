-- 080_host_profiles_internal_columns.sql
--
-- Closes the host_profiles column exposure created by 072.
--
-- HISTORY. Migration 027 revoked table-wide SELECT on host_profiles from `anon`
-- and re-granted only a public-safe column list. Migration 072 then revoked
-- table-wide SELECT from `authenticated` — but re-granted EVERY column except
-- benefit_library via a dynamic loop over pg_attribute. Its goal was to hide
-- the new private library; its side effect was to hand `authenticated` explicit
-- grants on every other column, including ones 027 had deliberately withheld
-- from anonymous visitors.
--
-- Net effect, live: a signed-in seeker could read STRICTLY MORE about a host
-- than an anonymous visitor could, on any host with a live listing (the
-- host_profiles_select_public policy at 013:132 is `to anon, authenticated`).
-- The Supabase anon key ships in the client bundle, so this is reachable with
-- nothing more than a free account and a PostgREST request:
--
--   primary_latitude / primary_longitude  — a host's exact coordinates
--   trust_status                          — commented "internal only" in 003
--   account_status, removed_at,
--   removed_reason_code, removed_notes,
--   removed_by_user_id                    — enforcement + removal history
--   flagged_for_review, flagged_reason,
--   flagged_at                            — spam/abuse flags (054, admin-only)
--   public_status                         — moderation state
--   attested_at, attestation_expires_at,
--   current_attestation_id                — attestation internals
--   completion_score, operating_regions,
--   slug, logo_asset_id, cover_asset_id,
--   owner_user_id                         — internals with no product surface
--
-- EVERY column revoked below was verified to have ZERO readers through the anon
-- or authenticated roles — the only readers are service-role paths (admin
-- dashboard, moderation, notifications), which bypass grants entirely. So this
-- migration requires no application change and cannot 403 a live query.
--
-- DELIBERATELY NOT REVOKED HERE: clerk_user_id and deleted_at. Both are read by
-- authenticated today — clerk_user_id by the self-application guard and the
-- invite-accept email path (which read ANOTHER host's row), and both by every
-- owner query that FILTERS on them (a column referenced only in WHERE still
-- requires SELECT privilege). Removing them means routing ~11 call sites
-- through SECURITY DEFINER RPCs, whose failure mode is a runtime 403 rather
-- than a type error. That is a separate, individually-verified change; bundling
-- it here would put a live marketplace at risk for a much smaller marginal gain
-- than the columns above.

-- WHY THIS IS AN ALLOW-LIST AND NOT A LIST OF REVOKES.
-- Revoking a COLUMN privilege is a silent no-op while a TABLE-level grant
-- exists: has_column_privilege() is satisfied by either, so the column revoke
-- changes nothing and reports success. (Verified empirically — the first
-- draft of this migration executed cleanly and left every privilege exactly as
-- it was.) 072 got this right by revoking the table grant first and then
-- re-granting columns; this migration does the same, so its result does not
-- depend on whether a table-level grant happens to be present.

begin;

-- 1) Drop any table-level SELECT. Harmless where 027/072 already removed it;
--    essential where it survives, because otherwise step 2 grants nothing new
--    and nothing below is actually withheld.
revoke select on table public.host_profiles from anon, authenticated;

-- 2) Re-grant SELECT on exactly the readable set. Anything absent here — the
--    21 internal columns listed above, plus benefit_library (072) — is now
--    unreadable through PostgREST by anon and authenticated alike.
do $$
declare
  -- Public-safe (15) — verbatim PUBLIC_PROFILE_SELECT (hostProfiles.ts:365).
  -- subscription_tier and narrative are already anon-readable (056, 059).
  --
  -- attestation_status and updated_at (27) are retained deliberately: neither
  -- is sensitive, and keeping them avoids widening this change's blast radius
  -- on a live site for no privacy gain.
  v_readable text[] := array[
    'id',
    'company_name',
    'host_name',
    'tagline',
    'about',
    'primary_location_name',
    'photo_url',
    'website_url',
    'social_links',
    'category_scopes',
    'housing_offered_generally',
    'meals_offered_generally',
    'subscription_tier',
    'created_at',
    'narrative',
    'attestation_status',
    'updated_at'
  ];
  -- Granted to `authenticated` ONLY, never anon. Both are read TODAY by owner
  -- queries that FILTER on them (a column referenced only in WHERE still
  -- requires SELECT), and clerk_user_id is additionally read cross-host by the
  -- self-application guard and the invite-accept email path. Removing them
  -- means routing ~11 call sites through SECURITY DEFINER RPCs whose failure
  -- mode is a runtime 403 — a separate, individually-verified change.
  --
  -- Kept OUT of the shared list above on purpose: granting these to anon would
  -- hand anonymous visitors a host's Clerk identifier, which 027 never did.
  v_authed_only text[] := array['clerk_user_id', 'deleted_at'];
  v_present text;
begin
  -- Only grant columns that actually exist, so a partial schema or a future
  -- rename degrades to a no-op instead of erroring on `supabase db reset`.
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_present
    from pg_attribute a
   where a.attrelid = 'public.host_profiles'::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attname = any(v_readable);

  if v_present is not null then
    execute format(
      'grant select (%s) on table public.host_profiles to anon, authenticated',
      v_present
    );
  end if;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_present
    from pg_attribute a
   where a.attrelid = 'public.host_profiles'::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attname = any(v_authed_only);

  if v_present is not null then
    execute format(
      'grant select (%s) on table public.host_profiles to authenticated',
      v_present
    );
  end if;
end
$$;

commit;
