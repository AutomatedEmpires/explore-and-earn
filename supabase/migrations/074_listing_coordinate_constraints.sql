-- Host-selected map points are persisted and directly writable by the owning
-- authenticated host. Keep the storage invariant below the application: a
-- point is either absent, or is a complete latitude/longitude pair inside the
-- valid WGS84 bounds with a display label. Location changes clear stale pins;
-- claim conversion snapshots source pins and revocation restores them.
-- Existing invalid data makes validation fail closed.

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.listings'::regclass
       and conname = 'listings_coordinates_pair_check'
  ) then
    alter table public.listings
      add constraint listings_coordinates_pair_check
      check (
        (latitude is null and longitude is null)
        or (latitude is not null and longitude is not null)
      ) not valid;
  end if;
end
$$;

alter table public.listings
  validate constraint listings_coordinates_pair_check;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.listings'::regclass
       and conname = 'listings_coordinates_bounds_check'
  ) then
    alter table public.listings
      add constraint listings_coordinates_bounds_check
      check (
        (latitude is null and longitude is null)
        or (
          latitude between -90 and 90
          and longitude between -180 and 180
        )
      ) not valid;
  end if;
end
$$;

alter table public.listings
  validate constraint listings_coordinates_bounds_check;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.listings'::regclass
       and conname = 'listings_coordinates_location_check'
  ) then
    alter table public.listings
      add constraint listings_coordinates_location_check
      check (
        latitude is null
        or nullif(btrim(location_display), '') is not null
      ) not valid;
  end if;
end
$$;

alter table public.listings
  validate constraint listings_coordinates_location_check;

-- A display label and its point are one fact. Clear an unchanged point when a
-- caller changes only the label, including the sourced-to-verified claim RPC.
-- Claim conversion must also preserve the source point privately so a later
-- revocation restores the exact sourced location rather than prior-host data.
create or replace function private.preserve_listing_coordinate_truth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshotted integer;
  v_snapshot jsonb;
begin
  if old.provenance = 'sourced'
     and new.provenance = 'verified'
     and new.host_profile_id is not null then
    update public.listing_claims lc
       set pre_conversion_snapshot =
         coalesce(lc.pre_conversion_snapshot, '{}'::jsonb) ||
         jsonb_build_object(
           'latitude', old.latitude,
           'longitude', old.longitude
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
        message = 'claim_coordinate_snapshot_missing';
    end if;
  elsif old.provenance = 'verified'
        and new.provenance = 'sourced'
        and new.host_profile_id is null then
    select lc.pre_conversion_snapshot
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

    -- Legacy claims have no coordinate snapshot. Null is the safe fallback:
    -- never retain a prior host's pin on a row that became sourced again.
    new.latitude := (v_snapshot->>'latitude')::double precision;
    new.longitude := (v_snapshot->>'longitude')::double precision;
  end if;

  if new.location_display is distinct from old.location_display
     and new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    new.latitude := null;
    new.longitude := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_listings_claim_coordinate_ownership on public.listings;
create trigger trg_listings_claim_coordinate_ownership
  before update of provenance, host_profile_id, location_display, latitude, longitude
  on public.listings
  for each row execute function private.preserve_listing_coordinate_truth();

-- 071 grants latitude/longitude on INSERT for create/duplicate, but its UPDATE
-- allow-list predates native host geocoding. Owners may now move/remove their
-- own listing pin; RLS still scopes rows and the CHECKs constrain the values.
grant update (latitude, longitude)
  on public.listings
  to authenticated;
