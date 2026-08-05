-- assert_authorization_matrix.sql
-- Lane A - DB-connected authorization coverage. Run against a live/local database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/assert_authorization_matrix.sql
--
-- WHAT THIS FILE IS FOR
-- The authorization model of this product lives almost entirely in Postgres:
-- row-level policies, column grant allow-lists, and SECURITY DEFINER RPCs. Until
-- this file existed, none of it was exercised anywhere -- supabase/tests held a
-- README, and the two DB-backed vitest files self-skip whenever their connection
-- environment is absent, which is every CI run. This suite runs against a real
-- database and fails the build when a refusal stops refusing.
--
-- HOW IT IS WRITTEN, AND WHY IT IS NOT SHAPED LIKE THE OLDER ASSERT FILES
-- The negative controls in assert_housing_photo_library.sql wrap a statement in
--   exception when insufficient_privilege then null
-- which accepts ANY 42501 from ANY part of the statement. This file does not do
-- that. Every refusal goes through pg_temp.expect_denied, which requires the
-- exact SQLSTATE *and* a substring of the exact message, and fails loudly with
-- the actual values when either differs.
--
-- The second failure mode this file guards against is the vacuous pass. A test
-- that asserts "the other party sees zero rows" also passes when the fixture row
-- does not exist, when RLS is broken shut, or when the whole policy was dropped.
-- So every isolation refusal is paired with a POSITIVE CONTROL asserting that the
-- rightful owner does see the row. Dropping the policy under test therefore fails
-- the positive control; widening it fails the refusal. Both directions are
-- covered, and a suite that refused everything would fail its own positive
-- controls.
--
-- A subtler vacuous pass is a refusal aimed at a row the actor could not reach
-- anyway. Postgres applies SELECT policies to an UPDATE or DELETE that reads the
-- table -- which a WHERE clause does -- so "host A cannot delete host B's
-- listing" proves nothing when the target is a draft host A cannot see: the
-- SELECT policy alone produces the zero, and a DELETE policy widened to `true`
-- would still pass. Every cross-account write refusal below therefore aims at a
-- row the acting role CAN see, and says so.
--
-- HOW COMPLETENESS IS ENFORCED. Each section ends in checkpoint_section with an
-- EXACT assertion count, and the suite ends in assert_suite_complete with the
-- exact section, positive and refusal totals. A lower bound would let a section
-- stop running as long as the survivors added up; exact counts mean adding or
-- removing an assertion is a deliberate edit here.
--
-- EVERYTHING BELOW RUNS INSIDE ONE TRANSACTION AND ROLLS BACK. It writes fixture
-- rows and reads catalogs; it never leaves state behind.

\set ON_ERROR_STOP on

begin;

-- ===========================================================================
-- 0. Assertion helpers, shared with the other DB-connected suites.
-- ===========================================================================

\ir _assert_helpers.sql

-- ===========================================================================
-- 1. Fixtures.
-- Two hosts, two seekers, one live listing, one private draft, one application,
-- resume rows for both seekers, and one row in each server-only table.
-- Written as the connecting superuser, which bypasses RLS and grants; every
-- assertion below re-reads them through anon or authenticated.
-- ===========================================================================

-- PAID hosts. Migration 083 added a database cap on how many listings a host may
-- hold in a counted status, and it is a BEFORE trigger, so it fires ahead of
-- 070's publication-triad CHECK. An unsubscribed fixture has an allowance of
-- zero, which means every publication case below would be refused with
-- listing_allowance_exceeded and would stop proving anything about the
-- constraint it names. The allowance has its own proof in
-- assert_listing_allowance_enforcement.sql; here it must simply never be the
-- thing that refuses.
insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values
  ('user_authz_host_a', 'enterprise', 'active'),
  ('user_authz_host_b', 'enterprise', 'active');

insert into public.host_profiles (
  id, owner_user_id, clerk_user_id, company_name, slug, category_scopes,
  public_status, trust_status, primary_latitude, primary_longitude,
  subscription_tier, purchased_listing_slots
)
values
  (
    '0a17a000-0000-4000-8000-000000000001', null, 'user_authz_host_a',
    'Authz Host A', 'authz-host-a', array['farm'], 'active', 'unverified',
    47.4235, -120.3103, 'enterprise', 50
  ),
  (
    '0a17b000-0000-4000-8000-000000000002', null, 'user_authz_host_b',
    'Authz Host B', 'authz-host-b', array['seasonal'], 'active', 'unverified',
    44.0521, -123.0868, 'enterprise', 50
  );

insert into public.seeker_profiles (id, clerk_user_id, display_name)
values
  ('05eeca00-0000-4000-8000-000000000001', 'user_authz_seeker_a', 'Authz Seeker A'),
  ('05eecb00-0000-4000-8000-000000000002', 'user_authz_seeker_b', 'Authz Seeker B');

-- Listing A publishes. Housing and Meals are explicitly not included, so
-- migration 070's triad is satisfied by stated evidence and 072 requires no
-- housing photographs. Listing A being live is what makes host A's public-safe
-- columns readable at all, which several positive controls below depend on.
insert into public.listings (
  id, host_profile_id, title, category, status,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence,
  compensation_min_cents, compensation_unit
)
values (
  '111a1000-0000-4000-8000-00000000000a',
  '0a17a000-0000-4000-8000-000000000001',
  'Authz live listing', 'farm', 'under_review',
  false, false, 'confirmed', 'confirmed', 'confirmed',
  2500, 'hour'
);
update public.listings set status = 'live'
where id = '111a1000-0000-4000-8000-00000000000a';

insert into public.listings (
  id, host_profile_id, title, category, status,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence,
  compensation_min_cents, compensation_unit
)
values (
  '111b1000-0000-4000-8000-00000000000b',
  '0a17b000-0000-4000-8000-000000000002',
  'Authz private draft', 'seasonal', 'draft',
  false, false, 'confirmed', 'confirmed', 'confirmed',
  2600, 'hour'
);

-- Host C exists for a single reason: to be a cross-account write target that
-- the acting role can actually SEE.
--
-- Postgres applies SELECT policies to an UPDATE or DELETE that reads the table,
-- and a WHERE clause reads the table. So "host A cannot delete host B's
-- listing" aimed at host B's DRAFT proves nothing: listings_select_public
-- already hides that row, the zero comes from the SELECT policy, and the
-- refusal keeps passing with listings_delete_own widened to `true`. That is
-- what this file used to assert.
--
-- Host C therefore publishes a LIVE listing, which host A can read, and host
-- C's profile becomes publicly visible with it (host_profiles_select_public).
-- Host B is deliberately left with no live listing, because sections 4b and 4c
-- depend on host B being invisible; making host B live would have quietly
-- retired those refusals instead of failing them.
insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values ('user_authz_host_c', 'enterprise', 'active');

