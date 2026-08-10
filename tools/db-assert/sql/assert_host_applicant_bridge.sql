-- assert_host_applicant_bridge.sql
-- Lane A - DB-connected proof that migration 084's applicant bridge behaves.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/assert_host_applicant_bridge.sql
--
-- WHY THIS FILE EXISTS SEPARATELY FROM THE MIGRATION
--
-- 084 ends in a DO block that exercises the bridge against a synthetic graph.
-- That block runs exactly once, at apply time, and proves only that 084 was
-- correct on the day it landed. It is not re-run when a later migration
-- redefines public.host_can_view_seeker, re-grants one of these functions to
-- anon, or drops the soft-delete conjunct -- and a reviewer who mutated the
-- entitlement predicate so that any host could read any seeker found the vitest
-- suite still green, because everything vitest can check about 084 is textual.
--
-- These assertions therefore live here too, where they run on every pull
-- request against the schema rebuilt from 001, which is the only place a
-- WIDENING introduced by a later migration can be seen at all.
--
-- WHAT IS ASSERTED
--   * full applicant detail works for application/conversation relationships;
--     invite-only relationships resolve only the narrow display name
--   * an unrelated seeker is invisible to a legitimate host, through EVERY
--     projection and not just the profile one
--   * a second real host reaches neither the applicant's profile nor resume
--   * a seeker cannot use the bridge at all, including on themselves
--   * anon may not execute any bridge function, and NOBODY may execute the
--     entitlement predicate directly
--   * a soft-deleted seeker (079) disappears from every projection
--   * over the batch bound the RPC RAISES rather than returning zero rows
--
-- Every refusal is paired with a positive control on the same fixture, so
-- neither a removed guard nor a widened one passes. RUNS IN ONE TRANSACTION AND
-- ROLLS BACK.

\set ON_ERROR_STOP on

begin;

\ir _assert_helpers.sql

-- ===========================================================================
-- 1. Fixtures: two hosts, four seekers, one entitlement arm each.
-- ===========================================================================

insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values
  ('user_bridge_host_a', 'enterprise', 'active'),
  ('user_bridge_host_b', 'enterprise', 'active');

insert into public.host_profiles (
  id, clerk_user_id, company_name, slug, category_scopes,
  subscription_tier, purchased_listing_slots
)
values
  (
    'b0d9a000-0000-4000-8000-00000000000a', 'user_bridge_host_a',
    'Bridge Host A', 'bridge-host-a', array['farm'], 'enterprise', 50
  ),
  (
    'b0d9b000-0000-4000-8000-00000000000b', 'user_bridge_host_b',
    'Bridge Host B', 'bridge-host-b', array['farm'], 'enterprise', 50
  );

-- applicant   -> entitled to host A through an APPLICATION
-- stranger    -> entitled to nobody; the negative case for every projection
-- invitee     -> entitled to host B through an INVITE
-- correspondent -> entitled to host B through an existing CONVERSATION
insert into public.seeker_profiles (id, clerk_user_id, display_name, short_bio)
values
  ('b0d95000-0000-4000-8000-000000000001', 'user_bridge_applicant',
   'Bridge Applicant', 'Applied to host A.'),
  ('b0d95000-0000-4000-8000-000000000002', 'user_bridge_stranger',
   'Bridge Stranger', 'Related to nobody.'),
  ('b0d95000-0000-4000-8000-000000000003', 'user_bridge_invitee',
   'Bridge Invitee', 'Invited by host B.'),
  ('b0d95000-0000-4000-8000-000000000004', 'user_bridge_correspondent',
   'Bridge Correspondent', 'In conversation with host B.');

insert into public.listings (id, host_profile_id, title, category, status)
values
  ('b0d96000-0000-4000-8000-00000000000a', 'b0d9a000-0000-4000-8000-00000000000a',
   'Bridge listing A', 'farm', 'draft'),
  ('b0d96000-0000-4000-8000-00000000000b', 'b0d9b000-0000-4000-8000-00000000000b',
   'Bridge listing B', 'farm', 'draft');

