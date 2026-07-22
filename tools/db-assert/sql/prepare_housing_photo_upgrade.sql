\set ON_ERROR_STOP on

-- Representative production-shaped state immediately before migration 072:
-- one verified live Housing Included listing has no role photos yet, while a
-- second already has a complete listing-specific set.
begin;

insert into auth.users (id, email, created_at, updated_at)
values (
  '72000000-0000-0000-0000-000000000001',
  'housing-upgrade-owner@example.test',
  now(),
  now()
);

insert into public.host_profiles (
  id, owner_user_id, clerk_user_id, company_name, slug, category_scopes,
  public_status
)
values (
  '72000000-0000-0000-0000-000000000002',
  '72000000-0000-0000-0000-000000000001',
  'user_housing_upgrade_owner',
  'Housing Upgrade Host',
  'housing-upgrade-host',
  array['farm'],
  'active'
);

insert into storage.objects (bucket_id, name, metadata)
select
  'listing-media',
  '72000000-0000-0000-0000-000000000002/benefit/' ||
    '72000000-0000-0000-0000-000000000004/housing/' || role || '/existing.webp',
  jsonb_build_object('mimetype', 'image/webp', 'size', 4096)
from unnest(array['sleeping_area', 'bathroom', 'kitchen', 'dining_common']) role;

insert into public.listings (
  id, host_profile_id, title, category, status, published_at,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence,
  compensation_min_cents, compensation_unit,
  benefit_details
)
values
  (
    '72000000-0000-0000-0000-000000000003',
    '72000000-0000-0000-0000-000000000002',
    'Legacy live listing without role photos',
    'farm',
    'live',
    now(),
    true,
    false,
    'confirmed',
    'confirmed',
    'confirmed',
    2000,
    'hour',
    '{}'::jsonb
  ),
  (
    '72000000-0000-0000-0000-000000000004',
    '72000000-0000-0000-0000-000000000002',
    'Legacy live listing with a complete role set',
    'farm',
    'live',
    now(),
    true,
    false,
    'confirmed',
    'confirmed',
    'confirmed',
    2100,
    'hour',
    jsonb_build_object(
      'housing', jsonb_build_object(
        'photos', jsonb_build_object(
          'sleeping_area', 'https://mamosbzcbigcclafhmmr.supabase.co/storage/v1/object/public/listing-media/72000000-0000-0000-0000-000000000002/benefit/72000000-0000-0000-0000-000000000004/housing/sleeping_area/existing.webp',
          'bathroom', 'https://mamosbzcbigcclafhmmr.supabase.co/storage/v1/object/public/listing-media/72000000-0000-0000-0000-000000000002/benefit/72000000-0000-0000-0000-000000000004/housing/bathroom/existing.webp',
          'kitchen', 'https://mamosbzcbigcclafhmmr.supabase.co/storage/v1/object/public/listing-media/72000000-0000-0000-0000-000000000002/benefit/72000000-0000-0000-0000-000000000004/housing/kitchen/existing.webp',
          'dining_common', 'https://mamosbzcbigcclafhmmr.supabase.co/storage/v1/object/public/listing-media/72000000-0000-0000-0000-000000000002/benefit/72000000-0000-0000-0000-000000000004/housing/dining_common/existing.webp'
        )
      )
    )
  );

commit;
