-- assert_application_submission_authority.sql
-- Connected proof for migration 091. Runs only against a local database,
-- inside one transaction, and leaves no rows behind.

\set ON_ERROR_STOP on

begin;

\ir _assert_helpers.sql

-- ---------------------------------------------------------------------------
-- Fixtures: verified inventory across every availability boundary, one sourced
-- listing, complete/incomplete seekers, and each invite-attribution shape.
-- Fixture writes run as the connecting superuser so the assertions can isolate
-- the authenticated database boundary rather than setup RLS.
-- ---------------------------------------------------------------------------

insert into public.host_profiles (
  id, clerk_user_id, company_name, slug, category_scopes, public_status
)
values
  (
    '9100a000-0000-4000-8000-000000000001', ' user_submit_host_a ',
    'Submission Host A', 'submission-host-a', array['farm'], 'active'
  ),
  (
    '9100b000-0000-4000-8000-000000000002', 'user_submit_host_expired',
    'Expired-only Submission Host', 'submission-host-expired', array['farm'], 'active'
  ),
  (
    '9100c000-0000-4000-8000-000000000003', 'user_submit_host_null',
    'Null-expiry Submission Host', 'submission-host-null', array['farm'], 'active'
  ),
  (
    '9100d000-0000-4000-8000-000000000004', 'user_submit_host_draft',
    'Draft-only Submission Host', 'submission-host-draft', array['farm'], 'active'
  ),
  (
    '9100e000-0000-4000-8000-000000000005', '   ',
    'Identity-less Submission Host', 'submission-host-no-identity', array['farm'], 'active'
  );

insert into public.seeker_profiles (
  id, clerk_user_id, display_name, short_bio, relative_location,
  seeking_timeline, general_skill_tags
)
values
  ('91001000-0000-4000-8000-000000000001', 'user_submit_direct',
   'Direct Seeker', 'Ready for a season.', 'Wenatchee, WA', 'now', array['orchard']),
  ('91001000-0000-4000-8000-000000000002', 'user_submit_incomplete',
   'Incomplete Seeker', null, null, null, '{}'),
  ('91001000-0000-4000-8000-000000000003', 'user_submit_host_a',
   'Self Applying Seeker', 'Same identity as the host.', 'Wenatchee, WA', 'now', array['farm']),
  ('91001000-0000-4000-8000-000000000004', 'user_submit_invite',
   'Invited Seeker', 'Ready for an invitation.', 'Tacoma, WA', '1_month', array['hospitality']),
  ('91001000-0000-4000-8000-000000000005', 'user_submit_invite_null',
   'Null Invite Seeker', 'Ready for an invitation.', 'Olympia, WA', '1_month', array['hospitality']),
  ('91001000-0000-4000-8000-000000000006', 'user_submit_invite_expired',
   'Expired Invite Seeker', 'Ready for an invitation.', 'Yakima, WA', '1_month', array['hospitality']),
  ('91001000-0000-4000-8000-000000000007', 'user_submit_invite_mismatch',
   'Mismatch Invite Seeker', 'Ready for an invitation.', 'Spokane, WA', '1_month', array['hospitality']),
  ('91001000-0000-4000-8000-000000000008', 'user_submit_adopt',
   'Adoption Seeker', 'Already applied directly.', 'Portland, OR', '3_months', array['operations']),
  ('91001000-0000-4000-8000-000000000009', 'user_submit_reactivate',
   'Reactivation Seeker', 'May return to the same application.', 'Boise, ID', '3_months', array['operations']),
  ('91001000-0000-4000-8000-00000000000a', 'user_submit_invite_host_mismatch',
   'Host Mismatch Seeker', 'Ready for an invitation.', 'Bend, OR', '6_months', array['operations']),
  ('91001000-0000-4000-8000-00000000000b', 'user_submit_invite_ignored',
   'Ignored Invite Seeker', 'Ready for an invitation.', 'Missoula, MT', '6_months', array['operations']);

