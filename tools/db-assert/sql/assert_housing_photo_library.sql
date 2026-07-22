\set ON_ERROR_STOP on

begin;

set local request.headers = '{"host":"127.0.0.1:54321"}';

create function pg_temp.housing_url(p_name text)
returns text language sql immutable
as $$
  select 'http://127.0.0.1:54321/storage/v1/object/public/listing-media/' || p_name
$$;

create function pg_temp.image_metadata(
  p_mimetype text default 'image/webp',
  p_size bigint default 4096
)
returns jsonb language sql immutable
as $$
  select jsonb_build_object('mimetype', p_mimetype, 'size', p_size)
$$;

do $$
begin
  if private.housing_photo_object_name(
    'http://127.0.0.1:54321/storage/v1/object/public/listing-media/example/path.jpg'
  ) <> 'example/path.jpg' then
    raise exception 'local housing URL did not match the local request origin';
  end if;
  if private.housing_photo_object_name(
    'https://mamosbzcbigcclafhmmr.supabase.co/storage/v1/object/public/listing-media/example/path.jpg'
  ) is not null then
    raise exception 'cross-origin housing URL passed the request-origin invariant';
  end if;
end;
$$;

create function pg_temp.housing_library(p_host uuid)
returns jsonb language sql immutable
as $$
  select jsonb_build_object(
    'housing', jsonb_build_object(
      'photos', jsonb_build_object(
        'sleeping_area', pg_temp.housing_url(p_host || '/library/housing/sleeping_area/default.jpg'),
        'bathroom', pg_temp.housing_url(p_host || '/library/housing/bathroom/default.jpg'),
        'kitchen', pg_temp.housing_url(p_host || '/library/housing/kitchen/default.jpg'),
        'dining_common', pg_temp.housing_url(p_host || '/library/housing/dining_common/default.jpg')
      )
    )
  )
$$;

create function pg_temp.sourced_benefit_details()
returns jsonb language sql immutable
as $$
  select jsonb_build_object(
    'housing', jsonb_build_object(
      'fields', jsonb_build_object(
        'arrangement', 'source-shared cabin',
        'notes', 'source housing detail'
      ),
      'photos', jsonb_build_object(
        'sleeping_area', 'https://example.test/source-private-housing.jpg'
      )
    ),
    'meals', jsonb_build_object(
      'fields', jsonb_build_object(
        'format', 'source-provided board',
        'notes', 'source meals detail'
      )
    )
  )
$$;

insert into auth.users (id, email, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'housing-owner-1@example.test', now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'housing-owner-2@example.test', now(), now());

insert into public.host_profiles (
  id, owner_user_id, clerk_user_id, company_name, slug, category_scopes,
  public_status
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'user_housing_owner_1',
    'Housing Host One',
    'housing-host-one',
    array['farm'],
    'active'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '20000000-0000-0000-0000-000000000002',
    'user_housing_owner_2',
    'Housing Host Two',
    'housing-host-two',
    array['seasonal'],
    'active'
  );

insert into storage.objects (bucket_id, name, metadata)
select 'listing-media',
       '11111111-1111-1111-1111-111111111111/library/housing/' || role || '/default.jpg',
       pg_temp.image_metadata()
from unnest(array['sleeping_area', 'bathroom', 'kitchen', 'dining_common']) role;

insert into storage.objects (bucket_id, name, metadata)
select 'listing-media',
       '22222222-2222-2222-2222-222222222222/library/housing/' || role || '/default.jpg',
       pg_temp.image_metadata()
from unnest(array['sleeping_area', 'bathroom', 'kitchen']) role;

do $$
begin
  if not private.housing_photo_metadata_is_valid(
    pg_temp.image_metadata('image/webp', 5242880)
  ) then
    raise exception 'exact 5 MiB image metadata was rejected';
  end if;
  if private.housing_photo_metadata_is_valid(null)
     or private.housing_photo_metadata_is_valid(pg_temp.image_metadata('text/plain', 4096))
     or private.housing_photo_metadata_is_valid(pg_temp.image_metadata('image/webp', 0))
     or private.housing_photo_metadata_is_valid(pg_temp.image_metadata('image/webp', 5242881))
     or private.housing_photo_metadata_is_valid(
       jsonb_build_object('mimetype', 'image/webp', 'size', 'not-a-number')
     ) then
    raise exception 'invalid Storage metadata passed the housing-photo validator';
  end if;
