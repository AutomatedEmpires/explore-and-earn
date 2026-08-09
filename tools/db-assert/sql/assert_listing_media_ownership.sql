\set ON_ERROR_STOP on

begin;

\ir _assert_helpers.sql

set local request.headers = '{"host":"127.0.0.1:54321"}';
set local request.jwt.claims = '{}';

create function pg_temp.listing_media_url(p_object_name text)
returns text
language sql
immutable
as $fn$
  select 'http://127.0.0.1:54321/storage/v1/object/public/listing-media/' ||
         p_object_name
$fn$;

grant execute on function pg_temp.listing_media_url(text) to public;

-- ---------------------------------------------------------------------------
-- Fixtures are written by the local connecting superuser. Migration 092 is
-- intentionally scoped to authenticated requests, so this is also the setup
-- path for legacy rows whose media would now be refused on their next host edit.
-- Everything rolls back at the end of this file.
-- ---------------------------------------------------------------------------

insert into public.host_profiles (
  id, clerk_user_id, company_name, slug, category_scopes, public_status
)
values
  (
    '9200a000-0000-4000-8000-000000000001',
    'user_listing_media_owner_a',
    'Listing Media Host A',
    'listing-media-host-a',
    array['farm'],
    'active'
  ),
  (
    '9200b000-0000-4000-8000-000000000002',
    'user_listing_media_owner_b',
    'Listing Media Host B',
    'listing-media-host-b',
    array['seasonal'],
    'active'
  );

insert into public.listing_sources (id, name, kind, compliance_status)
values (
  '92005000-0000-4000-8000-000000000001',
  'Listing media assertion source',
  'json',
  'approved'
);

insert into storage.objects (bucket_id, name, metadata)
values
  (
    'listing-media',
    '9200a000-0000-4000-8000-000000000001/cover/owned.webp',
    '{"mimetype":"image/webp","size":4096}'::jsonb
  ),
  (
    'listing-media',
    '9200a000-0000-4000-8000-000000000001/gallery/one.webp',
    '{"mimetype":"image/webp","size":4096}'::jsonb
  ),
  (
    'listing-media',
    '9200a000-0000-4000-8000-000000000001/gallery/two.webp',
    '{"mimetype":"image/webp","size":4096}'::jsonb
  ),
  (
    'listing-media',
    '9200a000-0000-4000-8000-000000000001/cover/replacement.webp',
    '{"mimetype":"image/webp","size":4096}'::jsonb
  ),
  (
    'listing-media',
    '9200a000-0000-4000-8000-000000000001/gallery/replacement.webp',
    '{"mimetype":"image/webp","size":4096}'::jsonb
  ),
  (
    'listing-media',
    '9200b000-0000-4000-8000-000000000002/cover/foreign.webp',
    '{"mimetype":"image/webp","size":4096}'::jsonb
  ),
  (
    'listing-media',
    '9200b000-0000-4000-8000-000000000002/gallery/foreign.webp',
    '{"mimetype":"image/webp","size":4096}'::jsonb
  ),
  (
    'profile-photos',
    '9200a000-0000-4000-8000-000000000001/wrong-bucket.webp',
    '{"mimetype":"image/webp","size":4096}'::jsonb
  );

-- An ordinary legacy listing with unowned persisted media must fail closed on
-- every effective authenticated update, not only updates naming media columns.
insert into public.listings (
  id, host_profile_id, title, category, status,
  cover_photo_url, gallery_photo_urls
)
values (
  '92001000-0000-4000-8000-000000000002',
  '9200a000-0000-4000-8000-000000000001',
  'Legacy ordinary media',
  'farm',
  'draft',
  'https://legacy.example/source-cover.webp',
  array['https://legacy.example/source-gallery.webp']
);

-- A converted row is the one compatibility exception: byte-identical source
-- URLs may be resubmitted by the canonical full form, but any changed field is
-- a fresh host claim and must satisfy the ownership contract.
insert into public.listings (
  id, host_profile_id, title, category, status, claim_summary,
  cover_photo_url, gallery_photo_urls
)
values (
  '92001000-0000-4000-8000-000000000003',
  '9200a000-0000-4000-8000-000000000001',
  'Converted inherited media',
  'farm',
  'draft',
  'converted',
  'https://source.example/inherited-cover.webp',
  array[
    'https://source.example/inherited-gallery-a.webp',
    'https://source.example/inherited-gallery-b.webp'
  ]
);