insert into public.listing_sources (
  id, name, kind, compliance_status, compliance_notes
)
values (
  '91009000-0000-4000-8000-000000000001',
  'Submission authority fixture source', 'json', 'approved',
  'Local rollback-only authorization fixture.'
);

insert into public.listings (
  id, host_profile_id, title, category, status, provenance,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence,
  compensation_min_cents, compensation_unit, expires_at
)
values
  (
    '91006000-0000-4000-8000-000000000001',
    '9100a000-0000-4000-8000-000000000001',
    'Accepting verified listing', 'farm', 'live', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2500, 'hour', clock_timestamp() + interval '30 days'
  ),
  (
    '91006000-0000-4000-8000-000000000002',
    '9100b000-0000-4000-8000-000000000002',
    'Expired verified listing', 'farm', 'live', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2500, 'hour', clock_timestamp() - interval '1 day'
  ),
  (
    '91006000-0000-4000-8000-000000000003',
    '9100c000-0000-4000-8000-000000000003',
    'Null-expiry verified listing', 'farm', 'live', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2500, 'hour', clock_timestamp() + interval '30 days'
  ),
  (
    '91006000-0000-4000-8000-000000000004',
    '9100d000-0000-4000-8000-000000000004',
    'Draft verified listing', 'farm', 'draft', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2500, 'hour', clock_timestamp() + interval '30 days'
  ),
  (
    '91006000-0000-4000-8000-000000000005',
    '9100e000-0000-4000-8000-000000000005',
    'Host identity missing listing', 'farm', 'live', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2500, 'hour', clock_timestamp() + interval '30 days'
  ),
  (
    '91006000-0000-4000-8000-000000000007',
    '9100a000-0000-4000-8000-000000000001',
    'Second accepting verified listing', 'farm', 'live', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2600, 'hour', clock_timestamp() + interval '30 days'
  );

insert into public.listings (
  id, host_profile_id, title, category, status, provenance,
  source_id, source_name, source_status, claim_summary,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence, expires_at
)
values (
  '91006000-0000-4000-8000-000000000006', null,
  'Sourced listing without a platform host', 'farm', 'live', 'sourced',
  '91009000-0000-4000-8000-000000000001',
  'Submission authority fixture source', 'active', 'unclaimed',
  false, false, 'not_stated', 'not_stated', 'not_stated',
  clock_timestamp() + interval '30 days'
);

-- The listing insert trigger fills NULL expiries by design. Clear this one
-- after insertion to prove 091 fails closed on legacy/corrupt inventory.
update public.listings
   set expires_at = null
 where id = '91006000-0000-4000-8000-000000000003';

insert into public.invites (
  id, listing_id, host_profile_id, seeker_profile_id, status, expires_at
)
values
  (
    '91007000-0000-4000-8000-000000000001',
    '91006000-0000-4000-8000-000000000001',
    '9100a000-0000-4000-8000-000000000001',
    '91001000-0000-4000-8000-000000000004',
    'created', clock_timestamp() + interval '10 days'
  ),
  (
    '91007000-0000-4000-8000-000000000002',
    '91006000-0000-4000-8000-000000000001',
    '9100a000-0000-4000-8000-000000000001',
    '91001000-0000-4000-8000-000000000005',
    'created', clock_timestamp() + interval '10 days'
  ),
  (
    '91007000-0000-4000-8000-000000000003',
    '91006000-0000-4000-8000-000000000001',
    '9100a000-0000-4000-8000-000000000001',
    '91001000-0000-4000-8000-000000000006',
    'delivered', clock_timestamp() - interval '1 minute'
  ),
  (
    '91007000-0000-4000-8000-000000000004',
    '91006000-0000-4000-8000-000000000007',
    '9100a000-0000-4000-8000-000000000001',
    '91001000-0000-4000-8000-000000000007',
    'created', clock_timestamp() + interval '10 days'
  ),
  (
    '91007000-0000-4000-8000-000000000005',
    '91006000-0000-4000-8000-000000000001',
    '9100a000-0000-4000-8000-000000000001',
    '91001000-0000-4000-8000-000000000008',
    'created', clock_timestamp() + interval '10 days'
  ),
  (
    '91007000-0000-4000-8000-000000000006',
    '91006000-0000-4000-8000-000000000001',
    '9100a000-0000-4000-8000-000000000001',
    '91001000-0000-4000-8000-000000000009',
    'created', clock_timestamp() + interval '10 days'
  ),
  (
    '91007000-0000-4000-8000-000000000007',
    '91006000-0000-4000-8000-000000000001',
    '9100b000-0000-4000-8000-000000000002',
    '91001000-0000-4000-8000-00000000000a',
    'created', clock_timestamp() + interval '10 days'
  ),
  (
    '91007000-0000-4000-8000-000000000008',
    '91006000-0000-4000-8000-000000000001',
    '9100a000-0000-4000-8000-000000000001',
    '91001000-0000-4000-8000-00000000000b',
    'ignored', clock_timestamp() + interval '10 days'
  );

