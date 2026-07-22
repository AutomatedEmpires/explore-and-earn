-- Representative production-shaped state immediately before migration 072:
-- one verified live Housing Included listing has no role photos yet, a second
-- already has a complete listing-specific set, a third is still awaiting
-- moderation without photos, a sourced live listing exercises the separate
-- ingestion lifecycle, and a legacy paused row proves resume cannot inherit an
-- untrusted pre-trigger state.
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

insert into public.listing_sources (
  id, name, kind, compliance_status, allow_raw_snapshot
)
values (
  '72000000-0000-0000-0000-000000000006',
  'Housing Upgrade Source',
  'partner_api',
  'approved',
  false
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
  benefit_details,
  provenance, source_id, source_external_id, source_name, source_status
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
    '{}'::jsonb,
    'verified', null, null, null, 'not_applicable'
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
    ),
    'verified', null, null, null, 'not_applicable'
  ),
  (
    '72000000-0000-0000-0000-000000000005',
    '72000000-0000-0000-0000-000000000002',
    'Legacy under-review listing without role photos',
    'farm',
    'under_review',
    null,
    true,
    false,
    'confirmed',
    'confirmed',
    'confirmed',
    2200,
    'hour',
    '{}'::jsonb,
    'verified', null, null, null, 'not_applicable'
  ),
  (
    '72000000-0000-0000-0000-000000000007',
    null,
    'Sourced live listing remains source-controlled',
    'farm',
    'live',
    now(),
    true,
    false,
    'stated',
    'not_stated',
    'stated',
    2300,
    'hour',
    '{}'::jsonb,
    'sourced',
    '72000000-0000-0000-0000-000000000006',
    'housing-upgrade-source-1',
    'Housing Upgrade Source',
    'active'
  ),
  (
    '72000000-0000-0000-0000-000000000008',
    '72000000-0000-0000-0000-000000000002',
    'Legacy paused listing without moderation provenance',
    'farm',
    'paused',
    null,
    true,
    false,
    'confirmed',
    'confirmed',
    'confirmed',
    2400,
    'hour',
    '{}'::jsonb,
    'verified', null, null, null, 'not_applicable'
  );

commit;