insert into public.host_profiles (
  id, owner_user_id, clerk_user_id, company_name, slug, category_scopes,
  public_status, trust_status, primary_latitude, primary_longitude,
  subscription_tier, purchased_listing_slots
)
values (
  '0a17c000-0000-4000-8000-000000000003', null, 'user_authz_host_c',
  'Authz Host C', 'authz-host-c', array['seasonal'], 'active', 'unverified',
  46.8721, -113.9940, 'enterprise', 50
);

insert into public.listings (
  id, host_profile_id, title, category, status,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence,
  compensation_min_cents, compensation_unit
)
values (
  '111c2000-0000-4000-8000-00000000000d',
  '0a17c000-0000-4000-8000-000000000003',
  'Authz host C live listing', 'seasonal', 'under_review',
  false, false, 'confirmed', 'confirmed', 'confirmed',
  2700, 'hour'
);
update public.listings set status = 'live'
where id = '111c2000-0000-4000-8000-00000000000d';

-- Seeker A has an application on host A's listing. Seeker B has no relationship
-- with host A at all. Both cases are asserted separately below.
insert into public.applications (id, listing_id, seeker_profile_id, status)
values (
  'aaa10000-0000-4000-8000-000000000001',
  '111a1000-0000-4000-8000-00000000000a',
  '05eeca00-0000-4000-8000-000000000001',
  'applied'
);

insert into public.seeker_resume_experiences (id, seeker_profile_id, role_title, summary)
values
  (
    'e8be0000-0000-4000-8000-000000000001', '05eeca00-0000-4000-8000-000000000001',
    'Orchard hand', 'Authz resume A private summary'
  ),
  (
    'e8be0000-0000-4000-8000-000000000002', '05eecb00-0000-4000-8000-000000000002',
    'Deckhand', 'Authz resume B private summary'
  );

insert into public.events (id, event_type, properties)
values ('e1e70000-0000-4000-8000-000000000001', 'account_banned', '{"authz":true}'::jsonb);

insert into public.media_buckets (id, owner_type, owner_id, bucket_type)
values (
  'b0c10000-0000-4000-8000-000000000001', 'host_profile',
  '0a17a000-0000-4000-8000-000000000001', 'profile_gallery'
);

insert into public.media_assets (id, bucket_id, storage_key, asset_type)
values (
  'a55e7000-0000-4000-8000-000000000001',
  'b0c10000-0000-4000-8000-000000000001',
  'authz/probe.jpg', 'image'
);

insert into public.notification_deliveries (
  id, event_id, recipient_clerk_user_id, channel, category, notification_type, dedup_key
)
values (
  'de110000-0000-4000-8000-000000000001',
  'e1e70000-0000-4000-8000-000000000001',
  'user_authz_seeker_a', 'email', 'lifecycle', 'digest', 'authz-probe-dedup'
);

insert into public.email_log (id, template_name, recipient_email, ok)
values (
  'ee110000-0000-4000-8000-000000000001',
  'authz_probe', 'authz-probe@example.test', true
);

-- The fixtures must genuinely exist, or every "zero rows visible" refusal below
-- would pass for the wrong reason.
do $do$
begin
  if (select count(*) from public.host_profiles
       where clerk_user_id in ('user_authz_host_a', 'user_authz_host_b',
                               'user_authz_host_c')) <> 3
     or (select count(*) from public.seeker_profiles
          where clerk_user_id in ('user_authz_seeker_a', 'user_authz_seeker_b')) <> 2
     or (select count(*) from public.listings
          where id in ('111a1000-0000-4000-8000-00000000000a',
                       '111b1000-0000-4000-8000-00000000000b',
                       '111c2000-0000-4000-8000-00000000000d')) <> 3
     or (select status from public.listings
          where id = '111a1000-0000-4000-8000-00000000000a') <> 'live'
     -- Host C's listing is the cross-host write target and MUST be live: if it
     -- were not, host A could not see it and every cross-host write refusal
     -- below would go vacuous. Host B's listing MUST stay a draft, because
     -- sections 4b and 4c assert that host B is invisible.
     or (select status from public.listings
          where id = '111c2000-0000-4000-8000-00000000000d') <> 'live'
     or (select status from public.listings
          where id = '111b1000-0000-4000-8000-00000000000b') <> 'draft'
     or exists (
          select 1 from public.listings
           where host_profile_id = '0a17b000-0000-4000-8000-000000000002'
             and status = 'live'
        )
     or (select count(*) from public.seeker_resume_experiences
          where id in ('e8be0000-0000-4000-8000-000000000001',
                       'e8be0000-0000-4000-8000-000000000002')) <> 2
     or (select count(*) from public.applications
          where id = 'aaa10000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'authz: fixture set is incomplete -- every refusal below would be vacuous';
  end if;
end;
$do$;

-- ===========================================================================
-- 2. Seeker to seeker isolation: profile and resume.
-- Guarded by seeker_profiles_select_own / seeker_profiles_update_own (013) and
-- seeker_resume_experiences_all_own (013). Both directions are asserted, so
-- dropping either policy fails this section.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_seeker_a","role":"authenticated"}';

do $do$
begin
  if current_user <> 'authenticated' then
    raise exception 'authz: SET LOCAL ROLE did not take effect (current_user is %) -- the whole suite would pass as a superuser', current_user;
  end if;

  perform pg_temp.expect_rows(
    'seeker A reads own profile',
    $q$select 1 from public.seeker_profiles where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'seeker A cannot read seeker B profile',
    $q$select 1 from public.seeker_profiles where id = '05eecb00-0000-4000-8000-000000000002'$q$,
    0
  );
  -- An unfiltered read is the shape a client actually sends to PostgREST.
  perform pg_temp.expect_rows(
    'seeker A sees exactly one seeker profile in an unfiltered read',
    $q$select 1 from public.seeker_profiles$q$,
    1
  );

  perform pg_temp.expect_rows(
    'seeker A reads own resume',
    $q$select 1 from public.seeker_resume_experiences where seeker_profile_id = '05eeca00-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'seeker A cannot read seeker B resume',
    $q$select 1 from public.seeker_resume_experiences where seeker_profile_id = '05eecb00-0000-4000-8000-000000000002'$q$,
    0
  );
  perform pg_temp.expect_rows(
    'seeker A reads own application',
    $q$select 1 from public.applications where id = 'aaa10000-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'seeker A reads the live listing',
    $q$select 1 from public.listings where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    1
  );

  perform pg_temp.expect_write_rows(
    'seeker A updates own display name',
    $q$update public.seeker_profiles set display_name = 'Authz Seeker A edited' where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'seeker A updates own remote preference',
    $q$update public.seeker_profiles set remote_preference = 'hybrid' where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'seeker A cannot update seeker B profile',
    $q$update public.seeker_profiles set display_name = 'hijacked' where id = '05eecb00-0000-4000-8000-000000000002'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'seeker A cannot delete seeker B resume',
    $q$delete from public.seeker_resume_experiences where seeker_profile_id = '05eecb00-0000-4000-8000-000000000002'$q$,
    0
  );

  -- Migration 061: completion_score is service-role authoritative and gates the
  -- community photo upload. A row-level policy cannot stop a column write, so
  -- the column grant is the only thing standing here.
  perform pg_temp.expect_denied(
    'seeker A cannot write own completion_score',
    $q$update public.seeker_profiles set completion_score = 100 where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    'permission denied for table seeker_profiles'
  );
  perform pg_temp.expect_denied(
    'seeker A cannot write own visibility_status',
    $q$update public.seeker_profiles set visibility_status = 'hidden' where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    'permission denied for table seeker_profiles'
  );
  perform pg_temp.expect_denied(
    'seeker A cannot rewrite own clerk_user_id',
    $q$update public.seeker_profiles set clerk_user_id = 'user_authz_seeker_b' where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    'permission denied for table seeker_profiles'
  );

  perform pg_temp.checkpoint_section('2 seeker to seeker isolation', 14);
end;
$do$;
reset role;

-- ===========================================================================
-- 3. A host reaches no seeker at all through the client roles.
-- There is no host-facing SELECT policy on seeker_profiles: the applicant
-- surfaces are served by service_role. This asserts the relationship case AND
-- the no-relationship case, because "a host may read applicants directly" would
-- be a deliberate model change and must not arrive silently.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_host_a","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'host A reads applications on own listing',
    $q$select 1 from public.applications where listing_id = '111a1000-0000-4000-8000-00000000000a'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host A cannot read the seeker who applied',
    $q$select 1 from public.seeker_profiles where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host A cannot read an unrelated seeker',
    $q$select 1 from public.seeker_profiles where id = '05eecb00-0000-4000-8000-000000000002'$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host A cannot read any seeker resume',
    $q$select 1 from public.seeker_resume_experiences$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host A cannot read applications on another host listing',
    $q$select 1 from public.applications where listing_id = '111b1000-0000-4000-8000-00000000000b'$q$,
    0
  );

  perform pg_temp.checkpoint_section('3 host reaches no seeker', 5);
