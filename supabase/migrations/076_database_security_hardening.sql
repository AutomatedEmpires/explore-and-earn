-- 076_database_security_hardening.sql
-- Pin service-only RPC resolution and close cross-owner Storage enumeration.

begin;

-- These functions are SECURITY INVOKER and service-role-only, but a mutable
-- search_path still leaves name resolution dependent on the caller. Every
-- application relation in their bodies is already schema-qualified; pg_catalog
-- remains implicitly available when search_path is empty.
alter function public.create_invite_with_credit(uuid, uuid, uuid, text, uuid, integer)
  set search_path = '';
alter function public.restore_invite_credit(uuid)
  set search_path = '';
alter function public.transition_listing_claim(uuid, text, text, text)
  set search_path = '';
alter function public.convert_claimed_listing(uuid, text, uuid, jsonb)
  set search_path = '';
alter function public.claim_notification_deliveries(text, integer, integer)
  set search_path = '';
alter function public.get_unprocessed_notification_events(integer)
  set search_path = '';

-- community-photos is a public bucket, so public object URLs do not require a
-- SELECT policy. Replace the bucket-wide policy with an owner-scoped policy:
-- Storage remove() needs SELECT as well as DELETE because it returns deleted
-- rows, while the folder predicate prevents cross-seeker enumeration.
drop policy if exists "community_photos_authenticated_select"
  on storage.objects;

create policy "community_photos_owner_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'community-photos'
    and (storage.foldername(name))[1] in (
      select sp.id::text
      from public.seeker_profiles sp
      where sp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

commit;