insert into public.applications (id, listing_id, seeker_profile_id)
values ('b0d9aaa0-0000-4000-8000-000000000001',
        'b0d96000-0000-4000-8000-00000000000a',
        'b0d95000-0000-4000-8000-000000000001');

insert into public.invites (listing_id, host_profile_id, seeker_profile_id)
values ('b0d96000-0000-4000-8000-00000000000b',
        'b0d9b000-0000-4000-8000-00000000000b',
        'b0d95000-0000-4000-8000-000000000003');

insert into public.conversations (seeker_profile_id, host_profile_id, listing_id)
values ('b0d95000-0000-4000-8000-000000000004',
        'b0d9b000-0000-4000-8000-00000000000b',
        'b0d96000-0000-4000-8000-00000000000b');

-- A full resume for the applicant AND for the stranger. The stranger's rows are
-- the point: without them, "an unrelated seeker's resume is invisible" would
-- pass because there was nothing to see.
insert into public.seeker_resume_experiences (seeker_profile_id, company_name, role_title)
values
  ('b0d95000-0000-4000-8000-000000000001', 'Bridge Orchard', 'Bridge Picker'),
  ('b0d95000-0000-4000-8000-000000000002', 'Stranger Orchard', 'Stranger Picker'),
  ('b0d95000-0000-4000-8000-000000000003', 'Invite Orchard', 'Invite Worker');

insert into public.seeker_resume_educations (seeker_profile_id, institution, program_or_degree)
values
  ('b0d95000-0000-4000-8000-000000000001', 'Bridge College', 'Horticulture'),
  ('b0d95000-0000-4000-8000-000000000002', 'Stranger College', 'Horticulture');

insert into public.seeker_certifications (seeker_profile_id, name, issuing_organization)
values
  ('b0d95000-0000-4000-8000-000000000001', 'Bridge Safety', 'Bridge Board'),
  ('b0d95000-0000-4000-8000-000000000002', 'Stranger Safety', 'Stranger Board');

do $do$
begin
  if (select count(*) from public.seeker_profiles
       where clerk_user_id like 'user_bridge_%') <> 4
     or (select count(*) from public.seeker_resume_experiences
          where seeker_profile_id = 'b0d95000-0000-4000-8000-000000000002') <> 1
     or (select count(*) from public.seeker_resume_educations
          where seeker_profile_id = 'b0d95000-0000-4000-8000-000000000002') <> 1
     or (select count(*) from public.seeker_certifications
          where seeker_profile_id = 'b0d95000-0000-4000-8000-000000000002') <> 1
     or (select count(*) from public.invites
          where seeker_profile_id = 'b0d95000-0000-4000-8000-000000000003') <> 1
     or (select count(*) from public.conversations
          where seeker_profile_id = 'b0d95000-0000-4000-8000-000000000004') <> 1 then
    raise exception 'bridge: fixture set is incomplete -- every refusal below would be vacuous';
  end if;
end;
$do$;

-- ===========================================================================
-- 2. Execute grants, from the catalog.
-- The predicate is reachable by NO client role: exposing it hands any host an
-- oracle for probing seeker ids without ever reading a row.
-- ===========================================================================

do $do$
declare
  fn text;
  v_projections text[] := array[
    'get_host_applicant_profile(uuid)',
    'get_host_applicant_display_names(uuid[])',
    'get_host_applicant_experiences(uuid)',
    'get_host_applicant_educations(uuid)',
    'get_host_applicant_certifications(uuid)'
  ];
