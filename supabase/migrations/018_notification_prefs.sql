-- Migration 018: Seeker notification preferences
--
-- Adds per-seeker email notification toggles, surfaced in the seeker Settings
-- screen and enforced by the transactional email senders (the applicationStatus
-- and messages server actions). All columns default to true so existing seekers
-- keep their current (all-on) behavior until they explicitly opt out.
--
-- Applied to the remote Supabase project via the Supabase MCP apply_migration
-- tool with founder approval in-thread (schema/migrations are a founder-gated
-- change). Recorded here so the repo migration history stays the source of
-- truth.

alter table seeker_profiles
  add column if not exists email_on_invite boolean default true,
  add column if not exists email_on_status_change boolean default true,
  add column if not exists email_on_message boolean default true;
