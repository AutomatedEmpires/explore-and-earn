-- Connected proof for migration 088. Everything is fixture-only, transactional,
-- and rolled back. Refusals use exact SQLSTATE/message checks so an unrelated
-- failure cannot masquerade as an authorization boundary.

\set ON_ERROR_STOP on

begin;

\ir _assert_helpers.sql

create table pg_temp.scheduling_fixture_ids (
  key text primary key,
  id uuid not null unique
);
grant all on pg_temp.scheduling_fixture_ids to public;

-- Two real tenants plus nullable legacy identities for the historical IDOR
-- regression. Draft listings avoid coupling this suite to publication gates.
insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values
  ('user_schedule_host_a', 'enterprise', 'active'),
  ('user_schedule_host_b', 'enterprise', 'active');

insert into public.host_profiles (
  id, owner_user_id, clerk_user_id, company_name, slug, category_scopes,
  subscription_tier
)
values
  (
    '88000000-0000-4000-8000-00000000000a', null,
    'user_schedule_host_a', 'Schedule Host A', 'schedule-host-a',
    array['farm'], 'enterprise'
  ),
  (
    '88000000-0000-4000-8000-00000000000b', null,
    'user_schedule_host_b', 'Schedule Host B', 'schedule-host-b',
    array['seasonal'], 'enterprise'
  ),
  (
    '88000000-0000-4000-8000-00000000000c', null,
    null, 'Legacy Schedule Host', 'legacy-schedule-host',
    array['farm'], 'none'
  );

insert into public.seeker_profiles (id, clerk_user_id, display_name)
values
  ('88100000-0000-4000-8000-000000000001', 'user_schedule_seeker_a', 'Schedule Seeker A'),
  ('88100000-0000-4000-8000-000000000002', 'user_schedule_seeker_b', 'Schedule Seeker B'),
  ('88100000-0000-4000-8000-000000000003', 'user_schedule_seeker_c', 'Schedule Seeker C'),
  ('88100000-0000-4000-8000-000000000004', 'user_schedule_seeker_d', 'Schedule Seeker D'),
  ('88100000-0000-4000-8000-000000000005', 'user_schedule_seeker_e', 'Schedule Seeker E'),
  ('88100000-0000-4000-8000-000000000006', 'user_schedule_seeker_f', 'Schedule Seeker F'),
  ('88100000-0000-4000-8000-000000000007', 'user_schedule_seeker_g', 'Schedule Seeker G'),
  ('88100000-0000-4000-8000-000000000008', 'user_schedule_seeker_h', 'Schedule Seeker H'),
  ('88100000-0000-4000-8000-000000000009', null, 'Legacy Schedule Seeker'),
  ('88100000-0000-4000-8000-00000000000a', 'user_schedule_seeker_client', 'Client Boundary Seeker'),
  ('88100000-0000-4000-8000-00000000000b', 'user_schedule_seeker_overlap', 'Overlap Schedule Seeker');

insert into public.listings (id, host_profile_id, title, category, status)
values
  (
    '88200000-0000-4000-8000-00000000000a',
    '88000000-0000-4000-8000-00000000000a',
    'Schedule listing A', 'farm', 'draft'
  ),
  (
    '88200000-0000-4000-8000-00000000000b',
    '88000000-0000-4000-8000-00000000000b',
    'Schedule listing B', 'seasonal', 'draft'
  ),
  (
    '88200000-0000-4000-8000-00000000000c',
    '88000000-0000-4000-8000-00000000000c',
    'Legacy schedule listing', 'farm', 'draft'
  ),
  (
    '88200000-0000-4000-8000-00000000000d',
    '88000000-0000-4000-8000-00000000000b',
    'Adjacent schedule listing', 'seasonal', 'draft'
  );

insert into public.applications (id, listing_id, seeker_profile_id)
values
  ('88300000-0000-4000-8000-000000000001', '88200000-0000-4000-8000-00000000000a', '88100000-0000-4000-8000-000000000001'),
  ('88300000-0000-4000-8000-000000000002', '88200000-0000-4000-8000-00000000000b', '88100000-0000-4000-8000-000000000002'),
  ('88300000-0000-4000-8000-000000000003', '88200000-0000-4000-8000-00000000000a', '88100000-0000-4000-8000-000000000003'),
  ('88300000-0000-4000-8000-000000000004', '88200000-0000-4000-8000-00000000000a', '88100000-0000-4000-8000-000000000004'),
  ('88300000-0000-4000-8000-000000000005', '88200000-0000-4000-8000-00000000000a', '88100000-0000-4000-8000-000000000005'),
  ('88300000-0000-4000-8000-000000000006', '88200000-0000-4000-8000-00000000000a', '88100000-0000-4000-8000-000000000006'),
  ('88300000-0000-4000-8000-000000000007', '88200000-0000-4000-8000-00000000000a', '88100000-0000-4000-8000-000000000007'),
  ('88300000-0000-4000-8000-000000000008', '88200000-0000-4000-8000-00000000000a', '88100000-0000-4000-8000-000000000008'),
  ('88300000-0000-4000-8000-000000000009', '88200000-0000-4000-8000-00000000000c', '88100000-0000-4000-8000-000000000009'),
  ('88300000-0000-4000-8000-00000000000a', '88200000-0000-4000-8000-00000000000a', '88100000-0000-4000-8000-00000000000a'),
  ('88300000-0000-4000-8000-00000000000b', '88200000-0000-4000-8000-00000000000a', '88100000-0000-4000-8000-00000000000b'),
  ('88300000-0000-4000-8000-00000000000c', '88200000-0000-4000-8000-00000000000b', '88100000-0000-4000-8000-00000000000b'),
  ('88300000-0000-4000-8000-00000000000d', '88200000-0000-4000-8000-00000000000d', '88100000-0000-4000-8000-00000000000b');

