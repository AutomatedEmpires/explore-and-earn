-- assert_founding_host_program.sql
-- Connected proof for migration 087 (commercial redesign D10).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/assert_founding_host_program.sql
--
-- WHAT THIS FILE IS FOR
-- The founding-host program is the one surface in this product that publishes a
-- SCARCITY CLAIM: "N of CAPACITY positions remain, until DATE". A claim like that
-- is only honest while three things hold, and none of them can be proved by
-- reading the application:
--
--   1. the figures a visitor sees come out of the database and nothing else, so
--      anon must be able to read exactly capacity, claimed, enrollment_deadline
--      and status -- and nothing else on the row, and nothing at all on the
--      claim ledger;
--   2. no client role can move those figures, directly or through the claim
--      function, because a program a visitor can exhaust is not a program;
--   3. the claim itself refuses beyond capacity, refuses past the deadline,
--      refuses while the program is not open, and consumes exactly one seat per
--      identity however many times it is called -- Stripe delivers at least once.
--
-- Every refusal goes through pg_temp.expect_denied, which requires the exact
-- SQLSTATE and a substring of the exact message, so a refusal caused by a typo
-- or a missing fixture cannot be counted as the refusal under test. Every
-- refusal is paired with a positive control on the same fixture, so a suite that
-- refused everything would fail its own positive controls.
--
-- Each section ends in checkpoint_section with an EXACT count and the suite ends
-- in assert_suite_complete, so an assertion that stops running fails here rather
-- than passing quietly.
--
-- EVERYTHING BELOW RUNS INSIDE ONE TRANSACTION AND ROLLS BACK.

\set ON_ERROR_STOP on

begin;

\ir _assert_helpers.sql

-- ===========================================================================
-- 0. Fixture: a configured, open program with two seats.
--
-- Written as the connecting superuser, which bypasses RLS and grants. Migration
-- 087 deliberately seeds NO row -- absence is the dark state -- so the suite
-- creates one and every assertion below re-reads it through anon, authenticated
-- or the service-role-only function.
-- ===========================================================================

insert into public.founding_host_program
  (id, capacity, claimed, enrollment_deadline, status)
values
  (1, 2, 0, now() + interval '30 days', 'open');

-- ===========================================================================
-- 1. anon: reads the offer, and only the offer.
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'anon reads the four public program columns',
    $q$select capacity, claimed, enrollment_deadline, status
         from public.founding_host_program$q$,
    1
  );

  -- The exact grant, not merely "some columns work". A later migration that
  -- widened the allow-list would pass every individual probe below and fail
  -- here, which is the point.
  perform pg_temp.expect_rows(
    'anon holds SELECT on exactly the four offer columns',
    $q$select 1
        where pg_temp.readable_columns('anon', 'public.founding_host_program'::regclass)
              = array['capacity', 'claimed', 'enrollment_deadline', 'status']$q$,
    1
  );

  perform pg_temp.expect_denied(
    'anon cannot read founding_host_program.id',
    $q$select id from public.founding_host_program$q$,
    'permission denied for table founding_host_program'
  );
  perform pg_temp.expect_denied(
    'anon cannot read founding_host_program.created_at',
    $q$select created_at from public.founding_host_program$q$,
    'permission denied for table founding_host_program'
  );
  perform pg_temp.expect_denied(
    'anon cannot read founding_host_program.updated_at',
    $q$select updated_at from public.founding_host_program$q$,
    'permission denied for table founding_host_program'
  );
  -- A WHERE-only reference still needs the column privilege (the 081 lesson).
  perform pg_temp.expect_denied(
    'anon cannot filter on founding_host_program.id',
    $q$select capacity from public.founding_host_program where id = 1$q$,
    'permission denied for table founding_host_program'
  );

  perform pg_temp.expect_denied(
    'anon cannot insert a program',
    $q$insert into public.founding_host_program (id, capacity, status)
       values (1, 999, 'open')$q$,
    'permission denied for table founding_host_program'
  );
  perform pg_temp.expect_denied(
    'anon cannot move the claimed count',
    $q$update public.founding_host_program set claimed = 0$q$,
    'permission denied for table founding_host_program'
  );
  perform pg_temp.expect_denied(
    'anon cannot delete the program',
    $q$delete from public.founding_host_program$q$,
    'permission denied for table founding_host_program'
  );

  perform pg_temp.expect_denied(
    'anon cannot read the claim ledger',
    $q$select 1 from public.founding_host_claims$q$,
    'permission denied for table founding_host_claims'
  );
  perform pg_temp.expect_denied(
    'anon cannot read the discrepancy log',
    $q$select 1 from public.founding_host_claim_discrepancies$q$,
    'permission denied for table founding_host_claim_discrepancies'
  );

  perform pg_temp.expect_denied(
    'anon cannot execute the claim function',
    $q$select public.claim_founding_host_seat('user_founding_anon')$q$,
    'permission denied for function claim_founding_host_seat'
  );
  perform pg_temp.expect_denied(
    'anon cannot execute the discrepancy recorder',
    $q$select public.record_founding_claim_discrepancy('user_founding_anon', 'full', 'cs_anon')$q$,
    'permission denied for function record_founding_claim_discrepancy'
  );

  perform pg_temp.checkpoint_section('1 program visibility: anon', 13);