begin
  foreach fn in array v_projections loop
    if not has_function_privilege('authenticated', 'public.' || fn, 'EXECUTE') then
      raise exception 'bridge: authenticated lost EXECUTE on public.% -- the feature is dead again', fn;
    end if;
    if has_function_privilege('anon', 'public.' || fn, 'EXECUTE') then
      raise exception 'bridge: anon gained EXECUTE on public.%', fn;
    end if;
  end loop;

  if has_function_privilege('authenticated', 'public.host_can_view_seeker(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.host_can_view_seeker(uuid)', 'EXECUTE') then
    raise exception 'bridge: the entitlement predicate became callable by a client role';
  end if;

  -- Every projection must be SECURITY DEFINER with an empty search_path, or the
  -- grants above would be describing a function that cannot read anything, or
  -- one that resolves its tables through the caller's search_path.
  foreach fn in array v_projections loop
    if not exists (
      select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = ('public.' || fn)::regprocedure
         and p.prosecdef
         and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
    ) then
      raise exception 'bridge: public.% is not a SECURITY DEFINER with a pinned search_path', fn;
    end if;
  end loop;
end;
$do$;

-- ===========================================================================
-- 3. Host A, entitled through an application. Every projection, both ways.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_bridge_host_a","role":"authenticated"}';

do $do$
begin
  if current_user <> 'authenticated' then
    raise exception 'bridge: SET LOCAL ROLE did not take effect (current_user is %) -- the whole suite would pass as a superuser', current_user;
  end if;

  perform pg_temp.expect_rows(
    'host A reads own applicant profile',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000001')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host A reads own applicant experiences',
    $q$select 1 from public.get_host_applicant_experiences('b0d95000-0000-4000-8000-000000000001')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host A reads own applicant educations',
    $q$select 1 from public.get_host_applicant_educations('b0d95000-0000-4000-8000-000000000001')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host A reads own applicant certifications',
    $q$select 1 from public.get_host_applicant_certifications('b0d95000-0000-4000-8000-000000000001')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host A resolves own applicant name',
    $q$select 1 from public.get_host_applicant_display_names(array['b0d95000-0000-4000-8000-000000000001']::uuid[]) where display_name = 'Bridge Applicant'$q$,
    1
  );

  -- The unrelated seeker, through all five. The resume projections are listed
  -- individually on purpose: an earlier draft of 084 filtered soft deletes only
  -- in the two that select seeker_profiles, and a reviewer's mutation of the
  -- predicate is only visible if every projection is probed.
  perform pg_temp.expect_rows(
    'host A cannot read an unrelated seeker profile',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000002')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host A cannot read an unrelated seeker experiences',
    $q$select 1 from public.get_host_applicant_experiences('b0d95000-0000-4000-8000-000000000002')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host A cannot read an unrelated seeker educations',
    $q$select 1 from public.get_host_applicant_educations('b0d95000-0000-4000-8000-000000000002')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host A cannot read an unrelated seeker certifications',
    $q$select 1 from public.get_host_applicant_certifications('b0d95000-0000-4000-8000-000000000002')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host A cannot resolve an unrelated seeker name',
    $q$select 1 from public.get_host_applicant_display_names(array['b0d95000-0000-4000-8000-000000000002']::uuid[])$q$,
    0
  );
  -- A mixed batch returns the entitled id only, and says nothing about the other.
  perform pg_temp.expect_rows(
    'a mixed batch returns only the entitled seeker',
    $q$select 1 from public.get_host_applicant_display_names(array['b0d95000-0000-4000-8000-000000000001','b0d95000-0000-4000-8000-000000000002']::uuid[])$q$,
    1
  );

  -- Host B's seekers are entitled to host B, not to host A. Without these, an
  -- entitlement predicate that ignored WHICH host is asking would still pass.
  perform pg_temp.expect_rows(
    'host A cannot read host B invitee',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000003')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host A cannot read host B correspondent',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000004')$q$,
    0
  );

  perform pg_temp.checkpoint_section('3 host A: application arm', 13);
end;
$do$;
reset role;