end;
$do$;
reset role;

-- ===========================================================================
-- 4. host_profiles column closure (migration 080, plus benefit_library from 072).
-- The contract is the ALLOW-LIST, so this section pins the readable set exactly
-- and then proves each closed column actually raises. A migration that re-grants
-- table-level SELECT fails the set comparison even before the behaviour checks.
-- ===========================================================================

do $do$
declare
  -- Verbatim from 080: 17 public-safe columns for anon and authenticated alike.
  v_anon_readable text[] := array[
    'about', 'attestation_status', 'category_scopes', 'company_name',
    'created_at', 'host_name', 'housing_offered_generally', 'id',
    'meals_offered_generally', 'narrative', 'photo_url',
    'primary_location_name', 'social_links', 'subscription_tier', 'tagline',
    'updated_at', 'website_url'
  ];
  -- 080 deliberately left these two readable by authenticated: owner queries
  -- filter on them, and a column used only in WHERE still needs SELECT.
  v_authenticated_only text[] := array['clerk_user_id', 'deleted_at'];
  v_authenticated_readable text[] := (
    select array_agg(c order by c)
      from unnest(array[
        'about', 'attestation_status', 'category_scopes', 'company_name',
        'created_at', 'host_name', 'housing_offered_generally', 'id',
        'meals_offered_generally', 'narrative', 'photo_url',
        'primary_location_name', 'social_links', 'subscription_tier', 'tagline',
        'updated_at', 'website_url', 'clerk_user_id', 'deleted_at'
      ]) c
  );
  v_actual text[];
begin
  v_actual := pg_temp.readable_columns('anon', 'public.host_profiles'::regclass);
  if v_actual is distinct from (select array_agg(c order by c) from unnest(v_anon_readable) c) then
    raise exception 'authz: anon host_profiles SELECT set drifted -- got %', v_actual;
  end if;

  v_actual := pg_temp.readable_columns('authenticated', 'public.host_profiles'::regclass);
  if v_actual is distinct from v_authenticated_readable then
    raise exception 'authz: authenticated host_profiles SELECT set drifted -- got %', v_actual;
  end if;

  if cardinality(v_authenticated_only) <> 2 then
    raise exception 'authz: the authenticated-only host column list is no longer two columns';
  end if;
end;
$do$;

-- The 21 columns 080 withdrew, written out rather than derived, because the
-- list IS the contract. Deriving it from the catalog would make the assertion
-- true by construction and worth nothing.
create table pg_temp.host_internal_columns (name text primary key);
insert into pg_temp.host_internal_columns (name)
values
  ('account_status'), ('attestation_expires_at'), ('attested_at'),
  ('completion_score'), ('cover_asset_id'), ('current_attestation_id'),
  ('flagged_at'), ('flagged_for_review'), ('flagged_reason'),
  ('logo_asset_id'), ('operating_regions'), ('owner_user_id'),
  ('primary_latitude'), ('primary_longitude'), ('public_status'),
  ('removed_at'), ('removed_by_user_id'), ('removed_notes'),
  ('removed_reason_code'), ('slug'), ('trust_status');
grant select on pg_temp.host_internal_columns to public;

do $do$
declare
  v_count integer;
  v_missing text;
begin
  select count(*) into v_count from pg_temp.host_internal_columns;
  if v_count <> 21 then
    raise exception 'authz: expected 21 internal host columns, listed %', v_count;
  end if;
  -- Every named column must still exist, or a rename would silently retire a
  -- refusal test rather than fail it.
  select string_agg(i.name, ', ') into v_missing
    from pg_temp.host_internal_columns i
   where not exists (
     select 1 from pg_attribute a
      where a.attrelid = 'public.host_profiles'::regclass
        and a.attnum > 0
        and not a.attisdropped
        and a.attname = i.name
   );
  if v_missing is not null then
    raise exception 'authz: internal host column(s) no longer exist: %', v_missing;
  end if;
end;
$do$;

-- 4a. A signed-in NON-OWNER: the seeker reading a public host.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_seeker_a","role":"authenticated"}';

do $do$
declare
  c text;
begin
  -- Positive control. Host A is publicly visible because listing A is live, so
  -- a refusal below cannot be explained away by the row being invisible.
  perform pg_temp.expect_rows(
    'signed-in non-owner reads a public host column',
    $q$select company_name from public.host_profiles where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    1
  );

  for c in select name from pg_temp.host_internal_columns order by name loop
    perform pg_temp.expect_denied(
      format('non-owner cannot read host_profiles.%s', c),
      format(
        'select %I from public.host_profiles where id = %L',
        c, '0a17a000-0000-4000-8000-000000000001'
      ),
      'permission denied for table host_profiles'
    );
  end loop;

  perform pg_temp.expect_denied(
    'non-owner cannot read host_profiles.benefit_library',
    $q$select benefit_library from public.host_profiles where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    'permission denied for table host_profiles'
  );

  -- A column referenced only in WHERE still needs SELECT, so filtering on an
  -- internal column is refused exactly like projecting it. This is the shape
  -- that leaks a value one bit at a time.
  perform pg_temp.expect_denied(
    'non-owner cannot filter on host_profiles.trust_status',
    $q$select id from public.host_profiles where trust_status = 'verified'$q$,
    'permission denied for table host_profiles'
  );

  -- 1 positive control + one refusal per internal column (21) + benefit_library
  -- + the WHERE-only probe. The count is spelled out because the loop makes it
  -- possible for the internal column list to shrink unnoticed.
  perform pg_temp.checkpoint_section('4a host column closure: non-owner', 24);