end;
$$;

-- A reusable draft reference is rejected even before any listing publishes.
insert into storage.objects (bucket_id, name, metadata)
values (
  'listing-media',
  '22222222-2222-2222-2222-222222222222/library/housing/dining_common/invalid.webp',
  pg_temp.image_metadata('text/plain', 4096)
);
do $$
begin
  begin
    update public.host_profiles
       set benefit_library = jsonb_build_object(
         'housing', jsonb_build_object(
           'photos', jsonb_build_object(
             'dining_common', pg_temp.housing_url(
               '22222222-2222-2222-2222-222222222222/library/housing/dining_common/invalid.webp'
             )
           )
         )
       )
     where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'expected invalid reusable housing reference to fail';
  exception when check_violation then
    if sqlerrm <> 'housing_photo_reference_invalid: dining_common' then
      raise exception 'unexpected invalid library error: %', sqlerrm;
    end if;
  end;
end;
$$;
set local storage.allow_delete_query = 'true';
delete from storage.objects
 where bucket_id = 'listing-media'
   and name = '22222222-2222-2222-2222-222222222222/library/housing/dining_common/invalid.webp';

update public.host_profiles
set benefit_library = pg_temp.housing_library(id)
where id = '11111111-1111-1111-1111-111111111111';

update public.host_profiles
set benefit_library = pg_temp.housing_library(id) #- '{housing,photos,dining_common}'
where id = '22222222-2222-2222-2222-222222222222';

-- An owner can update the new column through its narrow grant and owner RLS.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_housing_owner_1","role":"authenticated"}';
do $$
declare v_rows integer;
begin
  update public.host_profiles
     set benefit_library = pg_temp.housing_library(id)
   where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'housing library owner update was not authorized';
  end if;
  if public.get_my_host_benefit_library() is distinct from pg_temp.housing_library(
       '11111111-1111-1111-1111-111111111111'
     ) then
    raise exception 'owner library RPC did not return the caller library';
  end if;
end;
$$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'listing-media',
      '11111111-1111-1111-1111-111111111111/library/housing/kitchen/direct-upload.webp',
      pg_temp.image_metadata()
    );
    raise exception 'expected direct authenticated housing upload to fail';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'listing-media',
      '11111111-1111-1111-1111-111111111111/benefit/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/housing/kitchen/direct-upload.webp',
      pg_temp.image_metadata()
    );
    raise exception 'expected direct authenticated listing Housing upload to fail';
  exception when insufficient_privilege then
    null;
  end;

  -- Non-Housing listing media retains the historical owner-scoped path.
  insert into storage.objects (bucket_id, name, metadata)
  values (
    'listing-media',
    '11111111-1111-1111-1111-111111111111/cover-security-test.webp',
    pg_temp.image_metadata()
  );

  begin
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'listing-media',
      '22222222-2222-2222-2222-222222222222/cover-security-test.webp',
      pg_temp.image_metadata()
    );
    raise exception 'expected cross-host storage upload to fail';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;
set local request.jwt.claims = '{"sub":"service_role","role":"service_role"}';

insert into public.listings (
  id, host_profile_id, title, category, status,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence,
  compensation_min_cents, compensation_unit
)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Inherited housing evidence',
  'farm',
  'draft',
  true,
  false,
  'confirmed',
  'confirmed',
  'confirmed',
  2000,
  'hour'
);

