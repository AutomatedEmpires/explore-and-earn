-- Migration 012: Add clerk_user_id to host_profiles
--
-- host_profiles.owner_user_id references auth.users(id) (Supabase UUIDs), but
-- the application layer identifies hosts by their Clerk user id (a string like
-- "user_2abc..."). Without this column, every host-scoped query falls back to
-- an unfiltered table scan — a HIGH-severity IDOR: any authenticated host can
-- read or modify any other host's listings.
--
-- This column is the single source of truth for host identity in app code.
-- RLS policies (founder-gated, PR #107) will enforce this at the DB layer once
-- they land; until then, application code uses it for ownership scoping.

alter table host_profiles add column if not exists clerk_user_id text;

create unique index if not exists idx_host_profiles_clerk_user_id
  on host_profiles (clerk_user_id)
  where clerk_user_id is not null;