end;
$do$;
reset role;

-- 4b. The OWNER is equally closed. 080 is a role grant, not a policy, so a host
-- cannot read their own moderation state either. Asserted so nobody "fixes"
-- this by re-granting the columns to authenticated.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_host_a","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'host A reads own public-safe columns',
    $q$select company_name, clerk_user_id from public.host_profiles where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_denied(
    'host A cannot read own trust_status',
    $q$select trust_status from public.host_profiles where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    'permission denied for table host_profiles'
  );
  perform pg_temp.expect_denied(
    'host A cannot read own primary_latitude',
    $q$select primary_latitude from public.host_profiles where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    'permission denied for table host_profiles'
  );
  perform pg_temp.expect_rows(
    'host A cannot read host B row',
    $q$select company_name from public.host_profiles where id = '0a17b000-0000-4000-8000-000000000002'$q$,
    0
  );

  perform pg_temp.checkpoint_section('4b host column closure: owner', 4);
end;
$do$;
reset role;

-- 4c. anon must not reach clerk_user_id or deleted_at, which authenticated may.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'anon reads a public host column',
    $q$select company_name from public.host_profiles where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_denied(
    'anon cannot read host_profiles.clerk_user_id',
    $q$select clerk_user_id from public.host_profiles where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    'permission denied for table host_profiles'
  );
  perform pg_temp.expect_denied(
    'anon cannot read host_profiles.deleted_at',
    $q$select deleted_at from public.host_profiles where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    'permission denied for table host_profiles'
  );
  perform pg_temp.expect_denied(
    'anon cannot filter on host_profiles.clerk_user_id',
    $q$select id from public.host_profiles where clerk_user_id = 'user_authz_host_a'$q$,
    'permission denied for table host_profiles'
  );
  perform pg_temp.expect_rows(
    'anon cannot read a host with no live listing',
    $q$select company_name from public.host_profiles where id = '0a17b000-0000-4000-8000-000000000002'$q$,
    0
  );
  perform pg_temp.expect_rows(
    'anon cannot read any seeker profile',
    $q$select 1 from public.seeker_profiles$q$,
    0
  );

  perform pg_temp.checkpoint_section('4c host column closure: anon', 6);
end;
$do$;
reset role;

-- ===========================================================================
-- 5. Listing writes: row ownership (013) and the column allow-list (071/074).
-- ===========================================================================

do $do$
declare
  -- The exact sets 071 granted, with latitude/longitude added by 074. Pinned so
  -- that adding provenance, host_profile_id, published_at or a source_* column
  -- to either grant fails here rather than in production.
  v_expected_update text[] := array[
    'begins_at', 'benefit_details', 'category', 'category_depth',
    'compensation_currency', 'compensation_max_cents', 'compensation_min_cents',
    'compensation_unit', 'cover_photo_url', 'description', 'ends_at',
    'gallery_photo_urls', 'housing_description', 'housing_evidence',
    'housing_included', 'latitude', 'location_display', 'logistics', 'longitude',
    'meals_description', 'meals_evidence', 'meals_included', 'pay_evidence',
    'status', 'title'
  ];
  v_expected_insert text[] := array[
    'begins_at', 'benefit_details', 'category', 'category_depth',
    'compensation_currency', 'compensation_max_cents', 'compensation_min_cents',
    'compensation_summary', 'compensation_unit', 'cover_photo_url',
    'description', 'ends_at', 'gallery_photo_urls', 'host_profile_id',
    'housing_description', 'housing_evidence', 'housing_included', 'latitude',
    'location_display', 'logistics', 'longitude', 'meals_description',
    'meals_evidence', 'meals_included', 'pay_evidence', 'status',
    'timeline_summary', 'title'
  ];
  v_actual text[];
begin
  v_actual := pg_temp.granted_columns('authenticated', 'public.listings'::regclass, 'UPDATE');
  if v_actual is distinct from (select array_agg(c order by c) from unnest(v_expected_update) c) then
    raise exception 'authz: authenticated listings UPDATE grant drifted -- got %', v_actual;
  end if;

  v_actual := pg_temp.granted_columns('authenticated', 'public.listings'::regclass, 'INSERT');
  if v_actual is distinct from (select array_agg(c order by c) from unnest(v_expected_insert) c) then
    raise exception 'authz: authenticated listings INSERT grant drifted -- got %', v_actual;
  end if;

  -- benefit_details stays unreadable through the raw table for both client roles
  -- (072); it is served by get_public_benefit_details.
  if has_column_privilege('anon', 'public.listings'::regclass, 'benefit_details', 'SELECT')
     or has_column_privilege('authenticated', 'public.listings'::regclass, 'benefit_details', 'SELECT') then
    raise exception 'authz: listings.benefit_details became directly readable';
  end if;
