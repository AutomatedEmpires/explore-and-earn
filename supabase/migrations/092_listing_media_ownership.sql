-- Database-authoritative ownership for listings.cover_photo_url and
-- listings.gallery_photo_urls.
--
-- Application validation keeps the canonical host editor honest, but an
-- authenticated caller can also write the granted listing columns through the
-- Supabase Data API. This trigger is the authoritative boundary: any new media
-- reference must resolve to an existing object in the public listing-media
-- bucket below the listing host's UUID prefix.
--
-- REVIEW-ONLY. Apply only through the protected db-migrate workflow after the
-- compatible application release is live.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

create schema if not exists private;
revoke all on schema private from public;

lock table public.listing_claims in share row exclusive mode;
lock table public.listings in share row exclusive mode;

-- Claim conversion is an authorship boundary. A converted listing may keep
-- source cover/gallery media until the host deliberately replaces it, but a
-- later claim revocation must restore the exact source values rather than keep
-- media authored by the removed host. This mirrors migration 072's private
-- benefit-details snapshot without changing the canonical claim RPCs.
create or replace function private.preserve_listing_media_truth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshotted integer;
  v_snapshot jsonb := '{}'::jsonb;
  v_restored_gallery text[] := '{}'::text[];
begin
  if old.provenance = 'sourced'
     and new.provenance = 'verified'
     and new.host_profile_id is not null then
    update public.listing_claims lc
       set pre_conversion_snapshot =
         coalesce(lc.pre_conversion_snapshot, '{}'::jsonb) ||
         jsonb_build_object(
           'cover_photo_url', old.cover_photo_url,
           'gallery_photo_urls',
             to_jsonb(coalesce(old.gallery_photo_urls, '{}'::text[]))
         )
     where lc.id = (
       select candidate.id
         from public.listing_claims candidate
        where candidate.listing_id = old.id
          and candidate.host_profile_id = new.host_profile_id
          and candidate.status = 'confirming'
        order by candidate.updated_at desc,
                 candidate.created_at desc,
                 candidate.id desc
        limit 1
     );

    get diagnostics v_snapshotted = row_count;
    if v_snapshotted <> 1 then
      raise exception using
        errcode = '23514',
        message = 'claim_media_snapshot_missing';
    end if;
  elsif old.provenance = 'verified'
        and new.provenance = 'sourced'
        and new.host_profile_id is null then
    select coalesce(lc.pre_conversion_snapshot, '{}'::jsonb)
      into v_snapshot
      from public.listing_claims lc
     where lc.listing_id = old.id
       and lc.host_profile_id = old.host_profile_id
       and lc.status = 'revoked'
     order by lc.decided_at desc nulls last,
              lc.updated_at desc,
              lc.created_at desc,
              lc.id desc
     limit 1;

    v_snapshot := coalesce(v_snapshot, '{}'::jsonb);

    if v_snapshot ? 'cover_photo_url'
       and jsonb_typeof(v_snapshot->'cover_photo_url') in ('string', 'null') then
      new.cover_photo_url := v_snapshot->>'cover_photo_url';
    else
      new.cover_photo_url := null;
    end if;

    if jsonb_typeof(v_snapshot->'gallery_photo_urls') = 'array' then
      if exists (
        select 1
          from jsonb_array_elements(
            v_snapshot->'gallery_photo_urls'
          ) as item(value)
         where jsonb_typeof(item.value) <> 'string'
      ) then
        new.gallery_photo_urls := '{}'::text[];
      else
        select coalesce(
                 array_agg(item.value order by item.ordinality),
                 '{}'::text[]
               )
          into v_restored_gallery
          from jsonb_array_elements_text(
            v_snapshot->'gallery_photo_urls'
          ) with ordinality as item(value, ordinality);
        new.gallery_photo_urls := v_restored_gallery;
      end if;
    else
      -- Legacy converted claims have no media snapshot. Never leave a revoked
      -- source row carrying media authored by the removed host.
      new.gallery_photo_urls := '{}'::text[];
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.preserve_listing_media_truth()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_listings_claim_media_ownership on public.listings;
create trigger trg_listings_claim_media_ownership
  before update of provenance, host_profile_id
  on public.listings
  for each row
  execute function private.preserve_listing_media_truth();

-- Validate effective media on every authenticated INSERT/UPDATE. Running on
-- every UPDATE is intentional: an ordinary legacy row with unowned persisted
-- media fails closed on its next edit, even when that edit targets another
-- column. Service-role sourcing, moderation, expiry, and claim workflows do
-- not carry an authenticated JWT and remain unaffected.
create or replace function private.enforce_listing_media_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_is_authenticated_request boolean :=
    current_user = 'authenticated'
    or coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
  v_headers jsonb := '{}'::jsonb;
  v_request_host text;
  v_request_hostname text;
  v_expected_host text;
  v_is_local_origin boolean := false;
  v_validate_cover boolean := true;
  v_validate_gallery boolean := true;
  v_urls text[] := '{}'::text[];
  v_fields text[] := '{}'::text[];
  v_url text;
  v_url_scheme text;
  v_url_host text;
  v_object_name text;
  v_marker constant text :=
    '/storage/v1/object/public/listing-media/';
  v_index integer;
