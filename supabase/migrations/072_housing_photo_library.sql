-- Reusable housing-photo evidence, enforced at every writer boundary.
-- Semantic roles are fixed; category-adaptive labels live in contracts/UI.

begin;

-- Freeze every table participating in the cross-row preflight before changing
-- schema or scanning evidence. SHARE ROW EXCLUSIVE blocks concurrent writers
-- while allowing ordinary reads and is held until this transaction commits.
lock table public.host_profiles in share row exclusive mode;
lock table public.listings in share row exclusive mode;
lock table storage.objects in share row exclusive mode;

-- Storage API enforces these limits for every protocol, including callers that
-- bypass the application and upload directly with an authenticated JWT.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/heic'
       ]::text[]
 where id = 'listing-media';

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'listing-media') then
    raise exception 'housing_photo_storage_preflight: listing-media bucket is missing';
  end if;
end;
$$;

alter table public.host_profiles
  add column if not exists benefit_library jsonb not null default '{}'::jsonb;

comment on column public.host_profiles.benefit_library is
  'Reusable host evidence. Housing shape: {housing:{photos:{sleeping_area,bathroom,kitchen,dining_common}}}. Empty/absent keys make no claim.';

-- 054 removed the blanket host UPDATE grant. Add only this new editable column.
grant update (benefit_library) on public.host_profiles to authenticated;

-- RLS cannot hide a column from authenticated non-owners because the public
-- live-host SELECT policy is ORed with the owner policy. Remove table-wide
-- reads, restore every pre-existing column except the private library, and
-- expose owner reads through a SECURITY DEFINER RPC below.
revoke select on table public.host_profiles from authenticated;
revoke select (benefit_library) on public.host_profiles from anon, authenticated;

do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_columns
    from pg_attribute a
   where a.attrelid = 'public.host_profiles'::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attname <> 'benefit_library';
  execute format(
    'grant select (%s) on table public.host_profiles to authenticated',
    v_columns
  );
end;
$$;

-- Raw listing benefit JSON can contain unused or stale housing overrides.
-- Public and authenticated readers retain every ordinary listing column while
-- benefit_details moves behind owner/public RPCs below.
revoke select on table public.listings from anon, authenticated;
revoke select (benefit_details) on public.listings from anon, authenticated;

do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_columns
    from pg_attribute a
   where a.attrelid = 'public.listings'::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attname <> 'benefit_details';
  execute format(
    'grant select (%s) on table public.listings to anon, authenticated',
    v_columns
  );
end;
$$;

create schema if not exists private;
revoke all on schema private from public;

-- Keep ordinary listing-media uploads owner-scoped, but reserve both Housing
-- evidence namespaces for trusted server writes. PostgreSQL combines permissive
-- policies with OR, so the historical 017 policies must be replaced rather
-- than supplemented with a second deny policy.
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
    and not (
      (split_part(name, '/', 2) = 'library'
       and split_part(name, '/', 3) = 'housing')
      or
      (split_part(name, '/', 2) = 'benefit'
       and split_part(name, '/', 4) = 'housing')
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
    and not (
      (split_part(name, '/', 2) = 'library'
       and split_part(name, '/', 3) = 'housing')
      or
      (split_part(name, '/', 2) = 'benefit'
       and split_part(name, '/', 4) = 'housing')
    )
  )
  with check (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] in (
      select hp.id::text
        from public.host_profiles hp
       where hp.clerk_user_id = auth.jwt() ->> 'sub'
    )
    and not (
      (split_part(name, '/', 2) = 'library'
       and split_part(name, '/', 3) = 'housing')
      or
      (split_part(name, '/', 2) = 'benefit'
       and split_part(name, '/', 4) = 'housing')
    )
  );

-- Extract the object path from a URL that has already passed an origin-bound
-- writer check. Storage mutation triggers use this origin-independent parser:
-- the Storage API may connect with an internal Host header (or none at all).
create or replace function private.stored_housing_photo_object_name(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_url ~ '^https?://[^/]+/storage/v1/object/public/listing-media/[^?#]+([?][^#]*)?$'
    then nullif(
      split_part(
        split_part(p_url, '/storage/v1/object/public/listing-media/', 2),
        '?',
        1
      ),
      ''
    )
    else null
  end
$$;

create or replace function private.housing_photo_metadata_is_valid(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    lower(trim(p_metadata->>'mimetype')) = any(array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic'
    ]::text[])
    and case
      when coalesce(p_metadata->>'size', '') ~ '^[0-9]+$'
      then (p_metadata->>'size')::numeric between 1 and 5242880
      else false
    end,
    false
  )