-- Canonical conversion/revocation fixtures.
insert into public.listings (
  id, host_profile_id, title, category, status, provenance, source_id, source_name,
  source_status, claim_summary, housing_evidence, meals_evidence, pay_evidence,
  cover_photo_url, gallery_photo_urls
)
values
  (
    '92001000-0000-4000-8000-000000000004',
    null,
    'Source media claim conversion',
    'farm',
    'draft',
    'sourced',
    '92005000-0000-4000-8000-000000000001',
    'Listing media assertion source',
    'active',
    'claim_pending',
    'stated',
    'stated',
    'stated',
    'https://source.example/claim-cover.webp',
    array[
      'https://source.example/claim-gallery-b.webp',
      'https://source.example/claim-gallery-a.webp'
    ]
  ),
  (
    '92001000-0000-4000-8000-000000000005',
    '9200a000-0000-4000-8000-000000000001',
    'Legacy converted media claim',
    'seasonal',
    'draft',
    'verified',
    '92005000-0000-4000-8000-000000000001',
    'Listing media assertion source',
    'not_applicable',
    'converted',
    'confirmed',
    'confirmed',
    'confirmed',
    'https://legacy.example/converted-cover.webp',
    array['https://legacy.example/converted-gallery.webp']
  );

insert into public.listing_claims (
  id, listing_id, claimant_clerk_user_id, host_profile_id, status,
  pre_conversion_snapshot
)
values
  (
    '9200c000-0000-4000-8000-000000000004',
    '92001000-0000-4000-8000-000000000004',
    'user_listing_media_claimant',
    '9200a000-0000-4000-8000-000000000001',
    'confirming',
    null
  ),
  (
    '9200c000-0000-4000-8000-000000000005',
    '92001000-0000-4000-8000-000000000005',
    'user_listing_media_legacy_claimant',
    '9200a000-0000-4000-8000-000000000001',
    'converted',
    null
  );

do $do$
begin
  if (select count(*) from public.host_profiles
       where id in (
         '9200a000-0000-4000-8000-000000000001',
         '9200b000-0000-4000-8000-000000000002'
       )) <> 2
     or (select count(*) from storage.objects
          where bucket_id in ('listing-media', 'profile-photos')
            and name like '9200%') <> 8
     or (select count(*) from public.listings
          where id in (
            '92001000-0000-4000-8000-000000000002',
            '92001000-0000-4000-8000-000000000003',
            '92001000-0000-4000-8000-000000000004',
            '92001000-0000-4000-8000-000000000005'
          )) <> 4
     or (select count(*) from public.listing_claims
          where id in (
            '9200c000-0000-4000-8000-000000000004',
            '9200c000-0000-4000-8000-000000000005'
          )) <> 2 then
    raise exception 'listing-media ownership fixtures are incomplete';
  end if;
end;
$do$;

-- The catalog proof catches disabled or narrowed triggers, a privilege leak,
-- and a definer/invoker swap even when behavioral cases still happen to pass.
do $do$
declare
  v_general_trigger text;
begin
  select pg_get_triggerdef(t.oid)
    into v_general_trigger
    from pg_trigger t
   where t.tgrelid = 'public.listings'::regclass
     and t.tgname = 'trg_listings_media_ownership'
     and not t.tgisinternal
     and t.tgenabled <> 'D'
     and t.tgattr = ''::int2vector;

  if v_general_trigger is null
     or v_general_trigger not like '%BEFORE INSERT OR UPDATE ON public.listings%' then
    raise exception 'listing-media ownership trigger is absent, disabled, or UPDATE OF-scoped';
  end if;

  if not exists (
    select 1
      from pg_trigger t
     where t.tgrelid = 'public.listings'::regclass
       and t.tgname = 'trg_listings_claim_media_ownership'
       and not t.tgisinternal
       and t.tgenabled <> 'D'
  ) then
    raise exception 'listing-media claim preservation trigger is absent or disabled';
  end if;

  if (
    select count(*) <> 2
       or not bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
       or not bool_and(
         case p.proname
           when 'preserve_listing_media_truth' then p.prosecdef
           when 'enforce_listing_media_ownership' then not p.prosecdef
           else false
         end
       )
       or bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
       or bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       or bool_or(has_function_privilege('service_role', p.oid, 'EXECUTE'))
       or bool_or(exists (
         select 1
           from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0
            and a.privilege_type = 'EXECUTE'
       ))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in (
         'preserve_listing_media_truth',
         'enforce_listing_media_ownership'
       )
  ) then
    raise exception 'listing-media private function contract is unsafe';
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- Owned insert positive control.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"user_listing_media_owner_a","role":"authenticated"}';