-- Build all normal requests through the service-only boundary. One option per
-- request keeps party-visibility counts exact.
set local role service_role;

insert into pg_temp.scheduling_fixture_ids (key, id)
values
  ('req_a', public.propose_my_host_scheduling_request(
    'user_schedule_host_a', '88300000-0000-4000-8000-000000000001',
    'video', 30, 'America/Los_Angeles', 'Schedule A details',
    array[date_trunc('hour', now()) + interval '2 days']
  )),
  ('req_b', public.propose_my_host_scheduling_request(
    'user_schedule_host_b', '88300000-0000-4000-8000-000000000002',
    'phone', 30, 'America/New_York', 'Schedule B details',
    array[date_trunc('hour', now()) + interval '3 days']
  )),
  ('req_wrong', public.propose_my_host_scheduling_request(
    'user_schedule_host_a', '88300000-0000-4000-8000-000000000003',
    'video', 30, 'UTC', 'Wrong round details',
    array[date_trunc('hour', now()) + interval '4 days']
  )),
  ('req_terminal', public.propose_my_host_scheduling_request(
    'user_schedule_host_a', '88300000-0000-4000-8000-000000000004',
    'video', 30, 'UTC', 'Terminal application details',
    array[date_trunc('hour', now()) + interval '5 days']
  )),
  ('req_expiry', public.propose_my_host_scheduling_request(
    'user_schedule_host_a', '88300000-0000-4000-8000-000000000005',
    'phone', 30, 'UTC', 'Expiry details',
    array[date_trunc('hour', now()) + interval '6 days']
  )),
  ('req_resolve', public.propose_my_host_scheduling_request(
    'user_schedule_host_a', '88300000-0000-4000-8000-000000000006',
    'video', 30, 'UTC', 'Completion details',
    array[date_trunc('hour', now()) + interval '7 days']
  )),
  ('req_cancel', public.propose_my_host_scheduling_request(
    'user_schedule_host_a', '88300000-0000-4000-8000-000000000007',
    'phone', 30, 'UTC', 'Cancellation details',
    array[date_trunc('hour', now()) + interval '8 days']
  )),
  ('req_noshow', public.propose_my_host_scheduling_request(
    'user_schedule_host_a', '88300000-0000-4000-8000-000000000008',
    'video', 30, 'UTC', 'No show details',
    array[date_trunc('hour', now()) + interval '9 days']
  )),
  ('req_overlap_base', public.propose_my_host_scheduling_request(
    'user_schedule_host_a', '88300000-0000-4000-8000-00000000000b',
    'video', 30, 'UTC', 'Overlap baseline details',
    array[date_trunc('hour', now()) + interval '12 days']
  )),
  ('req_overlap', public.propose_my_host_scheduling_request(
    'user_schedule_host_b', '88300000-0000-4000-8000-00000000000c',
    'video', 30, 'UTC', 'Overlapping details',
    array[date_trunc('hour', now()) + interval '12 days 15 minutes']
  )),
  ('req_adjacent', public.propose_my_host_scheduling_request(
    'user_schedule_host_b', '88300000-0000-4000-8000-00000000000d',
    'video', 30, 'UTC', 'Adjacent details',
    array[date_trunc('hour', now()) + interval '12 days 30 minutes']
  ));

insert into pg_temp.scheduling_fixture_ids (key, id)
select fixture.key, option_row.id
from (
  values
    ('opt_a', 'req_a'),
    ('opt_b_round_1', 'req_b'),
    ('opt_wrong', 'req_wrong'),
    ('opt_terminal', 'req_terminal'),
    ('opt_expiry', 'req_expiry'),
    ('opt_resolve', 'req_resolve'),
    ('opt_cancel', 'req_cancel'),
    ('opt_noshow', 'req_noshow'),
    ('opt_overlap_base', 'req_overlap_base'),
    ('opt_overlap', 'req_overlap'),
    ('opt_adjacent', 'req_adjacent')
) as fixture(key, request_key)
join pg_temp.scheduling_fixture_ids request_row
  on request_row.key = fixture.request_key
join public.scheduling_options option_row
  on option_row.scheduling_request_id = request_row.id
 and option_row.proposal_round = 1;

reset role;

-- A round-two option on a round-one request must never be selectable.
insert into public.scheduling_options (
  id, scheduling_request_id, proposal_round, starts_at, ends_at
)
values (
  '88500000-0000-4000-8000-000000000003',
  (select id from pg_temp.scheduling_fixture_ids where key = 'req_wrong'),
  2,
  date_trunc('hour', now()) + interval '4 days 1 hour',
  date_trunc('hour', now()) + interval '4 days 1 hour 30 minutes'
);
insert into pg_temp.scheduling_fixture_ids values
  ('opt_wrong_round_2', '88500000-0000-4000-8000-000000000003');