-- The invite insert trigger also fills NULL. Preserve an explicit legacy NULL
-- row after insertion so fail-closed attribution is behaviorally pinned.
update public.invites
   set expires_at = null
 where id = '91007000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- Catalog boundary: the RPC is the only client submission surface. The two
-- seeker-controlled lifecycle columns remain writable; submission metadata is
-- neither table-writable nor column-writable.
-- ---------------------------------------------------------------------------

do $do$
begin
  if not has_function_privilege(
    'authenticated',
    'public.submit_my_application(uuid,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'application authority: authenticated lost RPC execution';
  end if;

  if has_function_privilege(
    'anon',
    'public.submit_my_application(uuid,text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.submit_my_application(uuid,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'application authority: a non-authenticated client can execute the RPC';
  end if;

  if has_table_privilege('authenticated', 'public.applications', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.applications', 'INSERT')
     or has_table_privilege('anon', 'public.applications', 'INSERT')
     or has_any_column_privilege('anon', 'public.applications', 'INSERT') then
    raise exception 'application authority: a client role can bypass RPC with INSERT';
  end if;

  if has_table_privilege('authenticated', 'public.applications', 'UPDATE') then
    raise exception 'application authority: authenticated regained table-wide UPDATE';
  end if;

  if not has_column_privilege('authenticated', 'public.applications', 'status', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.applications', 'withdrawn_reason', 'UPDATE') then
    raise exception 'application authority: legitimate seeker lifecycle columns lost UPDATE';
  end if;

  if has_column_privilege('authenticated', 'public.applications', 'cover_message', 'UPDATE')
     or has_column_privilege('authenticated', 'public.applications', 'reactivated_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.applications', 'source', 'UPDATE')
     or has_column_privilege('authenticated', 'public.applications', 'origin_invite_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.applications', 'expires_at', 'UPDATE') then
    raise exception 'application authority: server-authored application columns remain client-writable';
  end if;

  if exists (
    select 1
      from pg_policies p
     where p.schemaname = 'public'
       and p.tablename = 'applications'
       and p.cmd in ('INSERT', 'ALL')
       and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
  ) then
    raise exception 'application authority: a client INSERT policy still exists';
  end if;

  if not exists (
    select 1
      from pg_trigger t
     where t.tgrelid = 'public.applications'::regclass
       and t.tgname = 'trg_applications_submission_authority'
       and not t.tgisinternal
       and t.tgenabled <> 'D'
  ) then
    raise exception 'application authority: defense trigger is absent or disabled';
  end if;

  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.oid = 'public.submit_my_application(uuid,text,uuid)'::regprocedure
       and p.prosecdef
       and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
  ) then
    raise exception 'application authority: RPC is not SECURITY DEFINER with a pinned search_path';
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- Public inventory and public host reachability share one real-future rule.
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'anon sees the future live verified listing',
    $q$select 1 from public.listings where id = '91006000-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'anon still sees future live sourced disclosure inventory',
    $q$select 1 from public.listings where id = '91006000-0000-4000-8000-000000000006'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'anon cannot see an expired live-status listing',
    $q$select 1 from public.listings where id = '91006000-0000-4000-8000-000000000002'$q$,
    0
  );
  perform pg_temp.expect_rows(
    'anon cannot see a null-expiry live-status listing',
    $q$select 1 from public.listings where id = '91006000-0000-4000-8000-000000000003'$q$,
    0
  );
  perform pg_temp.expect_rows(
    'anon cannot see a future draft listing',
    $q$select 1 from public.listings where id = '91006000-0000-4000-8000-000000000004'$q$,
    0
  );
  perform pg_temp.expect_rows(
    'anon sees a host backed by future live inventory',
    $q$select 1 from public.host_profiles where id = '9100a000-0000-4000-8000-000000000001'$q$,
    1
  );
  perform pg_temp.expect_rows(
    'anon cannot see an expired-only host',
    $q$select 1 from public.host_profiles where id = '9100b000-0000-4000-8000-000000000002'$q$,
    0
  );
  perform pg_temp.expect_rows(
    'anon cannot see a null-expiry-only host',
    $q$select 1 from public.host_profiles where id = '9100c000-0000-4000-8000-000000000003'$q$,
    0
  );
  perform pg_temp.expect_rows(
    'anon cannot see a draft-only host',
    $q$select 1 from public.host_profiles where id = '9100d000-0000-4000-8000-000000000004'$q$,
    0
  );
end;
$do$;

select pg_temp.expect_denied(
  'anon cannot execute application submission RPC',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null, null
  )$q$,
  'permission denied for function submit_my_application'
);

reset role;
set local request.jwt.claims = '{}';

-- ---------------------------------------------------------------------------
-- Stable eligibility errors. These run before any successful submission so a
-- failure cannot be explained by an existing application row.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select pg_temp.expect_denied(
  'authenticated JWT without a Clerk subject is refused',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null, null
  )$q$,
  'unauthenticated', '42501'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_missing","role":"authenticated"}';
select pg_temp.expect_denied(
  'missing seeker profile is refused',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null, null
  )$q$,
  'profile_not_found', '42501'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_incomplete","role":"authenticated"}';
select pg_temp.expect_denied(
  'incomplete resume is refused',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null, null
  )$q$,
  'resume_incomplete', '23514'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_direct","role":"authenticated"}';
do $do$
begin
  perform pg_temp.expect_denied(
    'cover message over 2000 characters is refused',
    $q$select * from public.submit_my_application(
      '91006000-0000-4000-8000-000000000001', repeat('x', 2001), null
    )$q$,
    'cover_message_too_long', '22001'
  );
  perform pg_temp.expect_denied(
    'expired listing is refused',
    $q$select * from public.submit_my_application(
      '91006000-0000-4000-8000-000000000002', null, null
    )$q$,
    'listing_not_accepting_applications', '23514'
  );
  perform pg_temp.expect_denied(
    'unknown listing is refused as unavailable',
    $q$select * from public.submit_my_application(
      '91006000-0000-4000-8000-000000000099', null, null
    )$q$,
    'listing_not_accepting_applications', '23514'
  );
  perform pg_temp.expect_denied(
    'null-expiry listing is refused',
    $q$select * from public.submit_my_application(
      '91006000-0000-4000-8000-000000000003', null, null
    )$q$,
    'listing_not_accepting_applications', '23514'
  );
  perform pg_temp.expect_denied(
    'draft listing is refused',
    $q$select * from public.submit_my_application(
      '91006000-0000-4000-8000-000000000004', null, null
    )$q$,
    'listing_not_accepting_applications', '23514'
  );
  perform pg_temp.expect_denied(
    'listing without a usable host identity is refused',
    $q$select * from public.submit_my_application(
      '91006000-0000-4000-8000-000000000005', null, null
    )$q$,
    'listing_not_accepting_applications', '23514'
  );
  perform pg_temp.expect_denied(
    'sourced listing is refused',
    $q$select * from public.submit_my_application(
      '91006000-0000-4000-8000-000000000006', null, null
    )$q$,
    'listing_not_accepting_applications', '23514'
  );
end;
$do$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_host_a","role":"authenticated"}';
select pg_temp.expect_denied(
  'whitespace-wrapped host identity cannot apply to own listing',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null, null
  )$q$,
  'cannot_apply_to_own_listing', '23514'
);
reset role;

