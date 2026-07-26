-- 081_policy_host_identity_helpers.sql
--
-- Removes the last *policy-level* dependency on host_profiles.clerk_user_id, so
-- that revoking the column (082) cannot break unrelated features.
--
-- WHY THIS EXISTS — a hazard 080 did not account for.
--
-- 080 deferred revoking clerk_user_id / deleted_at from `authenticated`, and
-- scoped the remaining work as "~11 call sites" in application code. That count
-- was low, because it only considered code that NAMES the column. It missed an
-- entire category: RLS policies on OTHER tables whose USING / WITH CHECK
-- contains a sub-select against public.host_profiles filtered on clerk_user_id.
--
-- 080:15 correctly notes that a policy on host_profiles itself is evaluated as
-- the table owner. That is true, and it is why host_profiles_select_own is not a
-- problem. It does NOT extend to a sub-select on a DIFFERENT table: that
-- sub-select becomes an ordinary range-table entry in the rewritten query and is
-- permission-checked against the INVOKING role, column bitmap included.
--
-- Verified empirically on a local instance of this database rather than assumed
-- (role `authenticated`, column-level grants, policy sub-select on a second
-- table):
--
--   * SELECT through a policy whose sub-select filters an UNGRANTED column of
--     another table  -> ERROR 42501 permission denied
--   * identical shape with the column GRANTED                 -> row returned
--   * an OR branch that would have matched does NOT short-circuit the
--     permission check on the other branch    -> ERROR 42501
--   * routing the same sub-select through a SECURITY DEFINER helper -> allowed
--
-- Consequence had 082 landed alone: every authenticated write to
-- storage.objects in the `listing-media` and `profile-photos` buckets would
-- 42501 — that is every listing cover/gallery upload, every host AND SEEKER
-- profile photo upload (the OR result above is why seekers break on a
-- host_profiles column), plus the whole host_announcements community feed for
-- every signed-in user. None of that is host_profiles code, so none of it would
-- have been caught by reviewing host_profiles call sites. Public <img> delivery
-- goes through /storage/v1/object/public/ and bypasses storage RLS entirely, so
-- a visual smoke test of the site would NOT have surfaced it either.
--
-- WHAT THIS MIGRATION DOES
--
-- Recreates the 11 affected policies with the sub-select replaced by the
-- SECURITY DEFINER helpers that already exist and are already the house pattern
-- for exactly this (013:37-47; currently backing listings_select_own,
-- listings_update_own, listings_delete_own, conversations_select_party,
-- host_attestations_all_own, host_seeker_dispositions_all_own,
-- team_memberships_all_host, invites_select_party and others).
--
-- The 11 were enumerated from pg_policy on a database rebuilt through 080, not
-- by grepping migrations, so policies created in one migration and superseded in
-- another are counted once, in their live form.
--
-- SEMANTICS ARE UNCHANGED. Every replaced expression was literally
--     <col> in (select hp.id from host_profiles hp
--                where hp.clerk_user_id = auth.jwt() ->> 'sub')
-- and public.current_host_profile_ids() is
--     select id from public.host_profiles where clerk_user_id = get_clerk_user_id()
-- with get_clerk_user_id() = auth.jwt() ->> 'sub' gated on ^user_[A-Za-z0-9_-]+$.
-- The only behavioural delta is that a malformed `sub` now resolves to NULL
-- instead of being compared literally — strictly narrower, and unreachable in
-- practice because no host row carries a malformed Clerk id.
--
-- This migration deliberately REVOKES NOTHING. It only removes dependencies, so
-- it is safe to apply on its own and safe to leave applied if 082 is deferred.

begin;

-- ---------------------------------------------------------------------------
-- 1) public.host_announcements (3 policies, migration 031)
-- ---------------------------------------------------------------------------

drop policy if exists host_announcements_owner_read_all on public.host_announcements;
create policy host_announcements_owner_read_all on public.host_announcements
  for select to authenticated
  using (
    host_profile_id in (select hp_id from public.current_host_profile_ids() as hp_id)
  );

drop policy if exists host_announcements_owner_insert on public.host_announcements;
create policy host_announcements_owner_insert on public.host_announcements
  for insert to authenticated
  with check (
    host_profile_id in (select hp_id from public.current_host_profile_ids() as hp_id)
  );

-- USING only, with no explicit WITH CHECK — same as before, so Postgres reuses
-- the USING expression for the check. Adding one here would be a behaviour change.
drop policy if exists host_announcements_owner_update on public.host_announcements;
create policy host_announcements_owner_update on public.host_announcements
  for update to authenticated
  using (
    host_profile_id in (select hp_id from public.current_host_profile_ids() as hp_id)
  );

-- ---------------------------------------------------------------------------
-- 2) storage.objects — listing-media (4 policies, migrations 017 + 072)
--
-- The `not (... library/housing ... benefit/housing ...)` carve-out is 072's:
-- Housing evidence objects are written only by the trusted service-role path
-- (packages/db/src/trustedStorage.ts), never by an authenticated client. It is
-- reproduced verbatim.
-- ---------------------------------------------------------------------------

drop policy if exists listing_media_select_own_folder on storage.objects;
create policy listing_media_select_own_folder on storage.objects
  for select to authenticated
  using (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp_id::text from public.current_host_profile_ids() as hp_id
    )
  );