-- Legacy rows can have no Clerk identity on either side. The cancel RPC must
-- fail closed for an unrelated non-null identity rather than inheriting SQL
-- three-valued logic through nullable equality checks.
insert into public.scheduling_requests (
  id, application_id, listing_title, meeting_type, duration_minutes, proposal_timezone,
  meeting_details, expires_at
)
values (
  '88400000-0000-4000-8000-000000000009',
  '88300000-0000-4000-8000-000000000009',
  'Legacy schedule listing', 'phone', 30, 'UTC', 'Legacy details',
  clock_timestamp() + interval '10 days'
);
insert into public.scheduling_options (
  id, scheduling_request_id, proposal_round, starts_at, ends_at
)
values (
  '88500000-0000-4000-8000-000000000009',
  '88400000-0000-4000-8000-000000000009', 1,
  date_trunc('hour', now()) + interval '10 days',
  date_trunc('hour', now()) + interval '10 days 30 minutes'
);
insert into pg_temp.scheduling_fixture_ids values
  ('req_legacy', '88400000-0000-4000-8000-000000000009'),
  ('opt_legacy', '88500000-0000-4000-8000-000000000009');

do $do$
begin
  if (select count(*) from pg_temp.scheduling_fixture_ids where key like 'req_%') <> 12
     or (select count(*) from pg_temp.scheduling_fixture_ids where key like 'opt_%') <> 13
     or (select count(*) from public.events e
          join pg_temp.scheduling_fixture_ids i on i.id = e.subject_id
         where i.key like 'req_%') <> 12 then
    raise exception 'scheduling assertions: fixture graph is incomplete';
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 1. Schema, RLS, exact table grants, RPC grants and integrity triggers.
-- ---------------------------------------------------------------------------

