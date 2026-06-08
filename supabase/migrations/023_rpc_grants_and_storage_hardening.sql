-- 023_rpc_grants_and_storage_hardening.sql
-- Lane A - security hardening (final migration in sequence).
--
-- Scope:
--   1. Neutralize the prod default-privilege re-arm so future function
--      (re)creation cannot regain anon/authenticated EXECUTE.
--   2. Explicitly REVOKE EXECUTE from anon, authenticated, public on all 8
--      SECURITY DEFINER functions in `public`, then re-grant only the minimum.
--   3. Close bucket-wide enumeration on the listing-media and profile-photos
--      storage buckets while preserving public asset delivery.
--   4. Reaffirm RLS-on / deny-by-default on the server-only tables.
--
-- ROOT CAUSE (corrected hypothesis):
--   Production carries a postgres-owned default-privilege re-arm:
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public
--       GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--   Because of it, every (re)created function in `public` regains a DIRECT
--   EXECUTE grant to anon + authenticated. Migration 016 only ran
--   `REVOKE ... FROM PUBLIC`, which does NOT remove a direct anon/authenticated
--   grant, so security advisor 0028 (anon) and 0029 (authenticated) still fire.
--   This migration revokes from anon, authenticated AND public explicitly,
--   re-grants the minimum, and removes the default-privilege re-arm.
--
-- This migration is the LAST in sequence, so a clean rebuild from repo ends in
-- the locked-down grant state. It intentionally does NOT redefine the functions
-- (a CREATE OR REPLACE would re-fire the default-privilege grant mid-run); the
-- grant reconciliation below is sufficient and idempotent.
--
-- REVIEW-ONLY: this PR does not apply anything to any live database.
-- Prod apply is founder-operated (see docs/runbooks/security-rpc-grants.md).

begin;

-- ===========================================================================
-- 1) Neutralize the default-privilege re-arm for FUTURE function creation.
-- ===========================================================================
-- Required by the lane brief: drop the anon/authenticated default grant.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- Also neutralize the built-in PostgreSQL default that grants EXECUTE to PUBLIC
-- on every newly created function (anon/authenticated inherit via PUBLIC).
alter default privileges in schema public
  revoke execute on functions from public;

-- The prod re-arm is owned by the `postgres` role; Supabase runs migrations as
-- `postgres`, so pin the same revoke for that grantor to remove its default
-- ACL entry. Guarded so a non-superuser rebuild environment does not hard-fail.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres')
     and pg_has_role(current_user, 'postgres', 'USAGE') then
    execute 'alter default privileges for role postgres in schema public '
         || 'revoke execute on functions from anon, authenticated, public';
  end if;
end;
$$;

-- ===========================================================================
-- 2) Lock down EXECUTE on the 8 SECURITY DEFINER functions.
--    Pattern: REVOKE from anon, authenticated, public; then GRANT the minimum.
-- ===========================================================================

-- 2a) RLS identity / set-membership helpers. These are evaluated INSIDE RLS
--     policies, so `authenticated` MUST retain EXECUTE (otherwise authenticated
--     queries fail with "permission denied for function"). anon + public removed.
revoke execute on function public.get_clerk_user_id()          from anon, authenticated, public;
revoke execute on function public.current_seeker_profile_ids() from anon, authenticated, public;
revoke execute on function public.current_host_profile_ids()   from anon, authenticated, public;
revoke execute on function public.current_host_listing_ids()   from anon, authenticated, public;
revoke execute on function public.current_conversation_ids()   from anon, authenticated, public;

grant execute on function public.get_clerk_user_id()          to authenticated, service_role;
grant execute on function public.current_seeker_profile_ids() to authenticated, service_role;
grant execute on function public.current_host_profile_ids()   to authenticated, service_role;
grant execute on function public.current_host_listing_ids()   to authenticated, service_role;
grant execute on function public.current_conversation_ids()   to authenticated, service_role;

-- 2b) Host attestation writer. authenticated + service_role only, never anon.
revoke execute on function public.set_host_attestation() from anon, authenticated, public;
grant  execute on function public.set_host_attestation() to authenticated, service_role;

-- 2c) Trigger functions. Triggers fire as the table owner and EXECUTE is never
--     checked for trigger invocation, so NO client role (and not service_role)
--     needs an execute grant. Revoke from all client roles; grant nothing.
revoke execute on function public.enforce_listing_cover_asset()    from anon, authenticated, public;
revoke execute on function public.enforce_listing_media_override() from anon, authenticated, public;

-- ===========================================================================
-- 3) Storage hardening - close bucket-wide enumeration on listing-media and
--    profile-photos while preserving PUBLIC ASSET DELIVERY.
-- ===========================================================================
-- The 017 `*_public_read` policies grant `SELECT ... to anon, authenticated
-- USING (bucket_id = '<bucket>')`, a blanket grant over storage.objects that
-- lets anyone LIST/enumerate every object key in the bucket via the storage
-- objects API.
--
-- TRADEOFF / DECISION: public DELIVERY does not need this policy. Both buckets
-- are `public = true`, so files are served through the public object endpoint
-- (/storage/v1/object/public/<bucket>/<key>), which bypasses storage.objects
-- RLS entirely. Dropping the blanket anon SELECT closes enumeration WITHOUT
-- breaking <img> delivery (the app persists resolved public URLs - see 017).
-- We replace it with an OWNER-SCOPED authenticated SELECT so a signed-in
-- host/seeker can still list ONLY their own folder (dashboard use), mirroring
-- the existing folder predicates used by the insert/update/delete policies.

-- listing-media: drop blanket public read; add owner-folder read.
drop policy if exists "listing_media_public_read" on storage.objects;
drop policy if exists "listing_media_select_own_folder" on storage.objects;
create policy "listing_media_select_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp.id::text
      from public.host_profiles hp
      where hp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

-- profile-photos: drop blanket public read; add owner-folder read.
-- Path convention (017): {ownerType}/{ownerId} where ownerType is host|seeker.
drop policy if exists "profile_photos_public_read" on storage.objects;
drop policy if exists "profile_photos_select_own_folder" on storage.objects;
create policy "profile_photos_select_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (
        split_part(name, '/', 1) = 'host'
        and split_part(name, '/', 2) in (
          select hp.id::text from public.host_profiles hp
          where hp.clerk_user_id = auth.jwt() ->> 'sub'
        )
      )
      or
      (
        split_part(name, '/', 1) = 'seeker'
        and split_part(name, '/', 2) in (
          select sp.id::text from public.seeker_profiles sp
          where sp.clerk_user_id = auth.jwt() ->> 'sub'
        )
      )
    )
  );

-- ===========================================================================
-- 4) Server-only tables - reaffirm RLS-on + deny-by-default (no client policy).
-- ===========================================================================
-- 015 already enabled RLS on these three with NO client policy (deny-by-design):
--   * events        - append-only audit/analytics; written server-side only.
--   * media_assets  - served outside the anon PostgREST path.
--   * media_buckets - referenced only by SQL + generated types.
-- 015 R1/R2 proved (by scanning the app) there is no client read/write path.
-- Re-assert idempotently so a clean rebuild can never leave them RLS-off, and
-- so the post-migration guardrail can prove the locked state.
alter table public.events        enable row level security;
alter table public.media_assets  enable row level security;
alter table public.media_buckets enable row level security;

commit;
