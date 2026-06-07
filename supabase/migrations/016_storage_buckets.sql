-- 016_storage_buckets.sql
-- Wave 9 — Image upload infrastructure.
--
-- Creates the two public storage buckets used for uploaded media plus their
-- write RLS, and the URL columns the app writes resolved public URLs into.
--
-- AUTH MODEL: this project authenticates with Clerk, NOT Supabase Auth (see
-- 013_rls_policies.sql, which states "Never use auth.uid()"). Ownership is keyed
-- on the Clerk user id carried in the Supabase-templated JWT as
-- `auth.jwt() ->> 'sub'`. The Wave 9 brief expressed the listing-media policy in
-- auth.uid()/auth.users terms; that is translated here to this project's
-- canonical Clerk pattern so the policy actually matches how rows are owned
-- (host_profiles.clerk_user_id). Reads are public on both buckets.

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
--   INSERT/UPDATE: the caller must own (via clerk_user_id) the host_profile
--                  whose id is the first path segment
--                  -> listing-media/{hostProfileId}/{slot}
--   SELECT: public (bucket is public).
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

drop policy if exists "listing_media_public_read" on storage.objects;
create policy "listing_media_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'listing-media');

-- ---------------------------------------------------------------------------
-- profile-photos RLS
--   INSERT/UPDATE: any authenticated user (Clerk sub present on the JWT).
--   SELECT: public.
-- ---------------------------------------------------------------------------
drop policy if exists "profile_photos_insert_authed" on storage.objects;
create policy "profile_photos_insert_authed" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (auth.jwt() ->> 'sub') is not null
  );

drop policy if exists "profile_photos_update_authed" on storage.objects;
create policy "profile_photos_update_authed" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and (auth.jwt() ->> 'sub') is not null
  )
  with check (
    bucket_id = 'profile-photos'
    and (auth.jwt() ->> 'sub') is not null
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