do $do$
begin
  perform pg_temp.expect_rows(
    'both scheduling tables have RLS enabled',
    $q$select c.oid
         from pg_class c
        where c.oid in (
          'public.scheduling_requests'::regclass,
          'public.scheduling_options'::regclass
        ) and c.relrowsecurity$q$,
    2
  );
  perform pg_temp.expect_rows(
    'exactly the two participant SELECT policies exist',
    $q$select 1
        where (
          select count(*) from pg_policies
           where schemaname = 'public'
             and tablename in ('scheduling_requests', 'scheduling_options')
        ) = 2
          and exists (
            select 1 from pg_policies
             where schemaname = 'public'
               and tablename = 'scheduling_requests'
               and policyname = 'scheduling_requests_select_party'
          )
          and exists (
            select 1 from pg_policies
             where schemaname = 'public'
               and tablename = 'scheduling_options'
               and policyname = 'scheduling_options_select_party'
          )$q$,
    1
  );
  perform pg_temp.expect_rows(
    'authenticated has SELECT and no write privilege on both tables',
    $q$select c.oid
         from pg_class c
        where c.oid in (
          'public.scheduling_requests'::regclass,
          'public.scheduling_options'::regclass
        )
          and has_table_privilege('authenticated', c.oid, 'SELECT')
          and not has_table_privilege('authenticated', c.oid, 'INSERT')
          and not has_table_privilege('authenticated', c.oid, 'UPDATE')
          and not has_table_privilege('authenticated', c.oid, 'DELETE')$q$,
    2
  );
  perform pg_temp.expect_rows(
    'anon has no scheduling table privilege',
    $q$select c.oid
         from pg_class c
        where c.oid in (
          'public.scheduling_requests'::regclass,
          'public.scheduling_options'::regclass
        )
          and not has_table_privilege('anon', c.oid, 'SELECT')
          and not has_table_privilege('anon', c.oid, 'INSERT')
          and not has_table_privilege('anon', c.oid, 'UPDATE')
          and not has_table_privilege('anon', c.oid, 'DELETE')$q$,
    2
  );
  perform pg_temp.expect_rows(
    'service role owns the scheduler read-write surface',
    $q$select c.oid
         from pg_class c
        where c.oid in (
          'public.scheduling_requests'::regclass,
          'public.scheduling_options'::regclass
        )
          and has_table_privilege('service_role', c.oid, 'SELECT')
          and has_table_privilege('service_role', c.oid, 'INSERT')
          and has_table_privilege('service_role', c.oid, 'UPDATE')
          and has_table_privilege('service_role', c.oid, 'DELETE')$q$,
    2
  );
  perform pg_temp.expect_rows(
    'all mutation RPCs are security definers with pinned search paths',
    $q$select p.oid
         from pg_proc p
        where p.oid = any(array[
          'public.propose_my_host_scheduling_request(text,uuid,text,integer,text,text,timestamp with time zone[])'::regprocedure,
          'public.respond_to_my_scheduling_request(text,uuid,text,uuid)'::regprocedure,
          'public.cancel_my_scheduling_request(text,uuid)'::regprocedure,
          'public.resolve_my_host_scheduling_request(text,uuid,text)'::regprocedure
        ])
          and p.prosecdef
          and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'$q$,
    4
  );
  perform pg_temp.expect_rows(
    'selection RPC retains per-seeker advisory serialization',
    $q$select 1 from pg_proc
        where oid = 'public.respond_to_my_scheduling_request(text,uuid,text,uuid)'::regprocedure
          and position('pg_advisory_xact_lock' in prosrc) > 0
          and position('v_seeker_profile_id' in prosrc) > 0$q$,
    1
  );
  perform pg_temp.expect_rows(
    'service role can execute all four mutation RPCs',
    $q$select p.oid
         from pg_proc p
        where p.oid = any(array[
          'public.propose_my_host_scheduling_request(text,uuid,text,integer,text,text,timestamp with time zone[])'::regprocedure,
          'public.respond_to_my_scheduling_request(text,uuid,text,uuid)'::regprocedure,
          'public.cancel_my_scheduling_request(text,uuid)'::regprocedure,
          'public.resolve_my_host_scheduling_request(text,uuid,text)'::regprocedure
        ]) and has_function_privilege('service_role', p.oid, 'EXECUTE')$q$,
    4
  );
  perform pg_temp.expect_rows(
    'authenticated cannot execute a scheduling mutation RPC',
    $q$select p.oid
         from pg_proc p
        where p.oid = any(array[
          'public.propose_my_host_scheduling_request(text,uuid,text,integer,text,text,timestamp with time zone[])'::regprocedure,
          'public.respond_to_my_scheduling_request(text,uuid,text,uuid)'::regprocedure,
          'public.cancel_my_scheduling_request(text,uuid)'::regprocedure,
          'public.resolve_my_host_scheduling_request(text,uuid,text)'::regprocedure
        ]) and has_function_privilege('authenticated', p.oid, 'EXECUTE')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'anon cannot execute a scheduling mutation RPC',
    $q$select p.oid
         from pg_proc p
        where p.oid = any(array[
          'public.propose_my_host_scheduling_request(text,uuid,text,integer,text,text,timestamp with time zone[])'::regprocedure,
          'public.respond_to_my_scheduling_request(text,uuid,text,uuid)'::regprocedure,
          'public.cancel_my_scheduling_request(text,uuid)'::regprocedure,
          'public.resolve_my_host_scheduling_request(text,uuid,text)'::regprocedure
        ]) and has_function_privilege('anon', p.oid, 'EXECUTE')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'trigger helpers are locked security definers',
    $q$select p.oid
         from pg_proc p
        where p.oid = any(array[
          'public.cancel_scheduling_for_terminal_application()'::regprocedure,
          'public.record_scheduling_lifecycle_event()'::regprocedure
        ])
          and p.prosecdef
          and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
          and has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not has_function_privilege('anon', p.oid, 'EXECUTE')$q$,
    2
  );
  perform pg_temp.expect_rows(
    'all six scheduler integrity, snapshot, and event triggers exist',
    $q$select t.oid
         from pg_trigger t
        where not t.tgisinternal
          and t.tgname in (
            'trg_scheduling_requests_selected_option',
            'trg_scheduling_requests_listing_title_immutable',
            'trg_scheduling_requests_lifecycle',
            'trg_scheduling_requests_event_insert',
            'trg_scheduling_requests_event_status',
            'trg_applications_cancel_scheduling'
          )$q$,
    6
  );
  perform pg_temp.expect_rows(
    'selected option has a foreign key and supporting index',
    $q$select 1
        where exists (
          select 1 from pg_constraint
           where conrelid = 'public.scheduling_requests'::regclass
             and conname = 'scheduling_requests_selected_option_fk'
             and contype = 'f'
        )
          and to_regclass('public.scheduling_requests_selected_option_idx') is not null$q$,
    1
  );

  perform pg_temp.checkpoint_section('1 schema and grants', 13);
end;
$do$;

-- ---------------------------------------------------------------------------
-- 2. Client roles cannot mutate directly or call server-derived identity RPCs.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_schedule_host_a","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_denied(
    'authenticated cannot call proposal RPC directly',
    $q$select public.propose_my_host_scheduling_request(
      'user_schedule_host_a', '88300000-0000-4000-8000-00000000000a',
      'video', 30, 'UTC', 'Direct RPC attempt',
      array[clock_timestamp() + interval '11 days']
    )$q$,
    'permission denied for function propose_my_host_scheduling_request'
  );
  perform pg_temp.expect_denied(
    'authenticated cannot call response RPC directly',
    $q$select public.respond_to_my_scheduling_request(
      'user_schedule_seeker_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_a'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_a')
    )$q$,
    'permission denied for function respond_to_my_scheduling_request'
  );
  perform pg_temp.expect_denied(
    'authenticated cannot call cancellation RPC directly',
    $q$select public.cancel_my_scheduling_request(
      'user_schedule_host_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')
    )$q$,
    'permission denied for function cancel_my_scheduling_request'
  );
  perform pg_temp.expect_denied(
    'authenticated cannot call resolution RPC directly',
    $q$select public.resolve_my_host_scheduling_request(
      'user_schedule_host_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_a'),
      'completed'
    )$q$,
    'permission denied for function resolve_my_host_scheduling_request'
  );

  perform pg_temp.expect_denied(
    'authenticated cannot insert scheduling requests',
    $q$insert into public.scheduling_requests (
      id, application_id, listing_title, meeting_type, duration_minutes, proposal_timezone,
      meeting_details, expires_at
    ) values (
      '88400000-0000-4000-8000-00000000000a',
      '88300000-0000-4000-8000-00000000000a',
      'Direct insert listing', 'video', 30, 'UTC', 'Direct insert',
      clock_timestamp() + interval '11 days'
    )$q$,
    'permission denied for table scheduling_requests'
  );
  perform pg_temp.expect_denied(
    'authenticated cannot update scheduling requests',
    $q$update public.scheduling_requests set meeting_details = 'Direct update'
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    'permission denied for table scheduling_requests'
  );
  perform pg_temp.expect_denied(
    'authenticated cannot delete scheduling requests',
    $q$delete from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    'permission denied for table scheduling_requests'
  );
  perform pg_temp.expect_denied(
    'authenticated cannot insert scheduling options',
    $q$insert into public.scheduling_options (
      scheduling_request_id, proposal_round, starts_at, ends_at
    ) values (
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_a'), 1,
      clock_timestamp() + interval '2 days 1 hour',
      clock_timestamp() + interval '2 days 1 hour 30 minutes'
    )$q$,
    'permission denied for table scheduling_options'
  );
  perform pg_temp.expect_denied(
    'authenticated cannot update scheduling options',
    $q$update public.scheduling_options set ends_at = ends_at + interval '15 minutes'
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'opt_a')$q$,
    'permission denied for table scheduling_options'
  );
  perform pg_temp.expect_denied(
    'authenticated cannot delete scheduling options',
    $q$delete from public.scheduling_options
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'opt_a')$q$,
    'permission denied for table scheduling_options'
  );

  perform pg_temp.checkpoint_section('2 authenticated mutation boundary', 10);