select pg_temp.expect_allowed(
  'owned cover/gallery insert succeeds',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url, gallery_photo_urls
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Owned listing media insert',
      'farm',
      'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/cover/owned.webp',
      array[
        'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/gallery/one.webp',
        'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/gallery/two.webp'
      ]
    )
  $q$
);
select pg_temp.expect_rows(
  'owned cover/gallery insert persisted both fields',
  $q$
    select 1
      from public.listings
     where title = 'Owned listing media insert'
       and cover_photo_url like '%/cover/owned.webp'
       and cardinality(gallery_photo_urls) = 2
  $q$,
  1
);
select pg_temp.checkpoint_section('owned insert', 2);

-- ---------------------------------------------------------------------------
-- Every known URL/path bypass returns the same stable refusal.
-- ---------------------------------------------------------------------------

select pg_temp.expect_denied(
  'cross-host cover is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Cross-host cover probe',
      'farm',
      'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200b000-0000-4000-8000-000000000002/cover/foreign.webp'
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'cross-host gallery is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, gallery_photo_urls
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Cross-host gallery probe',
      'farm',
      array['http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200b000-0000-4000-8000-000000000002/gallery/foreign.webp']
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'foreign-origin media is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Foreign origin probe',
      'farm',
      'https://example.test/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/cover/owned.webp'
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'missing storage object is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Missing storage object probe',
      'farm',
      'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/cover/missing.webp'
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'wrong bucket is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Wrong bucket probe',
      'farm',
      'http://127.0.0.1:54321/storage/v1/object/public/profile-photos/9200a000-0000-4000-8000-000000000001/wrong-bucket.webp'
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'dot path traversal is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Dot traversal probe',
      'farm',
      'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/../escape.webp'
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'encoded path traversal is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Encoded traversal probe',
      'farm',
      'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/%2e%2e/escape.webp'
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'empty path segment is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Empty segment probe',
      'farm',
      'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001//escape.webp'
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'empty child path is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Empty child probe',
      'farm',
      'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/'
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'backslash path is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Backslash path probe',
      'farm',
      E'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/cover\\escape.webp'
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'whitespace path is rejected',
  $q$
    insert into public.listings (
      host_profile_id, title, category, cover_photo_url
    ) values (
      '9200a000-0000-4000-8000-000000000001',
      'Whitespace path probe',
      'farm',
      'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/cover/file name.webp'
    )
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.checkpoint_section('hostile paths', 11);

-- ---------------------------------------------------------------------------
-- Ordinary rows validate the effective persisted media on every edit.
-- ---------------------------------------------------------------------------

select pg_temp.expect_denied(
  'ordinary legacy unowned media blocks unrelated edit',
  $q$
    update public.listings
       set title = 'Legacy unrelated edit must fail'
     where id = '92001000-0000-4000-8000-000000000002'
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_allowed(
  'ordinary media repair replaces every unowned reference',
  $q$
    update public.listings
       set title = 'Legacy media repaired',
           cover_photo_url = 'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/cover/owned.webp',
           gallery_photo_urls = array[
             'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/gallery/one.webp'
           ]
     where id = '92001000-0000-4000-8000-000000000002'
  $q$
);
select pg_temp.expect_allowed(
  'ordinary media repair permits the following unrelated edit',
  $q$
    update public.listings
       set title = 'Legacy unrelated edit now succeeds'
     where id = '92001000-0000-4000-8000-000000000002'
  $q$
);
select pg_temp.expect_rows(
  'ordinary media repair persisted owned effective media',
  $q$
    select 1
      from public.listings
     where id = '92001000-0000-4000-8000-000000000002'
       and title = 'Legacy unrelated edit now succeeds'
       and cover_photo_url like '%/cover/owned.webp'
       and gallery_photo_urls = array[
         'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/gallery/one.webp'
       ]
  $q$,
  1
);
select pg_temp.checkpoint_section('ordinary effective media', 4);

-- ---------------------------------------------------------------------------
-- Converted rows preserve source authorship only while byte-identical.
-- ---------------------------------------------------------------------------

select pg_temp.expect_allowed(
  'converted full-form byte-identical source media survives',
  $q$
    update public.listings
       set title = 'Converted full-form save',
           cover_photo_url = cover_photo_url,
           gallery_photo_urls = gallery_photo_urls
     where id = '92001000-0000-4000-8000-000000000003'
  $q$
);
select pg_temp.expect_denied(
  'converted source cover replacement is rejected',
  $q$
    update public.listings
       set cover_photo_url = 'https://source.example/replacement-cover.webp'
     where id = '92001000-0000-4000-8000-000000000003'
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_denied(
  'converted source gallery replacement is rejected',
  $q$
    update public.listings
       set gallery_photo_urls = array[
         'https://source.example/replacement-gallery.webp'
       ]
     where id = '92001000-0000-4000-8000-000000000003'
  $q$,
  'listing_media_reference_not_owned',
  '23514'
);
select pg_temp.expect_allowed(
  'converted media can be replaced entirely with owned objects',
  $q$
    update public.listings
       set cover_photo_url = 'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/cover/replacement.webp',
           gallery_photo_urls = array[
             'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/gallery/replacement.webp'
           ]
     where id = '92001000-0000-4000-8000-000000000003'
  $q$
);
select pg_temp.expect_rows(
  'converted owned replacement persisted',
  $q$
    select 1
      from public.listings
     where id = '92001000-0000-4000-8000-000000000003'
       and cover_photo_url like '%/cover/replacement.webp'
       and gallery_photo_urls = array[
         'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/gallery/replacement.webp'
       ]
  $q$,
  1
);
select pg_temp.checkpoint_section('converted compatibility', 5);

reset role;
set local request.jwt.claims = '{"sub":"service_role","role":"service_role"}';
set local role service_role;

-- ---------------------------------------------------------------------------
-- The canonical claim RPCs must snapshot and restore media exactly. Array
-- order is deliberate: changing it would change what seekers see.
-- ---------------------------------------------------------------------------

select pg_temp.expect_rows(
  'claim conversion executes through the canonical RPC',
  $q$
    select 1
     where (public.convert_claimed_listing(
       '9200c000-0000-4000-8000-000000000004',
       'user_listing_media_claimant',
       '9200a000-0000-4000-8000-000000000001',
       '{}'::jsonb
     )->>'ok')::boolean
  $q$,
  1
);
select pg_temp.expect_rows(
  'claim conversion snapshots source cover/gallery',
  $q$
    select 1
      from public.listing_claims
     where id = '9200c000-0000-4000-8000-000000000004'
       and status = 'converted'
       and pre_conversion_snapshot->>'cover_photo_url' =
         'https://source.example/claim-cover.webp'
       and array(
         select value
           from jsonb_array_elements_text(
             pre_conversion_snapshot->'gallery_photo_urls'
           ) with ordinality as item(value, ordinality)
          order by ordinality
       ) = array[
         'https://source.example/claim-gallery-b.webp',
         'https://source.example/claim-gallery-a.webp'
       ]
  $q$,
  1
);
select pg_temp.expect_allowed(
  'converted claimant may author replacement media before revocation',
  $q$
    update public.listings
       set cover_photo_url = 'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/cover/replacement.webp',
           gallery_photo_urls = array[
             'http://127.0.0.1:54321/storage/v1/object/public/listing-media/9200a000-0000-4000-8000-000000000001/gallery/replacement.webp'
           ]
     where id = '92001000-0000-4000-8000-000000000004'
  $q$
);
select pg_temp.expect_rows(
  'converted claim revocation executes through the canonical RPC',
  $q$
    select 1
     where (public.transition_listing_claim(
       '9200c000-0000-4000-8000-000000000004',
       'revoked',
       'user_listing_media_reviewer',
       'listing media assertion'
     )->>'ok')::boolean
  $q$,
  1
);
select pg_temp.expect_rows(
  'claim revocation restores byte-identical source cover/gallery',
  $q$
    select 1
      from public.listings
     where id = '92001000-0000-4000-8000-000000000004'
       and provenance = 'sourced'
       and host_profile_id is null
       and cover_photo_url = 'https://source.example/claim-cover.webp'
       and gallery_photo_urls = array[
         'https://source.example/claim-gallery-b.webp',
         'https://source.example/claim-gallery-a.webp'
       ]
  $q$,
  1
);
select pg_temp.expect_rows(
  'legacy converted claim revocation executes',
  $q$
    select 1
     where (public.transition_listing_claim(
       '9200c000-0000-4000-8000-000000000005',
       'revoked',
       'user_listing_media_reviewer',
       'legacy listing media assertion'
     )->>'ok')::boolean
  $q$,
  1
);
select pg_temp.expect_rows(
  'legacy converted revocation clears unsnapshotted media',
  $q$
    select 1
      from public.listings
     where id = '92001000-0000-4000-8000-000000000005'
       and provenance = 'sourced'
       and host_profile_id is null
       and cover_photo_url is null
       and gallery_photo_urls = '{}'::text[]
  $q$,
  1
);
select pg_temp.checkpoint_section('claim snapshot and restoration', 7);

reset role;
set local request.jwt.claims = '{}';

select pg_temp.assert_suite_complete(
  'listing-media-ownership',
  5,
  15,
  14
);

rollback;
