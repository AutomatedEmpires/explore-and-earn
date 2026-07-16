-- 060_listing_immersive_fields.sql
-- Additive schema for the IMMERSIVE listing-detail page (route
-- apps/web/app/listing/[id]/page.tsx).
--
-- INTENT
--   The immersive detail page wants role narrative the listing model lacked:
--   "What you'll do" (responsibilities), "What we're looking for" (requirements),
--   and a listing-level "Perks & benefits" bucket (perks). Each lands as ONE
--   additive jsonb array of plain strings:
--     responsibilities : string[]   -- e.g. ["Hand-pick fruit", "Stage bins"]
--     requirements     : string[]   -- e.g. ["Lift 40 lbs", "Reliable"]
--     perks            : string[]   -- e.g. ["Fresh produce", "Season bonus"]
--   An empty array ('[]') means "nothing captured yet" — the page gracefully
--   omits each empty section. Read path:
--   packages/db/src/queries/listings.ts getListingDetailPublic
--   (LISTING_DETAIL_COLUMNS), parsed defensively (non-string entries dropped).
--
--   Note (revisits the 006 header): migration 006 deliberately shipped "NO
--   generic perks bucket on listings" for the Sprint-Zero Discovery Card triad.
--   The immersive detail page (a later, founder-directed vision) reintroduces a
--   listing-level perks array for the "Perks & benefits" section — additive and
--   independent of the Housing/Meals/Pay triad, which stays first-class.
--
-- ALREADY PRESENT (intentionally NOT re-added here)
--   housing_description / meals_description already exist on `listings` from
--   migration 040 (free-text Housing/Meals descriptors). 060 only widens the
--   detail READ path to surface them; no column add is needed.
--   The host showcase narrative ("Why work with us", team, activities, host
--   perks) already lives on host_profiles.narrative from migration 059.
--
-- ANON READ (no grant needed here — unlike 059)
--   Migration 027 revoked anon's table-wide SELECT on host_profiles and re-granted
--   a column subset, so 059 had to grant SELECT on the new `narrative` column to
--   anon. `listings` was NEVER column-revoked for anon (its public read is a
--   table-level grant governed by the 013 row policy listings_select_public), so
--   new columns are covered automatically — the public detail query (anon client)
--   can read responsibilities/requirements/perks without an explicit grant.
--
--   Idempotent: `add column if not exists` is a no-op on re-run, so a clean
--   `supabase db reset` rebuild ends in exactly this state.
--
-- Additive-only: no existing data is touched, no column is dropped or rewritten.
--
-- REVIEW-ONLY: this migration is a schema DEFINITION and is NOT applied to any
-- live database here. Prod apply is founder-operated.

begin;

alter table public.listings
  add column if not exists responsibilities jsonb not null default '[]'::jsonb,
  add column if not exists requirements     jsonb not null default '[]'::jsonb,
  add column if not exists perks            jsonb not null default '[]'::jsonb;

comment on column public.listings.responsibilities is
  'Immersive listing "What you''ll do" — jsonb array of plain-string '
  'responsibilities. Empty array means none captured yet.';

comment on column public.listings.requirements is
  'Immersive listing "What we''re looking for" — jsonb array of plain-string '
  'requirements. Empty array means none captured yet.';

comment on column public.listings.perks is
  'Immersive listing "Perks & benefits" — jsonb array of plain-string, '
  'listing-level perks (distinct from the Housing/Meals/Pay triad and from the '
  'host-level host_profiles.narrative.perks). Empty array means none captured yet.';

commit;