end;
$do$;
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $do$
begin
  perform pg_temp.expect_denied(
    'anon cannot read scheduling requests',
    $q$select 1 from public.scheduling_requests$q$,
    'permission denied for table scheduling_requests'
  );
  perform pg_temp.expect_denied(
    'anon cannot read scheduling options',
    $q$select 1 from public.scheduling_options$q$,
    'permission denied for table scheduling_options'
  );
  perform pg_temp.checkpoint_section('2b anon boundary', 2);
end;
$do$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Host RLS: own application schedule is visible, the other tenant is zero.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_schedule_host_a","role":"authenticated"}';
do $do$
begin
  perform pg_temp.expect_rows(
    'host A sees its request',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host A cannot see host B request',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host A sees its request option',
    $q$select 1 from public.scheduling_options
        where scheduling_request_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host A cannot see host B options',
    $q$select 1 from public.scheduling_options
        where scheduling_request_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')$q$,
    0
  );
  perform pg_temp.checkpoint_section('3a host A row ownership', 4);
end;
$do$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_schedule_host_b","role":"authenticated"}';
do $do$
begin
  perform pg_temp.expect_rows(
    'host B sees its request',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host B cannot see host A request',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'host B sees its request option',
    $q$select 1 from public.scheduling_options
        where scheduling_request_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'host B cannot see host A options',
    $q$select 1 from public.scheduling_options
        where scheduling_request_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    0
  );
  perform pg_temp.checkpoint_section('3b host B row ownership', 4);
end;
$do$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Seeker RLS is symmetric with host RLS.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_schedule_seeker_a","role":"authenticated"}';
do $do$
begin
  perform pg_temp.expect_rows(
    'seeker A sees its request',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'seeker A cannot see seeker B request',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'seeker A sees its request option',
    $q$select 1 from public.scheduling_options
        where scheduling_request_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'seeker A cannot see seeker B options',
    $q$select 1 from public.scheduling_options
        where scheduling_request_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')$q$,
    0
  );
  perform pg_temp.checkpoint_section('4a seeker A row ownership', 4);
end;
$do$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_schedule_seeker_b","role":"authenticated"}';
do $do$
begin
  perform pg_temp.expect_rows(
    'seeker B sees its request',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'seeker B cannot see seeker A request',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    0
  );
  perform pg_temp.expect_rows(
    'seeker B sees its request option',
    $q$select 1 from public.scheduling_options
        where scheduling_request_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'seeker B cannot see seeker A options',
    $q$select 1 from public.scheduling_options
        where scheduling_request_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    0
  );
  perform pg_temp.checkpoint_section('4b seeker B row ownership', 4);
end;
$do$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Service RPC ownership, current-round selection and alternate proposals.
-- ---------------------------------------------------------------------------