$$;

create or replace function private.housing_photo_object_name(p_url text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_request_host text;
  v_url_host text;
  v_url_scheme text;
begin
  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_request_host := lower(trim(split_part(coalesce(v_headers->>'host', ''), ',', 1)));
  if v_request_host = '' then
    -- Migration/preflight and service-side SQL have no request headers. The
    -- canonical production origin is the only safe fallback in that context.
    v_request_host := 'mamosbzcbigcclafhmmr.supabase.co';
  end if;

  if p_url !~ '^https?://[^/]+/storage/v1/object/public/listing-media/.+' then
    return null;
  end if;
  v_url_scheme := lower(split_part(p_url, '://', 1));
  v_url_host := lower(split_part(split_part(p_url, '://', 2), '/', 1));
  if v_url_host <> v_request_host then
    return null;
  end if;
  if v_url_scheme <> 'https'
     and split_part(v_url_host, ':', 1) not in ('127.0.0.1', 'localhost', '::1') then
    return null;
  end if;

  return private.stored_housing_photo_object_name(p_url);
end;
$$;

create or replace function private.housing_photo_url_is_valid(
  p_url text,
  p_expected_prefix text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with candidate as (
    select private.housing_photo_object_name(p_url) as name
  )
  select coalesce(
    c.name is not null
    and left(c.name, length(p_expected_prefix) + 1) = p_expected_prefix || '/'
    and length(c.name) > length(p_expected_prefix) + 1
    and exists (
      select 1
        from storage.objects o
       where o.bucket_id = 'listing-media'
         and o.name = c.name
         and private.housing_photo_metadata_is_valid(o.metadata)
    ),
    false
  )
  from candidate c
$$;

create or replace function private.missing_housing_photo_roles(
  p_host_profile_id uuid,
  p_listing_id uuid,
  p_benefit_details jsonb,
  p_benefit_library jsonb
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_override text;
  v_library text;
  v_valid boolean;
  v_missing text[] := array[]::text[];
begin
  foreach v_role in array array['sleeping_area', 'bathroom', 'kitchen', 'dining_common'] loop
    v_override := nullif(trim(p_benefit_details #>> array['housing', 'photos', v_role]), '');
    v_library := nullif(trim(p_benefit_library #>> array['housing', 'photos', v_role]), '');
    if v_override is not null then
      v_valid := private.housing_photo_url_is_valid(
        v_override,
        p_host_profile_id::text || '/benefit/' || p_listing_id::text || '/housing/' || v_role
      );
    else
      v_valid := private.housing_photo_url_is_valid(
        v_library,
        p_host_profile_id::text || '/library/housing/' || v_role
      );
    end if;

    if not coalesce(v_valid, false) then
      v_missing := array_append(v_missing, v_role);
    end if;
  end loop;

  return v_missing;
end;
$$;

-- Existing deployments necessarily have an empty host library because this
-- migration introduces the column. Do not let that make the upgrade
-- impossible, and do not silently grandfather an unsupported public claim:
-- atomically restrict every affected verified listing while the participating
-- tables are still locked. A live listing has already passed moderation, so it
-- may return to paused and resume after its photos are repaired. An
-- under-review listing has not passed moderation and must return to draft;
-- moving both states to paused would let migration 077's paused -> live host
-- transition bypass the outstanding admin decision. Draft/paused rows remain
-- private and the triggers installed below require any persisted role URL to
-- be repaired on its next write.
do $$
declare
  v_restricted_count integer;
begin
  update public.listings l
     set status = case
       when l.status = 'under_review' then 'draft'
       else 'paused'
     end
   where l.provenance <> 'sourced'
     and l.status in ('under_review', 'live')
     and l.housing_included = true
     and coalesce(array_length(
       private.missing_housing_photo_roles(
         l.host_profile_id,
         l.id,
         coalesce(l.benefit_details, '{}'::jsonb),
         coalesce((
           select hp.benefit_library
             from public.host_profiles hp
            where hp.id = l.host_profile_id
         ), '{}'::jsonb)
       ),
       1
     ), 0) > 0;

  get diagnostics v_restricted_count = row_count;
  raise notice 'housing_photo_migration_restricted_listings=%', v_restricted_count;
end;
$$;

-- Ownership transfer is also a claim-boundary transfer of authorship. Source
-- details and a prior host's details belong in the private claim snapshot, not
-- on the newly verified listing where seekers would read them as the new
-- host's statement. Keep this as a small trigger around the existing 064 claim
-- RPCs so their state machine remains canonical.
create or replace function private.preserve_claim_benefit_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshotted integer;
  v_restored jsonb;
begin
  if old.provenance = 'sourced'
     and new.provenance = 'verified'
     and new.host_profile_id is not null then
    update public.listing_claims lc
       set pre_conversion_snapshot =
         coalesce(lc.pre_conversion_snapshot, '{}'::jsonb) ||
         jsonb_build_object(
           'benefit_details',
           coalesce(old.benefit_details, '{}'::jsonb)
         )
     where lc.id = (
       select candidate.id
         from public.listing_claims candidate
        where candidate.listing_id = old.id
          and candidate.host_profile_id = new.host_profile_id
          and candidate.status = 'confirming'
        order by candidate.updated_at desc, candidate.created_at desc, candidate.id desc
        limit 1
     );

    get diagnostics v_snapshotted = row_count;
    if v_snapshotted <> 1 then
      raise exception using
        errcode = '23514',
        message = 'claim_benefit_snapshot_missing';
    end if;

    new.benefit_details := '{}'::jsonb;
  elsif old.provenance = 'verified'
        and new.provenance = 'sourced'
        and new.host_profile_id is null then
    select nullif(lc.pre_conversion_snapshot->'benefit_details', 'null'::jsonb)
      into v_restored
      from public.listing_claims lc
     where lc.listing_id = old.id
       and lc.host_profile_id = old.host_profile_id
       and lc.status = 'revoked'
     order by lc.decided_at desc nulls last,
              lc.updated_at desc,
              lc.created_at desc,
              lc.id desc
     limit 1;

    -- Legacy converted claims have no benefit_details snapshot. Failing closed
    -- to an empty map keeps an unreviewed prior-host statement out of the
    -- sourced row while preserving every new conversion exactly.
    new.benefit_details := coalesce(v_restored, '{}'::jsonb);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_listings_claim_benefit_ownership on public.listings;
create trigger trg_listings_claim_benefit_ownership
  before update of provenance, host_profile_id on public.listings
  for each row execute function private.preserve_claim_benefit_details();

-- PostgreSQL fires same-kind triggers in name order. `claim` sorts before
-- `housing`, so stale source/prior-host overrides are cleared before the new
-- host's effective Housing evidence is validated below.
create or replace function private.enforce_listing_housing_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_library jsonb := '{}'::jsonb;
  v_role text;
  v_override text;
  v_missing text[];
begin
  if new.provenance = 'sourced' then
    return new;
  end if;

  if new.host_profile_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.host_profile_id::text, 72));
  end if;

  -- Draft overrides are still persisted references. Validate every present role
  -- immediately so invalid direct PostgREST writes cannot wait in a draft.
  foreach v_role in array array['sleeping_area', 'bathroom', 'kitchen', 'dining_common'] loop
    v_override := nullif(trim(
      coalesce(new.benefit_details, '{}'::jsonb) #>> array['housing', 'photos', v_role]
    ), '');
    if v_override is not null and (
      new.host_profile_id is null
      or not private.housing_photo_url_is_valid(
        v_override,
        new.host_profile_id::text || '/benefit/' || new.id::text || '/housing/' || v_role
      )
    ) then
      raise exception using
        errcode = '23514',
        message = 'housing_photo_reference_invalid: ' || v_role;
    end if;
  end loop;

  if new.status not in ('under_review', 'live')
     or new.housing_included is not true then
    return new;
  end if;

  if new.host_profile_id is null then
    raise exception using
      errcode = '23514',
      message = 'housing_photo_roles_missing: sleeping_area, bathroom, kitchen, dining_common';
  end if;

  select coalesce(hp.benefit_library, '{}'::jsonb)
    into v_library
    from public.host_profiles hp
   where hp.id = new.host_profile_id;

  v_missing := private.missing_housing_photo_roles(
    new.host_profile_id,
    new.id,
    coalesce(new.benefit_details, '{}'::jsonb),
    coalesce(v_library, '{}'::jsonb)
  );

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception using
      errcode = '23514',
      message = 'housing_photo_roles_missing: ' || array_to_string(v_missing, ', ');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_listings_housing_photos on public.listings;
create trigger trg_listings_housing_photos
  before insert or update of status, provenance, host_profile_id, housing_included, benefit_details
  on public.listings
  for each row execute function private.enforce_listing_housing_photos();

create or replace function private.protect_host_housing_photo_library()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing record;
  v_role text;
  v_url text;
  v_missing text[];
begin
  if new.benefit_library is not distinct from old.benefit_library then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.id::text, 72));

  foreach v_role in array array['sleeping_area', 'bathroom', 'kitchen', 'dining_common'] loop
    v_url := nullif(trim(
      coalesce(new.benefit_library, '{}'::jsonb) #>> array['housing', 'photos', v_role]
    ), '');
    if v_url is not null and not private.housing_photo_url_is_valid(
      v_url,
      new.id::text || '/library/housing/' || v_role
    ) then
      raise exception using
        errcode = '23514',
        message = 'housing_photo_reference_invalid: ' || v_role;
    end if;
  end loop;

  for v_listing in
    select l.id, l.benefit_details
      from public.listings l
     where l.host_profile_id = new.id
       and l.provenance <> 'sourced'
       and l.status in ('under_review', 'live')
       and l.housing_included = true
     order by l.id
  loop
    v_missing := private.missing_housing_photo_roles(
      new.id,
      v_listing.id,
      coalesce(v_listing.benefit_details, '{}'::jsonb),
      coalesce(new.benefit_library, '{}'::jsonb)
    );

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using
        errcode = '23514',
        message = 'housing_photo_roles_in_use: ' || array_to_string(v_missing, ', ');
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_host_profiles_housing_library on public.host_profiles;
create trigger trg_host_profiles_housing_library
  before update of benefit_library on public.host_profiles
  for each row execute function private.protect_host_housing_photo_library();

create or replace function private.protect_referenced_housing_photo_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host_profile_id uuid;
  v_referenced boolean;
begin
  if old.bucket_id <> 'listing-media' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  begin
    v_host_profile_id := split_part(old.name, '/', 1)::uuid;
  exception when invalid_text_representation then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end;

  perform pg_advisory_xact_lock(hashtextextended(v_host_profile_id::text, 72));

  select exists (
    select 1
      from public.host_profiles hp
     where hp.id = v_host_profile_id
       and old.name in (
         private.stored_housing_photo_object_name(hp.benefit_library #>> '{housing,photos,sleeping_area}'),
         private.stored_housing_photo_object_name(hp.benefit_library #>> '{housing,photos,bathroom}'),
         private.stored_housing_photo_object_name(hp.benefit_library #>> '{housing,photos,kitchen}'),
         private.stored_housing_photo_object_name(hp.benefit_library #>> '{housing,photos,dining_common}')
       )
    union all
    select 1
      from public.listings l
     where l.host_profile_id = v_host_profile_id
       and old.name in (
         private.stored_housing_photo_object_name(l.benefit_details #>> '{housing,photos,sleeping_area}'),
         private.stored_housing_photo_object_name(l.benefit_details #>> '{housing,photos,bathroom}'),
         private.stored_housing_photo_object_name(l.benefit_details #>> '{housing,photos,kitchen}'),
         private.stored_housing_photo_object_name(l.benefit_details #>> '{housing,photos,dining_common}')
       )
  )
    into v_referenced;

  if v_referenced then
    raise exception using
      errcode = '23514',
      message = 'housing_photo_object_in_use';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_storage_housing_photo_references on storage.objects;
create trigger trg_storage_housing_photo_references
  before delete or update on storage.objects
  for each row execute function private.protect_referenced_housing_photo_object();

-- Anonymous consumers may see only the four effective photos for one live,
-- host-controlled Housing Included claim. Raw profile defaults remain private,
-- including defaults unused by a listing or hidden behind an override.
create or replace function public.get_public_housing_photos(p_listing_id uuid)
returns table(role text, url text, source text)
language sql
stable
security definer
set search_path = ''
as $$
  with roles(role, ordinal) as (
    select value, ordinality
      from unnest(array['sleeping_area', 'bathroom', 'kitchen', 'dining_common']::text[])
           with ordinality as fixed(value, ordinality)
  ),
  eligible as (
    select l.id,
           l.host_profile_id,
           coalesce(l.benefit_details, '{}'::jsonb) as benefit_details,
           coalesce(hp.benefit_library, '{}'::jsonb) as benefit_library
      from public.listings l
      join public.host_profiles hp on hp.id = l.host_profile_id
     where l.id = p_listing_id
       and l.status = 'live'
       and l.provenance = 'verified'
       and l.housing_included = true
       and l.housing_evidence = 'confirmed'
  ),
  candidates as (
    select r.role,
           r.ordinal,
           e.id as listing_id,
           e.host_profile_id,
           nullif(trim(e.benefit_details #>> array['housing', 'photos', r.role]), '') as override_url,
           nullif(trim(e.benefit_library #>> array['housing', 'photos', r.role]), '') as library_url
      from eligible e
      cross join roles r
  ),
  selected as (
    select c.role,
           c.ordinal,
           case
             when c.override_url is not null then c.override_url
             else c.library_url
           end as url,
           case
             when c.override_url is not null then 'listing'
             else 'profile'
           end as source,
           case
             when c.override_url is not null
               then c.host_profile_id::text || '/benefit/' || c.listing_id::text || '/housing/' || c.role
             else c.host_profile_id::text || '/library/housing/' || c.role
           end as expected_prefix
      from candidates c
  ),
  validated as materialized (
    select s.role,
           s.ordinal,
           s.url,
           s.source,
           private.housing_photo_url_is_valid(s.url, s.expected_prefix) as is_valid
      from selected s
  ),
  complete as (
    select v.role,
           v.ordinal,
           v.url,
           v.source,
           count(*) over () as valid_count
      from validated v
     where v.is_valid
  )
  select c.role, c.url, c.source
    from complete c
   where c.valid_count = 4
   order by c.ordinal
$$;

-- Owner-only raw benefit context. Public RLS policies cannot provide column
-- secrecy, so callers prove ownership inside this definer function instead.
create or replace function public.get_owned_benefit_context(p_listing_id uuid)
returns table(
  host_profile_id uuid,
  benefit_details jsonb,
  benefit_library jsonb,
  subscription_tier text
)
language sql
stable
security definer
set search_path = ''
as $$
  select hp.id,
         coalesce(l.benefit_details, '{}'::jsonb),
         coalesce(hp.benefit_library, '{}'::jsonb),
         hp.subscription_tier
    from public.listings l
    join public.host_profiles hp on hp.id = l.host_profile_id
   where l.id = p_listing_id
     and hp.id in (select public.current_host_profile_ids())
   limit 1
$$;

create or replace function public.get_my_host_benefit_library()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(hp.benefit_library, '{}'::jsonb)
    from public.host_profiles hp
   where hp.id in (select public.current_host_profile_ids())
   limit 1
$$;

-- Serialize structured benefit edits at the row boundary. Updating one kind
-- with jsonb_set preserves concurrent edits to the other kind, and returning
-- the replaced detail lets the caller clean up only objects it actually
-- displaced.
create or replace function public.save_owned_benefit_detail(
  p_listing_id uuid,
  p_kind text,
  p_detail jsonb
)
returns table(
  previous_detail jsonb,
  benefit_details jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current jsonb;
  v_next jsonb;
begin
  if p_kind not in ('housing', 'meals') then
    raise exception using
      errcode = '22023',
      message = 'unsupported_benefit_kind';
  end if;
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'benefit_detail_must_be_an_object';
  end if;

  select coalesce(l.benefit_details, '{}'::jsonb)
    into v_current
    from public.listings l
    join public.host_profiles hp on hp.id = l.host_profile_id
   where l.id = p_listing_id
     and hp.id in (select public.current_host_profile_ids())
   for update of l;

  if not found then
    return;
  end if;

  v_next := jsonb_set(v_current, array[p_kind], p_detail, true);
  update public.listings
     set benefit_details = v_next
   where id = p_listing_id;

  return query select v_current->p_kind, v_next;
end;
$$;

-- Profile-photo uploads are immediate mutations. Serialize them per profile
-- and per semantic role so two tabs cannot clobber unrelated roles, and return
-- the exact displaced URL for safe object cleanup.
create or replace function public.set_my_housing_library_photo(
  p_role text,
  p_url text
)
returns table(
  host_profile_id uuid,
  previous_url text,
  benefit_library jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host_profile_id uuid;
  v_current jsonb;
  v_next jsonb;
begin
  if p_role not in ('sleeping_area', 'bathroom', 'kitchen', 'dining_common') then
    raise exception using
      errcode = '22023',
      message = 'invalid_housing_photo_role';
  end if;
  if p_url is null or nullif(btrim(p_url), '') is null then
    raise exception using
      errcode = '22023',
      message = 'housing_photo_url_required';
  end if;

  select hp.id, coalesce(hp.benefit_library, '{}'::jsonb)
    into v_host_profile_id, v_current
    from public.host_profiles hp
   where hp.id in (select public.current_host_profile_ids())
   order by hp.created_at
   limit 1
   for update;

  if not found then
    return;
  end if;

  v_next := jsonb_set(
    v_current,
    '{housing}',
    coalesce(v_current->'housing', '{}'::jsonb) || jsonb_build_object(
      'photos',
      coalesce(v_current #> '{housing,photos}', '{}'::jsonb) ||
        jsonb_build_object(p_role, btrim(p_url))
    ),
    true
  );
  update public.host_profiles
     set benefit_library = v_next
   where id = v_host_profile_id;

  return query
    select v_host_profile_id,
           v_current #>> array['housing', 'photos', p_role],
           v_next;
end;
$$;

-- Public benefit detail is eligibility-aware and never returns raw stored
-- housing overrides. Sourced/revoked rows and excluded benefits collapse to {}.
create or replace function public.get_public_benefit_details(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select coalesce(l.benefit_details, '{}'::jsonb) as benefit_details,
           l.housing_included,
           l.meals_included,
           l.housing_evidence,
           l.meals_evidence
      from public.listings l
     where l.id = p_listing_id
       and l.status = 'live'
       and l.provenance = 'verified'
  ),
  housing as (
    select coalesce(jsonb_object_agg(p.role, p.url), '{}'::jsonb) as photos
      from public.get_public_housing_photos(p_listing_id) p
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'housing', case
      when e.housing_included = true and e.housing_evidence = 'confirmed'
      then coalesce(e.benefit_details->'housing', '{}'::jsonb) ||
           jsonb_build_object('photos', h.photos)
      else null
    end,
    'meals', case
      when e.meals_included = true
       and e.meals_evidence = 'confirmed'
       and e.benefit_details ? 'meals'
      then e.benefit_details->'meals'
      else null
    end
  ))
    from eligible e
    cross join housing h
$$;

revoke all on function public.get_public_housing_photos(uuid) from public;
grant execute on function public.get_public_housing_photos(uuid) to anon, authenticated, service_role;
revoke all on function public.get_public_benefit_details(uuid) from public;
grant execute on function public.get_public_benefit_details(uuid) to anon, authenticated, service_role;
revoke all on function public.get_owned_benefit_context(uuid) from public;
grant execute on function public.get_owned_benefit_context(uuid) to authenticated, service_role;
revoke all on function public.get_my_host_benefit_library() from public;
grant execute on function public.get_my_host_benefit_library() to authenticated, service_role;
revoke all on function public.save_owned_benefit_detail(uuid, text, jsonb) from public;
grant execute on function public.save_owned_benefit_detail(uuid, text, jsonb) to authenticated, service_role;
revoke all on function public.set_my_housing_library_photo(text, text) from public;
grant execute on function public.set_my_housing_library_photo(text, text) to authenticated, service_role;

revoke execute on function private.stored_housing_photo_object_name(text) from public, anon, authenticated;
revoke execute on function private.housing_photo_metadata_is_valid(jsonb) from public, anon, authenticated;
revoke execute on function private.housing_photo_object_name(text) from public, anon, authenticated;
revoke execute on function private.housing_photo_url_is_valid(text, text) from public, anon, authenticated;
revoke execute on function private.missing_housing_photo_roles(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function private.preserve_claim_benefit_details() from public, anon, authenticated;
revoke execute on function private.enforce_listing_housing_photos() from public, anon, authenticated;
revoke execute on function private.protect_host_housing_photo_library() from public, anon, authenticated;
revoke execute on function private.protect_referenced_housing_photo_object() from public, anon, authenticated;

commit;