-- ---------------------------------------------------------------------------
-- Direct create, direct-write lockout, duplicate behavior, and reactivation.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_direct","role":"authenticated"}';

do $do$
declare
  v_row record;
begin
  select * into v_row
    from public.submit_my_application(
      '91006000-0000-4000-8000-000000000001', 'Initial direct cover', null
    );

  if v_row.disposition is distinct from 'created'
     or v_row.application_id is null
     or v_row.seeker_profile_id is distinct from '91001000-0000-4000-8000-000000000001'::uuid
     or v_row.listing_id is distinct from '91006000-0000-4000-8000-000000000001'::uuid then
    raise exception 'application authority: direct RPC returned wrong identity/outcome: %', v_row;
  end if;

  if not exists (
    select 1 from public.applications a
     where a.id = v_row.application_id
       and a.status = 'applied'
       and a.source = 'direct'
       and a.origin_invite_id is null
       and a.cover_message = 'Initial direct cover'
       and a.expires_at > clock_timestamp()
  ) then
    raise exception 'application authority: direct submission row is not canonical';
  end if;

  perform pg_temp.expect_denied(
    'active direct duplicate is stable already_applied',
    $q$select * from public.submit_my_application(
      '91006000-0000-4000-8000-000000000001', null, null
    )$q$,
    'already_applied', '23505'
  );

  perform pg_temp.expect_denied(
    'authenticated cannot forge an accepted initial application',
    $q$insert into public.applications (
      listing_id, seeker_profile_id, status
    ) values (
      '91006000-0000-4000-8000-000000000007',
      '91001000-0000-4000-8000-000000000001',
      'accepted'
    )$q$,
    'permission denied for table applications'
  );

  perform pg_temp.expect_denied(
    'authenticated cannot re-author cover message directly',
    $q$update public.applications
          set cover_message = 'forged cover'
        where listing_id = '91006000-0000-4000-8000-000000000001'
          and seeker_profile_id = '91001000-0000-4000-8000-000000000001'$q$,
    'permission denied for table applications'
  );

  perform pg_temp.expect_denied(
    'authenticated cannot forge reactivated_at directly',
    $q$update public.applications
          set reactivated_at = clock_timestamp()
        where listing_id = '91006000-0000-4000-8000-000000000001'
          and seeker_profile_id = '91001000-0000-4000-8000-000000000001'$q$,
    'permission denied for table applications'
  );