-- A malformed object cannot become a persisted listing override, even while
-- the listing is still a private draft.
insert into storage.objects (bucket_id, name, metadata)
values (
  'listing-media',
  '11111111-1111-1111-1111-111111111111/benefit/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/housing/kitchen/oversize.webp',
  pg_temp.image_metadata('image/webp', 5242881)
);
do $$
begin
  begin
    update public.listings
       set benefit_details = jsonb_build_object(
         'housing', jsonb_build_object(
           'photos', jsonb_build_object(
             'kitchen', pg_temp.housing_url(
               '11111111-1111-1111-1111-111111111111/benefit/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/housing/kitchen/oversize.webp'
             )
           )
         )
       )
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    raise exception 'expected invalid draft listing reference to fail';
  exception when check_violation then
    if sqlerrm <> 'housing_photo_reference_invalid: kitchen' then
      raise exception 'unexpected invalid draft listing error: %', sqlerrm;
    end if;
  end;

  if (select benefit_details from public.listings
       where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> '{}'::jsonb then
    raise exception 'rejected draft reference left partial listing state';
  end if;
end;
$$;
delete from storage.objects
 where bucket_id = 'listing-media'
   and name = '11111111-1111-1111-1111-111111111111/benefit/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/housing/kitchen/oversize.webp';

-- Four inherited objects satisfy review and live publication.
update public.listings set status = 'under_review'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.listings set status = 'live'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- A live listing can override one role and remove the override when the
-- profile default remains complete.
insert into storage.objects (bucket_id, name, metadata)
values (
  'listing-media',
  '11111111-1111-1111-1111-111111111111/benefit/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/housing/kitchen/override.jpg',
  pg_temp.image_metadata()
);
update public.listings
set benefit_details = jsonb_build_object(
  'housing', jsonb_build_object(
    'photos', jsonb_build_object(
      'kitchen', pg_temp.housing_url(
        '11111111-1111-1111-1111-111111111111/benefit/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/housing/kitchen/override.jpg'
      )
    )
  )
)
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$
begin
  if (select count(*) from public.get_public_housing_photos(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      )) <> 4 then
    raise exception 'public housing RPC did not return the complete mixed set';
  end if;
  if (select source from public.get_public_housing_photos(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      ) where role = 'kitchen') <> 'listing' then
    raise exception 'public housing RPC did not prefer the listing override';
  end if;
  if exists (
    select 1 from public.get_public_housing_photos(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    ) where role <> 'kitchen' and source <> 'profile'
  ) then
    raise exception 'public housing RPC mislabeled inherited mixed-set roles';
  end if;
end;
$$;
update public.listings set benefit_details = '{}'::jsonb
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $$
begin
  if (select count(*) from public.get_public_housing_photos(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      )) <> 4 then
    raise exception 'public housing RPC did not return four fallback photos';
  end if;
  if exists (
    select 1 from public.get_public_housing_photos(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    ) where source <> 'profile'
  ) then
    raise exception 'override removal did not fall back to profile sources';
  end if;
end;
$$;

-- Even if legacy data somehow contains a present-but-invalid override, the
-- public resolver fails the entire set closed instead of falling back and
-- disguising the bad listing-specific claim.
alter table public.listings disable trigger trg_listings_housing_photos;
update public.listings
set benefit_details = jsonb_build_object(
  'housing', jsonb_build_object(
    'photos', jsonb_build_object(
      'kitchen', pg_temp.housing_url(
        '11111111-1111-1111-1111-111111111111/benefit/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/housing/kitchen/missing-object.jpg'
      )
    )
  )
)
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
alter table public.listings enable trigger trg_listings_housing_photos;
do $$
begin
  if exists (
    select 1 from public.get_public_housing_photos(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    )
  ) then
    raise exception 'invalid listing override fell back to profile evidence';
  end if;
end;
$$;
update public.listings set benefit_details = '{}'::jsonb
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.listings (
  id, host_profile_id, title, category, status,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence,
  compensation_min_cents, compensation_unit
)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'Incomplete draft housing evidence',
  'maritime',
  'draft',
  true,
  false,
  'confirmed',
  'confirmed',
  'confirmed',
  22000,
  'day'
);