end;
$do$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_host_a","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'host A reads own live listing',
    $q$select 1 from public.listings where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'host A edits own listing title',
    $q$update public.listings set title = 'Authz live listing edited' where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host A cannot read host B private draft',
    $q$select 1 from public.listings where id = '111b1000-0000-4000-8000-00000000000b'$q$,
    0
  );

  -- Cross-host writes are aimed at host B's LIVE listing, not the draft. The
  -- positive control immediately below is the whole point: host A demonstrably
  -- SEES this row, so when the UPDATE and DELETE reach zero rows it is
  -- listings_update_own / listings_delete_own doing the refusing and not the
  -- SELECT policy that Postgres also applies to a WHERE-bearing write.
  perform pg_temp.expect_rows(
    'host A can see host C live listing (so the write refusals below are real)',
    $q$select 1 from public.listings where id = '111c2000-0000-4000-8000-00000000000d'$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'host A cannot edit host C live listing',
    $q$update public.listings set title = 'hijacked' where id = '111c2000-0000-4000-8000-00000000000d'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'host A cannot delete host C live listing',
    $q$delete from public.listings where id = '111c2000-0000-4000-8000-00000000000d'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'host A cannot edit host B private draft',
    $q$update public.listings set title = 'hijacked' where id = '111b1000-0000-4000-8000-00000000000b'$q$,
    0
  );

  -- The bypass 071 exists to close: writing provenance would move the listing
  -- into the sourced exemption that migration 070's publication gate honours.
  perform pg_temp.expect_denied(
    'host A cannot write listings.provenance',
    $q$update public.listings set provenance = 'sourced' where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    'permission denied for table listings'
  );
  perform pg_temp.expect_denied(
    'host A cannot re-parent a listing',
    $q$update public.listings set host_profile_id = '0a17b000-0000-4000-8000-000000000002' where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    'permission denied for table listings'
  );
  perform pg_temp.expect_denied(
    'host A cannot forge published_at',
    $q$update public.listings set published_at = now() where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    'permission denied for table listings'
  );
  perform pg_temp.expect_denied(
    'host A cannot write source attribution',
    $q$update public.listings set source_name = 'invented source' where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    'permission denied for table listings'
  );
  perform pg_temp.expect_denied(
    'host A cannot write completion_score',
    $q$update public.listings set completion_score = 100 where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    'permission denied for table listings'
  );
  perform pg_temp.expect_denied(
    'host A cannot insert a listing carrying provenance',
    $q$insert into public.listings (host_profile_id, title, category, provenance) values ('0a17a000-0000-4000-8000-000000000001', 'Fake sourced', 'farm', 'sourced')$q$,
    'permission denied for table listings'
  );
  perform pg_temp.expect_denied(
    'host A cannot insert a listing owned by host B',
    $q$insert into public.listings (host_profile_id, title, category) values ('0a17b000-0000-4000-8000-000000000002', 'Planted listing', 'farm')$q$,
    'new row violates row-level security policy for table "listings"'
  );

  -- Migration 070's publication triad. Not weakened here, only proven: an
  -- unanswered benefit cannot reach under_review or live.
  -- The primary key is deliberately absent from 071's INSERT grant, so the row
  -- is addressed by its title afterwards rather than by a chosen id.
  perform pg_temp.expect_allowed(
    'host A creates an own draft listing',
    $q$insert into public.listings (host_profile_id, title, category, status) values ('0a17a000-0000-4000-8000-000000000001', 'Authz unanswered draft', 'farm', 'draft')$q$
  );
  perform pg_temp.expect_denied(
    'host A cannot choose a listing primary key',
    $q$insert into public.listings (id, host_profile_id, title, category, status) values ('111c1000-0000-4000-8000-00000000000c', '0a17a000-0000-4000-8000-000000000001', 'Authz keyed draft', 'farm', 'draft')$q$,
    'permission denied for table listings'
  );
  perform pg_temp.expect_denied(
    'host A cannot publish a listing with unstated benefits',
    $q$update public.listings set status = 'under_review' where title = 'Authz unanswered draft'$q$,
    'listings_publication_triad_chk',
    '23514'
  );

  perform pg_temp.checkpoint_section('5a listing writes: host A', 17);
end;
$do$;
reset role;

-- Host B's side of the same pair. Without this, "host A cannot read host B's
-- private draft" would also pass if listings_select_own were dropped outright.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_host_b","role":"authenticated"}';
do $do$
begin
  perform pg_temp.expect_rows(
    'host B reads own private draft',
    $q$select 1 from public.listings where id = '111b1000-0000-4000-8000-00000000000b'$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'host B edits own draft',
    $q$update public.listings set title = 'Authz private draft edited' where id = '111b1000-0000-4000-8000-00000000000b'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host B reads own host profile',
    $q$select company_name from public.host_profiles where id = '0a17b000-0000-4000-8000-000000000002'$q$,
    1
  );

  -- listings_delete_own must actually delete something, or "host A cannot
  -- delete host C live listing" would pass on a schema with no DELETE path at
  -- all. A throwaway draft is used so the fixtures later sections depend on
  -- survive.
  perform pg_temp.expect_allowed(
    'host B creates a throwaway draft',
    $q$insert into public.listings (host_profile_id, title, category, status) values ('0a17b000-0000-4000-8000-000000000002', 'Authz host B throwaway', 'seasonal', 'draft')$q$
  );
  perform pg_temp.expect_write_rows(
    'host B deletes own throwaway draft',
    $q$delete from public.listings where title = 'Authz host B throwaway'$q$,
    1
  );

  perform pg_temp.checkpoint_section('5b listing writes: host B', 5);
end;
$do$;
reset role;

-- anon holds no listing write policy. NOTE, precisely: anon still carries the
-- Supabase default table-level INSERT/UPDATE grant on public.listings -- 071
-- revoked those from authenticated only. Row-level security is therefore the
-- single barrier on the anon path today, which is what these two refusals pin.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'anon reads the live listing',
    $q$select 1 from public.listings where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'anon cannot read a draft listing',
    $q$select 1 from public.listings where id = '111b1000-0000-4000-8000-00000000000b'$q$,
    0
  );
  perform pg_temp.expect_denied(
    'anon cannot insert a listing',
    $q$insert into public.listings (host_profile_id, title, category) values ('0a17a000-0000-4000-8000-000000000001', 'Anon listing', 'farm')$q$,
    'new row violates row-level security policy for table "listings"'
  );
  perform pg_temp.expect_write_rows(
    'anon cannot update a live listing',
    $q$update public.listings set title = 'anon edit' where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    0
  );

  perform pg_temp.checkpoint_section('5c listing writes: anon', 4);
end;
$do$;
reset role;

do $do$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'listings'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and (roles && array['anon']::name[] or roles = array['public']::name[]);
  if v_count <> 0 then
    raise exception 'authz: % anon-facing write policy(ies) appeared on public.listings', v_count;
  end if;
  if not (
    select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'listings'
  ) then
    raise exception 'authz: RLS is not enabled on public.listings';
  end if;
end;
$do$;

-- ===========================================================================
-- 6. Applications cannot be filed on someone else's behalf.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_host_a","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_denied(
    'host A cannot file an application as seeker B',
    $q$insert into public.applications (listing_id, seeker_profile_id) values ('111a1000-0000-4000-8000-00000000000a', '05eecb00-0000-4000-8000-000000000002')$q$,
    'new row violates row-level security policy for table "applications"'
  );
  perform pg_temp.expect_denied(
    'host A cannot file an application as the seeker who already applied',
    $q$insert into public.applications (listing_id, seeker_profile_id) values ('111a1000-0000-4000-8000-00000000000a', '05eeca00-0000-4000-8000-000000000001')$q$,
    'new row violates row-level security policy for table "applications"'
  );

  perform pg_temp.checkpoint_section('6a applications: host A cannot file', 2);
end;
$do$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_seeker_b","role":"authenticated"}';

do $do$
begin
  -- Positive control: the policy this section guards must still let a seeker
  -- apply for themselves, or every refusal above would be free.
  perform pg_temp.expect_allowed(
    'seeker B files an application for themselves',
    $q$insert into public.applications (listing_id, seeker_profile_id) values ('111a1000-0000-4000-8000-00000000000a', '05eecb00-0000-4000-8000-000000000002')$q$
  );
  perform pg_temp.expect_denied(
    'seeker B cannot file an application as seeker A',
    $q$insert into public.applications (listing_id, seeker_profile_id) values ('111b1000-0000-4000-8000-00000000000b', '05eeca00-0000-4000-8000-000000000001')$q$,
    'new row violates row-level security policy for table "applications"'
  );
  perform pg_temp.expect_rows(
    'seeker B reads own application',
    $q$select 1 from public.applications where seeker_profile_id = '05eecb00-0000-4000-8000-000000000002'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'seeker B cannot read seeker A application',
    $q$select 1 from public.applications where id = 'aaa10000-0000-4000-8000-000000000001'$q$,
    0
  );

  perform pg_temp.checkpoint_section('6b applications: seeker B', 4);
