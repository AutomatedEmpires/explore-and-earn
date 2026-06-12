-- 027_host_profiles_anon_column_privacy.sql
-- P0 #1 - close anon (public-internet) COLUMN over-exposure on host_profiles.
--
-- FINDING
--   Migration 013 created the row policy `host_profiles_select_public`:
--     for select to anon, authenticated
--     using (exists (select 1 from public.listings l
--                    where l.host_profile_id = host_profiles.id
--                      and l.status = 'live'))
--   RLS is ROW-level only: once a row is visible, the grantee can read EVERY
--   column of that row. Combined with the anon role's table-wide SELECT grant,
--   any UNAUTHENTICATED visitor can read sensitive columns of any host that has
--   a live listing - including owner_user_id, clerk_user_id, the exact
--   primary_latitude / primary_longitude, account_status, the removed_*
--   moderation fields, attestation_* internals, trust_status, completion_score,
--   and subscription_tier.
--
-- FIX (least privilege, embed-preserving)
--   PostgreSQL column-level privileges add the COLUMN dimension that row-level
--   RLS cannot express. We REVOKE the anon role's table-wide SELECT and re-GRANT
--   SELECT on ONLY the public-safe columns. The `host_profiles_select_public`
--   row policy is intentionally left intact (it still gates which ROWS anon may
--   see). A column-restricted GRANT also preserves PostgREST FK embeds
--   (listings -> host_profiles), which a replacement view would break.
--
-- WHY THIS IS NON-BREAKING (verified against the data-access layer)
--   Every anon (anonClient) read selects an EXPLICIT column list, never `*`:
--     * packages/db/src/queries/hostProfiles.ts  getPublicHostProfile
--         id, company_name, host_name, tagline, about, primary_location_name,
--         photo_url, website_url, social_links, category_scopes,
--         housing_offered_generally, meals_offered_generally,
--         attestation_status, created_at
--     * packages/db/src/queries/listings.ts      discovery embed
--         host_profiles(company_name, attestation_status)
--     * sitemap                                   host_profiles(id, updated_at)
--   All of those columns are in the public-safe grant set below.
--   Owner / authenticated reads (getHostProfile, billing, invite embeds) run as
--   the `authenticated` role (the Clerk Supabase JWT carries role=authenticated;
--   the 013 owner policies are `to authenticated`). This migration does NOT
--   touch the authenticated role.
--
-- ROLE NOTE
--   anonClient()            => Postgres role `anon`
--   authedClient(clerkToken) => Postgres role `authenticated`
--     (Authorization: Bearer <clerk supabase jwt>; see packages/db/src/client.ts)
--   This migration changes the `anon` role ONLY.
--
-- RESIDUAL (tracked follow-up, NOT closed here)
--   An AUTHENTICATED non-owner can still over-read sensitive columns of any
--   live-listing host because the authenticated role keeps a table-wide SELECT
--   (it legitimately needs full columns on its OWN row, and column grants are
--   role-global, not per-row). Closing that requires moving cross-host public
--   reads behind a private-schema function/view and is scoped to a follow-up
--   PR. See docs/security/host-profile-anon-column-privacy.md.
--
-- REVIEW-ONLY: this PR does not apply anything to any live database.
-- Prod apply is founder-operated - see
-- docs/runbooks/security-host-profile-anon-columns.md.

begin;

-- 1) Remove the anon role's table-wide SELECT (all columns) on host_profiles.
revoke select on table public.host_profiles from anon;

-- 2) Re-grant SELECT to anon on ONLY the public-safe columns.
--    Idempotent: re-granting an already-held column privilege is a no-op, so a
--    clean `supabase db reset` rebuild ends in exactly this locked-down state.
grant select (
  id,
  company_name,
  host_name,
  tagline,
  about,
  primary_location_name,
  photo_url,
  website_url,
  social_links,
  category_scopes,
  housing_offered_generally,
  meals_offered_generally,
  attestation_status,
  created_at,
  updated_at
) on public.host_profiles to anon;

commit;