-- Incomplete drafts are valid; publishing rejects and the failed statement
-- leaves the listing in draft.
do $$
begin
  begin
    update public.listings set status = 'under_review'
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    raise exception 'expected incomplete housing publication to fail';
  exception when check_violation then
    if sqlerrm not like '%dining_common%' then
      raise exception 'missing-role error omitted dining_common: %', sqlerrm;
    end if;
  end;

  if (select status from public.listings where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') <> 'draft' then
    raise exception 'rejected publication left partial status state';
  end if;
end;
$$;

-- A listing-specific role completes a mixed inherited/override set.
insert into storage.objects (bucket_id, name, metadata)
values (
  'listing-media',
  '22222222-2222-2222-2222-222222222222/benefit/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/housing/dining_common/override.jpg',
  pg_temp.image_metadata()
);
update public.listings
set benefit_details = jsonb_build_object(
  'housing', jsonb_build_object(
    'photos', jsonb_build_object(
      'dining_common', pg_temp.housing_url(
        '22222222-2222-2222-2222-222222222222/benefit/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/housing/dining_common/override.jpg'
      )
    )
  )
)
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
update public.listings set status = 'under_review'
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Removing the only evidence for a published role is atomic and rejected.
do $$
begin
  begin
    update public.listings set benefit_details = '{}'::jsonb
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    raise exception 'expected override removal to fail';
  exception when check_violation then
    if sqlerrm not like '%dining_common%' then
      raise exception 'override-removal error omitted dining_common: %', sqlerrm;
    end if;
  end;

  if not (select benefit_details #> '{housing,photos}' ? 'dining_common'
            from public.listings where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'rejected override removal left partial state';
  end if;
end;
$$;

-- Housing explicitly not included has no photo requirement.
insert into public.listings (
  id, host_profile_id, title, category, status,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence,
  compensation_min_cents, compensation_unit
)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '22222222-2222-2222-2222-222222222222',
  'No housing included',
  'remote',
  'under_review',
  false,
  false,
  'confirmed',
  'confirmed',
  'confirmed',
  2500,
  'hour'
);
update public.listings set status = 'live'
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
insert into storage.objects (bucket_id, name, metadata)
values (
  'listing-media',
  '22222222-2222-2222-2222-222222222222/benefit/cccccccc-cccc-cccc-cccc-cccccccccccc/housing/sleeping_area/stale.webp',
  pg_temp.image_metadata()
);
update public.listings
set benefit_details = jsonb_build_object(
  'housing', jsonb_build_object(
    'fields', jsonb_build_object('arrangement', 'stale private detail'),
    'photos', jsonb_build_object('sleeping_area', pg_temp.housing_url(
      '22222222-2222-2222-2222-222222222222/benefit/cccccccc-cccc-cccc-cccc-cccccccccccc/housing/sleeping_area/stale.webp'
    ))
  )
)
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Sourced inventory keeps its existing publication exemption.
insert into public.listing_sources (id, name, kind, compliance_status)
values ('33333333-3333-3333-3333-333333333333', 'Housing Test Source', 'json', 'approved');
insert into public.listings (
  id, title, category, status, provenance, source_id, source_name, source_url,
  source_external_id, source_status, claim_summary,
  housing_included, housing_evidence, meals_evidence, pay_evidence
)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Sourced listing without housing photos',
  'seasonal',
  'live',
  'sourced',
  '33333333-3333-3333-3333-333333333333',
  'Housing Test Source',
  'https://example.test/sourced-housing',
  'sourced-housing-1',
  'active',
  'unclaimed',
  true,
  'stated',
  'not_stated',
  'not_stated'
);
update public.listings
set benefit_details = pg_temp.sourced_benefit_details()
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

-- Claim ownership is also benefit-detail authorship. Conversion snapshots and
-- clears the source map before Housing validation; revocation restores it; a
-- different host can then claim with only their own complete reusable library.
insert into public.listing_claims (
  id, listing_id, claimant_clerk_user_id, host_profile_id, status
)
values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'user_housing_owner_1',
  '11111111-1111-1111-1111-111111111111',
  'confirming'
);