end;
$do$;
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $do$
begin
  perform pg_temp.expect_rows(
    'anon cannot read any application',
    $q$select 1 from public.applications$q$,
    0
  );
  perform pg_temp.expect_denied(
    'anon cannot file an application',
    $q$insert into public.applications (listing_id, seeker_profile_id) values ('111a1000-0000-4000-8000-00000000000a', '05eeca00-0000-4000-8000-000000000001')$q$,
    'new row violates row-level security policy for table "applications"'
  );

  perform pg_temp.checkpoint_section('6c applications: anon', 2);
end;
$do$;
reset role;

-- ===========================================================================
-- 7. Cross-account WRITES on the five client tables, and anon's blanket table
--    grants.
--
-- Sections 2-6 concentrated on who can READ what, plus listing writes. This
-- section closes the write side of the same model, because the two are not the
-- same guarantee and were not covered by the same assertions.
--
-- WHAT ANON ACTUALLY HOLDS HERE, MEASURED NOT ASSUMED. On all five client
-- tables -- listings, applications, host_profiles, seeker_profiles and
-- seeker_resume_experiences -- the role `anon` still carries Supabase's default
-- table-level UPDATE and DELETE, and INSERT on the three that 073 did not
-- revoke it from. Nothing about the schema grants anon a write POLICY on any of
-- them, so row-level security is the entire barrier, and it is a barrier made
-- of the absence of something. That is exactly the kind of guarantee that
-- disappears when someone adds one permissive policy "for the public API", so
-- it is pinned behaviourally below and structurally in the catalog check at the
-- end. seeker_resume_experiences is the one that matters most: an anon INSERT
-- there would let an unauthenticated caller write work history onto a real
-- person's resume.
--
-- WHAT A CROSS-ACCOUNT REFUSAL CAN AND CANNOT PROVE. A write refusal is only
-- meaningful when the acting role can see the target row; otherwise the SELECT
-- policy produces the zero and the write policy is never consulted. Two targets
-- here satisfy that: host C's live listing (section 5) and host C's host
-- profile, which is publicly visible precisely because that listing is live.
-- For seeker_profiles and seeker_resume_experiences no such target exists --
-- no role in this product can see another seeker's rows at all -- so the
-- cross-seeker write refusals in section 2 are backed by the read refusals
-- beside them, and what is added here is the part that CAN be proven
-- non-vacuously: nobody, not even the owner, may DELETE a profile row through
-- the client roles.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_host_a","role":"authenticated"}';

do $do$
begin
  -- host_profiles. Host C's row is readable by host A, because host C has a
  -- live listing and host_profiles_select_public follows from that. So these
  -- two zeros are host_profiles_update_own refusing and the absence of any
  -- DELETE policy refusing -- not invisibility. Host B would have been the
  -- wrong target here for exactly the reason section 4c depends on.
  perform pg_temp.expect_rows(
    'host A can see host C profile (so the write refusals below are real)',
    $q$select company_name from public.host_profiles where id = '0a17c000-0000-4000-8000-000000000003'$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'host A edits own host profile',
    $q$update public.host_profiles set company_name = 'Authz Host A edited' where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'host A cannot edit host C profile',
    $q$update public.host_profiles set company_name = 'hijacked' where id = '0a17c000-0000-4000-8000-000000000003'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'host A cannot delete host C profile',
    $q$delete from public.host_profiles where id = '0a17c000-0000-4000-8000-000000000003'$q$,
    0
  );
  -- Deleting an account is 079's reviewed queue, not a row delete. There is no
  -- DELETE policy on host_profiles at all, and the owner is not an exception.
  perform pg_temp.expect_write_rows(
    'host A cannot delete own host profile',
    $q$delete from public.host_profiles where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    0
  );

  -- applications. Host A can see this row (applications_select_host) and may
  -- advance its status, so the refusals beneath the positive control are about
  -- the write path only.
  perform pg_temp.expect_write_rows(
    'host A advances the status of an application on own listing',
    $q$update public.applications set status = 'reviewing' where id = 'aaa10000-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'host A cannot delete an application on own listing',
    $q$delete from public.applications where id = 'aaa10000-0000-4000-8000-000000000001'$q$,
    0
  );
  perform pg_temp.expect_denied(
    'host A cannot move an application to another listing',
    $q$update public.applications set listing_id = '111b1000-0000-4000-8000-00000000000b' where id = 'aaa10000-0000-4000-8000-000000000001'$q$,
    'permission denied for table applications'
  );
  perform pg_temp.expect_denied(
    'host A cannot reassign an application to another seeker',
    $q$update public.applications set seeker_profile_id = '05eecb00-0000-4000-8000-000000000002' where id = 'aaa10000-0000-4000-8000-000000000001'$q$,
    'permission denied for table applications'
  );

  perform pg_temp.checkpoint_section('7a cross-account writes: host A', 9);
end;
$do$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_seeker_a","role":"authenticated"}';

do $do$
begin
  -- seeker_resume_experiences: the owner's full write path, so that section 2's
  -- cross-seeker refusals cannot pass on a table nobody can write at all.
  perform pg_temp.expect_write_rows(
    'seeker A edits own resume row',
    $q$update public.seeker_resume_experiences set summary = 'Authz resume A edited' where id = 'e8be0000-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_allowed(
    'seeker A adds a resume row to own profile',
    $q$insert into public.seeker_resume_experiences (seeker_profile_id, role_title, summary) values ('05eeca00-0000-4000-8000-000000000001', 'Throwaway', 'Authz throwaway row')$q$
  );
  perform pg_temp.expect_write_rows(
    'seeker A deletes own resume row',
    $q$delete from public.seeker_resume_experiences where summary = 'Authz throwaway row'$q$,
    1
  );
  perform pg_temp.expect_denied(
    'seeker A cannot add a resume row to seeker B',
    $q$insert into public.seeker_resume_experiences (seeker_profile_id, role_title, summary) values ('05eecb00-0000-4000-8000-000000000002', 'Planted', 'Planted by seeker A')$q$,
    'new row violates row-level security policy for table "seeker_resume_experiences"'
  );
  perform pg_temp.expect_write_rows(
    'seeker A cannot edit seeker B resume',
    $q$update public.seeker_resume_experiences set summary = 'hijacked' where id = 'e8be0000-0000-4000-8000-000000000002'$q$,
    0
  );

  -- seeker_profiles has no DELETE policy. The row IS visible to its owner, so
  -- this refusal is not vacuous: erasure goes through 079's operator queue.
  perform pg_temp.expect_rows(
    'seeker A can see own profile (so the delete refusal below is real)',
    $q$select 1 from public.seeker_profiles where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'seeker A cannot delete own seeker profile',
    $q$delete from public.seeker_profiles where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    0
  );

  perform pg_temp.checkpoint_section('7b cross-account writes: seeker A', 7);
