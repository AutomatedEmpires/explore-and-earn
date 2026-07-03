-- 040_benefit_details.sql
-- Additive migration: persist the Housing / Meals benefit detail that the host
-- benefit editor (BenefitTrustModal) and the listing create/edit form collect.
--
-- INTENT (closes the audited gap where benefit detail was inert / discarded):
--   1. housing_description / meals_description — the free-text benefit summary
--      the listing edit form already submits (read into ListingWriteFields but,
--      pre-040, silently dropped: buildListingColumnPatch only flipped the
--      housing_included / meals_included booleans, so the copy was never stored
--      and the edit form re-saved blanks, wiping the booleans). These columns
--      give that text a home and let the edit form hydrate honestly.
--   2. benefit_details JSONB — the structured detail from the benefit editor
--      (housing type, room setup, amenities[], meal style, dietary[], meals
--      provided[], arrangements[], per-slot photo URLs). Shape, keyed by kind:
--        { housing?: { fields, toggles, photos, customChips },
--          meals?:   { fields, toggles, photos, customChips } }
--      where fields = Record<fieldId,string>, toggles = Record<sectionId,string[]>,
--      photos = Record<slotId,publicUrl>, customChips = Record<sectionId,{id,label}[]>.
--
-- This lives on `listings` (the row the detail belongs to) rather than a new
-- table or the category-keyed listing_relevance_extensions (wrong home): one
-- additive column, governed by the listings RLS that already scopes writes to
-- the owning host. Photo URLs are write-gated in the app layer (server actions
-- validate each URL against the configured Supabase storage origin) — matching
-- the gallery_photo_urls convention from migration 036.
--
-- Additive-only: no existing data is touched, no column is dropped or rewritten.

alter table public.listings
  add column if not exists housing_description text,
  add column if not exists meals_description  text,
  add column if not exists benefit_details    jsonb not null default '{}'::jsonb;

comment on column public.listings.housing_description is
  'Free-text housing summary shown on the listing (e.g. "Private cabin, '
  'shared bath"). Host-entered via the listing edit form. NULL = unset.';

comment on column public.listings.meals_description is
  'Free-text meals summary shown on the listing (e.g. "3 staff meals daily, '
  'vegetarian options"). Host-entered via the listing edit form. NULL = unset.';

comment on column public.listings.benefit_details is
  'Structured Housing/Meals benefit detail from the benefit editor, keyed by '
  'kind: { housing?: {fields,toggles,photos,customChips}, meals?: {...} }. '
  'Photo values are public Supabase Storage URLs under '
  'listing-media/{hostProfileId}/benefit/{listingId}/{kind}/{slot}, '
  'app-layer write-gated. Empty object means no detail captured yet.';
