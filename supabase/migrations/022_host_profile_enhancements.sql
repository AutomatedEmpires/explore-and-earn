-- 022_host_profile_enhancements.sql
-- Add tagline and host_name to host_profiles so hosts can self-serve these
-- fields from the profile edit form. Both are nullable text (no constraint).

alter table host_profiles
  add column if not exists tagline    text,
  add column if not exists host_name  text;