end;
$do$;
reset role;

-- anon, holding table-level INSERT/UPDATE/DELETE on all five and no policy on
-- any of them. Every one of these is a row-level refusal; the catalog check
-- after them is what would notice a permissive anon policy being added.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $do$
begin
  perform pg_temp.expect_write_rows(
    'anon cannot delete a live listing',
    $q$delete from public.listings where id = '111a1000-0000-4000-8000-00000000000a'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'anon cannot edit a host profile',
    $q$update public.host_profiles set company_name = 'anon edit' where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'anon cannot delete a host profile',
    $q$delete from public.host_profiles where id = '0a17a000-0000-4000-8000-000000000001'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'anon cannot edit a seeker profile',
    $q$update public.seeker_profiles set display_name = 'anon edit' where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'anon cannot delete a seeker profile',
    $q$delete from public.seeker_profiles where id = '05eeca00-0000-4000-8000-000000000001'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'anon cannot edit an application',
    $q$update public.applications set status = 'accepted' where id = 'aaa10000-0000-4000-8000-000000000001'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'anon cannot delete an application',
    $q$delete from public.applications where id = 'aaa10000-0000-4000-8000-000000000001'$q$,
    0
  );
  -- The most sensitive of the five: anon holds table-level INSERT here.
  perform pg_temp.expect_denied(
    'anon cannot plant a resume row on a real seeker',
    $q$insert into public.seeker_resume_experiences (seeker_profile_id, role_title, summary) values ('05eeca00-0000-4000-8000-000000000001', 'Planted', 'Planted by anon')$q$,
    'new row violates row-level security policy for table "seeker_resume_experiences"'
  );
  perform pg_temp.expect_write_rows(
    'anon cannot edit a seeker resume row',
    $q$update public.seeker_resume_experiences set summary = 'anon edit' where id = 'e8be0000-0000-4000-8000-000000000001'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'anon cannot delete a seeker resume row',
    $q$delete from public.seeker_resume_experiences where id = 'e8be0000-0000-4000-8000-000000000001'$q$,
    0
  );

  perform pg_temp.checkpoint_section('7c anon blanket table grants', 10);
end;
$do$;
reset role;

-- The structural half. anon must hold no write policy on any client table, and
-- RLS must be on, because that pair is the only thing standing between anon's
-- table-level grants and these tables.
do $do$
declare
  t text;
  v_rls boolean;
  v_policies integer;
  v_tables text[] := array[
    'listings', 'applications', 'host_profiles', 'seeker_profiles',
    'seeker_resume_experiences'
  ];
begin
  foreach t in array v_tables loop
    select c.relrowsecurity into v_rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = t;
    if v_rls is distinct from true then
      raise exception 'authz: RLS is not enabled on client table public.%', t;
    end if;

    select count(*) into v_policies
      from pg_policies p
     where p.schemaname = 'public'
       and p.tablename = t
       and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and (p.roles && array['anon']::name[] or p.roles = array['public']::name[]);
    if v_policies <> 0 then
      raise exception 'authz: % anon-facing write policy(ies) appeared on public.%',
        v_policies, t;
    end if;
  end loop;

  -- The fixture rows the refusals above aimed at must all still be here. If
  -- anon had actually deleted one, the next suite run would report a missing
  -- fixture instead of a widened policy, so this says it plainly now.
  if (select count(*) from public.host_profiles
       where id in ('0a17a000-0000-4000-8000-000000000001',
                    '0a17b000-0000-4000-8000-000000000002',
                    '0a17c000-0000-4000-8000-000000000003')) <> 3
     or (select count(*) from public.seeker_profiles
          where id = '05eeca00-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.applications
          where id = 'aaa10000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.seeker_resume_experiences
          where id = 'e8be0000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.listings
          where id in ('111a1000-0000-4000-8000-00000000000a',
                       '111c2000-0000-4000-8000-00000000000d')) <> 2 then
    raise exception 'authz: a client fixture row was actually written away by a refused statement';
  end if;
end;
$do$;

-- ===========================================================================
-- 8. Server-only tables.
-- These carry the Supabase default table grants, so the refusal is row-level:
-- SELECT succeeds and returns nothing, INSERT raises. Both are asserted, and
-- the fixture rows proven present above are what make the empty reads mean
-- something. The catalog check underneath fails if RLS is turned off or a
-- client-facing policy appears.
-- ===========================================================================

do $do$
declare
  t text;
  v_rls boolean;
  v_policies integer;
  v_tables text[] := array[
    'events', 'media_assets', 'media_buckets', 'notification_deliveries', 'email_log'
  ];
begin
  foreach t in array v_tables loop
    select c.relrowsecurity into v_rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = t;
    if v_rls is distinct from true then
      raise exception 'authz: RLS is not enabled on server-only table public.%', t;
    end if;

    select count(*) into v_policies
      from pg_policies p
     where p.schemaname = 'public'
       and p.tablename = t
       and (p.roles && array['anon', 'authenticated']::name[]
            or p.roles = array['public']::name[]);
    if v_policies <> 0 then
      raise exception 'authz: % client-facing policy(ies) appeared on server-only table public.%',
        v_policies, t;
    end if;
  end loop;
end;
$do$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_authz_seeker_a","role":"authenticated"}';
do $do$
declare
  t text;
  v_tables text[] := array[
    'events', 'media_assets', 'media_buckets', 'notification_deliveries', 'email_log'
  ];
begin
  foreach t in array v_tables loop
    perform pg_temp.expect_rows(
      format('authenticated cannot read public.%s', t),
      format('select 1 from public.%I', t),
      0
    );
  end loop;

  perform pg_temp.expect_denied(
    'authenticated cannot write public.events',
    $q$insert into public.events (event_type) values ('account_banned')$q$,
    'new row violates row-level security policy for table "events"'
  );
  perform pg_temp.expect_denied(
    'authenticated cannot write public.email_log',
    $q$insert into public.email_log (template_name, recipient_email, ok) values ('forged', 'forged@example.test', true)$q$,
    'new row violates row-level security policy for table "email_log"'
  );
  perform pg_temp.expect_denied(
    'authenticated cannot write public.media_buckets',
    $q$insert into public.media_buckets (owner_type, owner_id, bucket_type) values ('host_profile', '0a17a000-0000-4000-8000-000000000001', 'profile_gallery')$q$,
    'new row violates row-level security policy for table "media_buckets"'
  );
  perform pg_temp.expect_write_rows(
    'authenticated cannot alter a notification delivery',
    $q$update public.notification_deliveries set status = 'delivered' where id = 'de110000-0000-4000-8000-000000000001'$q$,
    0
  );
  perform pg_temp.expect_write_rows(
    'authenticated cannot delete an event',
    $q$delete from public.events where id = 'e1e70000-0000-4000-8000-000000000001'$q$,
    0
  );

  -- One read refusal per server-only table (5) plus five write refusals.
  perform pg_temp.checkpoint_section('8a server-only tables: authenticated', 10);