end;
$do$;

reset role;
set local request.jwt.claims = '{}';

update public.applications
   set status = 'withdrawn', withdrawn_reason = 'changed_mind'
 where listing_id = '91006000-0000-4000-8000-000000000001'
   and seeker_profile_id = '91001000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_direct","role":"authenticated"}';

select pg_temp.expect_write_rows(
  'seeker cannot reactivate withdrawn row with direct UPDATE',
  $q$update public.applications
        set status = 'applied'
      where listing_id = '91006000-0000-4000-8000-000000000001'
        and seeker_profile_id = '91001000-0000-4000-8000-000000000001'$q$,
  0
);

do $do$
declare
  v_row record;
begin
  select * into v_row
    from public.submit_my_application(
      '91006000-0000-4000-8000-000000000001', null, null
    );

  if v_row.disposition is distinct from 'reactivated' then
    raise exception 'application authority: withdrawn row was not reactivated: %', v_row;
  end if;

  if not exists (
    select 1 from public.applications a
     where a.id = v_row.application_id
       and a.status = 'applied'
       and a.withdrawn_reason is null
       and a.reactivated_at is not null
       and a.cover_message = 'Initial direct cover'
       and a.expires_at > clock_timestamp()
  ) then
    raise exception 'application authority: reactivation did not stamp server facts/preserve cover';
  end if;
end;
$do$;

reset role;
set local request.jwt.claims = '{}';