begin
  if not v_is_authenticated_request then
    return new;
  end if;

  -- A converted listing may inherit source URLs. A canonical full-form save
  -- resubmits those exact strings; unchanged media is not a new host claim.
  -- Any changed field must be cleared or replaced entirely with owned media.
  if tg_op = 'UPDATE' and new.claim_summary = 'converted' then
    v_validate_cover :=
      new.cover_photo_url is distinct from old.cover_photo_url;
    v_validate_gallery :=
      new.gallery_photo_urls is distinct from old.gallery_photo_urls;
  end if;

  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_request_host := lower(
    btrim(split_part(coalesce(v_headers->>'host', ''), ',', 1))
  );

  if v_request_host = '' then
    -- Protected migration jobs and direct trusted SQL have no HTTP headers.
    v_expected_host := 'mamosbzcbigcclafhmmr.supabase.co';
  else
    if left(v_request_host, 1) = '['
       and strpos(v_request_host, ']') > 0 then
      v_request_hostname :=
        split_part(split_part(v_request_host, ']', 1), '[', 2);
    else
      v_request_hostname := split_part(v_request_host, ':', 1);
    end if;

    v_is_local_origin :=
      v_request_hostname in ('127.0.0.1', 'localhost', '::1')
      or v_request_hostname like '%.localhost';

    -- Local Supabase must match the exact request host and port. Any non-local
    -- request remains pinned to the one production project even if a proxy or
    -- caller supplies an unexpected Host header.
    v_expected_host := case
      when v_is_local_origin then v_request_host
      else 'mamosbzcbigcclafhmmr.supabase.co'
    end;
  end if;

  if v_validate_cover and new.cover_photo_url is not null then
    v_urls := array_append(v_urls, new.cover_photo_url);
    v_fields := array_append(v_fields, 'cover_photo_url');
  end if;

  if v_validate_gallery then
    foreach v_url in array coalesce(new.gallery_photo_urls, '{}'::text[])
    loop
      v_urls := array_append(v_urls, v_url);
      v_fields := array_append(v_fields, 'gallery_photo_urls');
    end loop;
  end if;

  if coalesce(array_length(v_urls, 1), 0) > 0 then
    for v_index in 1..array_length(v_urls, 1)
    loop
      v_url := v_urls[v_index];

      if v_url is null
         or v_url = ''
         or v_url is distinct from btrim(v_url)
         or v_url !~
           '^https?://[^/?#]+/storage/v1/object/public/listing-media/[^?#]+$' then
        raise exception using
          errcode = '23514',
          message = 'listing_media_reference_not_owned',
          detail = v_fields[v_index];
      end if;

      v_url_scheme := lower(split_part(v_url, '://', 1));
      v_url_host :=
        lower(split_part(split_part(v_url, '://', 2), '/', 1));
      v_object_name := substr(
        v_url,
        strpos(v_url, v_marker) + char_length(v_marker)
      );

      if v_url_host is distinct from v_expected_host
         or v_url_scheme not in ('http', 'https')
         or (not v_is_local_origin and v_url_scheme <> 'https')
         or new.host_profile_id is null
         or left(
              v_object_name,
              char_length(new.host_profile_id::text) + 1
            ) is distinct from new.host_profile_id::text || '/'
         or char_length(v_object_name) <=
              char_length(new.host_profile_id::text) + 1
         or right(v_object_name, 1) = '/'
         or v_object_name like '%//%'
         or v_object_name ~ '(^|/)[.]{1,2}(/|$)'
         or v_object_name ~ '[[:space:]]'
         or position('%' in v_object_name) > 0
         or position(E'\\' in v_object_name) > 0
         or not exists (
           select 1
             from storage.objects o
            where o.bucket_id = 'listing-media'
              and o.name = v_object_name
         ) then
        raise exception using
          errcode = '23514',
          message = 'listing_media_reference_not_owned',
          detail = v_fields[v_index];
      end if;
    end loop;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_listing_media_ownership()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_listings_media_ownership on public.listings;
create trigger trg_listings_media_ownership
  before insert or update
  on public.listings
  for each row
  execute function private.enforce_listing_media_ownership();

comment on function private.enforce_listing_media_ownership() is
  'Authenticated listing writes may persist cover/gallery URLs only from the exact Explore & Earn listing-media origin and owning host UUID prefix. Ordinary legacy rows fail closed on every edit; converted source media is grandfathered only while byte-identical.';

commit;
