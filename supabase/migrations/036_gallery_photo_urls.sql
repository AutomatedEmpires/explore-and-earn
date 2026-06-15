-- 036_gallery_photo_urls.sql
-- Additive migration: adds an ordered gallery URL array to the listings table.
--
-- INTENT: store the public Supabase Storage URLs for listing gallery images
-- (all slots other than "cover") so they can be displayed on the detail page
-- without a separate media join. This column is write-gated by the app layer
-- (server actions validate each URL against the storage bucket origin) and is
-- additive-only — no existing data is touched.
--
-- PATH CONVENTION (matches Wave 9 storage helpers in packages/db/src/storage.ts):
--   listing-media/{hostProfileId}/{slotIndex}   ← gallery (0-based integer slot)
--   listing-media/{hostProfileId}/cover          ← cover_photo_url (existing)

alter table public.listings
  add column if not exists gallery_photo_urls text[] not null default '{}';

comment on column public.listings.gallery_photo_urls is
  'Ordered array of public Supabase Storage URLs for listing gallery images '
  '(slots 0…N under listing-media/{hostProfileId}/{index}). '
  'Empty array means no gallery images. Maximum 10 entries enforced in the app layer.';
