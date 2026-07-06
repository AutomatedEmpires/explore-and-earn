-- 056_host_profiles_public_tier_read.sql
-- Unbreak every anonymous public read that derives the Verified Host badge.
--
-- FINDING (live-verified on the keyless QA harness, 2026-07-06)
--   Migration 027 column-restricted the anon role's SELECT on host_profiles to
--   a public-safe set that deliberately EXCLUDED subscription_tier — at the
--   time, tier was a billing internal and the public trust signal was
--   attestation_status.
--
--   The Verified-Host refactor (fix/verified-host-subscription-gated) then
--   made the PUBLIC Verified Host badge derive from an active paid
--   subscription: every public listing/host query now embeds
--   host_profiles(..., subscription_tier) through the anon client
--   (packages/db/src/queries/listings.ts LISTING_DETAIL/LISTING_COLUMNS,
--   hostProfiles.ts PUBLIC_* column lists). PostgREST rejects the WHOLE query
--   when one selected column lacks a grant, so /seek, /search, and every real
--   /listing/[id] + /host/[id] page crash to the error boundary for
--   signed-out visitors:
--     "searchListings: permission denied for table host_profiles"
--
-- DECISION
--   The product law changed: subscription_tier IS now the source of the
--   public trust signal (the seeker-facing badge is precisely
--   hasVerifiedHostSubscription(tier)). A host's plan tier is inherently
--   visible through public entitlement behavior (listing counts, featured
--   placement, the badge itself), so granting anon a read on this one column
--   follows the product; 027's remaining protections (owner ids, coordinates,
--   moderation/attestation internals, completion internals) stay locked.
--
-- Row visibility is still gated by the 013 row policy
-- host_profiles_select_public (only hosts with a live listing are readable).
-- Idempotent: re-granting a held column privilege is a no-op.

begin;

grant select (subscription_tier) on public.host_profiles to anon;

commit;