end;
$do$;
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $do$
declare
  t text;
  v_tables text[] := array[
    'events', 'media_assets', 'media_buckets', 'notification_deliveries', 'email_log'
  ];
begin
  foreach t in array v_tables loop
    perform pg_temp.expect_rows(
      format('anon cannot read public.%s', t),
      format('select 1 from public.%I', t),
      0
    );
  end loop;

  perform pg_temp.expect_denied(
    'anon cannot write public.events',
    $q$insert into public.events (event_type) values ('account_banned')$q$,
    'new row violates row-level security policy for table "events"'
  );
  perform pg_temp.expect_denied(
    'anon cannot write public.notification_deliveries',
    $q$insert into public.notification_deliveries (event_id, recipient_clerk_user_id, channel, category, notification_type, dedup_key) values ('e1e70000-0000-4000-8000-000000000001', 'user_authz_seeker_a', 'email', 'lifecycle', 'digest', 'anon-forged')$q$,
    'new row violates row-level security policy for table "notification_deliveries"'
  );
  perform pg_temp.expect_denied(
    'anon cannot write public.media_assets',
    $q$insert into public.media_assets (bucket_id, storage_key, asset_type) values ('b0c10000-0000-4000-8000-000000000001', 'anon/forged.jpg', 'image')$q$,
    'new row violates row-level security policy for table "media_assets"'
  );

  perform pg_temp.checkpoint_section('8b server-only tables: anon', 8);
end;
$do$;
reset role;

-- The fixture rows are still there for the superuser, which is the proof that
-- the empty reads above were refusals and not an empty table.
do $do$
begin
  if (select count(*) from public.events where id = 'e1e70000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.media_assets where id = 'a55e7000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.media_buckets where id = 'b0c10000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.notification_deliveries where id = 'de110000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.email_log where id = 'ee110000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'authz: a server-only fixture row vanished -- the empty client reads proved nothing';
  end if;
end;
$do$;

-- ===========================================================================
-- 9. SECURITY DEFINER RPCs and anon.
-- Enumerated from pg_proc rather than from a hand-kept list, so a definer
-- function added by a later migration is covered the day it lands. Two
-- functions are anon-executable on purpose; that set is pinned, so a third one
-- has to be added here deliberately.
-- ===========================================================================

do $do$
declare
  r record;
  v_total integer := 0;
  v_offenders text := '';
  -- The only public read surfaces intentionally reachable without a session.
  v_anon_allowed text[] := array[
    'get_public_housing_photos',
    'get_public_benefit_details'
  ];
begin
  for r in
    select p.oid,
           p.proname,
           p.oid::regprocedure::text as signature,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
           exists (
             select 1
               from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where a.grantee = 0 and a.privilege_type = 'EXECUTE'
           ) as public_exec
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    v_total := v_total + 1;
    if r.anon_exec and not (r.proname = any(v_anon_allowed)) then
      v_offenders := v_offenders || format('%s [anon EXECUTE]; ', r.signature);
    end if;
    if not r.anon_exec and r.proname = any(v_anon_allowed) then
      v_offenders := v_offenders || format('%s [public read surface lost anon EXECUTE]; ', r.signature);
    end if;
    if r.public_exec then
      v_offenders := v_offenders || format('%s [PUBLIC EXECUTE]; ', r.signature);
    end if;
  end loop;

  if v_offenders <> '' then
    raise exception 'authz: SECURITY DEFINER execute grants are wrong -- %', v_offenders;
  end if;

  -- A schema that somehow lost its definer functions would make the loop above
  -- pass by having nothing to check.
  if v_total < 20 then
    raise exception 'authz: only % SECURITY DEFINER function(s) found in public -- the enumeration is not seeing the schema', v_total;
  end if;

  -- Both named public surfaces must actually exist under those names.
  if (select count(*)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any(v_anon_allowed)) <> 2 then
    raise exception 'authz: the anon-executable RPC allow-list no longer matches the schema';
  end if;

  raise notice 'authz: % SECURITY DEFINER function(s) in public checked for anon/PUBLIC EXECUTE', v_total;
end;
$do$;

-- Behavioural spot checks. The loop above is a catalog assertion; these three
-- prove the catalog and the executor agree, in both directions.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $do$
begin
  perform pg_temp.expect_denied(
    'anon cannot execute get_clerk_user_id',
    $q$select public.get_clerk_user_id()$q$,
    'permission denied for function get_clerk_user_id'
  );
  perform pg_temp.expect_denied(
    'anon cannot execute current_host_profile_ids',
    $q$select public.current_host_profile_ids()$q$,
    'permission denied for function current_host_profile_ids'
  );
  perform pg_temp.expect_denied(
    'anon cannot execute create_my_host_profile',
    $q$select public.create_my_host_profile('Anon Host', array['farm'], null)$q$,
    'permission denied for function create_my_host_profile'
  );
  perform pg_temp.expect_denied(
    'anon cannot execute ensure_my_seeker_profile',
    $q$select public.ensure_my_seeker_profile()$q$,
    'permission denied for function ensure_my_seeker_profile'
  );
  perform pg_temp.expect_denied(
    'anon cannot execute set_my_housing_library_photo',
    $q$select public.set_my_housing_library_photo('kitchen', null)$q$,
    'permission denied for function set_my_housing_library_photo'
  );
  perform pg_temp.expect_denied(
    'anon cannot execute get_my_conversation_contexts',
    $q$select public.get_my_conversation_contexts(array['111a1000-0000-4000-8000-00000000000a']::uuid[])$q$,
    'permission denied for function get_my_conversation_contexts'
  );
  -- Positive control: the anon lockout is targeted, not a blanket one.
  perform pg_temp.expect_allowed(
    'anon can execute the intended public housing RPC',
    $q$select 1 from public.get_public_housing_photos('111a1000-0000-4000-8000-00000000000a')$q$
  );

  perform pg_temp.checkpoint_section('9 definer RPCs: anon behaviour', 7);
end;
$do$;
reset role;

-- ===========================================================================
-- 10. Completeness.
--
-- The previous version of this guard read `if v_positive < 19` and
-- `if v_refusal < 80`, against roughly 19 and 87 actual assertions -- seven
-- refusals of slack, and a comment above claiming it "fails if a whole section
-- stopped running". It did not: two of the smaller sections could have been
-- deleted outright and the totals would still have cleared the floor.
--
-- Exact numbers instead, in two dimensions. assert_suite_complete pins the
-- section count, so deleting a section (which deletes its checkpoint) fails
-- here; each section's own checkpoint pins its exact assertion count, so
-- losing one assertion inside a surviving section fails there. Editing either
-- number is a deliberate, reviewable act, which is the entire point.
-- ===========================================================================

do $do$
begin
  -- 17 sections, 137 assertions: 30 positive controls and 107 refusals.
  perform pg_temp.assert_suite_complete('authorization matrix', 17, 30, 107);
end;
$do$;

select name, assertions from pg_temp.authz_section order by name;

select kind, count(*) as assertions
from pg_temp.authz_log
group by kind
order by kind;

rollback;
