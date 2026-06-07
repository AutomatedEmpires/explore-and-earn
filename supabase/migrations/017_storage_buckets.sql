-- 017_storage_buckets.sql
-- Wave 9 — Image upload infrastructure.
--
-- Creates the two public storage buckets used for uploaded media plus their
-- write/delete RLS, and the URL columns the app writes resolved public URLs into.
--
-- AUTH MODEL: this project authenticates with Clerk, NOT Supabase Auth (see
-- 013_rls_policies.sql). Ownership is keyed on the Clerk user id carried in the
-- Supabase-templated JWT as `auth.jwt() ->> 'sub'`.
--
-- PATH CONVENTIONS:
--   listing-media  → {hostProfileId}/{slot}
--   profile-photos → {ownerType}/{ownerId}
--     ownerType = 'host'   ownerId = host_profiles.id::text
--     ownerType = 'seeker' ownerId = seeker_profiles.id::text

-- ---------------------------------------------------------------------------
-- Buckets (both public-read)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('listing-media', 'listing-media', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update set public = excluded.public;

-- ---------------------------------------------------------------------------
-- listing-media RLS
--   INSERT/UPDATE/DELETE: first path segment must be caller's host_profile id
--   SELECT: public
-- ---------------------------------------------------------------------------
drop policy if exists "listing_media_insert_own_folder" on storage.objects;
create policy "listing_media_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp.id::text
      from public.host_profiles hp
      where hp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

drop policy if exists "listing_media_update_own_folder" on storage.objects;
create policy "listing_media_update_own_folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp.id::text
      from public.host_profiles hp
      where hp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  )
  with check (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp.id::text
      from public.host_profiles hp
      where hp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

drop policy if exists "listing_media_delete_own_folder" on storage.objects;
create policy "listing_media_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp.id::text
      from public.host_profiles hp
      where hp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

drop policy if exists "listing_media_public_read" on storage.objects;
create policy "listing_media_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'listing-media');

-- ---------------------------------------------------------------------------
-- profile-photos RLS
--   Path: {ownerType}/{ownerId}
--   INSERT/UPDATE/DELETE: caller must own the profile referenced by ownerId
--   SELECT: public
-- ---------------------------------------------------------------------------
drop policy if exists "profile_photos_insert_authed" on storage.objects;
drop policy if exists "profile_photos_update_authed" on storage.objects;

drop policy if exists "profile_photos_insert_own_folder" on storage.objects;
create policy "profile_photos_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (
      -- host photo: profile-photos/host/{hostProfileId}
      (
        split_part(name, '/', 1) = 'host'
        and split_part(name, '/', 2) in (
          select hp.id::text
          from public.host_profiles hp
          where hp.clerk_user_id = auth.jwt() ->> 'sub'
        )
      )
      or
      -- seeker photo: profile-photos/seeker/{seekerProfileId}
      (
        split_part(name, '/', 1) = 'seeker'
        and split_part(name, '/', 2) in (
          select sp.id::text
          from public.seeker_profiles sp
          where sp.clerk_user_id = auth.jwt() ->> 'sub'
        )
      )
    )
  );

drop policy if exists "profile_photos_update_own_folder" on storage.objects;
create policy "profile_photos_update_own_folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (
        split_part(name, '/', 1) = 'host'
        and split_part(name, '/', 2) in (
          select hp.id::text
          from public.host_profiles hp
          where hp.clerk_user_id = auth.jwt() ->> 'sub'
        )
      )
      or
      (
        split_part(name, '/', 1) = 'seeker'
        and split_part(name, '/', 2) in (
          select sp.id::text
          from public.seeker_profiles sp
          where sp.clerk_user_id = auth.jwt() ->> 'sub'
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
          select hp.id::text
          from public.host_profiles hp
          where hp.clerk_user_id = auth.jwt() ->> 'sub'
        )
      )
      or
      (
        split_part(name, '/', 1) = 'seeker'
        and split_part(name, '/', 2) in (
          select sp.id::text
          from public.seeker_profiles sp
          where sp.clerk_user_id = auth.jwt() ->> 'sub'
        )
      )
    )
  );

drop policy if exists "profile_photos_delete_own_folder" on storage.objects;
create policy "profile_photos_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (
        split_part(name, '/', 1) = 'host'
        and split_part(name, '/', 2) in (
          select hp.id::text
          from public.host_profiles hp
          where hp.clerk_user_id = auth.jwt() ->> 'sub'
        )
      )
      or
      (
        split_part(name, '/', 1) = 'seeker'
        and split_part(name, '/', 2) in (
          select sp.id::text
          from public.seeker_profiles sp
          where sp.clerk_user_id = auth.jwt() ->> 'sub'
        )
      )
    )
  );

drop policy if exists "profile_photos_public_read" on storage.objects;
create policy "profile_photos_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'profile-photos');

-- ---------------------------------------------------------------------------
-- URL columns the app writes resolved public URLs into
-- ---------------------------------------------------------------------------
alter table public.listings      add column if not exists cover_photo_url text;
alter table public.host_profiles add column if not exists photo_url       text;
