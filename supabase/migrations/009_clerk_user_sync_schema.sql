-- 009_clerk_user_sync_schema.sql
-- Clerk user sync webhook support.
--
-- Issue #105 moves the auth source of truth to Clerk while Supabase remains the
-- database/storage layer. These additive compatibility changes give the webhook
-- stable Clerk IDs to write against without using the public anon key.

alter table users_profile_shadow
  drop constraint if exists users_profile_shadow_id_fkey;

alter table users_profile_shadow
  alter column id set default gen_random_uuid(),
  add column if not exists clerk_user_id text;

create unique index if not exists idx_users_profile_shadow_clerk_user_id
  on users_profile_shadow (clerk_user_id)
  where clerk_user_id is not null;

alter table seeker_profiles
  add column if not exists clerk_user_id text,
  alter column user_id drop not null,
  alter column display_name drop not null;

create unique index if not exists idx_seeker_profiles_clerk_user_id
  on seeker_profiles (clerk_user_id)
  where clerk_user_id is not null;
