-- Migration 031: Add profile_photo_url to seeker_profiles
-- Stores the public Supabase Storage URL for the seeker's profile photo.
-- Mirrors the host_profiles.photo_url pattern (a direct URL string).
-- profile_photo_asset_id (UUID) from migration 003 remains for future
-- structured asset management; this column is the simple URL path.

alter table seeker_profiles
  add column if not exists profile_photo_url text;
