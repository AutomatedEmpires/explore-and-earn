-- Migration 061: lock down column-level UPDATE on seeker_profiles.
--
-- Migration 013 enabled RLS on seeker_profiles and added seeker_profiles_update_own,
-- a ROW-level policy: it gates WHICH ROW a seeker may UPDATE (their own), but
-- Postgres RLS cannot restrict WHICH COLUMNS an UPDATE writes. Every seeker call
-- runs through the authenticated client (anon key + the caller's Clerk JWT) and
-- clients can call PostgREST directly, so the blanket table-level UPDATE grant on
-- `authenticated` lets a seeker PATCH *any* column of their own row — including
-- server-authoritative fields the app never writes under the seeker's token.
--
-- Real IDOR this closes (audit finding): completion_score is a
-- server/service-role-authoritative field (default 0; only ever written by
-- service-role paths — never by the authenticated PostgREST client). The
-- community photo gate consumes it directly — apps/web/app/actions/community.ts
-- (~68-72) refuses uploads when completion_score < 80. A seeker could otherwise
--   PATCH /rest/v1/seeker_profiles?id=eq.<own> {"completion_score": 100}
-- and bypass the gate outright. match_confidence_score, visibility_status, and
-- the identity/soft-delete columns (id, user_id, clerk_user_id, created_at,
-- updated_at, deleted_at) are the same class of authoritative field and are
-- likewise excluded below.
--
-- Fix — same shape as 050 (messages/conversations) and 054 (host_profiles):
-- revoke the blanket UPDATE grant from `authenticated` and re-grant UPDATE on
-- EXACTLY the columns the app writes under the seeker's own token today. Any
-- other column in an UPDATE payload now raises "permission denied for column".
-- RLS still restricts the rows; the grant now restricts the columns. service_role
-- writes (Clerk webhook soft-delete, the matching/completion pipelines, admin
-- actions) are unaffected — service_role bypasses grants and RLS entirely.
--
-- The granted set is the union of every authenticated-token writer verified live
-- against the codebase:
--   * saveSeekerProfile              (packages/db/.../seekerProfiles.ts)
--   * updateSeekerProfileBio         (packages/db/.../seekerResume.ts)
--   * updateSeekerProfileInfo        (packages/db/.../seekerResume.ts)
--   * updateSeekerProfileColumns     (apps/web/app/actions/seekerSettings.ts)
--   * saveNotificationPrefs / updateNotificationPrefs (packages/db/.../notificationPrefs.ts)
--
-- Idempotent: REVOKE/GRANT are safe to re-run.
--
-- NOTE (DO NOT APPLY as part of this change): additive migration only — the
-- founder applies it. If a future feature adds a seeker-writable column, it must
-- be added to this grant list or the write will 403 at PostgREST.

begin;

revoke update on public.seeker_profiles from authenticated;

grant update (
  -- identity / bio / onboarding
  display_name,
  short_bio,
  open_to_statement,
  onboarding_complete,
  -- location & travel
  relative_location,
  location_pref,
  travel_readiness,
  -- housing / meals preferences
  housing_preference,
  meals_preference,
  -- pay expectations
  pay_expectation_min_cents,
  pay_expectation_max_cents,
  pay_expectation_unit,
  pay_flexible,
  -- categories / roles / skills
  desired_categories,
  desired_roles,
  general_skill_tags,
  -- media
  profile_photo_url,
  hero_cover_url,
  -- seeking timeline
  seeking_timeline,
  -- availability window
  availability_start,
  availability_end,
  availability_status,
  -- notification preferences
  email_on_invite,
  email_on_status_change,
  email_on_message
) on public.seeker_profiles to authenticated;

commit;