end;
$do$;
reset role;

-- ===========================================================================
-- 2. authenticated: the same offer, the same closed doors.
--
-- A signed-in host must not reach STRICTLY MORE than an anonymous visitor here
-- (the 080 defect). The claim function in particular must be unreachable: a host
-- who could call it would take a discounted seat without paying for one.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_founding_host","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'a signed-in host reads the four public program columns',
    $q$select capacity, claimed, enrollment_deadline, status
         from public.founding_host_program$q$,
    1
  );
  perform pg_temp.expect_rows(
    'authenticated holds SELECT on exactly the four offer columns',
    $q$select 1
        where pg_temp.readable_columns('authenticated', 'public.founding_host_program'::regclass)
              = array['capacity', 'claimed', 'enrollment_deadline', 'status']$q$,
    1
  );

  perform pg_temp.expect_denied(
    'a host cannot read founding_host_program.id',
    $q$select id from public.founding_host_program$q$,
    'permission denied for table founding_host_program'
  );
  perform pg_temp.expect_denied(
    'a host cannot insert a program',
    $q$insert into public.founding_host_program (id, capacity, status)
       values (1, 999, 'open')$q$,
    'permission denied for table founding_host_program'
  );
  perform pg_temp.expect_denied(
    'a host cannot move the claimed count',
    $q$update public.founding_host_program set claimed = 0$q$,
    'permission denied for table founding_host_program'
  );
  perform pg_temp.expect_denied(
    'a host cannot delete the program',
    $q$delete from public.founding_host_program$q$,
    'permission denied for table founding_host_program'
  );
  perform pg_temp.expect_denied(
    'a host cannot read the claim ledger',
    $q$select 1 from public.founding_host_claims$q$,
    'permission denied for table founding_host_claims'
  );
  perform pg_temp.expect_denied(
    'a host cannot read the discrepancy log',
    $q$select 1 from public.founding_host_claim_discrepancies$q$,
    'permission denied for table founding_host_claim_discrepancies'
  );
  perform pg_temp.expect_denied(
    'a host cannot execute the claim function',
    $q$select public.claim_founding_host_seat('user_founding_host')$q$,
    'permission denied for function claim_founding_host_seat'
  );
  perform pg_temp.expect_denied(
    'a host cannot execute the discrepancy recorder',
    $q$select public.record_founding_claim_discrepancy('user_founding_host', 'full', 'cs_host')$q$,
    'permission denied for function record_founding_claim_discrepancy'
  );

  perform pg_temp.checkpoint_section('2 program visibility: authenticated', 10);
end;
$do$;
reset role;

-- ===========================================================================
-- 3. The claim consumes exactly one seat, once, and stops at capacity.
--
-- Run as the connecting superuser, standing in for the service role the webhook
-- uses. Sections 1 and 2 have already proved no client role can get here.
--
-- The claim result is read out of a named subquery rather than a bare function
-- alias, so the probe is reading the jsonb column and never a whole-row
-- reference that happens to share its name.
-- ===========================================================================

do $do$
begin
  perform pg_temp.expect_rows(
    'the first claim succeeds and is not a replay',
    $q$select 1
         from (select public.claim_founding_host_seat('user_founding_a') as r) t
        where (t.r ->> 'ok') = 'true' and (t.r ->> 'already_claimed') = 'false'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'the first claim moved the public count to one',
    $q$select 1 from public.founding_host_program
        where id = 1 and claimed = 1 and status = 'open'$q$,
    1
  );

  -- Stripe delivers at least once. A redelivered grant must answer "you already
  -- hold a seat" rather than taking a second one.
  perform pg_temp.expect_rows(
    'a redelivered claim for the same identity is a replay',
    $q$select 1
         from (select public.claim_founding_host_seat('user_founding_a') as r) t
        where (t.r ->> 'ok') = 'true' and (t.r ->> 'already_claimed') = 'true'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'the replay consumed no seat',
    $q$select 1 from public.founding_host_program where id = 1 and claimed = 1$q$,
    1
  );
  perform pg_temp.expect_rows(
    'the ledger holds exactly one row for that identity',
    $q$select 1 from public.founding_host_claims
        where clerk_user_id = 'user_founding_a'$q$,
    1
  );

  perform pg_temp.expect_rows(
    'the last seat flips the program to full',
    $q$select 1
         from (select public.claim_founding_host_seat('user_founding_b') as r) t
        where (t.r ->> 'ok') = 'true'
          and (t.r ->> 'claimed') = '2'
          and (t.r ->> 'status') = 'full'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'the stored row agrees that it is full',
    $q$select 1 from public.founding_host_program
        where id = 1 and claimed = 2 and status = 'full'$q$,
    1
  );

  perform pg_temp.expect_rows(
    'a claim beyond capacity is refused',
    $q$select 1
         from (select public.claim_founding_host_seat('user_founding_c') as r) t
        where (t.r ->> 'ok') = 'false' and (t.r ->> 'reason') = 'full'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'the refused claim wrote no ledger row',
    $q$select 1 from public.founding_host_claims
        where clerk_user_id = 'user_founding_c'$q$,
    0
  );

  perform pg_temp.checkpoint_section('3 claim semantics: capacity', 9);
