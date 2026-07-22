\set ON_ERROR_STOP on

begin;

do $$
declare
  v_host_id uuid := gen_random_uuid();
  v_source_id uuid := gen_random_uuid();
  v_claim_id uuid := gen_random_uuid();
  v_listing_id uuid;
  v_claim_listing_id uuid;
  v_result jsonb;
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.listings'::regclass
       and conname = 'listings_coordinates_pair_check'
       and contype = 'c'
       and convalidated
  ) then
    raise exception 'listing-coordinates: complete-pair CHECK is missing or unvalidated';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.listings'::regclass
       and conname = 'listings_coordinates_bounds_check'
       and contype = 'c'
       and convalidated
  ) then
    raise exception 'listing-coordinates: bounds CHECK is missing or unvalidated';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.listings'::regclass
       and conname = 'listings_coordinates_location_check'
       and contype = 'c'
       and convalidated
  ) then
    raise exception 'listing-coordinates: location CHECK is missing or unvalidated';
  end if;

  if not has_column_privilege(
       'authenticated',
       'public.listings',
       'latitude',
       'UPDATE'
     )
     or not has_column_privilege(
       'authenticated',
       'public.listings',
       'longitude',
       'UPDATE'
     ) then
    raise exception 'listing-coordinates: authenticated host cannot update the point pair';
  end if;

  insert into public.host_profiles (
    id,
    clerk_user_id,
    company_name,
    slug,
    category_scopes
  ) values (
    v_host_id,
    'user_coordinate_assert_' || replace(v_host_id::text, '-', ''),
    'Coordinate assertion host',
    'coordinate-assert-' || replace(v_host_id::text, '-', ''),
    array['farm']::text[]
  );

  -- Both NULL and valid edge coordinates are accepted.
  insert into public.listings (host_profile_id, title, category)
  values (v_host_id, 'No map pin', 'farm');

  insert into public.listings (
    host_profile_id,
    title,
    category,
    location_display,
    latitude,
    longitude
  ) values (
    v_host_id,
    'Valid map pin',
    'farm',
    'Coordinate boundary',
    90,
    180
  ) returning id into v_listing_id;

  begin
    insert into public.listings (
      host_profile_id,
      title,
      category,
      latitude
    ) values (v_host_id, 'Partial map pin', 'farm', 45);
    raise exception 'listing-coordinates: partial pair unexpectedly inserted';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.listings (
      host_profile_id,
      title,
      category,
      latitude,
      longitude
    ) values (v_host_id, 'Point without location', 'farm', 47, -120);
    raise exception 'listing-coordinates: point without a location unexpectedly inserted';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.listings (
      host_profile_id,
      title,
      category,
      latitude,
      longitude
    ) values (v_host_id, 'Invalid latitude', 'farm', 90.0001, 0);
    raise exception 'listing-coordinates: invalid latitude unexpectedly inserted';
  exception when check_violation then
    null;
  end;

  begin
    update public.listings
       set latitude = 0,
           longitude = -180.0001
     where id = v_listing_id;
    raise exception 'listing-coordinates: invalid longitude unexpectedly updated';
  exception when check_violation then
    null;
  end;

  insert into public.listing_sources (
    id,
    name,
    kind,
    compliance_status
  ) values (
    v_source_id,
    'Coordinate assertion source ' || v_source_id::text,
    'json',
    'approved'
  );

  insert into public.listings (
    title,
    category,
    provenance,
    source_id,
    source_name,
    source_status,
    claim_summary,
    location_display,
    latitude,
    longitude
  ) values (
    'Claim coordinate assertion',
    'farm',
    'sourced',
    v_source_id,
    'Coordinate assertion source',
    'active',
    'unclaimed',
    'Source location',
    47.4235,
    -120.3103
  ) returning id into v_claim_listing_id;

  insert into public.listing_claims (
    id,
    listing_id,
    claimant_clerk_user_id,
    host_profile_id,
    status
  ) values (
    v_claim_id,
    v_claim_listing_id,
    'user_coordinate_assert_' || replace(v_host_id::text, '-', ''),
    v_host_id,
    'confirming'
  );

  select public.convert_claimed_listing(
    v_claim_id,
    'user_coordinate_assert_' || replace(v_host_id::text, '-', ''),
    v_host_id,
    '{"locationDisplay":"Host-confirmed location"}'::jsonb
  ) into v_result;

  if not coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'listing-coordinates: claim conversion failed: %', v_result;
  end if;
  if not exists (
    select 1
      from public.listings
     where id = v_claim_listing_id
       and location_display = 'Host-confirmed location'
       and latitude is null
       and longitude is null
  ) then
    raise exception 'listing-coordinates: changed claim label retained a stale source pin';
  end if;
  if not exists (
    select 1
      from public.listing_claims
     where id = v_claim_id
       and (pre_conversion_snapshot->>'latitude')::double precision = 47.4235
       and (pre_conversion_snapshot->>'longitude')::double precision = -120.3103
  ) then
    raise exception 'listing-coordinates: claim conversion did not snapshot source coordinates';
  end if;

  select public.transition_listing_claim(
    v_claim_id,
    'revoked',
    'admin_coordinate_assert',
    'coordinate restoration assertion'
  ) into v_result;

  if not coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'listing-coordinates: claim revocation failed: %', v_result;
  end if;
  if not exists (
    select 1
      from public.listings
     where id = v_claim_listing_id
       and provenance = 'sourced'
       and host_profile_id is null
       and location_display = 'Source location'
       and latitude = 47.4235
       and longitude = -120.3103
  ) then
    raise exception 'listing-coordinates: claim revocation did not restore source location';
  end if;
end;
$$;

rollback;