do $$
declare v_result jsonb;
begin
  select public.convert_claimed_listing(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'user_housing_owner_1',
    '11111111-1111-1111-1111-111111111111',
    '{"housingIncluded":true,"mealsIncluded":false,"compensationMinCents":2500}'::jsonb
  ) into v_result;

  if not coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'host A claim conversion failed: %', v_result;
  end if;
  if (select benefit_details from public.listings
       where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') <> '{}'::jsonb then
    raise exception 'source benefit details survived host A conversion';
  end if;
  if (select pre_conversion_snapshot->'benefit_details'
        from public.listing_claims
       where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
       is distinct from pg_temp.sourced_benefit_details() then
    raise exception 'host A claim did not snapshot the exact source benefit map';
  end if;
end;
$$;

insert into storage.objects (bucket_id, name, metadata)
values (
  'listing-media',
  '11111111-1111-1111-1111-111111111111/benefit/dddddddd-dddd-dddd-dddd-dddddddddddd/housing/kitchen/host-a.webp',
  pg_temp.image_metadata()
);
update public.listings
set benefit_details = jsonb_build_object(
  'housing', jsonb_build_object(
    'fields', jsonb_build_object('arrangement', 'host A private housing detail'),
    'photos', jsonb_build_object(
      'kitchen', pg_temp.housing_url(
        '11111111-1111-1111-1111-111111111111/benefit/dddddddd-dddd-dddd-dddd-dddddddddddd/housing/kitchen/host-a.webp'
      )
    )
  ),
  'meals', jsonb_build_object(
    'fields', jsonb_build_object('format', 'host A private meals detail')
  )
)
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

do $$
declare v_result jsonb;
begin
  select public.transition_listing_claim(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'revoked',
    'admin_housing_test',
    'ownership transfer assertion'
  ) into v_result;

  if not coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'host A claim revocation failed: %', v_result;
  end if;
  if (select benefit_details from public.listings
       where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')
       is distinct from pg_temp.sourced_benefit_details() then
    raise exception 'revocation did not restore the exact sourced benefit map';
  end if;
end;
$$;

insert into storage.objects (bucket_id, name, metadata)
values (
  'listing-media',
  '22222222-2222-2222-2222-222222222222/library/housing/dining_common/default.jpg',
  pg_temp.image_metadata()
);
update public.host_profiles
set benefit_library = pg_temp.housing_library(id)
where id = '22222222-2222-2222-2222-222222222222';

insert into public.listing_claims (
  id, listing_id, claimant_clerk_user_id, host_profile_id, status
)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'user_housing_owner_2',
  '22222222-2222-2222-2222-222222222222',
  'confirming'
);

do $$
declare
  v_result jsonb;
  v_public jsonb;
begin
  select public.convert_claimed_listing(
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'user_housing_owner_2',
    '22222222-2222-2222-2222-222222222222',
    '{"housingIncluded":true,"mealsIncluded":false,"compensationMinCents":2500}'::jsonb
  ) into v_result;

  if not coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'host B claim conversion failed: %', v_result;
  end if;
  if (select benefit_details from public.listings
       where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') <> '{}'::jsonb then
    raise exception 'source or host A details survived host B conversion';
  end if;
  if (select pre_conversion_snapshot->'benefit_details'
        from public.listing_claims
       where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff')
       is distinct from pg_temp.sourced_benefit_details() then
    raise exception 'host B claim did not preserve the restored source map';
  end if;

  select public.get_public_benefit_details(
    'dddddddd-dddd-dddd-dddd-dddddddddddd'
  ) into v_public;
  if v_public #> '{housing,fields}' is not null
     or v_public ? 'meals'
     or v_public::text like '%host A private%'
     or v_public::text like '%source-%' then
    raise exception 'host B public detail inherited source/prior-host claims: %', v_public;
  end if;

  select public.transition_listing_claim(
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'revoked',
    'admin_housing_test',
    'restore sourced fixture'
  ) into v_result;
  if not coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'host B claim revocation failed: %', v_result;
  end if;
  if (select benefit_details from public.listings
       where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')
       is distinct from pg_temp.sourced_benefit_details() then
    raise exception 'host B revocation did not restore the source map';
  end if;
end;
$$;

-- Restore host two's intentionally incomplete library for the remaining
-- fallback and owner-scope assertions. Its published listing has a valid
-- listing-specific dining/common override, so this remains supported.
update public.host_profiles
set benefit_library = benefit_library #- '{housing,photos,dining_common}'
where id = '22222222-2222-2222-2222-222222222222';

-- Removing a profile role used by a live listing fails without mutation.
do $$
declare v_before jsonb;
begin
  select benefit_library into v_before from public.host_profiles
   where id = '11111111-1111-1111-1111-111111111111';
  begin
    update public.host_profiles
       set benefit_library = benefit_library #- '{housing,photos,bathroom}'
     where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'expected live library removal to fail';
  exception when check_violation then
    if sqlerrm not like '%bathroom%' then
      raise exception 'library-removal error omitted bathroom: %', sqlerrm;
    end if;
  end;
  if (select benefit_library from public.host_profiles
       where id = '11111111-1111-1111-1111-111111111111') is distinct from v_before then
    raise exception 'rejected library removal left partial state';
  end if;
end;
$$;

-- A profile role can be replaced atomically; its formerly referenced object
-- becomes deletable only after the JSON reference changes.
insert into storage.objects (bucket_id, name, metadata)
values (
  'listing-media',
  '11111111-1111-1111-1111-111111111111/library/housing/sleeping_area/replacement.jpg',
  pg_temp.image_metadata()
);
update public.host_profiles
set benefit_library = jsonb_set(
  benefit_library,
  '{housing,photos,sleeping_area}',
  to_jsonb(pg_temp.housing_url(
    '11111111-1111-1111-1111-111111111111/library/housing/sleeping_area/replacement.jpg'
  ))
)
where id = '11111111-1111-1111-1111-111111111111';
set local storage.allow_delete_query = 'true';
delete from storage.objects
where bucket_id = 'listing-media'
  and name = '11111111-1111-1111-1111-111111111111/library/housing/sleeping_area/default.jpg';

-- Owner mutation RPCs serialize one JSON key at a time and return the exact
-- displaced value. This prevents concurrent benefit kinds or Housing roles
-- from overwriting each other and makes post-commit object cleanup race-safe.
insert into storage.objects (bucket_id, name, metadata)
values (
  'listing-media',
  '11111111-1111-1111-1111-111111111111/library/housing/sleeping_area/rpc-replacement.jpg',
  pg_temp.image_metadata()
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_housing_owner_1","role":"authenticated"}';
do $$
declare
  v_previous jsonb;
  v_details jsonb;
  v_previous_url text;
  v_library jsonb;
begin
  select r.previous_detail, r.benefit_details
    into v_previous, v_details
    from public.save_owned_benefit_detail(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'meals',
      '{"fields":{"format":"family style"},"toggles":{}}'::jsonb
    ) r;
  if v_previous is not null or v_details #>> '{meals,fields,format}' <> 'family style' then
    raise exception 'atomic benefit RPC did not write the first kind';
  end if;

  select r.benefit_details
    into v_details
    from public.save_owned_benefit_detail(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'housing',
      '{"fields":{"arrangement":"shared lodge"},"toggles":{}}'::jsonb
    ) r;
  if v_details #>> '{meals,fields,format}' <> 'family style'
     or v_details #>> '{housing,fields,arrangement}' <> 'shared lodge' then
    raise exception 'atomic benefit RPC overwrote another benefit kind';
  end if;

  select r.previous_url, r.benefit_library
    into v_previous_url, v_library
    from public.set_my_housing_library_photo(
      'sleeping_area',
      pg_temp.housing_url(
        '11111111-1111-1111-1111-111111111111/library/housing/sleeping_area/rpc-replacement.jpg'
      )
    ) r;
  if v_previous_url is null
     or v_previous_url not like '%/sleeping_area/replacement.jpg'
     or v_library #>> '{housing,photos,bathroom}' is null
     or v_library #>> '{housing,photos,sleeping_area}' not like '%/rpc-replacement.jpg' then
    raise exception 'atomic library RPC lost another role or returned the wrong displacement';
  end if;

  if exists (
    select 1
      from public.save_owned_benefit_detail(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'meals',
        '{}'::jsonb
      )
  ) then
    raise exception 'atomic benefit RPC crossed listing ownership';
  end if;
end;
$$;
reset role;
set local request.jwt.claims = '{"sub":"service_role","role":"service_role"}';

update public.listings
   set benefit_details = '{}'::jsonb
 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local storage.allow_delete_query = 'true';
delete from storage.objects
 where bucket_id = 'listing-media'
   and name = '11111111-1111-1111-1111-111111111111/library/housing/sleeping_area/replacement.jpg';

-- Storage may use an internal Host header, and a same-name metadata UPDATE
-- must not bypass the reference guard.
set local request.headers = '{"host":"storage.internal"}';
do $$
declare v_before jsonb;
begin
  select metadata into v_before
    from storage.objects
   where bucket_id = 'listing-media'
     and name = '11111111-1111-1111-1111-111111111111/library/housing/bathroom/default.jpg';
  begin
    update storage.objects
       set metadata = metadata || '{"cacheControl":"7200"}'::jsonb
     where bucket_id = 'listing-media'
       and name = '11111111-1111-1111-1111-111111111111/library/housing/bathroom/default.jpg';
    raise exception 'expected referenced same-name storage update to fail';
  exception when check_violation then
    if sqlerrm <> 'housing_photo_object_in_use' then
      raise exception 'unexpected storage update error: %', sqlerrm;
    end if;
  end;
  if (select metadata from storage.objects
       where bucket_id = 'listing-media'
         and name = '11111111-1111-1111-1111-111111111111/library/housing/bathroom/default.jpg')
       is distinct from v_before then
    raise exception 'rejected storage update changed referenced metadata';
  end if;
end;
$$;
set local request.headers = '{"host":"127.0.0.1:54321"}';

-- Direct deletion of any still-referenced object is blocked too.
do $$
begin
  begin
    delete from storage.objects
     where bucket_id = 'listing-media'
       and name = '11111111-1111-1111-1111-111111111111/library/housing/bathroom/default.jpg';
    raise exception 'expected referenced storage deletion to fail';
  exception when check_violation then
    if sqlerrm <> 'housing_photo_object_in_use' then
      raise exception 'unexpected storage deletion error: %', sqlerrm;
    end if;
  end;
  if not exists (
    select 1 from storage.objects
     where bucket_id = 'listing-media'
       and name = '11111111-1111-1111-1111-111111111111/library/housing/bathroom/default.jpg'
  ) then
    raise exception 'rejected storage deletion removed the object';
  end if;
end;
$$;

-- Cross-host writes remain denied by owner RLS.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_housing_owner_2","role":"authenticated"}';
do $$
declare v_rows integer;
begin
  update public.host_profiles
     set benefit_library = '{}'::jsonb
   where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'cross-host housing library update was authorized';
  end if;
  begin
    perform benefit_library
      from public.host_profiles
     where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'expected authenticated raw benefit_library read to fail';
  exception when insufficient_privilege then
    null;
  end;
  if public.get_my_host_benefit_library() is distinct from (
    select pg_temp.housing_library('22222222-2222-2222-2222-222222222222')
      #- '{housing,photos,dining_common}'
  ) then
    raise exception 'owner library RPC crossed host scope';
  end if;
  if exists (
    select 1 from public.get_owned_benefit_context(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    )
  ) then
    raise exception 'owner benefit context RPC crossed host scope';
  end if;
end;
$$;
reset role;

-- Anonymous users cannot read raw defaults, even though BOTH host rows are now
-- public through live listings. They receive only one listing's effective set.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform benefit_library
      from public.host_profiles
     where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'expected raw anon benefit_library read to fail';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform benefit_details
      from public.listings
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    raise exception 'expected raw anon benefit_details read to fail';
  exception when insufficient_privilege then
    null;
  end;

  if (select count(*) from public.get_public_housing_photos(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      )) <> 4 then
    raise exception 'anon effective housing RPC expected exactly four rows';
  end if;
  if exists (
    select 1 from public.get_public_housing_photos(
      'cccccccc-cccc-cccc-cccc-cccccccccccc'
    )
  ) then
    raise exception 'Housing Not Included listing exposed profile defaults';
  end if;
  if exists (
    select 1 from public.get_public_housing_photos(
      'dddddddd-dddd-dddd-dddd-dddddddddddd'
    )
  ) then
    raise exception 'sourced listing exposed host housing evidence';
  end if;
  if coalesce(public.get_public_benefit_details(
       'cccccccc-cccc-cccc-cccc-cccccccccccc'
     ), '{}'::jsonb) <> '{}'::jsonb then
    raise exception 'Housing Not Included listing exposed stale benefit detail';
  end if;
  if coalesce(public.get_public_benefit_details(
       'dddddddd-dddd-dddd-dddd-dddddddddddd'
     ), '{}'::jsonb) <> '{}'::jsonb then
    raise exception 'sourced listing exposed host benefit detail';
  end if;
  if public.get_public_benefit_details(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     ) #>> '{housing,photos,sleeping_area}' is null then
    raise exception 'eligible public benefit detail omitted effective housing photos';
  end if;
end;
$$;
reset role;

rollback;
