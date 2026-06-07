-- 019_notification_prefs.sql
-- Seeker notification preferences.
--
-- Adds per-seeker email notification toggles, surfaced in the seeker Settings
-- screen and enforced by the transactional email senders (the applicationStatus
-- and messages server actions). All columns default to true so existing seekers
-- keep their current (all-on) behavior until they explicitly opt out.
--
-- RLS NOTE: seeker_profiles rows are already protected by the policies in
-- 013_rls_policies.sql (seekers can only read/write their own row via
-- clerk_user_id = auth.jwt() ->> 'sub'). The columns added here inherit that
-- coverage automatically — no additional RLS is needed.
--
-- CROSS-TOKEN READS: The transactional email senders (app/actions/messages.ts,
-- app/actions/applicationStatus.ts) need to check the recipient's prefs to
-- decide whether to send email. They do this with the SERVICE ROLE client
-- (SUPABASE_SERVICE_ROLE_KEY), not the caller's Clerk-templated JWT, because
-- the caller cannot read another user's seeker_profiles row. Never pass these
-- columns to the client or expose them via a public API.
--
-- Applied to the remote Supabase project via the Supabase MCP apply_migration
-- tool with founder approval in-thread (schema/migrations are a founder-gated
-- change). Recorded here so the repo migration history stays the source of truth.

alter table seeker_profiles
  add column if not exists email_on_invite boolean default true,
  add column if not exists email_on_status_change boolean default true,
  add column if not exists email_on_message boolean default true;