end;
$do$;

-- ===========================================================================
-- 4. The claim window: deadline, status, and the dark state.
-- ===========================================================================

update public.founding_host_program
   set capacity = 5, status = 'open', enrollment_deadline = now() - interval '1 day'
 where id = 1;

do $do$
begin
  perform pg_temp.expect_rows(
    'a claim past the enrolment deadline is refused',
    $q$select 1
         from (select public.claim_founding_host_seat('user_founding_d') as r) t
        where (t.r ->> 'ok') = 'false' and (t.r ->> 'reason') = 'ended'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'the expired claim wrote no ledger row',
    $q$select 1 from public.founding_host_claims
        where clerk_user_id = 'user_founding_d'$q$,
    0
  );
end;
$do$;

-- An UNSET deadline is a decision the founder has not made, not "no deadline".
update public.founding_host_program
   set enrollment_deadline = null, status = 'open'
 where id = 1;

do $do$
begin
  perform pg_temp.expect_rows(
    'a claim with no configured deadline is refused',
    $q$select 1
         from (select public.claim_founding_host_seat('user_founding_e') as r) t
        where (t.r ->> 'ok') = 'false' and (t.r ->> 'reason') = 'ended'$q$,
    1
  );
end;
$do$;

update public.founding_host_program
   set enrollment_deadline = now() + interval '30 days', status = 'draft'
 where id = 1;

do $do$
begin
  perform pg_temp.expect_rows(
    'a draft program cannot be claimed against',
    $q$select 1
         from (select public.claim_founding_host_seat('user_founding_f') as r) t
        where (t.r ->> 'ok') = 'false' and (t.r ->> 'reason') = 'not_open'$q$,
    1
  );
end;
$do$;

update public.founding_host_program set status = 'ended' where id = 1;

do $do$
begin
  perform pg_temp.expect_rows(
    'an ended program cannot be claimed against',
    $q$select 1
         from (select public.claim_founding_host_seat('user_founding_g') as r) t
        where (t.r ->> 'ok') = 'false' and (t.r ->> 'reason') = 'ended'$q$,
    1
  );
end;
$do$;

delete from public.founding_host_program where id = 1;

do $do$
begin
  -- THE SHIPPED STATE. No row at all is what production holds until the founder
  -- configures the program, and it must refuse rather than fault.
  perform pg_temp.expect_rows(
    'an unconfigured program refuses every claim',
    $q$select 1
         from (select public.claim_founding_host_seat('user_founding_h') as r) t
        where (t.r ->> 'ok') = 'false' and (t.r ->> 'reason') = 'not_configured'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'a blank identity claims nothing',
    $q$select 1
         from (select public.claim_founding_host_seat('   ') as r) t
        where (t.r ->> 'ok') = 'false' and (t.r ->> 'reason') = 'missing_identity'$q$,
    1
  );

  perform pg_temp.checkpoint_section('4 claim semantics: window', 7);
end;
$do$;

-- ===========================================================================
-- 5. The over-subscription record.
--
-- The race the money creates: a checkout opened while seats remained can settle
-- after the last one is gone. The paid tier is still granted, so the only way
-- the count stays true is if the over-subscription is written down.
-- ===========================================================================

do $do$
begin
  perform pg_temp.expect_rows(
    'a refused claim after payment is recorded',
    $q$select 1
         from (select public.record_founding_claim_discrepancy(
                        'user_founding_c', 'full', 'cs_founding_race') as r) t
        where (t.r ->> 'ok') = 'true' and (t.r ->> 'recorded') = 'true'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'a redelivery of the same session records nothing new',
    $q$select 1
         from (select public.record_founding_claim_discrepancy(
                        'user_founding_c', 'full', 'cs_founding_race') as r) t
        where (t.r ->> 'ok') = 'true' and (t.r ->> 'recorded') = 'false'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'exactly one note exists for that checkout session',
    $q$select 1 from public.founding_host_claim_discrepancies
        where stripe_checkout_session_id = 'cs_founding_race'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'a note with no identity or reason is refused',
    $q$select 1
         from (select public.record_founding_claim_discrepancy('', '', 'cs_blank') as r) t
        where (t.r ->> 'ok') = 'false' and (t.r ->> 'reason') = 'invalid_input'$q$,
    1
  );

  perform pg_temp.checkpoint_section('5 over-subscription record', 4);
end;
$do$;

-- ===========================================================================
-- 6. Completeness.
-- ===========================================================================

do $do$
begin
  -- 5 sections, 43 assertions: 22 positive controls and 21 refusals.
  perform pg_temp.assert_suite_complete('founding host program', 5, 22, 21);
end;
$do$;

select name, assertions from pg_temp.authz_section order by name;

select kind, count(*) as assertions
from pg_temp.authz_log
group by kind
order by kind;

rollback;