set local role service_role;
do $do$
begin
  perform pg_temp.expect_rows(
    'owned proposal created one request for the application',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')
          and application_id = '88300000-0000-4000-8000-000000000001'
          and listing_title = 'Schedule listing A'
          and status = 'proposed'$q$,
    1
  );
  perform pg_temp.expect_denied(
    'service writes cannot rewrite the proposal listing identity snapshot',
    $q$update public.scheduling_requests
          set listing_title = 'Rewritten listing title'
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    'scheduling_listing_title_immutable',
    '23514'
  );
  perform pg_temp.expect_denied(
    'a foreign host cannot propose for another host application',
    $q$select public.propose_my_host_scheduling_request(
      'user_schedule_host_b', '88300000-0000-4000-8000-00000000000a',
      'video', 30, 'UTC', 'Foreign proposal',
      array[clock_timestamp() + interval '11 days']
    )$q$,
    'scheduling_forbidden'
  );
  perform pg_temp.expect_rows(
    'a foreign seeker cannot answer another seeker request',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_b',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_wrong'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_wrong')
    )$q$,
    0
  );
  perform pg_temp.expect_rows(
    'a current seeker cannot select an option from the wrong round',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_c',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_wrong'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_wrong_round_2')
    )$q$,
    0
  );
  perform pg_temp.expect_denied(
    'service writes cannot bypass selected-option round integrity',
    $q$update public.scheduling_requests
          set status = 'selected',
              selected_option_id = (
                select id from pg_temp.scheduling_fixture_ids where key = 'opt_wrong_round_2'
              )
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_wrong')$q$,
    'scheduling_selected_option_mismatch',
    '23514'
  );
  perform pg_temp.expect_rows(
    'wrong-round refusal leaves the request unchanged',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_wrong')
          and status = 'proposed' and selected_option_id is null$q$,
    1
  );
  perform pg_temp.expect_rows(
    'the owning seeker selects a current-round option',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_a'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_a')
    )$q$,
    1
  );
  perform pg_temp.expect_rows(
    'a repeated selection is a no-op',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_a'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_a')
    )$q$,
    0
  );
  perform pg_temp.expect_rows(
    'a foreign host cannot cancel another host request',
    $q$select 1 where public.cancel_my_scheduling_request(
      'user_schedule_host_b',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_cancel')
    ) is not null$q$,
    0
  );
  perform pg_temp.expect_rows(
    'the owning host cancels its request with a derived actor',
    $q$select 1 where public.cancel_my_scheduling_request(
      'user_schedule_host_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_cancel')
    ) = 'host'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'a repeated cancellation is a no-op',
    $q$select 1 where public.cancel_my_scheduling_request(
      'user_schedule_host_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_cancel')
    ) is not null$q$,
    0
  );
  perform pg_temp.expect_rows(
    'the owning seeker requests alternatives',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_b',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_b'),
      'alternate_requested', null
    )$q$,
    1
  );
  perform pg_temp.expect_rows(
    'the owning host appends round two to the same request',
    $q$select 1 where public.propose_my_host_scheduling_request(
      'user_schedule_host_b', '88300000-0000-4000-8000-000000000002',
      'video', 45, 'America/New_York', 'Schedule B round two',
      array[date_trunc('hour', now()) + interval '10 days']
    ) = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'round two advances and preserves both immutable option rounds',
    $q$select 1 from public.scheduling_requests r
        where r.id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')
          and r.status = 'proposed' and r.current_round = 2
          and r.listing_title = 'Schedule listing B'
          and (select count(*) from public.scheduling_options o
                where o.scheduling_request_id = r.id) = 2$q$,
    1
  );
  perform pg_temp.expect_rows(
    'a seeker confirms the baseline interview for overlap checks',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_overlap',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_overlap_base'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_overlap_base')
    )$q$,
    1
  );
  perform pg_temp.expect_denied(
    'the same seeker cannot confirm an overlapping interview',
    $q$select public.respond_to_my_scheduling_request(
      'user_schedule_seeker_overlap',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_overlap'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_overlap')
    )$q$,
    'scheduling_time_conflict',
    '23P01'
  );
  perform pg_temp.expect_rows(
    'overlap refusal leaves the second request actionable',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_overlap')
          and status = 'proposed' and selected_option_id is null$q$,
    1
  );
  perform pg_temp.expect_rows(
    'an exactly adjacent interview remains selectable',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_overlap',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_adjacent'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_adjacent')
    )$q$,
    1
  );

  perform pg_temp.checkpoint_section('5 service RPC ownership and rounds', 19);
end;
$do$;

insert into pg_temp.scheduling_fixture_ids (key, id)
select 'opt_b_round_2', o.id
from public.scheduling_options o
where o.scheduling_request_id = (
  select id from pg_temp.scheduling_fixture_ids where key = 'req_b'
)
  and o.proposal_round = 2;

reset role;

-- ---------------------------------------------------------------------------
-- 6. Terminal application cancellation, response expiry, sweep expiry, and
-- host-only completion/no-show outcomes.
-- ---------------------------------------------------------------------------

set local role service_role;
do $do$
begin
  perform pg_temp.expect_rows(
    'terminal-case seeker confirms its interview',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_d',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_terminal'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_terminal')
    )$q$,
    1
  );
  perform pg_temp.expect_rows(
    'completion-case seeker confirms its interview',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_f',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_resolve'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_resolve')
    )$q$,
    1
  );
  perform pg_temp.expect_rows(
    'no-show-case seeker confirms its interview',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_h',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_noshow'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_noshow')
    )$q$,
    1
  );
end;
$do$;
reset role;

update public.scheduling_requests
set expires_at = clock_timestamp() - interval '1 minute'
where id in (
  (select id from pg_temp.scheduling_fixture_ids where key = 'req_expiry'),
  (select id from pg_temp.scheduling_fixture_ids where key = 'req_wrong')
);

update public.scheduling_options
set starts_at = clock_timestamp() - interval '6 hours',
    ends_at = clock_timestamp() - interval '5 hours'
where id = (select id from pg_temp.scheduling_fixture_ids where key = 'opt_resolve');

