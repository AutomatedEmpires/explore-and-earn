-- 016_lock_down_security_definer_functions.sql
--
-- Closes Supabase security advisor finding 0028
-- (anon_security_definer_function_executable): several SECURITY DEFINER
-- functions in the PostgREST-exposed `public` schema are callable by the
-- `anon` role via /rest/v1/rpc/*. Unauthenticated users should not invoke them.
--
-- Strategy:
--   * Identity / set-membership helpers are evaluated INSIDE RLS policies, so
--     the `authenticated` role MUST retain EXECUTE or authenticated queries
--     fail with "permission denied for function". We revoke from PUBLIC (which
--     drops anon) and re-grant to authenticated + service_role.
--   * Trigger functions fire as the table owner via triggers and never need a
--     client role to hold EXECUTE, so we revoke from PUBLIC outright.
--   * set_host_attestation is a host write helper: authenticated + service_role
--     only, never anon.
--
-- NOTE: the advisor's 0029 (authenticated_*) warning will still report the
-- identity/set-membership helpers after this migration. That is BY DESIGN --
-- RLS policy evaluation requires authenticated EXECUTE. To also clear 0029,
-- the thorough follow-up is to move these helpers out of the exposed `public`
-- schema into a dedicated `private` schema (RLS policies can still call them).
-- That refactor is intentionally NOT done here to keep this migration low-risk.

begin;

-- 1) Identity + set-membership helpers used in RLS policy evaluation.
revoke execute on function public.get_clerk_user_id() from public;
revoke execute on function public.current_seeker_profile_ids() from public;
revoke execute on function public.current_host_profile_ids() from public;
revoke execute on function public.current_host_listing_ids() from public;
revoke execute on function public.current_conversation_ids() from public;

grant execute on function public.get_clerk_user_id() to authenticated, service_role;
grant execute on function public.current_seeker_profile_ids() to authenticated, service_role;
grant execute on function public.current_host_profile_ids() to authenticated, service_role;
grant execute on function public.current_host_listing_ids() to authenticated, service_role;
grant execute on function public.current_conversation_ids() to authenticated, service_role;

-- 2) Trigger functions: no client role should hold RPC EXECUTE.
revoke execute on function public.enforce_listing_cover_asset() from public;
revoke execute on function public.enforce_listing_media_override() from public;

-- 3) Host attestation writer: authenticated + service_role only.
revoke execute on function public.set_host_attestation() from public;
grant execute on function public.set_host_attestation() to authenticated, service_role;

commit;