drop policy if exists listing_media_insert_own_folder on storage.objects;
create policy listing_media_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp_id::text from public.current_host_profile_ids() as hp_id
    )
    and not (
      (split_part(name, '/', 2) = 'library' and split_part(name, '/', 3) = 'housing')
      or (split_part(name, '/', 2) = 'benefit' and split_part(name, '/', 4) = 'housing')
    )
  );

drop policy if exists listing_media_update_own_folder on storage.objects;
create policy listing_media_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp_id::text from public.current_host_profile_ids() as hp_id
    )
    and not (
      (split_part(name, '/', 2) = 'library' and split_part(name, '/', 3) = 'housing')
      or (split_part(name, '/', 2) = 'benefit' and split_part(name, '/', 4) = 'housing')
    )
  )
  with check (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp_id::text from public.current_host_profile_ids() as hp_id
    )
    and not (
      (split_part(name, '/', 2) = 'library' and split_part(name, '/', 3) = 'housing')
      or (split_part(name, '/', 2) = 'benefit' and split_part(name, '/', 4) = 'housing')
    )
  );

drop policy if exists listing_media_delete_own_folder on storage.objects;
create policy listing_media_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp_id::text from public.current_host_profile_ids() as hp_id
    )
  );

-- ---------------------------------------------------------------------------
-- 3) storage.objects — profile-photos (4 policies, migrations 017 + 023)
--
-- Each is (host branch OR seeker branch). BOTH branches are rewritten: the
-- seeker branch sub-selects seeker_profiles.clerk_user_id, which 082 does not
-- revoke, but leaving it inline would keep a second copy of the same hazard in
-- the schema for the next person to trip over.
-- ---------------------------------------------------------------------------

drop policy if exists profile_photos_select_own_folder on storage.objects;
create policy profile_photos_select_own_folder on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (
        split_part(name, '/', 1) = 'host'
        and split_part(name, '/', 2) in (
          select hp_id::text from public.current_host_profile_ids() as hp_id
        )
      )
      or (
        split_part(name, '/', 1) = 'seeker'
        and split_part(name, '/', 2) in (
          select sp_id::text from public.current_seeker_profile_ids() as sp_id
        )
      )
    )
  );

drop policy if exists profile_photos_insert_own_folder on storage.objects;
create policy profile_photos_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (
      (
        split_part(name, '/', 1) = 'host'
        and split_part(name, '/', 2) in (
          select hp_id::text from public.current_host_profile_ids() as hp_id
        )
      )
      or (
        split_part(name, '/', 1) = 'seeker'
        and split_part(name, '/', 2) in (
          select sp_id::text from public.current_seeker_profile_ids() as sp_id
        )
      )
    )
  );

drop policy if exists profile_photos_update_own_folder on storage.objects;
create policy profile_photos_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (
        split_part(name, '/', 1) = 'host'
        and split_part(name, '/', 2) in (
          select hp_id::text from public.current_host_profile_ids() as hp_id
        )
      )
      or (
        split_part(name, '/', 1) = 'seeker'
        and split_part(name, '/', 2) in (
          select sp_id::text from public.current_seeker_profile_ids() as sp_id
        )
      )
    )
  )
  with check (
    bucket_id = 'profile-photos'
    and (
      (
        split_part(name, '/', 1) = 'host'
        and split_part(name, '/', 2) in (
          select hp_id::text from public.current_host_profile_ids() as hp_id
        )
      )
      or (
        split_part(name, '/', 1) = 'seeker'
        and split_part(name, '/', 2) in (
          select sp_id::text from public.current_seeker_profile_ids() as sp_id
        )
      )
    )
  );

drop policy if exists profile_photos_delete_own_folder on storage.objects;
create policy profile_photos_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (
        split_part(name, '/', 1) = 'host'
        and split_part(name, '/', 2) in (
          select hp_id::text from public.current_host_profile_ids() as hp_id
        )
      )
      or (
        split_part(name, '/', 1) = 'seeker'
        and split_part(name, '/', 2) in (
          select sp_id::text from public.current_seeker_profile_ids() as sp_id
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Proof, at migration time, that the category is now empty.
--
-- This is the assertion 080 needed and did not have. It fails the migration —
-- and therefore the db-migrate pipeline — if ANY policy reachable by anon or
-- authenticated still sub-selects host_profiles.clerk_user_id, including one
-- added by a future migration that reintroduces the inline pattern.
-- ---------------------------------------------------------------------------
do $$
declare
  v_leftover text;
begin
  select string_agg(c.relname || '.' || p.polname, ', ' order by c.relname, p.polname)
    into v_leftover
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where (
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
         ) ilike '%host_profiles%'
     and (
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
         ) ilike '%clerk_user_id%'
     and (
           -- A policy written without a TO clause applies to PUBLIC, which is
           -- stored as OID 0 in polroles. pg_roles has no row with oid 0, so
           -- checking role NAMES alone silently misses it — and PUBLIC is the
           -- widest audience there is, anon and authenticated included.
           0 = any(p.polroles)
           or exists (
                select 1 from pg_roles r
                 where r.oid = any(p.polroles) and r.rolname in ('anon', 'authenticated')
              )
         );

  if v_leftover is not null then
    raise exception
      'host_profiles.clerk_user_id still reachable from anon/authenticated policies: %',
      v_leftover;
  end if;

  raise notice 'policy_host_identity_helpers: zero anon/authenticated policies sub-select host_profiles.clerk_user_id';
end
$$;

commit;