-- Five minutes after the start is still inside the explicit 15-minute no-show
-- grace period. The option is moved farther into the past only after that
-- refusal has been observed.
update public.scheduling_options
set starts_at = clock_timestamp() - interval '5 minutes',
    ends_at = clock_timestamp() + interval '25 minutes'
where id = (select id from pg_temp.scheduling_fixture_ids where key = 'opt_noshow');

set local role service_role;
do $do$
begin
  perform pg_temp.expect_rows(
    'a foreign host cannot resolve another host interview',
    $q$select 1 where public.resolve_my_host_scheduling_request(
      'user_schedule_host_b',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_resolve'),
      'completed'
    )$q$,
    0
  );
  perform pg_temp.expect_rows(
    'owning host completes a past interview',
    $q$select 1 where public.resolve_my_host_scheduling_request(
      'user_schedule_host_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_resolve'),
      'completed'
    )$q$,
    1
  );
  perform pg_temp.expect_rows(
    'completed interview cannot be resolved twice',
    $q$select 1 where public.resolve_my_host_scheduling_request(
      'user_schedule_host_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_resolve'),
      'completed'
    )$q$,
    0
  );
  perform pg_temp.expect_rows(
    'no-show is refused inside the fifteen-minute grace period',
    $q$select 1 where public.resolve_my_host_scheduling_request(
      'user_schedule_host_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_noshow'),
      'no_show'
    )$q$,
    0
  );
end;
$do$;
reset role;

update public.scheduling_options
set starts_at = clock_timestamp() - interval '6 hours',
    ends_at = clock_timestamp() - interval '5 hours'
where id = (select id from pg_temp.scheduling_fixture_ids where key = 'opt_noshow');

set local role service_role;
do $do$
begin
  perform pg_temp.expect_rows(
    'owning host records no-show after the interview and grace window',
    $q$select 1 where public.resolve_my_host_scheduling_request(
      'user_schedule_host_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_noshow'),
      'no_show'
    )$q$,
    1
  );
  perform pg_temp.expect_rows(
    'no-show cannot be recorded twice',
    $q$select 1 where public.resolve_my_host_scheduling_request(
      'user_schedule_host_a',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_noshow'),
      'no_show'
    )$q$,
    0
  );
  perform pg_temp.expect_rows(
    'responding to a stale proposal refuses and expires it',
    $q$select 1 where public.respond_to_my_scheduling_request(
      'user_schedule_seeker_e',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_expiry'),
      'selected',
      (select id from pg_temp.scheduling_fixture_ids where key = 'opt_expiry')
    )$q$,
    0
  );
  perform pg_temp.expect_rows(
    'response-time expiry clears selection and records response time',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_expiry')
          and status = 'expired'
          and selected_option_id is null
          and responded_at is not null$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'service expiry sweep reaches exactly one stale proposal',
    $q$update public.scheduling_requests
          set status = 'expired'
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_wrong')
          and status in ('proposed', 'alternate_requested')
          and expires_at <= clock_timestamp()$q$,
    1
  );
  perform pg_temp.expect_rows(
    'sweep expiry leaves no selected option',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_wrong')
          and status = 'expired' and selected_option_id is null$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'selected request can expire through the canonical lifecycle edge',
    $q$update public.scheduling_requests
          set status = 'expired'
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_overlap_base')
          and status = 'selected'
          and expires_at <= clock_timestamp()$q$,
    1
  );
  perform pg_temp.expect_rows(
    'selected expiry retains the chosen option for audit',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_overlap_base')
          and status = 'expired'
          and selected_option_id = (
            select id from pg_temp.scheduling_fixture_ids where key = 'opt_overlap_base'
          )$q$,
    1
  );
  perform pg_temp.expect_write_rows(
    'terminal application transition updates exactly one application',
    $q$update public.applications
          set status = 'not_selected', decided_at = clock_timestamp()
        where id = '88300000-0000-4000-8000-000000000004'
          and status = 'reviewing'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'terminal application cancels the interview and retains chosen time',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_terminal')
          and status = 'cancelled'
          and cancelled_by = 'platform'
          and cancelled_at is not null
          and selected_option_id = (
            select id from pg_temp.scheduling_fixture_ids where key = 'opt_terminal'
          )$q$,
    1
  );

  perform pg_temp.checkpoint_section('6 lifecycle expiry and outcomes', 17);
end;
$do$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Nullable legacy ownership must fail closed.
-- ---------------------------------------------------------------------------

set local role service_role;
do $do$
begin
  perform pg_temp.expect_rows(
    'unrelated identity cannot cancel a nullable legacy request',
    $q$select 1 where public.cancel_my_scheduling_request(
      'user_schedule_attacker',
      (select id from pg_temp.scheduling_fixture_ids where key = 'req_legacy')
    ) is not null$q$,
    0
  );
end;
$do$;
reset role;

do $do$
begin
  perform pg_temp.expect_rows(
    'legacy request remains proposed after attacker cancellation',
    $q$select 1 from public.scheduling_requests
        where id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_legacy')
          and status = 'proposed'
          and cancelled_at is null
          and cancelled_by is null$q$,
    1
  );
  perform pg_temp.expect_rows(
    'legacy refusal emitted no cancellation event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_legacy')
          and event_type = 'scheduling_cancelled'$q$,
    0
  );
  perform pg_temp.expect_rows(
    'legacy proposal emitted its one creation event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_legacy')
          and event_type = 'scheduling_request_sent'$q$,
    1
  );
  perform pg_temp.checkpoint_section('7 nullable legacy identity', 4);