-- ===========================================================================
-- 4. Host B: invite-only name, conversation detail, and no reach into host A's.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_bridge_host_b","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'host B cannot read an invite-only seeker profile',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000003')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host B cannot read an invite-only seeker resume',
    $q$select 1 from public.get_host_applicant_experiences('b0d95000-0000-4000-8000-000000000003')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host B resolves an invite-only seeker display name',
    $q$select 1 from public.get_host_applicant_display_names(array['b0d95000-0000-4000-8000-000000000003']::uuid[]) where display_name = 'Bridge Invitee'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host B reads a seeker it converses with (conversation arm)',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000004')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host B cannot read host A applicant profile',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000001')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host B cannot read host A applicant experiences',
    $q$select 1 from public.get_host_applicant_experiences('b0d95000-0000-4000-8000-000000000001')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host B cannot read host A applicant educations',
    $q$select 1 from public.get_host_applicant_educations('b0d95000-0000-4000-8000-000000000001')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host B cannot read host A applicant certifications',
    $q$select 1 from public.get_host_applicant_certifications('b0d95000-0000-4000-8000-000000000001')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host B cannot resolve host A applicant name',
    $q$select 1 from public.get_host_applicant_display_names(array['b0d95000-0000-4000-8000-000000000001']::uuid[])$q$,
    0
  );

  perform pg_temp.checkpoint_section('4 host B: narrow invite and conversation arms', 9);
end;
$do$;
reset role;

-- ===========================================================================
-- 5. A seeker is not a host. current_host_profile_ids() resolves to the empty
-- set for them, so every arm of the predicate is false -- including on their
-- own row, which is the case most likely to be "helpfully" special-cased later.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_bridge_applicant","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'a seeker cannot read another seeker through the bridge',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000002')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'a seeker cannot read themselves through the bridge',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000001')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'a seeker cannot read a resume through the bridge',
    $q$select 1 from public.get_host_applicant_experiences('b0d95000-0000-4000-8000-000000000002')$q$,
    0
  );
  perform pg_temp.expect_denied(
    'a seeker cannot call the entitlement predicate directly',
    $q$select public.host_can_view_seeker('b0d95000-0000-4000-8000-000000000002')$q$,
    'permission denied for function host_can_view_seeker'
  );

  perform pg_temp.checkpoint_section('5 a seeker is not a host', 4);
end;
$do$;
reset role;

-- ===========================================================================
-- 6. anon reaches none of it.
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $do$
begin
  perform pg_temp.expect_denied(
    'anon cannot execute get_host_applicant_profile',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000001')$q$,
    'permission denied for function get_host_applicant_profile'
  );
  perform pg_temp.expect_denied(
    'anon cannot execute get_host_applicant_display_names',
    $q$select 1 from public.get_host_applicant_display_names(array['b0d95000-0000-4000-8000-000000000001']::uuid[])$q$,
    'permission denied for function get_host_applicant_display_names'
  );
  perform pg_temp.expect_denied(
    'anon cannot execute get_host_applicant_experiences',
    $q$select 1 from public.get_host_applicant_experiences('b0d95000-0000-4000-8000-000000000001')$q$,
    'permission denied for function get_host_applicant_experiences'
  );
  perform pg_temp.expect_denied(
    'anon cannot execute get_host_applicant_educations',
    $q$select 1 from public.get_host_applicant_educations('b0d95000-0000-4000-8000-000000000001')$q$,
    'permission denied for function get_host_applicant_educations'
  );
  perform pg_temp.expect_denied(
    'anon cannot execute get_host_applicant_certifications',
    $q$select 1 from public.get_host_applicant_certifications('b0d95000-0000-4000-8000-000000000001')$q$,
    'permission denied for function get_host_applicant_certifications'
  );
  perform pg_temp.expect_denied(
    'anon cannot call the entitlement predicate directly',
    $q$select public.host_can_view_seeker('b0d95000-0000-4000-8000-000000000001')$q$,
    'permission denied for function host_can_view_seeker'
  );

  perform pg_temp.checkpoint_section('6 anon reaches no bridge function', 6);