-- Temporarily recreate the kind of future direct grant the defense trigger is
-- designed to survive. This local transaction rolls the policy/grant back, and
-- removes them immediately so the rest of the suite exercises the real ACL.
grant insert on public.applications to authenticated;
create policy applications_insert_trigger_probe on public.applications
  for insert to authenticated
  with check (true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_direct","role":"authenticated"}';
select pg_temp.expect_denied(
  'future grant cannot submit as another seeker',
  $q$insert into public.applications (
    listing_id, seeker_profile_id, status, source
  ) values (
    '91006000-0000-4000-8000-000000000007',
    '91001000-0000-4000-8000-000000000004',
    'applied', 'direct'
  )$q$,
  'application_identity_mismatch', '42501'
);
reset role;
set local request.jwt.claims = '{}';

drop policy applications_insert_trigger_probe on public.applications;
revoke insert on public.applications from authenticated;

-- ---------------------------------------------------------------------------
-- Invite eligibility refuses NULL/past/mismatched/foreign/inactive rows.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_invite_null","role":"authenticated"}';
select pg_temp.expect_denied(
  'null-expiry invite is not actionable',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null,
    '91007000-0000-4000-8000-000000000002'
  )$q$,
  'invite_not_actionable', '23514'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_direct","role":"authenticated"}';
select pg_temp.expect_denied(
  'actionable invite owned by another seeker is not actionable for caller',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null,
    '91007000-0000-4000-8000-000000000001'
  )$q$,
  'invite_not_actionable', '23514'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_invite_expired","role":"authenticated"}';
select pg_temp.expect_denied(
  'expired invite is not actionable',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null,
    '91007000-0000-4000-8000-000000000003'
  )$q$,
  'invite_not_actionable', '23514'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_invite_mismatch","role":"authenticated"}';
select pg_temp.expect_denied(
  'same-seeker invite for another listing is not actionable',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null,
    '91007000-0000-4000-8000-000000000004'
  )$q$,
  'invite_not_actionable', '23514'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_invite_host_mismatch","role":"authenticated"}';
select pg_temp.expect_denied(
  'invite whose host does not own the listing is not actionable',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null,
    '91007000-0000-4000-8000-000000000007'
  )$q$,
  'invite_not_actionable', '23514'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_invite_ignored","role":"authenticated"}';
select pg_temp.expect_denied(
  'inactive invite is not actionable',
  $q$select * from public.submit_my_application(
    '91006000-0000-4000-8000-000000000001', null,
    '91007000-0000-4000-8000-000000000008'
  )$q$,
  'invite_not_actionable', '23514'
);
reset role;

-- ---------------------------------------------------------------------------
-- Invite create is one transaction: application attribution and invite
-- delivered/applied/link/response facts all commit together. Retry is stable.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_invite","role":"authenticated"}';

do $do$
declare
  v_row record;
  v_retry record;
begin
  select * into v_row
    from public.submit_my_application(
      '91006000-0000-4000-8000-000000000001', 'Invite cover',
      '91007000-0000-4000-8000-000000000001'
    );

  if v_row.disposition is distinct from 'created' then
    raise exception 'application authority: invite did not create application: %', v_row;
  end if;

  if not exists (
    select 1
      from public.applications a
      join public.invites i on i.application_id = a.id
     where a.id = v_row.application_id
       and a.source = 'invite'
       and a.origin_invite_id = '91007000-0000-4000-8000-000000000001'
       and a.status = 'applied'
       and i.id = '91007000-0000-4000-8000-000000000001'
       and i.status = 'applied'
       and i.delivered_at is not null
       and i.responded_at is not null
  ) then
    raise exception 'application authority: invite conversion facts are not atomic/canonical';
  end if;

  select * into v_retry
    from public.submit_my_application(
      '91006000-0000-4000-8000-000000000001', null,
      '91007000-0000-4000-8000-000000000001'
    );

  if v_retry.disposition is distinct from 'existing'
     or v_retry.application_id is distinct from v_row.application_id then
    raise exception 'application authority: invite retry did not return durable application: %', v_retry;
  end if;
end;
$do$;

reset role;
set local request.jwt.claims = '{}';

-- ---------------------------------------------------------------------------
-- An actionable invite adopts an existing direct application without creating
-- another row or rewriting the application's original direct attribution.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_adopt","role":"authenticated"}';

do $do$
declare
  v_created record;
  v_adopted record;
  v_before integer;
  v_after integer;
begin
  select * into v_created
    from public.submit_my_application(
      '91006000-0000-4000-8000-000000000001', null, null
    );
  select count(*) into v_before
    from public.applications
   where seeker_profile_id = '91001000-0000-4000-8000-000000000008';

  select * into v_adopted
    from public.submit_my_application(
      '91006000-0000-4000-8000-000000000001', null,
      '91007000-0000-4000-8000-000000000005'
    );
  select count(*) into v_after
    from public.applications
   where seeker_profile_id = '91001000-0000-4000-8000-000000000008';

  if v_created.disposition is distinct from 'created'
     or v_adopted.disposition is distinct from 'existing'
     or v_adopted.application_id is distinct from v_created.application_id
     or v_before <> 1
     or v_after <> 1 then
    raise exception 'application authority: invite adoption duplicated or replaced application';
  end if;

  if not exists (
    select 1
      from public.applications a
      join public.invites i on i.application_id = a.id
     where a.id = v_created.application_id
       and a.source = 'direct'
       and a.origin_invite_id is null
       and i.id = '91007000-0000-4000-8000-000000000005'
       and i.status = 'applied'
       and i.responded_at is not null
  ) then
    raise exception 'application authority: invite adoption attribution/linkage is wrong';
  end if;
end;
$do$;

reset role;
set local request.jwt.claims = '{}';

-- ---------------------------------------------------------------------------
-- Invite-driven reactivation may re-author attribution; a later direct
-- reactivation preserves that application's historical invite origin.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_reactivate","role":"authenticated"}';
select * from public.submit_my_application(
  '91006000-0000-4000-8000-000000000001', 'Original direct cover', null
);
reset role;
set local request.jwt.claims = '{}';

update public.applications
   set status = 'withdrawn', withdrawn_reason = 'changed_mind'
 where seeker_profile_id = '91001000-0000-4000-8000-000000000009'
   and listing_id = '91006000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_reactivate","role":"authenticated"}';

do $do$
declare
  v_row record;
begin
  select * into v_row
    from public.submit_my_application(
      '91006000-0000-4000-8000-000000000001', 'Invite-authored cover',
      '91007000-0000-4000-8000-000000000006'
    );

  if v_row.disposition is distinct from 'reactivated'
     or not exists (
       select 1 from public.applications a
        where a.id = v_row.application_id
          and a.source = 'invite'
          and a.origin_invite_id = '91007000-0000-4000-8000-000000000006'
          and a.cover_message = 'Invite-authored cover'
          and a.reactivated_at is not null
     ) then
    raise exception 'application authority: invite reactivation attribution is wrong';
  end if;
end;
$do$;

reset role;
set local request.jwt.claims = '{}';

update public.applications
   set status = 'withdrawn', withdrawn_reason = 'changed_mind_again'
 where seeker_profile_id = '91001000-0000-4000-8000-000000000009'
   and listing_id = '91006000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_submit_reactivate","role":"authenticated"}';

do $do$
declare
  v_row record;
begin
  select * into v_row
    from public.submit_my_application(
      '91006000-0000-4000-8000-000000000001', null, null
    );

  if v_row.disposition is distinct from 'reactivated'
     or not exists (
       select 1 from public.applications a
        where a.id = v_row.application_id
          and a.source = 'invite'
          and a.origin_invite_id = '91007000-0000-4000-8000-000000000006'
          and a.cover_message = 'Invite-authored cover'
          and a.status = 'applied'
          and a.withdrawn_reason is null
     ) then
    raise exception 'application authority: direct reactivation lost historical attribution/cover';
  end if;
end;
$do$;

reset role;
set local request.jwt.claims = '{}';

rollback;