end;
$do$;

-- ---------------------------------------------------------------------------
-- 8. Every state transition emits exactly one canonical event in the same
-- transaction. Repeated/no-op calls above must not add a duplicate.
-- ---------------------------------------------------------------------------

do $do$
begin
  perform pg_temp.expect_rows(
    'proposal event carries canonical host context',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')
          and event_type = 'scheduling_request_sent'
          and actor_scope = 'host'
          and subject_type = 'scheduling_request'
          and listing_id = '88200000-0000-4000-8000-00000000000a'
          and host_profile_id = '88000000-0000-4000-8000-00000000000a'
          and seeker_profile_id = '88100000-0000-4000-8000-000000000001'
          and source_surface = 'scheduling_lifecycle_trigger'
          and properties ->> 'applicationId' = '88300000-0000-4000-8000-000000000001'
          and properties ->> 'status' = 'proposed'
          and properties ->> 'round' = '1'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'selection event is emitted once by the seeker transition',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')
          and event_type = 'scheduling_time_selected'
          and actor_scope = 'seeker'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'repeated selection added no third event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_a')$q$,
    2
  );
  perform pg_temp.expect_rows(
    'alternate request preserves one round-one sent event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')
          and event_type = 'scheduling_request_sent'
          and properties ->> 'round' = '1'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'alternate request emits one seeker event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')
          and event_type = 'scheduling_alternate_requested'
          and actor_scope = 'seeker'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'reproposal emits one round-two sent event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')
          and event_type = 'scheduling_request_sent'
          and properties ->> 'round' = '2'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'alternate and reproposal produced exactly three events',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_b')$q$,
    3
  );
  perform pg_temp.expect_rows(
    'host cancellation emits one derived-host event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_cancel')
          and event_type = 'scheduling_cancelled'
          and actor_scope = 'host'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'repeated host cancellation added no third event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_cancel')$q$,
    2
  );
  perform pg_temp.expect_rows(
    'terminal request records its one selection',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_terminal')
          and event_type = 'scheduling_time_selected'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'terminal application cancellation emits one platform event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_terminal')
          and event_type = 'scheduling_cancelled'
          and actor_scope = 'platform'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'terminal cancellation produced exactly three request events',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_terminal')$q$,
    3
  );
  perform pg_temp.expect_rows(
    'response-time expiry emits one platform event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_expiry')
          and event_type = 'scheduling_expired'
          and actor_scope = 'platform'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'sweep expiry emits one platform event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_wrong')
          and event_type = 'scheduling_expired'
          and actor_scope = 'platform'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'overlap baseline selection emits exactly once',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_overlap_base')
          and event_type = 'scheduling_time_selected'
          and actor_scope = 'seeker'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'selected-to-expired emits once and attributes the platform',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_overlap_base')
          and event_type = 'scheduling_expired'
          and actor_scope = 'platform'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'overlap conflict emitted no selection event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_overlap')$q$,
    1
  );
  perform pg_temp.expect_rows(
    'adjacent non-overlap selection emits exactly once',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_adjacent')
          and event_type = 'scheduling_time_selected'
          and actor_scope = 'seeker'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'completion emits once despite a repeated resolve call',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_resolve')
          and event_type = 'scheduling_completed'
          and actor_scope = 'host'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'no-show emits once despite a repeated resolve call',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_noshow')
          and event_type = 'scheduling_no_show_reported'
          and actor_scope = 'host'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'legacy request has only its proposal event',
    $q$select 1 from public.events
        where subject_id = (select id from pg_temp.scheduling_fixture_ids where key = 'req_legacy')
          and event_type = 'scheduling_request_sent'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'fixture graph has exactly thirteen request-sent events',
    $q$select e.id from public.events e
        join pg_temp.scheduling_fixture_ids i on i.id = e.subject_id
        where i.key like 'req_%'
          and e.event_type = 'scheduling_request_sent'$q$,
    13
  );
  perform pg_temp.expect_rows(
    'fixture graph has exactly twenty-seven lifecycle events',
    $q$select e.id from public.events e
        join pg_temp.scheduling_fixture_ids i on i.id = e.subject_id
        where i.key like 'req_%'$q$,
    27
  );
  perform pg_temp.expect_rows(
    'every lifecycle event has complete canonical context',
    $q$select e.id from public.events e
        join pg_temp.scheduling_fixture_ids i on i.id = e.subject_id
        where i.key like 'req_%'
          and e.subject_type = 'scheduling_request'
          and e.listing_id is not null
          and e.host_profile_id is not null
          and e.seeker_profile_id is not null
          and e.actor_scope is not null
          and e.source_surface = 'scheduling_lifecycle_trigger'
          and e.properties ? 'applicationId'
          and e.properties ? 'status'
          and e.properties ? 'round'$q$,
    27
  );

  perform pg_temp.checkpoint_section('8 transactional event exactness', 24);
end;
$do$;

-- Eleven exact sections above: 67 positive controls and 38 refusals.
select pg_temp.assert_suite_complete(
  'interview-scheduling',
  11,
  67,
  38
);

rollback;