end;
$do$;
reset role;

-- ===========================================================================
-- 7. The batch bound is an ERROR above the limit, not an empty answer.
--
-- Returning zero rows for an over-sized request is the same "denied looks like
-- absent" confusion 084 exists to remove: a caller that stopped chunking would
-- render every applicant as a placeholder with nothing anywhere saying why.
-- The bound is 200; both sides of it are asserted, so lowering it silently
-- fails here rather than in production.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_bridge_host_a","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'a full 200-id batch is accepted and resolves the entitled id',
    $q$select 1 from public.get_host_applicant_display_names(
        (array['b0d95000-0000-4000-8000-000000000001']::uuid[]
         || array(select gen_random_uuid() from generate_series(1, 199)))
      )$q$,
    1
  );
  perform pg_temp.expect_denied(
    'a 201-id batch raises instead of returning nothing',
    $q$select 1 from public.get_host_applicant_display_names(
        array(select gen_random_uuid() from generate_series(1, 201))
      )$q$,
    'the bound is 200 per call',
    '54000'
  );

  perform pg_temp.checkpoint_section('7 the batch bound is loud', 2);
end;
$do$;
reset role;

-- ===========================================================================
-- 8. A soft-deleted seeker (079) disappears from EVERY projection.
--
-- This is checked last because it destroys the fixture the sections above rely
-- on. It is the case the first version of 084 got wrong: deleted_at was applied
-- in the two projections that select seeker_profiles and nowhere else, so a
-- deleted person's entire work history, education and certifications stayed
-- readable by every entitled host -- while the migration's own header said the
-- opposite. The filter now lives in the entitlement predicate, which all five
-- projections are gated on, and all five are probed here.
-- ===========================================================================

update public.seeker_profiles
   set deleted_at = now()
 where id = 'b0d95000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_bridge_host_a","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'a soft-deleted seeker profile is gone',
    $q$select 1 from public.get_host_applicant_profile('b0d95000-0000-4000-8000-000000000001')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'a soft-deleted seeker name is gone',
    $q$select 1 from public.get_host_applicant_display_names(array['b0d95000-0000-4000-8000-000000000001']::uuid[])$q$,
    0
  );
  perform pg_temp.expect_rows(
    'a soft-deleted seeker work history is gone',
    $q$select 1 from public.get_host_applicant_experiences('b0d95000-0000-4000-8000-000000000001')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'a soft-deleted seeker education is gone',
    $q$select 1 from public.get_host_applicant_educations('b0d95000-0000-4000-8000-000000000001')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'a soft-deleted seeker certifications are gone',
    $q$select 1 from public.get_host_applicant_certifications('b0d95000-0000-4000-8000-000000000001')$q$,
    0
  );

  perform pg_temp.checkpoint_section('8 soft delete removes every projection', 5);
end;
$do$;
reset role;

-- The resume rows must still physically exist. Otherwise the five zeros above
-- would have been proving that a cascade deleted them, not that the bridge
-- refuses to serve them.
do $do$
begin
  if (select count(*) from public.seeker_resume_experiences
       where seeker_profile_id = 'b0d95000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.seeker_resume_educations
          where seeker_profile_id = 'b0d95000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.seeker_certifications
          where seeker_profile_id = 'b0d95000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'bridge: the soft-deleted seeker resume rows are gone -- section 8 proved nothing';
  end if;
end;
$do$;

-- ===========================================================================
-- 9. Completeness. Exact counts, for the reason argued in the matrix suite.
-- ===========================================================================

do $do$
begin
  perform pg_temp.assert_suite_complete('host applicant bridge', 6, 9, 30);
end;
$do$;

select name, assertions from pg_temp.authz_section order by name;

rollback;
