-- assert_host_seeker_discovery.sql
-- Connected, rollback-only proof for migration 094. The runner is deliberately
-- single-session, so it pins the shared application/invite advisory key and
-- lock order structurally. The separate assert-invite-delivery-concurrency.mjs
-- runner proves both lock orderings with real concurrent sessions.

\set ON_ERROR_STOP on

begin;

\ir _assert_helpers.sql

-- ---------------------------------------------------------------------------
-- Fixtures: two active hosts, one inactive host, verified live inventory, and
-- every seeker sourceability boundary. Setup runs as the connecting superuser.
-- ---------------------------------------------------------------------------

insert into public.host_profiles (
  id, clerk_user_id, company_name, slug, category_scopes,
  public_status, account_status
)
values
  (
    '9400a000-0000-4000-8000-000000000001', ' user_discovery_host_a ',
    'Discovery Host A', 'discovery-host-a', array['farm'], 'active', 'active'
  ),
  (
    '9400b000-0000-4000-8000-000000000002', 'user_discovery_host_b',
    'Discovery Host B', 'discovery-host-b', array['farm'], 'active', 'active'
  ),
  (
    '9400c000-0000-4000-8000-000000000003', 'user_discovery_host_paused',
    'Paused Discovery Host', 'discovery-host-paused', array['farm'], 'active', 'paused'
  );
insert into public.host_subscriptions (
  clerk_user_id, tier, billing_status
)
values (
  ' user_discovery_host_a ', 'starter', 'active'
);

insert into public.listing_sources (
  id, name, kind, compliance_status, compliance_notes
)
values (
  '94009000-0000-4000-8000-000000000001',
  'Discovery authority fixture source',
  'json',
  'approved',
  'Rollback-only migration 094 authority fixture.'
);

insert into public.listings (
  id, host_profile_id, title, category, status, provenance,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence,
  compensation_min_cents, compensation_unit, expires_at
)
values
  (
    '94006000-0000-4000-8000-000000000001',
    '9400a000-0000-4000-8000-000000000001',
    'Actionable discovery listing', 'farm', 'live', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2500, 'hour', clock_timestamp() + interval '30 days'
  ),
  (
    '94006000-0000-4000-8000-000000000002',
    '9400b000-0000-4000-8000-000000000002',
    'Foreign discovery listing', 'farm', 'live', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2500, 'hour', clock_timestamp() + interval '30 days'
  ),
  (
    '94006000-0000-4000-8000-000000000003',
    '9400c000-0000-4000-8000-000000000003',
    'Inactive-host discovery listing', 'farm', 'live', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2500, 'hour', clock_timestamp() + interval '30 days'
  ),
  (
    '94006000-0000-4000-8000-000000000004',
    '9400a000-0000-4000-8000-000000000001',
    'Draft discovery listing', 'farm', 'draft', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2500, 'hour', clock_timestamp() + interval '30 days'
  ),
  (
    '94006000-0000-4000-8000-000000000005',
    '9400a000-0000-4000-8000-000000000001',
    'Expired discovery listing', 'farm', 'live', 'verified',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    2500, 'hour', clock_timestamp() - interval '1 day'
  );

insert into public.listings (
  id, host_profile_id, title, category, status, provenance,
  source_id, source_name, source_status, claim_summary,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence, expires_at
)
values (
  '94006000-0000-4000-8000-000000000006',
  '9400a000-0000-4000-8000-000000000001',
  'Sourced discovery listing', 'farm', 'live', 'sourced',
  '94009000-0000-4000-8000-000000000001',
  'Discovery authority fixture source', 'active', 'unclaimed',
  false, false, 'not_stated', 'not_stated', 'not_stated',
  clock_timestamp() + interval '30 days'
);

insert into public.seeker_profiles (
  id, clerk_user_id, display_name, short_bio, visibility_status,
  host_discovery_enabled, onboarding_complete, deleted_at,
  general_skill_tags, desired_categories
)
values
  (
    '94001000-0000-4000-8000-000000000001', 'user_discovery_exact',
    E' \tAnna  Trail\n ', 'Exact normalized name.', 'platform',
    true, true, null, array['orchard'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-000000000002', 'user_discovery_prefix',
    'Anna Trail Guide', 'Prefix name.', 'platform',
    true, true, null, array['guiding'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-000000000003', 'user_discovery_substring',
    'Guide Anna   Trail', 'Name substring.', 'platform',
    true, true, null, array['guiding'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-000000000004', 'user_discovery_bio',
    'Bianca Rivers', E'Works with Anna\t Trail crews.', 'platform',
    true, true, null, array['operations'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-000000000005', 'user_discovery_literal',
    'Percent %_ Marker', 'Literal wildcard symbols.', 'platform',
    true, true, null, array['operations'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-000000000006', 'user_discovery_hidden',
    'Anna Trail Hidden', 'Must stay hidden.', 'hidden',
    true, true, null, array['operations'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-000000000007', 'user_discovery_incomplete',
    'Anna Trail Incomplete', 'Not onboarded.', 'platform',
    true, false, null, array['operations'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-000000000008', 'user_discovery_deleted',
    'Anna Trail Deleted', 'Soft deleted.', 'platform',
    true, true, clock_timestamp(), array['operations'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-000000000009', 'user_discovery_host_a',
    'Anna Trail Self', 'Same Clerk identity as host.', 'platform',
    false, true, null, array['operations'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-00000000000a', 'user_discovery_applicant',
    'Anna Trail Applicant', 'Already applied and now hidden.', 'hidden',
    true, true, null, array['operations'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-00000000000b', 'user_discovery_low_score',
    'Low Score Seeker', 'Below match threshold.', 'platform',
    true, true, null, array['operations'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-00000000000c', 'user_discovery_writer',
    'Writer Candidate', 'Eligible for outreach.', 'platform',
    true, true, null, array['operations'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-00000000000d', 'user_discovery_purchased',
    'Purchased Credit Candidate', 'Eligible for purchased outreach.', 'platform',
    true, true, null, array['operations'], array['farm']
  ),
  (
    '94001000-0000-4000-8000-00000000000e', 'user_discovery_platform_applicant',
    'Anna Trail Platform Applicant', 'Application exclusion control.', 'platform',
    true, true, null, array['operations'], array['farm']
  );

-- Omit host_discovery_enabled deliberately: both new rows and every profile
-- that pre-dated migration 094 must inherit the fail-closed false default.
insert into public.seeker_profiles (
  id, clerk_user_id, display_name, short_bio, visibility_status,
  onboarding_complete, deleted_at, general_skill_tags, desired_categories
)
values (
  '94001000-0000-4000-8000-00000000000f', 'user_discovery_opted_out',
  'Anna Trail Opted Out', 'Platform-visible but not discoverable.', 'platform',
  true, null, array['operations'], array['farm']
);

insert into public.applications (
  id, listing_id, seeker_profile_id, status, source
)
values
  (
    '94008000-0000-4000-8000-000000000001',
    '94006000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000a',
    'applied', 'direct'
  ),
  (
    '94008000-0000-4000-8000-000000000002',
    '94006000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000e',
    'applied', 'direct'
  ),
  (
    '94008000-0000-4000-8000-000000000003',
    '94006000-0000-4000-8000-000000000002',
    '94001000-0000-4000-8000-00000000000c',
    'applied', 'direct'
  );

insert into public.seeker_resume_experiences (
  seeker_profile_id, company_name, role_title
)
values
  (
    '94001000-0000-4000-8000-000000000002',
    'Invite-only Orchard', 'Invite-only Worker'
  ),
  (
    '94001000-0000-4000-8000-00000000000c',
    'Applicant Orchard', 'Applicant Worker'
  );

insert into public.invites (
  id, listing_id, host_profile_id, seeker_profile_id, status, expires_at
)
values
  (
    '94007000-0000-4000-8000-000000000001',
    '94006000-0000-4000-8000-000000000001',
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-000000000001',
    'created', clock_timestamp() + interval '14 days'
  ),
  (
    '94007000-0000-4000-8000-000000000002',
    '94006000-0000-4000-8000-000000000002',
    '9400b000-0000-4000-8000-000000000002',
    '94001000-0000-4000-8000-000000000002',
    'created', clock_timestamp() + interval '14 days'
  ),
  (
    '94007000-0000-4000-8000-000000000003',
    '94006000-0000-4000-8000-000000000002',
    '9400b000-0000-4000-8000-000000000002',
    '94001000-0000-4000-8000-000000000003',
    'delivered', clock_timestamp() + interval '14 days'
  ),
  (
    '94007000-0000-4000-8000-000000000004',
    '94006000-0000-4000-8000-000000000002',
    '9400b000-0000-4000-8000-000000000002',
    '94001000-0000-4000-8000-000000000004',
    'viewed', clock_timestamp() + interval '14 days'
  ),
  (
    '94007000-0000-4000-8000-000000000005',
    '94006000-0000-4000-8000-000000000002',
    '9400b000-0000-4000-8000-000000000002',
    '94001000-0000-4000-8000-000000000005',
    'withdrawn', clock_timestamp() + interval '14 days'
  ),
  (
    '94007000-0000-4000-8000-000000000006',
    '94006000-0000-4000-8000-000000000002',
    '9400b000-0000-4000-8000-000000000002',
    '94001000-0000-4000-8000-000000000006',
    'ignored', clock_timestamp() + interval '14 days'
  ),
  (
    '94007000-0000-4000-8000-000000000010',
    '94006000-0000-4000-8000-000000000001',
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-000000000007',
    'created', clock_timestamp() + interval '14 days'
  ),
  (
    '94007000-0000-4000-8000-000000000011',
    '94006000-0000-4000-8000-000000000002',
    '9400b000-0000-4000-8000-000000000002',
    '94001000-0000-4000-8000-000000000007',
    'created', clock_timestamp() - interval '1 day'
  ),
  (
    '94007000-0000-4000-8000-000000000012',
    '94006000-0000-4000-8000-000000000003',
    '9400c000-0000-4000-8000-000000000003',
    '94001000-0000-4000-8000-000000000007',
    'created', null
  ),
  (
    '94007000-0000-4000-8000-000000000013',
    '94006000-0000-4000-8000-000000000004',
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-000000000007',
    'delivered', clock_timestamp() + interval '14 days'
  ),
  (
    '94007000-0000-4000-8000-000000000014',
    '94006000-0000-4000-8000-000000000005',
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-000000000007',
    'viewed', clock_timestamp() + interval '14 days'
  ),
  (
    '94007000-0000-4000-8000-000000000015',
    '94006000-0000-4000-8000-000000000006',
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-000000000007',
    'withdrawn', clock_timestamp() + interval '14 days'
  );

-- Durable provider truth is part of the terminal-visibility fixture, not an
-- inference from the lifecycle status alone.
update public.invites
   set delivered_at = clock_timestamp()
 where id = '94007000-0000-4000-8000-000000000003'
   and status = 'delivered';

-- The default-expiry INSERT trigger correctly fills NULL; clear this rollback-
-- only fixture afterwards to prove delivery never stamps a malformed legacy row.
update public.invites
   set expires_at = null
 where id = '94007000-0000-4000-8000-000000000012';

-- Notification/refund authority fixtures. Each invite has one canonical event
-- and delivery so settlement, cancellation, outcome-unknown, and worker-lock
-- behavior can be exercised deterministically in this rollback-only session.
insert into public.invites (
  id, listing_id, host_profile_id, seeker_profile_id, status, expires_at
)
values
  ('94007000-0000-4000-8000-000000000016', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-000000000009', 'created', clock_timestamp() + interval '14 days'),
  ('94007000-0000-4000-8000-000000000017', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000a', 'created', clock_timestamp() + interval '14 days'),
  ('94007000-0000-4000-8000-000000000018', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000b', 'created', clock_timestamp() + interval '14 days'),
  ('94007000-0000-4000-8000-000000000019', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000c', 'created', clock_timestamp() + interval '14 days'),
  ('94007000-0000-4000-8000-00000000001a', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000d', 'created', clock_timestamp() + interval '14 days'),
  ('94007000-0000-4000-8000-00000000001b', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000e', 'withdrawn', clock_timestamp() + interval '14 days'),
  ('94007000-0000-4000-8000-00000000001c', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000f', 'created', clock_timestamp() + interval '14 days'),
  ('94007000-0000-4000-8000-00000000001d', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-000000000008', 'created', clock_timestamp() + interval '14 days'),
  ('94007000-0000-4000-8000-00000000001e', '94006000-0000-4000-8000-000000000006', '9400a000-0000-4000-8000-000000000001', '94001000-0000-4000-8000-00000000000b', 'created', clock_timestamp() + interval '14 days');

insert into public.events (
  id, event_type, actor_scope, subject_type, subject_id,
  listing_id, host_profile_id, seeker_profile_id, source_surface, properties
)
values
  ('9400f000-0000-4000-8000-000000000011', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-000000000011', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-000000000007', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-000000000012', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-000000000012', '94006000-0000-4000-8000-000000000003', '9400c000-0000-4000-8000-000000000003', '94001000-0000-4000-8000-000000000007', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-000000000013', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-000000000013', '94006000-0000-4000-8000-000000000004', '9400a000-0000-4000-8000-000000000001', '94001000-0000-4000-8000-000000000007', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-000000000014', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-000000000014', '94006000-0000-4000-8000-000000000005', '9400a000-0000-4000-8000-000000000001', '94001000-0000-4000-8000-000000000007', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-000000000016', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-000000000016', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-000000000009', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-000000000017', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-000000000017', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000a', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-000000000018', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-000000000018', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000b', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-000000000019', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-000000000019', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000c', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-00000000001a', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-00000000001a', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000d', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-00000000001b', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-00000000001b', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000e', 'db_assert_094', '{}'::jsonb),
  -- Deliberate listing mismatch: settlement must reject this mapping.
  ('9400f000-0000-4000-8000-00000000001c', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-00000000001c', '94006000-0000-4000-8000-000000000001', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-00000000000f', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-00000000001d', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-00000000001d', '94006000-0000-4000-8000-000000000002', '9400b000-0000-4000-8000-000000000002', '94001000-0000-4000-8000-000000000008', 'db_assert_094', '{}'::jsonb),
  ('9400f000-0000-4000-8000-00000000001e', 'invite_created', 'host', 'invite', '94007000-0000-4000-8000-00000000001e', '94006000-0000-4000-8000-000000000006', '9400a000-0000-4000-8000-000000000001', '94001000-0000-4000-8000-00000000000b', 'db_assert_094', '{}'::jsonb);

insert into public.notification_deliveries (
  id, event_id, recipient_clerk_user_id, channel, category,
  notification_type, variant, dedup_key, status, cadence,
  worker_id, lease_expires_at, delivered_at,
  provider_started_at, claim_authority_version
)
values
  ('9400d000-0000-4000-8000-000000000011', '9400f000-0000-4000-8000-000000000011', 'user_discovery_incomplete', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-11', 'processing', 'immediate', 'worker-recheck', clock_timestamp() + interval '10 minutes', null, null, '094'),
  ('9400d000-0000-4000-8000-000000000012', '9400f000-0000-4000-8000-000000000012', 'user_discovery_incomplete', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-12', 'processing', 'immediate', 'worker-recheck', clock_timestamp() + interval '10 minutes', null, null, '094'),
  ('9400d000-0000-4000-8000-000000000013', '9400f000-0000-4000-8000-000000000013', 'user_discovery_incomplete', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-13', 'processing', 'immediate', 'worker-recheck', clock_timestamp() + interval '10 minutes', null, null, '094'),
  ('9400d000-0000-4000-8000-000000000014', '9400f000-0000-4000-8000-000000000014', 'user_discovery_incomplete', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-14', 'processing', 'immediate', 'worker-recheck', clock_timestamp() + interval '10 minutes', null, null, '094'),
  ('9400d000-0000-4000-8000-000000000016', '9400f000-0000-4000-8000-000000000016', 'user_discovery_host_a', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-16', 'deferred', 'immediate', null, null, null, null, null),
  ('9400d000-0000-4000-8000-000000000017', '9400f000-0000-4000-8000-000000000017', 'user_discovery_applicant', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-17', 'processing', 'immediate', 'worker-live', clock_timestamp() + interval '10 minutes', null, clock_timestamp(), '094'),
  ('9400d000-0000-4000-8000-000000000018', '9400f000-0000-4000-8000-000000000018', 'user_discovery_low_score', 'in_app', 'offers_invites', 'invite_received', 'default', 'db-assert-094-18', 'delivered', 'immediate', null, null, clock_timestamp(), clock_timestamp(), null),
  ('9400d000-0000-4000-8000-000000000019', '9400f000-0000-4000-8000-000000000019', 'user_discovery_writer', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-19', 'dead_letter', 'immediate', null, null, null, clock_timestamp(), null),
  ('9400d000-0000-4000-8000-00000000001a', '9400f000-0000-4000-8000-00000000001a', 'user_discovery_purchased', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-1a', 'processing', 'immediate', 'worker-settle', clock_timestamp() + interval '10 minutes', null, null, '094'),
  ('9400d000-0000-4000-8000-00000000001b', '9400f000-0000-4000-8000-00000000001b', 'user_discovery_platform_applicant', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-1b', 'processing', 'immediate', 'worker-withdrawn', clock_timestamp() + interval '10 minutes', null, clock_timestamp(), '094'),
  ('9400d000-0000-4000-8000-00000000001c', '9400f000-0000-4000-8000-00000000001c', 'user_discovery_opted_out', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-1c', 'processing', 'immediate', 'worker-bad', clock_timestamp() + interval '10 minutes', null, clock_timestamp(), '094'),
  ('9400d000-0000-4000-8000-00000000001d', '9400f000-0000-4000-8000-00000000001d', 'user_discovery_deleted', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-1d', 'processing', 'immediate', 'worker-crashed', null, null, null, '094'),
  ('9400d000-0000-4000-8000-00000000001e', '9400f000-0000-4000-8000-00000000001e', 'user_discovery_low_score', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-094-1e', 'processing', 'immediate', 'worker-recheck', clock_timestamp() + interval '10 minutes', null, null, '094');

update public.notification_deliveries
   set next_attempt_at = clock_timestamp() + interval '1 day'
 where id = '9400d000-0000-4000-8000-000000000016';

select pg_temp.expect_denied(
  'invite processing claim requires a non-null 094 authority marker',
  $q$update public.notification_deliveries
        set status = 'processing',
            worker_id = 'worker-null-authority',
            lease_expires_at = clock_timestamp() + interval '10 minutes'
      where id = '9400d000-0000-4000-8000-000000000016'$q$,
  'notification_deliveries_invite_claim_authority_094_chk',
  '23514'
);

-- The compatibility trigger must clear the marker for generic old/new worker
-- exits, while the two-valued CHECK rejects every unversioned processing row.
update public.notification_deliveries
   set status = 'failed_retryable',
       worker_id = null,
       lease_expires_at = null
 where id = '9400d000-0000-4000-8000-00000000001c';

do $do$
begin
  if (select claim_authority_version
        from public.notification_deliveries
       where id = '9400d000-0000-4000-8000-00000000001c') is not null then
    raise exception 'host discovery: processing exit did not clear claim authority';
  end if;
end;
$do$;

update public.notification_deliveries
   set status = 'processing',
       claim_authority_version = '094',
       worker_id = 'worker-bad',
       lease_expires_at = clock_timestamp() + interval '10 minutes'
 where id = '9400d000-0000-4000-8000-00000000001c';

-- Known-unsent poison remains reversible/refundable; only the explicitly
-- outcome-unknown dead letter is immutable and non-refundable.
update public.notification_deliveries
   set status = 'dead_letter',
       failure_class = 'known_unsent',
       failure_detail = 'known-unsent invalid intent'
 where id = '9400d000-0000-4000-8000-000000000016';

update public.notification_deliveries
   set failure_class = 'outcome_unknown',
       failure_detail = 'provider response lost'
 where id = '9400d000-0000-4000-8000-000000000019';

-- Simulate a legacy pre-094 queued member so withdrawal's defensive cleanup
-- remains executable proof. The production trigger is re-enabled immediately;
-- the entire assertion suite is rollback-only.
alter table public.digest_memberships
  disable trigger trg_digest_memberships_no_invite_queue_094;
insert into public.digest_memberships (
  id, recipient_clerk_user_id, cadence, category, event_id, delivery_id, status
)
values
  (
    '9400c000-0000-4000-8000-000000000016',
    'user_discovery_host_a', 'daily', 'offers_invites',
    '9400f000-0000-4000-8000-000000000016',
    '9400d000-0000-4000-8000-000000000016', 'queued'
  ),
  (
    '9400c000-0000-4000-8000-000000000096',
    'user_discovery_host_a', 'weekly', 'offers_invites',
    '9400f000-0000-4000-8000-000000000016',
    null, 'queued'
  );
alter table public.digest_memberships
  enable trigger trg_digest_memberships_no_invite_queue_094;

insert into public.invite_credit_events (
  id, host_profile_id, kind, source, credits, invite_id, period_key
)
values
  (
    '9400e000-0000-4000-8000-000000000002',
    '9400b000-0000-4000-8000-000000000002',
    'consume', 'monthly', 1,
    '94007000-0000-4000-8000-000000000002',
    to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM')
  ),
  (
    '9400e000-0000-4000-8000-000000000003',
    '9400b000-0000-4000-8000-000000000002',
    'consume', 'monthly', 1,
    '94007000-0000-4000-8000-000000000003',
    to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM')
  ),
  (
    '9400e000-0000-4000-8000-000000000004',
    '9400b000-0000-4000-8000-000000000002',
    'consume', 'monthly', 1,
    '94007000-0000-4000-8000-000000000004',
    to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM')
  ),
  (
    '9400e000-0000-4000-8000-000000000005',
    '9400b000-0000-4000-8000-000000000002',
    'consume', 'monthly', 1,
    '94007000-0000-4000-8000-000000000005',
    to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM')
  );

insert into public.invite_credit_events (
  id, host_profile_id, kind, source, credits, invite_id, period_key
)
select
  ('9400e000-0000-4000-8000-' || lpad(suffix, 12, '0'))::uuid,
  '9400b000-0000-4000-8000-000000000002'::uuid,
  'consume',
  'monthly',
  1,
  ('94007000-0000-4000-8000-' || lpad(suffix, 12, '0'))::uuid,
  to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM')
from unnest(array['16', '17', '18', '19', '1a', '1b', '1c', '1d']) as ids(suffix);

-- Immediately after 094, the DB-enforced runtime drain must refuse withdrawal
-- without touching invite/delivery/credit state. Advance only this rollback-
-- local singleton after proving the clock gate so the remaining behaviors can
-- run deterministically.
update public.invite_authority_rollout_094
   set applied_at = clock_timestamp()
 where singleton is true;

set local role service_role;
do $do$
declare
  v_result jsonb;
begin
  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000016'
  );
  if v_result is distinct from
       '{"ok":false,"error":"invite_authority_rollout_draining"}'::jsonb
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000016') <> 'created'
     or exists (
       select 1 from public.invite_credit_events
        where invite_id = '94007000-0000-4000-8000-000000000016'
          and kind = 'restore'
     ) then
    raise exception 'host discovery: rollout drain refusal mutated invite truth: %',
      v_result;
  end if;
end;
$do$;
reset role;

update public.invite_authority_rollout_094
   set applied_at = clock_timestamp() - interval '331 seconds'
 where singleton is true;

insert into public.match_scores (
  seeker_profile_id, listing_id, score, raw_score, band,
  confidence, components, computed_at
)
values
  ('94001000-0000-4000-8000-000000000001', '94006000-0000-4000-8000-000000000001', 95, 95, 'strong', 95, '{"skills":95}', clock_timestamp()),
  ('94001000-0000-4000-8000-000000000002', '94006000-0000-4000-8000-000000000001', 90, 90, 'strong', 90, '{"skills":90}', '2026-01-01 00:00:00+00'),
  ('94001000-0000-4000-8000-000000000003', '94006000-0000-4000-8000-000000000001', 90, 90, 'strong', 80, '{"skills":90}', '2026-01-01 00:00:00+00'),
  ('94001000-0000-4000-8000-000000000004', '94006000-0000-4000-8000-000000000001', 90, 90, 'strong', 80, '{"skills":90}', '2026-01-01 00:00:00+00'),
  ('94001000-0000-4000-8000-000000000005', '94006000-0000-4000-8000-000000000001', 90, 90, 'strong', 80, '{"skills":90}', '2026-01-02 00:00:00+00'),
  ('94001000-0000-4000-8000-000000000006', '94006000-0000-4000-8000-000000000001', 100, 100, 'strong', 100, '{"skills":100}', clock_timestamp()),
  ('94001000-0000-4000-8000-000000000007', '94006000-0000-4000-8000-000000000001', 100, 100, 'strong', 100, '{"skills":100}', clock_timestamp()),
  ('94001000-0000-4000-8000-000000000008', '94006000-0000-4000-8000-000000000001', 100, 100, 'strong', 100, '{"skills":100}', clock_timestamp()),
  ('94001000-0000-4000-8000-000000000009', '94006000-0000-4000-8000-000000000001', 100, 100, 'strong', 100, '{"skills":100}', clock_timestamp()),
  ('94001000-0000-4000-8000-00000000000a', '94006000-0000-4000-8000-000000000001', 100, 100, 'strong', 100, '{"skills":100}', clock_timestamp()),
  ('94001000-0000-4000-8000-00000000000b', '94006000-0000-4000-8000-000000000001', 49, 49, 'needs_attention', 90, '{"skills":49}', clock_timestamp()),
  ('94001000-0000-4000-8000-00000000000c', '94006000-0000-4000-8000-000000000001', 55, 55, 'developing', 55, '{"skills":55}', clock_timestamp()),
  ('94001000-0000-4000-8000-00000000000e', '94006000-0000-4000-8000-000000000001', 100, 100, 'strong', 100, '{"skills":100}', clock_timestamp()),
  ('94001000-0000-4000-8000-00000000000f', '94006000-0000-4000-8000-000000000001', 100, 100, 'strong', 100, '{"skills":100}', clock_timestamp()),
  ('94001000-0000-4000-8000-000000000002', '94006000-0000-4000-8000-000000000002', 88, 88, 'strong', 92, '{"pay":91,"availability":87}', clock_timestamp());

-- ---------------------------------------------------------------------------
-- Catalog, projection, ACL, and lock-order proof.
-- ---------------------------------------------------------------------------

do $do$
declare
  v_function record;
  v_public_execute boolean;
  v_definition text;
  v_delivery_definition text;
  v_settle_definition text;
  v_recheck_definition text;
  v_begin_definition text;
  v_claim_definition text;
  v_claim_v2_definition text;
  v_withdraw_definition text;
  v_host_view_definition text;
  v_display_names_definition text;
  v_application_definition text;
  v_application_lock integer;
  v_seeker_lock integer;
  v_listing_lock integer;
  v_host_lock integer;
  v_invite_lock integer;
  v_subscription_lock integer;
  v_credit_lock integer;
  v_credit_read integer;
  v_invite_insert integer;
  v_credit_insert integer;
  v_compact_definition text;
  v_compact_delivery_definition text;
  v_compact_settle_definition text;
  v_compact_recheck_definition text;
  v_compact_begin_definition text;
  v_compact_claim_definition text;
  v_compact_claim_v2_definition text;
  v_compact_withdraw_definition text;
  v_compact_application_definition text;
  v_post_credit_definition text;
  v_host_error integer;
  v_listing_error integer;
  v_application_error integer;
  v_seeker_error integer;
  v_invite_error integer;
  v_first_clock integer;
  v_first_expiry_check integer;
  v_clock_count integer;
begin
  for v_function in
    select p.oid, p.proname, p.prosecdef, p.proconfig,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
           p.provolatile
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.oid in (
         'public.search_host_sourceable_seekers(uuid,uuid,text,integer)'::regprocedure,
         'public.get_host_sourceable_matches(uuid,uuid,integer)'::regprocedure,
         'public.create_host_source_invite_with_credit(uuid,uuid,uuid,text)'::regprocedure,
         'public.deliver_seeker_invites(uuid,uuid[])'::regprocedure,
         'public.settle_invite_notification_delivery(uuid,text,text,timestamptz)'::regprocedure,
         'public.get_invite_notification_state(uuid,uuid,text)'::regprocedure,
         'public.begin_invite_notification_delivery(uuid,uuid,text)'::regprocedure,
         'public.claim_notification_deliveries(text,integer,integer)'::regprocedure,
         'public.claim_notification_deliveries_v2(text,integer,integer)'::regprocedure,
         'public.withdraw_host_invite(uuid,uuid)'::regprocedure
       )
  loop
    select exists (
      select 1
        from pg_proc p,
             lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid = v_function.oid
         and a.grantee = 0
         and a.privilege_type = 'EXECUTE'
    ) into v_public_execute;

    if v_function.prosecdef
       or v_function.anon_execute
       or v_function.authenticated_execute
       or not v_function.service_execute
       or v_public_execute
       or (
         v_function.proname in (
           'search_host_sourceable_seekers',
           'get_host_sourceable_matches'
         )
         and v_function.provolatile is distinct from 's'
       )
       or not (
         coalesce(v_function.proconfig, '{}'::text[])
           @> array['search_path=""']::text[]
       ) then
      raise exception 'host discovery: unsafe execution contract for %',
        v_function.proname;
    end if;
  end loop;

  if to_regclass('public.idx_events_invite_created_authority_094') is null
     or not exists (
       select 1
         from pg_index i
        where i.indexrelid =
          'public.idx_events_invite_created_authority_094'::regclass
          and i.indisunique
          and lower(pg_get_expr(i.indpred, i.indrelid)) like
            '%event_type%invite_created%'
          and lower(pg_get_expr(i.indpred, i.indrelid)) like
            '%subject_type%invite%'
          and lower(pg_get_expr(i.indpred, i.indrelid)) like
            '%source_surface%invite_authority%'
          and lower(pg_get_expr(i.indpred, i.indrelid)) like
            '%authority_version%094%'
     ) then
    raise exception 'host discovery: canonical invite event uniqueness drifted';
  end if;

  if (select count(*)
        from pg_attribute a
       where a.attrelid = 'public.notification_deliveries'::regclass
         and a.attname in ('provider_started_at', 'claim_authority_version')
         and a.attnum > 0
         and not a.attisdropped) <> 2 then
    raise exception 'host discovery: delivery provider/claim phase columns drifted';
  end if;

  if not exists (
    select 1
      from pg_proc p
     where p.oid = 'public.search_host_sourceable_seekers(uuid,uuid,text,integer)'::regprocedure
       and pg_get_function_result(p.oid) =
         'TABLE(seeker_profile_id uuid, display_name text, short_bio text, already_invited boolean)'
  ) then
    raise exception 'host discovery: search projection drifted';
  end if;

  if not exists (
    select 1
      from pg_proc p
     where p.oid = 'public.get_host_sourceable_matches(uuid,uuid,integer)'::regprocedure
       and pg_get_function_result(p.oid) =
         'TABLE(seeker_profile_id uuid, display_name text, short_bio text, general_skill_tags text[], desired_categories text[], score smallint, band text, already_invited boolean)'
  ) then
    raise exception 'host discovery: match projection drifted';
  end if;

  if not exists (
    select 1
      from pg_proc p
     where p.oid = 'public.deliver_seeker_invites(uuid,uuid[])'::regprocedure
       and pg_get_function_result(p.oid) =
         'TABLE(invite_id uuid, status text)'
  ) then
    raise exception 'host discovery: delivery projection drifted';
  end if;

  if not exists (
    select 1
      from pg_proc p
     where p.oid = 'public.get_invite_notification_state(uuid,uuid,text)'::regprocedure
       and pg_get_function_result(p.oid) =
         'TABLE(status text, expires_at timestamp with time zone)'
  ) then
    raise exception 'host discovery: notification recheck projection drifted';
  end if;

  if not exists (
    select 1
      from pg_proc p
     where p.oid = 'public.begin_invite_notification_delivery(uuid,uuid,text)'::regprocedure
       and pg_get_function_result(p.oid) =
         'TABLE(status text, expires_at timestamp with time zone)'
  ) then
    raise exception 'host discovery: notification provider-boundary projection drifted';
  end if;

  if has_function_privilege(
       'service_role',
       'public.create_invite_with_credit(uuid,uuid,uuid,text,uuid,integer)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.restore_invite_credit(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.restore_invite_credit(uuid)',
       'EXECUTE'
     )
     or exists (
       select 1
         from pg_proc p,
              lateral aclexplode(
                coalesce(p.proacl, acldefault('f', p.proowner))
              ) a
        where p.oid = 'public.restore_invite_credit(uuid)'::regprocedure
          and a.grantee = 0
          and a.privilege_type = 'EXECUTE'
     ) then
    raise exception 'host discovery: legacy allowance-bearing invite writer remains executable';
  end if;

  if has_function_privilege(
       'service_role',
       'public.restore_invite_credit(uuid)',
       'EXECUTE'
     ) then
    raise exception 'host discovery: standalone legacy credit restore remains executable';
  end if;

  -- A single-session suite can exercise the existing-row duplicate branch but
  -- not the insert race's unique_violation handler. Pin the structural arbiter
  -- that makes that handler specific to the listing/seeker pair.
  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.invites'::regclass
       and c.contype = 'u'
       and lower(pg_get_constraintdef(c.oid, false)) =
         'unique (listing_id, seeker_profile_id)'
  ) then
    raise exception 'host discovery: invite listing/seeker uniqueness drifted';
  end if;

  if to_regclass('public.idx_seeker_profiles_visible_onboarded') is not null
     or to_regclass('public.idx_seeker_profiles_platform_onboarded') is null
     or not exists (
       select 1
         from pg_index i
        where i.indexrelid = 'public.idx_seeker_profiles_platform_onboarded'::regclass
          and lower(pg_get_expr(i.indpred, i.indrelid)) like '%host_discovery_enabled%true%'
          and lower(pg_get_expr(i.indpred, i.indrelid)) like '%visibility_status%platform%'
          and lower(pg_get_expr(i.indpred, i.indrelid)) like '%onboarding_complete%true%'
          and lower(pg_get_expr(i.indpred, i.indrelid)) like '%deleted_at is null%'
     ) then
    raise exception 'host discovery: platform/onboarded partial index contract drifted';
  end if;

  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.notification_deliveries'::regclass
       and c.conname = 'notification_deliveries_invite_open_cadence_chk'
       and c.contype = 'c'
       and c.convalidated
       and lower(pg_get_constraintdef(c.oid, false)) like
         '%notification_type%invite_received%'
       and lower(pg_get_constraintdef(c.oid, false)) like
         '%cadence%immediate%'
       and lower(pg_get_constraintdef(c.oid, false)) like
         '%status%dead_letter%cancelled%'
  ) then
    raise exception 'host discovery: open invite cadence constraint drifted';
  end if;

  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.notification_deliveries'::regclass
       and c.conname = 'notification_deliveries_invite_claim_authority_094_chk'
       and c.contype = 'c'
       and c.convalidated
       and lower(pg_get_constraintdef(c.oid, false)) like
         '%notification_type%invite_received%'
       and lower(pg_get_constraintdef(c.oid, false)) like
         '%not (status is distinct from%processing%not (claim_authority_version is distinct from%094%'
       and lower(pg_get_constraintdef(c.oid, false)) like
         '%status%is distinct from%processing%claim_authority_version is null%'
  ) then
    raise exception 'host discovery: versioned invite claim constraint drifted';
  end if;

  if not coalesce((
       select c.relrowsecurity
         from pg_class c
        where c.oid = 'public.invites'::regclass
     ), false)
     or not coalesce((
       select c.relrowsecurity
         from pg_class c
        where c.oid = 'public.match_scores'::regclass
     ), false) then
    raise exception 'host discovery: invite/match-score RLS is disabled';
  end if;

  if (select count(*) from pg_policy
       where polrelid = 'public.invites'::regclass) <> 2
     or not exists (
       select 1 from pg_policy p
        where p.polrelid = 'public.invites'::regclass
          and p.polname = 'invites_select_party'
          and p.polcmd = 'r'
          and p.polpermissive
          and p.polroles = array['authenticated'::regrole::oid]::oid[]
          and p.polwithcheck is null
          and md5(regexp_replace(
                lower(pg_get_expr(p.polqual, p.polrelid)),
                '[[:space:]]+', '', 'g'
              )) = 'd67462759e3b4fd145fb71131c41e42e'
     )
     or not exists (
       select 1 from pg_policy p
        where p.polrelid = 'public.invites'::regclass
          and p.polname = 'invites_update_seeker'
          and p.polcmd = 'w'
          and p.polpermissive
          and p.polroles = array['authenticated'::regrole::oid]::oid[]
          and md5(regexp_replace(
                lower(pg_get_expr(p.polqual, p.polrelid)),
                '[[:space:]]+', '', 'g'
              )) = 'd8237c2cc19af204163ad38685840885'
          and md5(regexp_replace(
                lower(pg_get_expr(p.polwithcheck, p.polrelid)),
                '[[:space:]]+', '', 'g'
              )) = '1922082763d7c9a267806360a3e0ee7e'
     ) then
    raise exception 'host discovery: exact invite policy inventory drifted';
  end if;

  if (select count(*) from pg_policy
       where polrelid = 'public.match_scores'::regclass) <> 2
     or not exists (
       select 1 from pg_policy p
        where p.polrelid = 'public.match_scores'::regclass
          and p.polname = 'match_scores_select_host'
          and p.polcmd = 'r'
          and p.polpermissive
          and p.polroles = array['authenticated'::regrole::oid]::oid[]
          and p.polwithcheck is null
          and md5(regexp_replace(
                lower(pg_get_expr(p.polqual, p.polrelid)),
                '[[:space:]]+', '', 'g'
              )) = '19f529e501c5b60cbef691bb5793e204'
     )
     or not exists (
       select 1 from pg_policy p
        where p.polrelid = 'public.match_scores'::regclass
          and p.polname = 'match_scores_select_seeker'
          and p.polcmd = 'r'
          and p.polpermissive
          and p.polroles = array['authenticated'::regrole::oid]::oid[]
          and p.polwithcheck is null
          and md5(regexp_replace(
                lower(pg_get_expr(p.polqual, p.polrelid)),
                '[[:space:]]+', '', 'g'
              )) = 'efea6a7c51d72911569def4741592a97'
     ) then
    raise exception 'host discovery: exact match-score policy inventory drifted';
  end if;

  if (select count(*)
        from public.invite_authority_rollout_094
       where singleton is true) <> 1
     or not has_table_privilege(
       'service_role',
       'public.invite_authority_rollout_094',
       'SELECT'
     )
     or has_table_privilege(
       'service_role',
       'public.invite_authority_rollout_094',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.invite_authority_rollout_094',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.invite_authority_rollout_094',
       'DELETE'
     )
     or has_table_privilege(
       'anon',
       'public.invite_authority_rollout_094',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'public.invite_authority_rollout_094',
       'SELECT'
     )
     or not (select c.relrowsecurity
               from pg_class c
              where c.oid = 'public.invite_authority_rollout_094'::regclass)
     or exists (
       select 1
         from pg_policy p
        where p.polrelid = 'public.invite_authority_rollout_094'::regclass
     ) then
    raise exception 'host discovery: rollout epoch singleton/ACL drifted';
  end if;

  if not exists (
    select 1
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.digest_memberships'::regclass
       and t.tgname = 'trg_digest_memberships_no_invite_queue_094'
       and not t.tgisinternal
       and t.tgenabled <> 'D'
       and p.proname = 'prevent_queued_invite_digest_membership_094'
       and not p.prosecdef
       and 'search_path=""' = any(coalesce(p.proconfig, '{}'::text[]))
       and not has_function_privilege('anon', p.oid, 'EXECUTE')
       and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'host discovery: queued invite digest trigger contract drifted';
  end if;

  if not exists (
    select 1
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.notification_deliveries'::regclass
       and t.tgname = 'trg_notification_deliveries_invite_dead_letter_094'
       and not t.tgisinternal
       and t.tgenabled <> 'D'
       and p.proname = 'prevent_invite_dead_letter_requeue_094'
       and not p.prosecdef
       and 'search_path=""' = any(coalesce(p.proconfig, '{}'::text[]))
       and not has_function_privilege('anon', p.oid, 'EXECUTE')
       and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'host discovery: invite dead-letter trigger contract drifted';
  end if;

  if not exists (
    select 1
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attrdef d
        on d.adrelid = a.attrelid
       and d.adnum = a.attnum
     where n.nspname = 'public'
       and c.relname = 'seeker_profiles'
       and a.attname = 'host_discovery_enabled'
       and a.attnotnull
       and lower(pg_get_expr(d.adbin, d.adrelid)) in ('false', 'false::boolean')
  )
     or not has_column_privilege(
       'authenticated',
       'public.seeker_profiles',
       'host_discovery_enabled',
       'UPDATE'
     )
     or has_table_privilege(
       'authenticated',
       'public.seeker_profiles',
       'UPDATE'
     )
     or (select host_discovery_enabled
           from public.seeker_profiles
          where id = '94001000-0000-4000-8000-00000000000f') is distinct from false
     or not exists (
       select 1
         from pg_policy p
        where p.polrelid = 'public.seeker_profiles'::regclass
          and p.polname = 'seeker_profiles_update_own'
          and p.polcmd = 'w'
          and lower(pg_get_expr(p.polqual, p.polrelid)) like '%get_clerk_user_id%'
          and lower(pg_get_expr(p.polwithcheck, p.polrelid)) like '%get_clerk_user_id%'
     ) then
    raise exception 'host discovery: fail-closed consent column/grant/owner policy drifted';
  end if;

  select lower(pg_get_functiondef(
    'public.create_host_source_invite_with_credit(uuid,uuid,uuid,text)'::regprocedure
  )) into v_definition;
  select lower(pg_get_functiondef(
    'public.deliver_seeker_invites(uuid,uuid[])'::regprocedure
  )) into v_delivery_definition;
  select lower(pg_get_functiondef(
    'public.settle_invite_notification_delivery(uuid,text,text,timestamptz)'::regprocedure
  )) into v_settle_definition;
  select lower(pg_get_functiondef(
    'public.get_invite_notification_state(uuid,uuid,text)'::regprocedure
  )) into v_recheck_definition;
  select lower(pg_get_functiondef(
    'public.begin_invite_notification_delivery(uuid,uuid,text)'::regprocedure
  )) into v_begin_definition;
  select lower(pg_get_functiondef(
    'public.claim_notification_deliveries(text,integer,integer)'::regprocedure
  )) into v_claim_definition;
  select lower(pg_get_functiondef(
    'public.claim_notification_deliveries_v2(text,integer,integer)'::regprocedure
  )) into v_claim_v2_definition;
  select lower(pg_get_functiondef(
    'public.withdraw_host_invite(uuid,uuid)'::regprocedure
  )) into v_withdraw_definition;
  select lower(pg_get_functiondef(
    'public.host_can_view_seeker(uuid)'::regprocedure
  )) into v_host_view_definition;
  select lower(pg_get_functiondef(
    'public.get_host_applicant_display_names(uuid[])'::regprocedure
  )) into v_display_names_definition;
  select lower(pg_get_functiondef(
    'public.submit_my_application(uuid,text,uuid)'::regprocedure
  )) into v_application_definition;

  v_compact_definition := regexp_replace(v_definition, '[[:space:]]+', '', 'g');
  v_compact_delivery_definition := regexp_replace(
    v_delivery_definition,
    '[[:space:]]+',
    '',
    'g'
  );
  v_compact_settle_definition := regexp_replace(
    v_settle_definition,
    '[[:space:]]+',
    '',
    'g'
  );
  v_compact_recheck_definition := regexp_replace(
    v_recheck_definition,
    '[[:space:]]+',
    '',
    'g'
  );
  v_compact_begin_definition := regexp_replace(
    v_begin_definition,
    '[[:space:]]+',
    '',
    'g'
  );
  v_compact_claim_definition := regexp_replace(
    v_claim_definition,
    '[[:space:]]+',
    '',
    'g'
  );
  v_compact_claim_v2_definition := regexp_replace(
    v_claim_v2_definition,
    '[[:space:]]+',
    '',
    'g'
  );
  v_compact_withdraw_definition := regexp_replace(
    v_withdraw_definition,
    '[[:space:]]+',
    '',
    'g'
  );
  v_compact_application_definition := regexp_replace(
    v_application_definition,
    '[[:space:]]+',
    '',
    'g'
  );

  if position(
       'hashtextextended(''application_submission:''||p_listing_id::text||'':''||p_seeker_profile_id::text,0)'
       in v_compact_definition
     ) = 0
     or position('v_provider_started_atisnull' in v_compact_settle_definition) = 0
     or position(
       'v_claim_authority_versionisdistinctfrom''094'''
       in v_compact_settle_definition
     ) = 0
     or position(
       'hashtextextended(''application_submission:''||p_listing_id::text||'':''||v_seeker_profile_id::text,0)'
       in v_compact_application_definition
     ) = 0 then
    raise exception 'host discovery: invite/application shared pair advisory namespace drifted';
  end if;

  if position(
       'frompublic.applicationsawherea.listing_id=p_listing_idanda.seeker_profile_id=p_seeker_profile_idforupdate;'
       in v_compact_definition
     ) = 0
     or position(
       'frompublic.seeker_profilesswheres.id=p_seeker_profile_idforshare;'
       in v_compact_definition
     ) = 0
     or position(
       'frompublic.listingslwherel.id=p_listing_idforshare;'
       in v_compact_definition
     ) = 0
     or position(
       'frompublic.host_profileshwhereh.id=p_host_profile_idforshare;'
       in v_compact_definition
     ) = 0
     or position(
       'frompublic.invitesiwherei.listing_id=p_listing_idandi.seeker_profile_id=p_seeker_profile_idforupdate;'
       in v_compact_definition
     ) = 0 then
    raise exception 'host discovery: exact application/seeker/listing/host/invite row locks drifted';
  end if;

  v_application_lock := position('from public.applications a' in v_definition);
  v_seeker_lock := position('from public.seeker_profiles s' in v_definition);
  v_listing_lock := position('from public.listings l' in v_definition);
  v_host_lock := position('from public.host_profiles h' in v_definition);
  v_invite_lock := position('from public.invites i' in v_definition);
  v_subscription_lock := position('from public.host_subscriptions hs' in v_definition);
  v_credit_lock := position('invite_credit:' in v_definition);
  v_credit_read := position('from public.invite_credit_events e' in v_definition);
  v_invite_insert := position('insert into public.invites' in v_definition);
  v_credit_insert := position('insert into public.invite_credit_events' in v_definition);
  v_post_credit_definition := substr(v_definition, v_credit_lock);
  v_host_error := position('''error'', ''host_not_eligible''' in v_definition);
  v_listing_error := position('''error'', ''listing_not_actionable''' in v_definition);
  v_application_error := position('''error'', ''already_applied''' in v_definition);
  v_seeker_error := position('''error'', ''seeker_not_sourceable''' in v_definition);
  v_invite_error := position('''error'', ''already_invited''' in v_definition);
  v_first_clock := position('v_now := clock_timestamp()' in v_definition);
  v_first_expiry_check := position('v_listing_expires_at <= v_now' in v_definition);
  select count(*)
    into v_clock_count
    from regexp_matches(
      v_definition,
      'v_now := clock_timestamp\(\)',
      'g'
    );

  if not (
    v_application_lock > 0
    and v_seeker_lock > v_application_lock
    and v_listing_lock > v_seeker_lock
    and v_host_lock > v_listing_lock
    and v_invite_lock > v_host_lock
    and v_first_clock > v_invite_lock
    and v_first_expiry_check > v_first_clock
    and v_credit_lock > v_first_expiry_check
    and v_credit_lock > v_invite_lock
    and v_credit_read > v_credit_lock
    and v_invite_insert > v_credit_read
    and v_credit_insert > v_invite_insert
    and v_listing_error > v_host_error
    and v_application_error > v_listing_error
    and v_seeker_error > v_application_error
    and v_invite_error > v_seeker_error
    and v_subscription_lock > v_invite_error
    and v_credit_lock > v_subscription_lock
  ) then
    raise exception 'host discovery: pair/row/credit lock and write order drifted';
  end if;

  if v_clock_count <> 2 then
    raise exception 'host discovery: expected exactly two locked clock captures, found %',
      v_clock_count;
  end if;

  if position(
       'frompublic.host_subscriptionshswherehs.clerk_user_id=v_host_clerk_user_idforshare;'
       in v_compact_definition
     ) = 0
     or position(
       'v_subscription_tier:=public.host_subscription_tier_for_clerk_user(v_host_clerk_user_id);'
       in v_compact_definition
     ) = 0
     or position(
       'v_authoritative_monthly_allowance:=casev_subscription_tierwhen''starter''then3when''professional''then10when''enterprise''then20else0end;'
       in v_compact_definition
     ) = 0
     or position(
       'v_monthly_used<v_authoritative_monthly_allowance'
       in v_compact_definition
     ) = 0
     or position(
       'v_monthly_used<p_monthly_allowance'
       in v_compact_definition
     ) > 0 then
    raise exception 'host discovery: authoritative subscription lock/allowance drifted';
  end if;

  if position('v_now := clock_timestamp()' in v_post_credit_definition) = 0
     or position(
       'v_listing_expires_at <= v_now'
       in v_post_credit_definition
     ) <= position('v_now := clock_timestamp()' in v_post_credit_definition)
     or position(
       'from public.invite_credit_events e'
       in v_post_credit_definition
     ) <= position('v_listing_expires_at <= v_now' in v_post_credit_definition) then
    raise exception 'host discovery: post-credit-lock clock/expiry recheck drifted';
  end if;

  if position(
       'frompublic.invitesijoinpublic.seeker_profilessons.id=i.seeker_profile_idwherei.id=p_invite_idforupdateofi;'
       in v_compact_withdraw_definition
     ) = 0
     or position(
       'orderbyd.idforupdateofd;'
       in v_compact_withdraw_definition
     ) <= position(
       'forupdateofi;'
       in v_compact_withdraw_definition
     )
     or position(
       'd.status=''processing''andd.provider_started_atisnulland(d.lease_expires_atisnullord.lease_expires_at<clock_timestamp());'
       in v_compact_withdraw_definition
     ) <= position(
       'orderbyd.idforupdateofd;'
       in v_compact_withdraw_definition
     )
     or position(
       'ifv_delivery_processingthen'
       in v_compact_withdraw_definition
     ) <= position(
       'd.status=''processing''andd.provider_started_atisnotnulland(d.lease_expires_atisnullord.lease_expires_at<clock_timestamp());'
       in v_compact_withdraw_definition
     )
     or position(
       'd.status=''processing''andd.provider_started_atisnotnulland(d.lease_expires_atisnullord.lease_expires_at<clock_timestamp());'
       in v_compact_withdraw_definition
     ) = 0
     or position(
       '''invite_authority_rollout_draining'''
       in v_compact_withdraw_definition
     ) = 0
     or position(
       'updatepublic.digest_membershipsdmsetstatus=''cancelled'''
       in v_compact_withdraw_definition
     ) <= position(
       'ifv_delivery_processingthen'
       in v_compact_withdraw_definition
     )
     or position(
       'd.statusin(''pending'',''deferred'',''failed_retryable'')'
       in v_compact_withdraw_definition
     ) <= position(
       'updatepublic.digest_membershipsdmsetstatus=''cancelled'''
       in v_compact_withdraw_definition
     )
     or position(
       'd.status=''delivered'''
       in v_compact_withdraw_definition
     ) = 0
     or position(
       'd.status=''dead_letter''andd.failure_class=''outcome_unknown'''
       in v_compact_withdraw_definition
     ) = 0
     or position(
       'd.failure_classisdistinctfrom''outcome_unknown'''
       in v_compact_withdraw_definition
     ) = 0
     or position(
       'hashtextextended(''invite_credit:''||p_host_profile_id::text,0)'
       in v_compact_withdraw_definition
     ) <= position(
       'andnotv_delivery_delivered_or_unknown;'
       in v_compact_withdraw_definition
     )
     or position(
       'updatepublic.invitesisetstatus=''withdrawn'''
       in v_compact_withdraw_definition
     ) <= position(
       'hashtextextended(''invite_credit:''||p_host_profile_id::text,0)'
       in v_compact_withdraw_definition
     )
     or position(
       'frompublic.invite_credit_eventsewheree.invite_id=p_invite_idande.host_profile_id=p_host_profile_idande.kind=''consume''onconflictdonothing;'
       in v_compact_withdraw_definition
     ) <= position(
       'updatepublic.invitesisetstatus=''withdrawn'''
       in v_compact_withdraw_definition
     ) then
    raise exception 'host discovery: atomic invite/delivery/cancel/credit lock order drifted';
  end if;

  if position(
       'frompublic.invitesiwherei.seeker_profile_id=p_seeker_profile_idandi.id=any(v_ids)orderbyi.idforupdate;'
       in v_compact_delivery_definition
     ) = 0
     or position(
       'v_now:=clock_timestamp()'
       in v_compact_delivery_definition
     ) <= position(
       'forupdate;'
       in v_compact_delivery_definition
     )
     or position(
       'andi.status=''created''andi.expires_atisnotnullandi.expires_at>v_nowandl.id=i.listing_id'
       in v_compact_delivery_definition
     ) = 0
     or position(
       'andi.statusin(''delivered'',''viewed'')andi.expires_atisnotnullandi.expires_at>v_now'
       in v_compact_delivery_definition
     ) = 0
     or position('andl.host_profile_id=i.host_profile_idandl.status=''live''andl.provenance=''verified''' in v_compact_delivery_definition) = 0
     or position('andh.account_status=''active''andh.deleted_atisnullandnullif(btrim(h.clerk_user_id),'''')isnotnull' in v_compact_delivery_definition) = 0
     or position('ands.deleted_atisnullandnullif(btrim(s.clerk_user_id),'''')isnotnull' in v_compact_delivery_definition) = 0 then
    raise exception 'host discovery: atomic delivery lock/clock/status contract drifted';
  end if;

  if position(
       'joinpublic.invitesioni.id=e.subject_id'
       in v_compact_settle_definition
     ) = 0
     or position(
       'frompublic.invitesiwherei.id=v_invite_idforupdate;'
       in v_compact_settle_definition
     ) = 0
     or position(
       'forupdateofd;'
       in v_compact_settle_definition
     ) <= position(
       'frompublic.invitesiwherei.id=v_invite_idforupdate;'
       in v_compact_settle_definition
     )
     or position(
       'v_delivery_worker_idisdistinctfromp_worker_id'
       in v_compact_settle_definition
     ) = 0
     or position(
       'updatepublic.invitesisetstatus=casewheni.status=''created''then''delivered''elsei.statusend'
       in v_compact_settle_definition
     ) <= position(
       'forupdateofd;'
       in v_compact_settle_definition
     )
     or position(
       'andi.statusin(''created'',''expired'');'
       in v_compact_settle_definition
     ) = 0
     or position(
       'delivered_at=coalesce(i.delivered_at,v_now)'
       in v_compact_settle_definition
     ) = 0
     or position(
       'delivered_at=coalesce(d.delivered_at,v_now)'
       in v_compact_settle_definition
     ) = 0
     or position(
       'updatepublic.notification_deliveriesdsetstatus=''delivered'''
       in v_compact_settle_definition
     ) <= position(
       'updatepublic.invitesisetstatus=casewheni.status=''created''then''delivered''elsei.statusend'
       in v_compact_settle_definition
     )
     or position('v_invite_expires_at' in v_compact_settle_definition) > 0
     or position('v_invite_status=''withdrawn''' in v_compact_settle_definition) = 0 then
    raise exception 'host discovery: atomic provider settlement mapping/lock contract drifted';
  end if;

  if position('frompublic.notification_deliveriesdjoinpublic.eventseone.id=d.event_idjoinpublic.invitesioni.id=e.subject_id' in v_compact_recheck_definition) = 0
     or position('d.id=p_delivery_id' in v_compact_recheck_definition) = 0
     or position('i.id=p_invite_id' in v_compact_recheck_definition) = 0
     or position('d.recipient_clerk_user_id=s.clerk_user_id' in v_compact_recheck_definition) = 0
     or position('frompublic.invitesiwherei.id=v_invite_idforshare;' in v_compact_recheck_definition) = 0
     or position('forupdateofd;' in v_compact_recheck_definition) <=
       position('frompublic.invitesiwherei.id=v_invite_idforshare;' in v_compact_recheck_definition)
     or position('v_delivery_statusisdistinctfrom''processing''' in v_compact_recheck_definition) = 0
     or position('v_delivery_worker_idisdistinctfromp_worker_id' in v_compact_recheck_definition) = 0
     or position('v_claim_authority_versionisdistinctfrom''094''' in v_compact_recheck_definition) = 0
     or position('v_delivery_lease_expires_atisnull' in v_compact_recheck_definition) = 0
     or position('v_delivery_lease_expires_at<=v_now' in v_compact_recheck_definition) = 0
     or position('lease_expires_at=v_now+interval''330seconds''' in v_compact_recheck_definition) = 0
     or position('''delivery_not_recheckable''' in v_compact_recheck_definition) = 0
     or position('joinpublic.listingslonl.id=i.listing_id' in v_compact_recheck_definition) = 0
     or position('joinpublic.host_profileshonh.id=i.host_profile_id' in v_compact_recheck_definition) = 0
     or position('joinpublic.seeker_profilessons.id=i.seeker_profile_id' in v_compact_recheck_definition) = 0
     or position('i.statusin(''created'',''delivered'',''viewed'')' in v_compact_recheck_definition) = 0
     or position('i.expires_at>clock_timestamp()' in v_compact_recheck_definition) = 0
     or position('l.host_profile_id=i.host_profile_id' in v_compact_recheck_definition) = 0
     or position('l.status=''live''' in v_compact_recheck_definition) = 0
     or position('l.provenance=''verified''' in v_compact_recheck_definition) = 0
     or position('l.expires_at>clock_timestamp()' in v_compact_recheck_definition) = 0
     or position('h.account_status=''active''' in v_compact_recheck_definition) = 0
     or position('h.deleted_atisnull' in v_compact_recheck_definition) = 0
     or position('s.deleted_atisnull' in v_compact_recheck_definition) = 0 then
    raise exception 'host discovery: pre-send exact worker lease/actionability lock drifted';
  end if;

  if position('frompublic.notification_deliveriesdjoinpublic.eventseone.id=d.event_idjoinpublic.invitesioni.id=e.subject_id' in v_compact_begin_definition) = 0
     or position('frompublic.invitesiwherei.id=v_invite_idforshare;' in v_compact_begin_definition) = 0
     or position('forupdateofd;' in v_compact_begin_definition) <=
       position('frompublic.invitesiwherei.id=v_invite_idforshare;' in v_compact_begin_definition)
     or position('v_delivery_worker_idisdistinctfromp_worker_id' in v_compact_begin_definition) = 0
     or position('v_claim_authority_versionisdistinctfrom''094''' in v_compact_begin_definition) = 0
     or position('v_delivery_lease_expires_at<=v_now' in v_compact_begin_definition) = 0
     or position('provider_started_at=casewhenv_actionablethencoalesce(d.provider_started_at,v_now)' in v_compact_begin_definition) = 0
     or position('lease_expires_at=v_now+interval''330seconds''' in v_compact_begin_definition) = 0
     or position('''delivery_not_startable''' in v_compact_begin_definition) = 0
     or position('i.statusin(''created'',''delivered'',''viewed'')' in v_compact_begin_definition) = 0 then
    raise exception 'host discovery: final provider-start lock/phase contract drifted';
  end if;

  if position(
       'd.notification_type<>''invite_received'''
       in v_compact_claim_definition
     ) = 0
     or position('d.notification_type=''invite_received''' in v_compact_claim_definition) > 0 then
    raise exception 'host discovery: legacy claim retained invite authority';
  end if;

  if position(
       'd.provider_started_atisnullandd.attempt_count<6'
       in v_compact_claim_v2_definition
     ) = 0
     or position(
       'd.notification_type<>''invite_received''andd.lease_expires_at<clock_timestamp()'
       in v_compact_claim_v2_definition
     ) = 0
     or position(
       'inviteprovider-startedleaseexpired;provideroutcomeunknown'
       in v_compact_claim_v2_definition
     ) = 0
     or position(
       'failure_class=''outcome_unknown'''
       in v_compact_claim_v2_definition
     ) = 0
     or position(
       'whend.notification_type=''invite_received''thengreatest(330,'
       in v_compact_claim_v2_definition
     ) = 0
     or position(
       'whend.notification_type=''invite_received''then''094'''
       in v_compact_claim_v2_definition
     ) = 0 then
    raise exception 'host discovery: versioned pre/provider-phase claim behavior drifted';
  end if;

  if position('from public.invites i' in v_host_view_definition) > 0
     or position('from public.applications a' in v_host_view_definition) = 0
     or position('from public.conversations c' in v_host_view_definition) = 0
     or position('from public.invites i' in v_display_names_definition) = 0
     or position('from public.applications a' in v_display_names_definition) = 0
     or position('from public.conversations c' in v_display_names_definition) = 0 then
    raise exception 'host discovery: applicant detail/name relationship boundary drifted';
  end if;

  insert into pg_temp.authz_log values (
    'positive',
    'discovery catalog, projection, ACL and lock contract is exact'
  );
end;
$do$;

select pg_temp.expect_denied(
  'open invite delivery cannot use a digest cadence',
  $q$insert into public.notification_deliveries (
    id, event_id, recipient_clerk_user_id, channel, category,
    notification_type, variant, dedup_key, status, cadence
  ) values (
    '9400d000-0000-4000-8000-000000000099',
    '9400f000-0000-4000-8000-000000000016',
    'user_discovery_host_a', 'push', 'offers_invites',
    'invite_received', 'digest-race', 'db-assert-094-digest-race',
    'pending', 'daily'
  )$q$,
  'notification_deliveries_invite_open_cadence_chk',
  '23514'
);

select pg_temp.expect_denied(
  'queued digest membership cannot be attached to an invite delivery',
  $q$insert into public.digest_memberships (
    id, recipient_clerk_user_id, cadence, category,
    event_id, delivery_id, status
  ) values (
    '9400c000-0000-4000-8000-000000000098',
    'user_discovery_host_a', 'weekly', 'offers_invites',
    '9400f000-0000-4000-8000-000000000016',
    '9400d000-0000-4000-8000-000000000016', 'queued'
  )$q$,
  'invite_digest_membership_forbidden',
  '23514'
);

select pg_temp.expect_denied(
  'queued digest membership cannot survive on an invite event without a delivery',
  $q$insert into public.digest_memberships (
    id, recipient_clerk_user_id, cadence, category,
    event_id, delivery_id, status
  ) values (
    '9400c000-0000-4000-8000-000000000097',
    'user_discovery_host_a', 'daily', 'offers_invites',
    '9400f000-0000-4000-8000-000000000016',
    null, 'queued'
  )$q$,
  'invite_digest_membership_forbidden',
  '23514'
);

select pg_temp.expect_denied(
  'outcome-unknown invite dead letter cannot be requeued',
  $q$update public.notification_deliveries
        set status = 'pending'
      where id = '9400d000-0000-4000-8000-000000000019'$q$,
  'invite_dead_letter_immutable',
  '23514'
);

update public.notification_deliveries
   set status = 'pending'
 where id = '9400d000-0000-4000-8000-000000000016';

do $do$
begin
  if (select status
        from public.notification_deliveries
       where id = '9400d000-0000-4000-8000-000000000016') <> 'pending' then
    raise exception 'host discovery: known-unsent invite dead letter was not requeueable';
  end if;
end;
$do$;

update public.notification_deliveries
   set status = 'dead_letter'
 where id = '9400d000-0000-4000-8000-000000000016';

select pg_temp.checkpoint_section('catalog contract', 6);

-- ---------------------------------------------------------------------------
-- Client roles cannot call either discovery RPC.
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.expect_denied(
  'anon cannot search the seeker directory',
  $q$select * from public.search_host_sourceable_seekers(
    '9400a000-0000-4000-8000-000000000001',
    '94006000-0000-4000-8000-000000000001',
    'Anna Trail', 20
  )$q$,
  'permission denied for function search_host_sourceable_seekers'
);
select pg_temp.expect_denied(
  'anon cannot withdraw a host invite',
  $q$select public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000002'
  )$q$,
  'permission denied for function withdraw_host_invite'
);
select pg_temp.expect_denied(
  'anon cannot deliver seeker invites',
  $q$select * from public.deliver_seeker_invites(
    '94001000-0000-4000-8000-000000000007',
    array['94007000-0000-4000-8000-000000000010']::uuid[]
  )$q$,
  'permission denied for function deliver_seeker_invites'
);
select pg_temp.expect_denied(
  'anon cannot settle an invite notification delivery',
  $q$select public.settle_invite_notification_delivery(
    '9400d000-0000-4000-8000-00000000001a',
    'worker-settle', null, clock_timestamp()
  )$q$,
  'permission denied for function settle_invite_notification_delivery'
);
select pg_temp.expect_denied(
  'anon cannot lock-read invite notification state',
  $q$select * from public.get_invite_notification_state(
    '94007000-0000-4000-8000-00000000001a',
    '9400d000-0000-4000-8000-00000000001a',
    'worker-settle'
  )$q$,
  'permission denied for function get_invite_notification_state'
);
select pg_temp.expect_denied(
  'anon cannot begin invite provider delivery',
  $q$select * from public.begin_invite_notification_delivery(
    '94007000-0000-4000-8000-00000000001a',
    '9400d000-0000-4000-8000-00000000001a',
    'worker-settle'
  )$q$,
  'permission denied for function begin_invite_notification_delivery'
);
select pg_temp.expect_denied(
  'anon cannot use versioned notification claim authority',
  $q$select * from public.claim_notification_deliveries_v2(
    'anon-worker', 1, 120
  )$q$,
  'permission denied for function claim_notification_deliveries_v2'
);
reset role;
set local request.jwt.claims = '{}';

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_discovery_host_a","role":"authenticated"}';
select pg_temp.expect_denied(
  'authenticated cannot read host sourceable matches directly',
  $q$select * from public.get_host_sourceable_matches(
    '9400a000-0000-4000-8000-000000000001',
    '94006000-0000-4000-8000-000000000001',
    20
  )$q$,
  'permission denied for function get_host_sourceable_matches'
);
select pg_temp.expect_denied(
  'authenticated cannot withdraw a host invite directly',
  $q$select public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000002'
  )$q$,
  'permission denied for function withdraw_host_invite'
);
select pg_temp.expect_denied(
  'authenticated cannot deliver seeker invites directly',
  $q$select * from public.deliver_seeker_invites(
    '94001000-0000-4000-8000-000000000007',
    array['94007000-0000-4000-8000-000000000010']::uuid[]
  )$q$,
  'permission denied for function deliver_seeker_invites'
);
select pg_temp.expect_denied(
  'authenticated cannot settle an invite notification delivery',
  $q$select public.settle_invite_notification_delivery(
    '9400d000-0000-4000-8000-00000000001a',
    'worker-settle', null, clock_timestamp()
  )$q$,
  'permission denied for function settle_invite_notification_delivery'
);
select pg_temp.expect_denied(
  'authenticated cannot lock-read invite notification state',
  $q$select * from public.get_invite_notification_state(
    '94007000-0000-4000-8000-00000000001a',
    '9400d000-0000-4000-8000-00000000001a',
    'worker-settle'
  )$q$,
  'permission denied for function get_invite_notification_state'
);
select pg_temp.expect_denied(
  'authenticated cannot begin invite provider delivery',
  $q$select * from public.begin_invite_notification_delivery(
    '94007000-0000-4000-8000-00000000001a',
    '9400d000-0000-4000-8000-00000000001a',
    'worker-settle'
  )$q$,
  'permission denied for function begin_invite_notification_delivery'
);
select pg_temp.expect_denied(
  'authenticated cannot use versioned notification claim authority',
  $q$select * from public.claim_notification_deliveries_v2(
    'authenticated-worker', 1, 120
  )$q$,
  'permission denied for function claim_notification_deliveries_v2'
);
select pg_temp.expect_write_rows(
  'dual-role seeker cannot opt a foreign profile into host discovery',
  $q$update public.seeker_profiles
        set host_discovery_enabled = false
      where id = '94001000-0000-4000-8000-000000000001'$q$,
  0
);
select pg_temp.expect_write_rows(
  'seeker owner can opt their own profile into host discovery',
  $q$update public.seeker_profiles
        set host_discovery_enabled = true
      where id = '94001000-0000-4000-8000-000000000009'$q$,
  1
);
select pg_temp.expect_rows(
  'dual-role host cannot raw-select a discovery candidate',
  $q$select id from public.seeker_profiles
      where id = '94001000-0000-4000-8000-000000000001'$q$,
  0
);
select pg_temp.expect_rows(
  'dual-role host retains raw access only to its own seeker row',
  $q$select id from public.seeker_profiles
      where id = '94001000-0000-4000-8000-000000000009'$q$,
  1
);
select pg_temp.expect_rows(
  'seeker cannot read a refundable created invite before delivery authority',
  $q$select id from public.invites
      where id = '94007000-0000-4000-8000-000000000016'$q$,
  0
);
reset role;
set local request.jwt.claims = '{}';

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_discovery_host_b","role":"authenticated"}';
select pg_temp.expect_rows(
  'owning host retains its created invite sent-list row',
  $q$select id from public.invites
      where id = '94007000-0000-4000-8000-000000000016'$q$,
  1
);
select pg_temp.expect_write_rows(
  'authenticated host cannot bypass atomic withdrawal by direct update',
  $q$update public.invites
        set status = 'withdrawn'
      where id = '94007000-0000-4000-8000-000000000002'$q$,
  0
);
reset role;
set local request.jwt.claims = '{}';

select pg_temp.checkpoint_section('client RPC, consent and raw table isolation', 21);

-- ---------------------------------------------------------------------------
-- Applicant privacy: an outbound invite supports the sent-list display name,
-- not full profile/resume disclosure. An application remains explicit consent
-- for the existing applicant-review projection.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_discovery_host_b","role":"authenticated"}';
select pg_temp.expect_rows(
  'invite-only host can resolve the narrow sent-list display name',
  $q$select 1 from public.get_host_applicant_display_names(
      array['94001000-0000-4000-8000-000000000002']::uuid[]
    ) where display_name = 'Anna Trail Guide'$q$,
  1
);
select pg_temp.expect_rows(
  'invite-only host cannot read the full seeker profile',
  $q$select 1 from public.get_host_applicant_profile(
      '94001000-0000-4000-8000-000000000002'
    )$q$,
  0
);
select pg_temp.expect_rows(
  'invite-only host cannot read seeker resume experience',
  $q$select 1 from public.get_host_applicant_experiences(
      '94001000-0000-4000-8000-000000000002'
    )$q$,
  0
);
select pg_temp.expect_rows(
  'host cannot raw-select pre-application match internals',
  $q$select score, confidence, components
        from public.match_scores
       where listing_id = '94006000-0000-4000-8000-000000000002'
         and seeker_profile_id = '94001000-0000-4000-8000-000000000002'$q$,
  0
);
reset role;
set local request.jwt.claims = '{}';

insert into public.applications (
  id, listing_id, seeker_profile_id, status, source
)
values (
  '94008000-0000-4000-8000-000000000004',
  '94006000-0000-4000-8000-000000000002',
  '94001000-0000-4000-8000-000000000002',
  'applied', 'direct'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_discovery_host_b","role":"authenticated"}';
select pg_temp.expect_rows(
  'application relationship unlocks the raw applicant match row',
  $q$select score, confidence, components
        from public.match_scores
       where listing_id = '94006000-0000-4000-8000-000000000002'
         and seeker_profile_id = '94001000-0000-4000-8000-000000000002'$q$,
  1
);
select pg_temp.expect_rows(
  'application relationship unlocks the applicant profile',
  $q$select 1 from public.get_host_applicant_profile(
      '94001000-0000-4000-8000-000000000002'
    )$q$,
  1
);
select pg_temp.expect_rows(
  'application relationship unlocks applicant resume experience',
  $q$select 1 from public.get_host_applicant_experiences(
      '94001000-0000-4000-8000-000000000002'
    )$q$,
  1
);
reset role;
set local request.jwt.claims = '{}';

select pg_temp.checkpoint_section('applicant detail and raw match privacy boundary', 7);

-- ---------------------------------------------------------------------------
-- Service-role read behavior: normalization, literal symbols, exact ranking,
-- actionability, sourceability, application exclusion, and invite annotation.
-- ---------------------------------------------------------------------------

set local role service_role;

do $do$
declare
  v_ids uuid[];
  v_invited boolean;
begin
  select array_agg(result.seeker_profile_id order by result.ordinality),
         bool_or(result.already_invited)
    into v_ids, v_invited
    from public.search_host_sourceable_seekers(
      '9400a000-0000-4000-8000-000000000001',
      '94006000-0000-4000-8000-000000000001',
      E'\t Anna \n Trail \t',
      20
    ) with ordinality result;

  if v_ids is distinct from array[
      '94001000-0000-4000-8000-000000000001'::uuid,
      '94001000-0000-4000-8000-000000000002'::uuid,
      '94001000-0000-4000-8000-000000000003'::uuid,
      '94001000-0000-4000-8000-000000000004'::uuid
    ]
     or v_invited is distinct from true then
    raise exception 'host discovery: normalized exact/prefix/name/bio search order or invite annotation drifted: %', v_ids;
  end if;

  select array_agg(result.seeker_profile_id order by result.ordinality)
    into v_ids
    from public.search_host_sourceable_seekers(
      '9400a000-0000-4000-8000-000000000001',
      '94006000-0000-4000-8000-000000000001',
      '%_',
      20
    ) with ordinality result;
  if v_ids is distinct from array[
    '94001000-0000-4000-8000-000000000005'::uuid
  ] then
    raise exception 'host discovery: percent/underscore search is not an exact literal result set: %', v_ids;
  end if;

  select array_agg(result.seeker_profile_id order by result.ordinality)
    into v_ids
    from public.get_host_sourceable_matches(
      '9400a000-0000-4000-8000-000000000001',
      '94006000-0000-4000-8000-000000000001',
      5
    ) with ordinality result;
  if v_ids is distinct from array[
      '94001000-0000-4000-8000-000000000001'::uuid,
      '94001000-0000-4000-8000-000000000005'::uuid,
      '94001000-0000-4000-8000-000000000002'::uuid,
      '94001000-0000-4000-8000-000000000003'::uuid,
      '94001000-0000-4000-8000-000000000004'::uuid
    ] then
    raise exception 'host discovery: match score/computed/id order or exclusions drifted: %', v_ids;
  end if;

  perform pg_temp.expect_denied(
    'search rejects normalized query shorter than two characters',
    $q$select * from public.search_host_sourceable_seekers(
      '9400a000-0000-4000-8000-000000000001',
      '94006000-0000-4000-8000-000000000001', E' \t x \n ', 20
    )$q$,
    'invalid_request', '22023'
  );
  perform pg_temp.expect_denied(
    'search rejects queries longer than one hundred characters',
    $q$select * from public.search_host_sourceable_seekers(
      '9400a000-0000-4000-8000-000000000001',
      '94006000-0000-4000-8000-000000000001', repeat('x', 101), 20
    )$q$,
    'invalid_request', '22023'
  );
  perform pg_temp.expect_denied(
    'search rejects a limit above twenty',
    $q$select * from public.search_host_sourceable_seekers(
      '9400a000-0000-4000-8000-000000000001',
      '94006000-0000-4000-8000-000000000001', 'Anna Trail', 21
    )$q$,
    'invalid_request', '22023'
  );
  perform pg_temp.expect_denied(
    'matches reject a limit above fifty',
    $q$select * from public.get_host_sourceable_matches(
      '9400a000-0000-4000-8000-000000000001',
      '94006000-0000-4000-8000-000000000001', 51
    )$q$,
    'invalid_request', '22023'
  );
  perform pg_temp.expect_denied(
    'search hides a foreign listing behind listing_unavailable',
    $q$select * from public.search_host_sourceable_seekers(
      '9400a000-0000-4000-8000-000000000001',
      '94006000-0000-4000-8000-000000000002', 'Anna Trail', 20
    )$q$,
    'listing_unavailable', '42501'
  );
  perform pg_temp.expect_denied(
    'matches hide an ineligible listing behind listing_unavailable',
    $q$select * from public.get_host_sourceable_matches(
      '9400a000-0000-4000-8000-000000000001',
      '94006000-0000-4000-8000-000000000004', 20
    )$q$,
    'listing_unavailable', '42501'
  );
  perform pg_temp.expect_denied(
    'search hides a sourced listing behind listing_unavailable',
    $q$select * from public.search_host_sourceable_seekers(
      '9400a000-0000-4000-8000-000000000001',
      '94006000-0000-4000-8000-000000000006', 'Anna Trail', 20
    )$q$,
    'listing_unavailable', '42501'
  );

  insert into pg_temp.authz_log values (
    'positive',
    'service discovery normalization, order, filtering and errors are exact'
  );
end;
$do$;

reset role;

select pg_temp.checkpoint_section('service discovery behavior', 8);

-- ---------------------------------------------------------------------------
-- Service-role delivery behavior: row-locked expiry, created-only stamping,
-- authoritative active results, ownership filtering, and idempotent retry.
-- ---------------------------------------------------------------------------

set local role service_role;

do $do$
declare
  v_rows jsonb;
  v_delivered_at timestamptz;
  v_count bigint;
begin
  perform pg_temp.expect_denied(
    'delivery rejects a duplicate invite id array',
    $q$select * from public.deliver_seeker_invites(
      '94001000-0000-4000-8000-000000000007',
      array[
        '94007000-0000-4000-8000-000000000010',
        '94007000-0000-4000-8000-000000000010'
      ]::uuid[]
    )$q$,
    'invalid_request',
    '22023'
  );

  -- The service candidate read may be broader, but the stamping RPC is the
  -- final authority. Each domain invalidation must leave the created row
  -- untouched and return no renderable invite.
  update public.listings
     set status = 'paused'
   where id = '94006000-0000-4000-8000-000000000001';
  select count(*) into v_count
    from public.deliver_seeker_invites(
      '94001000-0000-4000-8000-000000000007',
      array['94007000-0000-4000-8000-000000000010']::uuid[]
    );
  if v_count <> 0 then
    raise exception 'host discovery: paused listing invite was delivered';
  end if;
  update public.listings
     set status = 'live'
   where id = '94006000-0000-4000-8000-000000000001';
  select count(*) into v_count
    from public.deliver_seeker_invites(
      '94001000-0000-4000-8000-00000000000b',
      array['94007000-0000-4000-8000-00000000001e']::uuid[]
    );
  if v_count <> 0
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-00000000001e') <> 'created' then
    raise exception 'host discovery: unverified listing invite was delivered';
  end if;
  update public.listings
     set expires_at = clock_timestamp() - interval '1 second'
   where id = '94006000-0000-4000-8000-000000000001';
  select count(*) into v_count
    from public.deliver_seeker_invites(
      '94001000-0000-4000-8000-000000000007',
      array['94007000-0000-4000-8000-000000000010']::uuid[]
    );
  if v_count <> 0 then
    raise exception 'host discovery: expired listing invite was delivered';
  end if;
  update public.listings
     set expires_at = clock_timestamp() + interval '30 days'
   where id = '94006000-0000-4000-8000-000000000001';

  update public.host_profiles
     set account_status = 'paused'
   where id = '9400a000-0000-4000-8000-000000000001';
  select count(*) into v_count
    from public.deliver_seeker_invites(
      '94001000-0000-4000-8000-000000000007',
      array['94007000-0000-4000-8000-000000000010']::uuid[]
    );
  if v_count <> 0 then
    raise exception 'host discovery: inactive host invite was delivered';
  end if;
  update public.host_profiles
     set account_status = 'active', deleted_at = clock_timestamp()
   where id = '9400a000-0000-4000-8000-000000000001';
  select count(*) into v_count
    from public.deliver_seeker_invites(
      '94001000-0000-4000-8000-000000000007',
      array['94007000-0000-4000-8000-000000000010']::uuid[]
    );
  if v_count <> 0 then
    raise exception 'host discovery: deleted host invite was delivered';
  end if;
  update public.host_profiles
     set deleted_at = null
   where id = '9400a000-0000-4000-8000-000000000001';

  update public.seeker_profiles
     set deleted_at = clock_timestamp()
   where id = '94001000-0000-4000-8000-000000000007';
  select count(*) into v_count
    from public.deliver_seeker_invites(
      '94001000-0000-4000-8000-000000000007',
      array['94007000-0000-4000-8000-000000000010']::uuid[]
    );
  if v_count <> 0
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000010') <> 'created' then
    raise exception 'host discovery: deleted seeker invite was delivered/stamped';
  end if;
  update public.seeker_profiles
     set deleted_at = null
   where id = '94001000-0000-4000-8000-000000000007';

  select jsonb_agg(
           jsonb_build_object(
             'invite_id', delivered.invite_id,
             'status', delivered.status
           )
           order by delivered.ordinality
         )
    into v_rows
    from public.deliver_seeker_invites(
      '94001000-0000-4000-8000-000000000007',
      array[
        '94007000-0000-4000-8000-000000000015',
        '94007000-0000-4000-8000-000000000014',
        '94007000-0000-4000-8000-000000000013',
        '94007000-0000-4000-8000-000000000012',
        '94007000-0000-4000-8000-000000000011',
        '94007000-0000-4000-8000-000000000010',
        '94007000-0000-4000-8000-000000000002'
      ]::uuid[]
    ) with ordinality delivered;

  if v_rows is distinct from '[
      {"invite_id":"94007000-0000-4000-8000-000000000010","status":"delivered"}
    ]'::jsonb
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000010') <> 'delivered'
     or (select delivered_at from public.invites
          where id = '94007000-0000-4000-8000-000000000010') is null
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000011') <> 'created'
     or (select delivered_at from public.invites
          where id = '94007000-0000-4000-8000-000000000011') is not null
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000012') <> 'created'
     or (select delivered_at from public.invites
          where id = '94007000-0000-4000-8000-000000000012') is not null
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000015') <> 'withdrawn'
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000002') <> 'created' then
    raise exception 'host discovery: atomic delivery result/stamp/filter drifted: %', v_rows;
  end if;

  select delivered_at into v_delivered_at
    from public.invites
   where id = '94007000-0000-4000-8000-000000000010';

  select jsonb_agg(
           jsonb_build_object(
             'invite_id', delivered.invite_id,
             'status', delivered.status
           )
           order by delivered.ordinality
         )
    into v_rows
    from public.deliver_seeker_invites(
      '94001000-0000-4000-8000-000000000007',
      array[
        '94007000-0000-4000-8000-000000000014',
        '94007000-0000-4000-8000-000000000013',
        '94007000-0000-4000-8000-000000000010'
      ]::uuid[]
    ) with ordinality delivered;

  if v_rows is distinct from '[
      {"invite_id":"94007000-0000-4000-8000-000000000010","status":"delivered"}
    ]'::jsonb
     or (select delivered_at from public.invites
          where id = '94007000-0000-4000-8000-000000000010')
       is distinct from v_delivered_at then
    raise exception 'host discovery: delivery retry changed authoritative state: %', v_rows;
  end if;

  insert into pg_temp.authz_log values (
    'positive',
    'atomic delivery expiry, ownership, status and retry behavior are exact'
  );
end;
$do$;

reset role;

select pg_temp.checkpoint_section('invite delivery behavior', 2);

-- ---------------------------------------------------------------------------
-- Provider settlement authority: exact event mapping, worker ownership,
-- post-send expiry truth, withdrawn cancellation, and crash outcome handling.
-- ---------------------------------------------------------------------------

set local role service_role;

do $do$
declare
  v_result jsonb;
  v_state record;
  v_claimed bigint;
  v_historical_restore_conflicts bigint;
  v_nonactionable_invite_ids uuid[] := array[
    '94007000-0000-4000-8000-000000000011'::uuid,
    '94007000-0000-4000-8000-000000000012'::uuid,
    '94007000-0000-4000-8000-000000000013'::uuid,
    '94007000-0000-4000-8000-000000000014'::uuid,
    '94007000-0000-4000-8000-00000000001b'::uuid,
    '94007000-0000-4000-8000-00000000001d'::uuid,
    '94007000-0000-4000-8000-00000000001e'::uuid
  ];
  v_nonactionable_delivery_ids uuid[] := array[
    '9400d000-0000-4000-8000-000000000011'::uuid,
    '9400d000-0000-4000-8000-000000000012'::uuid,
    '9400d000-0000-4000-8000-000000000013'::uuid,
    '9400d000-0000-4000-8000-000000000014'::uuid,
    '9400d000-0000-4000-8000-00000000001b'::uuid,
    '9400d000-0000-4000-8000-00000000001d'::uuid,
    '9400d000-0000-4000-8000-00000000001e'::uuid
  ];
  v_nonactionable_worker_ids text[] := array[
    'worker-recheck',
    'worker-recheck',
    'worker-recheck',
    'worker-recheck',
    'worker-withdrawn',
    'worker-crashed',
    'worker-recheck'
  ];
  v_index integer;
  v_error_message text;
  v_lease_before timestamptz;
  -- Deliberately stale caller time: settlement must use the locked database
  -- clock after provider success, never this run-start timestamp.
  v_delivered_at timestamptz := '2000-01-01 00:00:00+00';
begin
  select lease_expires_at into v_lease_before
    from public.notification_deliveries
   where id = '9400d000-0000-4000-8000-00000000001a';

  begin
    perform 1
      from public.get_invite_notification_state(
        '94007000-0000-4000-8000-00000000001a',
        '9400d000-0000-4000-8000-00000000001a',
        'wrong-worker'
      );
    raise exception 'host discovery: stale worker recheck was allowed';
  exception when sqlstate '55000' then
    get stacked diagnostics v_error_message = message_text;
    if v_error_message <> 'delivery_not_recheckable' then
      raise exception 'host discovery: stale worker recheck error drifted: %',
        v_error_message;
    end if;
  end;
  if (select lease_expires_at from public.notification_deliveries
       where id = '9400d000-0000-4000-8000-00000000001a')
       is distinct from v_lease_before then
    raise exception 'host discovery: stale worker renewed the invite lease';
  end if;

  update public.notification_deliveries
     set lease_expires_at = clock_timestamp() - interval '1 second'
   where id = '9400d000-0000-4000-8000-00000000001a';
  begin
    perform 1
      from public.get_invite_notification_state(
        '94007000-0000-4000-8000-00000000001a',
        '9400d000-0000-4000-8000-00000000001a',
        'worker-settle'
      );
    raise exception 'host discovery: expired worker recheck was allowed';
  exception when sqlstate '55000' then
    get stacked diagnostics v_error_message = message_text;
    if v_error_message <> 'delivery_not_recheckable' then
      raise exception 'host discovery: expired worker recheck error drifted: %',
        v_error_message;
    end if;
  end;
  if (select lease_expires_at >= clock_timestamp()
        from public.notification_deliveries
       where id = '9400d000-0000-4000-8000-00000000001a') is true then
    raise exception 'host discovery: expired worker renewed the invite lease';
  end if;

  update public.notification_deliveries
     set lease_expires_at = clock_timestamp() + interval '10 seconds'
   where id = '9400d000-0000-4000-8000-00000000001a';
  select * into v_state
    from public.get_invite_notification_state(
      '94007000-0000-4000-8000-00000000001a',
      '9400d000-0000-4000-8000-00000000001a',
      'worker-settle'
    );
  if not found
     or v_state.status is distinct from 'created'
     or v_state.expires_at <= clock_timestamp()
     or (select lease_expires_at from public.notification_deliveries
          where id = '9400d000-0000-4000-8000-00000000001a')
          < clock_timestamp() + interval '320 seconds' then
    raise exception 'host discovery: locking invite notification lease renewal drifted';
  end if;

  select * into v_state
    from public.begin_invite_notification_delivery(
      '94007000-0000-4000-8000-00000000001a',
      '9400d000-0000-4000-8000-00000000001a',
      'worker-settle'
    );
  if not found
     or v_state.status is distinct from 'created'
     or v_state.expires_at <= clock_timestamp()
     or not exists (
       select 1
         from public.notification_deliveries
        where id = '9400d000-0000-4000-8000-00000000001a'
          and provider_started_at is not null
          and claim_authority_version = '094'
          and lease_expires_at >= clock_timestamp() + interval '320 seconds'
     ) then
    raise exception 'host discovery: final provider boundary phase/lease drifted';
  end if;

  -- Give the deleted-seeker fixture a live owned lease for the domain-state
  -- check, then restore its malformed NULL lease for the claim-sweep proof.
  update public.notification_deliveries
     set lease_expires_at = clock_timestamp() + interval '10 minutes'
   where id = '9400d000-0000-4000-8000-00000000001d';

  for v_index in 1..array_length(v_nonactionable_invite_ids, 1) loop
    perform 1
      from public.get_invite_notification_state(
        v_nonactionable_invite_ids[v_index],
        v_nonactionable_delivery_ids[v_index],
        v_nonactionable_worker_ids[v_index]
      );
    if found then
      raise exception
        'host discovery: pre-send actionability invalidation drifted for %',
        v_nonactionable_invite_ids[v_index];
    end if;
  end loop;

  -- The final provider-boundary call repeats domain actionability under the
  -- same invite -> delivery locks. A nonactionable row returns no state and
  -- must not acquire the durable provider-start marker.
  perform 1
    from public.begin_invite_notification_delivery(
      '94007000-0000-4000-8000-000000000011',
      '9400d000-0000-4000-8000-000000000011',
      'worker-recheck'
    );
  if found
     or (select provider_started_at
           from public.notification_deliveries
          where id = '9400d000-0000-4000-8000-000000000011') is not null then
    raise exception 'host discovery: nonactionable provider boundary marked submission';
  end if;

  update public.notification_deliveries
     set lease_expires_at = null
   where id = '9400d000-0000-4000-8000-00000000001d';

  begin
    perform 1
      from public.get_invite_notification_state(
        '94007000-0000-4000-8000-00000000001c',
        '9400d000-0000-4000-8000-00000000001c',
        'worker-bad'
      );
    raise exception 'host discovery: mismatched relationship recheck was allowed';
  exception when sqlstate '55000' then
    get stacked diagnostics v_error_message = message_text;
    if v_error_message <> 'delivery_not_recheckable' then
      raise exception 'host discovery: mismatched relationship recheck error drifted: %',
        v_error_message;
    end if;
  end;

  -- Simulate provider latency crossing the invite expiry boundary after the
  -- valid locking recheck. Settlement must preserve the successful send.
  update public.invites
     set status = 'expired',
         expires_at = clock_timestamp() - interval '1 second'
   where id = '94007000-0000-4000-8000-00000000001a';

  v_result := public.settle_invite_notification_delivery(
    null, 'worker-settle', null, v_delivered_at
  );
  if v_result is distinct from '{"ok":false,"error":"invalid_request"}'::jsonb then
    raise exception 'host discovery: settlement invalid request drifted: %', v_result;
  end if;

  v_result := public.settle_invite_notification_delivery(
    '9400d000-0000-4000-8000-00000000001a',
    'wrong-worker', null, v_delivered_at
  );
  if v_result is distinct from '{"ok":false,"error":"delivery_not_settleable"}'::jsonb
     or (select status from public.notification_deliveries
          where id = '9400d000-0000-4000-8000-00000000001a') <> 'processing'
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-00000000001a') <> 'expired' then
    raise exception 'host discovery: wrong-worker settlement changed state: %', v_result;
  end if;

  v_result := public.settle_invite_notification_delivery(
    '9400d000-0000-4000-8000-00000000001c',
    'worker-bad', null, v_delivered_at
  );
  if v_result is distinct from '{"ok":false,"error":"delivery_not_settleable"}'::jsonb
     or (select status from public.notification_deliveries
          where id = '9400d000-0000-4000-8000-00000000001c') <> 'processing' then
    raise exception 'host discovery: mismatched event dimensions settled: %', v_result;
  end if;

  -- This invite expired after the simulated provider submission began. A
  -- successful provider result remains delivered/non-refundable; settlement
  -- must not relabel that real send as cancelled.
  v_result := public.settle_invite_notification_delivery(
    '9400d000-0000-4000-8000-00000000001a',
    'worker-settle', 'provider-db-assert-1a', v_delivered_at
  );
  if v_result is distinct from jsonb_build_object(
       'ok', true,
       'status', 'delivered',
       'invite_id', '94007000-0000-4000-8000-00000000001a'::uuid
     )
     or not exists (
       select 1
        from public.invites i
         join public.notification_deliveries d
           on d.id = '9400d000-0000-4000-8000-00000000001a'
        where i.id = '94007000-0000-4000-8000-00000000001a'
          and i.status = 'expired'
          and i.delivered_at = d.delivered_at
          and d.status = 'delivered'
          and d.delivered_at >= d.provider_started_at
          and d.delivered_at > v_delivered_at
          and d.provider_message_id = 'provider-db-assert-1a'
          and d.worker_id is null
          and d.lease_expires_at is null
          and d.provider_started_at is not null
          and d.claim_authority_version is null
     ) then
    raise exception 'host discovery: post-send expiry settlement drifted: %', v_result;
  end if;

  v_result := public.settle_invite_notification_delivery(
    '9400d000-0000-4000-8000-00000000001b',
    'worker-withdrawn', null, v_delivered_at
  );
  if v_result is distinct from jsonb_build_object(
       'ok', true,
       'status', 'cancelled',
       'invite_id', '94007000-0000-4000-8000-00000000001b'::uuid
     )
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-00000000001b') <> 'withdrawn'
     or not exists (
       select 1
         from public.notification_deliveries
        where id = '9400d000-0000-4000-8000-00000000001b'
          and status = 'cancelled'
          and suppression_reason = 'invite_not_actionable'
          and worker_id is null
          and lease_expires_at is null
     ) then
    raise exception 'host discovery: withdrawn late settlement drifted: %', v_result;
  end if;

  -- A later item in a sequential batch must not age out under the caller's
  -- legacy 120-second request before its first worker-bound recheck.
  update public.notification_deliveries
     set status = 'pending',
         worker_id = null,
         lease_expires_at = null,
         next_attempt_at = clock_timestamp() - interval '1 minute'
   where id = '9400d000-0000-4000-8000-00000000001c';

  -- A provider-started expired claim is ambiguous and immutable. The deleted
  -- seeker's expired pre-provider claim remains safely reclaimable.
  update public.notification_deliveries
     set provider_started_at = clock_timestamp(),
         lease_expires_at = null
   where id = '9400d000-0000-4000-8000-000000000011';

  select count(*) into v_claimed
    from public.claim_notification_deliveries_v2('claim-sweep-094', 100, 120);
  if v_claimed <> 2
     or not exists (
       select 1
         from public.notification_deliveries
        where id = '9400d000-0000-4000-8000-000000000011'
          and status = 'dead_letter'
          and failure_class = 'outcome_unknown'
          and failure_detail =
            'invite provider-started lease expired; provider outcome unknown'
          and provider_started_at is not null
          and claim_authority_version is null
          and worker_id is null
          and lease_expires_at is null
     )
     or not exists (
       select 1
         from public.notification_deliveries
        where id in (
          '9400d000-0000-4000-8000-00000000001c',
          '9400d000-0000-4000-8000-00000000001d'
        )
          and status = 'processing'
          and worker_id = 'claim-sweep-094'
          and provider_started_at is null
          and claim_authority_version = '094'
          and lease_expires_at >= clock_timestamp() + interval '320 seconds'
        group by status, worker_id, claim_authority_version
       having count(*) = 2
     ) then
    raise exception
      'host discovery: provider-phase sweep or versioned 330-second claim drifted: %',
      v_claimed;
  end if;

  select count(*) into v_historical_restore_conflicts
    from public.notification_deliveries d
    join public.events e on e.id = d.event_id
    join public.invites i on i.id = e.subject_id
    join public.seeker_profiles s on s.id = i.seeker_profile_id
    join public.invite_credit_events restore
      on restore.invite_id = i.id
     and restore.host_profile_id = i.host_profile_id
     and restore.kind = 'restore'
   where d.notification_type = 'invite_received'
     and (
       d.status = 'delivered'
       or (
         d.status = 'dead_letter'
         and d.failure_class = 'outcome_unknown'
       )
     )
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and e.subject_id = i.id
     and e.listing_id = i.listing_id
     and e.host_profile_id = i.host_profile_id
     and e.seeker_profile_id = i.seeker_profile_id
     and d.recipient_clerk_user_id = s.clerk_user_id;
  if v_historical_restore_conflicts <> 0 then
    raise exception
      'host discovery: historical nonrefundable invite restore conflict count drifted: %',
      v_historical_restore_conflicts;
  end if;

  insert into pg_temp.authz_log values (
    'positive',
    'invite notification settlement, expiry, mapping and crash outcomes are exact'
  );
end;
$do$;

reset role;

select pg_temp.checkpoint_section('invite notification settlement behavior', 1);

-- ---------------------------------------------------------------------------
-- Writer domain results and no-spend invariant. Every refusal precedes the one
-- successful monthly invite, so zero ledger rows is an unambiguous assertion.
-- ---------------------------------------------------------------------------

set local role service_role;

do $do$
declare
  v_result jsonb;
  v_invites_before bigint;
  v_events_before bigint;
  v_invite_id uuid;
begin
  select count(*) into v_invites_before
    from public.invites
   where host_profile_id in (
     '9400a000-0000-4000-8000-000000000001',
     '9400b000-0000-4000-8000-000000000002',
     '9400c000-0000-4000-8000-000000000003'
   );
  select count(*) into v_events_before
    from public.invite_credit_events
   where host_profile_id in (
     '9400a000-0000-4000-8000-000000000001',
     '9400b000-0000-4000-8000-000000000002',
     '9400c000-0000-4000-8000-000000000003'
   );

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000c',
    '94006000-0000-4000-8000-000000000001',
    repeat('x', 501)
  );
  if v_result is distinct from '{"ok":false,"error":"invalid_request"}'::jsonb then
    raise exception 'host discovery: over-500-code-point message error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    null,
    '94001000-0000-4000-8000-00000000000c',
    '94006000-0000-4000-8000-000000000001',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"invalid_request"}'::jsonb then
    raise exception 'host discovery: null identifier error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400c000-0000-4000-8000-000000000003',
    '94001000-0000-4000-8000-00000000000c',
    '94006000-0000-4000-8000-000000000003',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"host_not_eligible"}'::jsonb then
    raise exception 'host discovery: inactive host error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000c',
    '94006000-0000-4000-8000-000000000002',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"listing_not_actionable"}'::jsonb then
    raise exception 'host discovery: foreign listing error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000c',
    '94006000-0000-4000-8000-000000000004',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"listing_not_actionable"}'::jsonb then
    raise exception 'host discovery: draft listing error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000c',
    '94006000-0000-4000-8000-000000000005',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"listing_not_actionable"}'::jsonb then
    raise exception 'host discovery: expired listing error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000c',
    '94006000-0000-4000-8000-000000000006',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"listing_not_actionable"}'::jsonb then
    raise exception 'host discovery: sourced listing error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-000000000006',
    '94006000-0000-4000-8000-000000000001',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"seeker_not_sourceable"}'::jsonb then
    raise exception 'host discovery: hidden seeker error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-000000000007',
    '94006000-0000-4000-8000-000000000001',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"seeker_not_sourceable"}'::jsonb then
    raise exception 'host discovery: incomplete seeker error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-000000000008',
    '94006000-0000-4000-8000-000000000001',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"seeker_not_sourceable"}'::jsonb then
    raise exception 'host discovery: deleted seeker error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-000000000009',
    '94006000-0000-4000-8000-000000000001',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"seeker_not_sourceable"}'::jsonb then
    raise exception 'host discovery: self seeker error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000f',
    '94006000-0000-4000-8000-000000000001',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"seeker_not_sourceable"}'::jsonb then
    raise exception 'host discovery: opted-out seeker error drifted: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000a',
    '94006000-0000-4000-8000-000000000001',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"already_applied"}'::jsonb then
    raise exception 'host discovery: existing application must precede hidden seeker sourceability: %', v_result;
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-000000000001',
    '94006000-0000-4000-8000-000000000001',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"already_invited"}'::jsonb then
    raise exception 'host discovery: existing invite error drifted: %', v_result;
  end if;

  if (select count(*) from public.invites
       where host_profile_id in (
         '9400a000-0000-4000-8000-000000000001',
         '9400b000-0000-4000-8000-000000000002',
         '9400c000-0000-4000-8000-000000000003'
       ))
       <> v_invites_before
     or (select count(*) from public.invite_credit_events
          where host_profile_id in (
            '9400a000-0000-4000-8000-000000000001',
            '9400b000-0000-4000-8000-000000000002',
            '9400c000-0000-4000-8000-000000000003'
          ))
       <> v_events_before then
    raise exception 'host discovery: refusal inserted an invite or spent credit';
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000c',
    '94006000-0000-4000-8000-000000000001',
    '  Welcome to the crew.  '
  );
  if (v_result ->> 'ok')::boolean is distinct from true
     or v_result ->> 'source' is distinct from 'monthly'
     or (select count(*) from jsonb_object_keys(v_result)) <> 3 then
    raise exception 'host discovery: successful monthly result drifted: %', v_result;
  end if;
  v_invite_id := (v_result ->> 'invite_id')::uuid;

  if not exists (
    select 1
      from public.invites i
      join public.invite_credit_events e
        on e.invite_id = i.id
       and e.host_profile_id = i.host_profile_id
       and e.kind = 'consume'
       and e.source = 'monthly'
       and e.credits = 1
     where i.id = v_invite_id
       and i.listing_id = '94006000-0000-4000-8000-000000000001'
       and i.host_profile_id = '9400a000-0000-4000-8000-000000000001'
       and i.seeker_profile_id = '94001000-0000-4000-8000-00000000000c'
       and i.status = 'created'
       and i.message = 'Welcome to the crew.'
  )
     or not exists (
       select 1
         from public.events ev
        where ev.event_type = 'invite_created'
          and ev.actor_scope = 'host'
          and ev.subject_type = 'invite'
          and ev.subject_id = v_invite_id
          and ev.listing_id = '94006000-0000-4000-8000-000000000001'
          and ev.host_profile_id = '9400a000-0000-4000-8000-000000000001'
          and ev.seeker_profile_id = '94001000-0000-4000-8000-00000000000c'
          and ev.source_surface = 'invite_authority'
          and ev.properties = '{"authority_version":"094"}'::jsonb
  ) then
    raise exception 'host discovery: invite, monthly consume and canonical event were not atomic';
  end if;

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000c',
    '94006000-0000-4000-8000-000000000001',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"already_invited"}'::jsonb
     or (select count(*) from public.invite_credit_events e
          where e.invite_id = v_invite_id and e.kind = 'consume') <> 1
     or (select count(*) from public.events ev
          where ev.subject_id = v_invite_id
            and ev.event_type = 'invite_created'
            and ev.source_surface = 'invite_authority'
            and ev.properties ->> 'authority_version' = '094') <> 1 then
    raise exception 'host discovery: duplicate retry spent another credit: %', v_result;
  end if;

  -- Simulate an action that read Enterprise (20) before the authoritative
  -- subscription row was downgraded. The old allowance-bearing RPC is no
  -- longer executable, and the replacement derives the post-downgrade tier.
  update public.host_subscriptions
     set tier = 'none', billing_status = 'cancelled'
   where clerk_user_id = ' user_discovery_host_a ';
  select count(*) into v_invites_before
    from public.invites
   where host_profile_id = '9400a000-0000-4000-8000-000000000001';
  select count(*) into v_events_before
    from public.invite_credit_events
   where host_profile_id = '9400a000-0000-4000-8000-000000000001';

  perform pg_temp.expect_denied(
    'legacy writer cannot spend a stale high caller allowance',
    $q$select public.create_invite_with_credit(
      '9400a000-0000-4000-8000-000000000001',
      '94001000-0000-4000-8000-00000000000d',
      '94006000-0000-4000-8000-000000000001',
      null, null, 20
    )$q$,
    'permission denied for function create_invite_with_credit'
  );

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000d',
    '94006000-0000-4000-8000-000000000001',
    null
  );
  if v_result is distinct from '{"ok":false,"error":"invite_credits_required"}'::jsonb
     or (select count(*) from public.invites
          where host_profile_id = '9400a000-0000-4000-8000-000000000001')
       <> v_invites_before
     or (select count(*) from public.invite_credit_events
          where host_profile_id = '9400a000-0000-4000-8000-000000000001')
       <> v_events_before then
    raise exception 'host discovery: stale high caller allowance authorized spend after downgrade: %', v_result;
  end if;

  insert into public.invite_credit_events (
    host_profile_id, kind, source, credits, stripe_checkout_session_id
  ) values (
    '9400a000-0000-4000-8000-000000000001',
    'purchase', 'purchased', 1, 'cs_discovery_094_purchased'
  );

  v_result := public.create_host_source_invite_with_credit(
    '9400a000-0000-4000-8000-000000000001',
    '94001000-0000-4000-8000-00000000000d',
    '94006000-0000-4000-8000-000000000001',
    'Purchased path'
  );
  if (v_result ->> 'ok')::boolean is distinct from true
     or v_result ->> 'source' is distinct from 'purchased'
     or (select count(*) from jsonb_object_keys(v_result)) <> 3
     or not exists (
       select 1
         from public.invite_credit_events e
        where e.invite_id = (v_result ->> 'invite_id')::uuid
          and e.host_profile_id = '9400a000-0000-4000-8000-000000000001'
          and e.kind = 'consume'
          and e.source = 'purchased'
          and e.credits = 1
     ) then
    raise exception 'host discovery: purchased credit success/consume drifted: %', v_result;
  end if;

  insert into pg_temp.authz_log values (
    'positive',
    'invite writer domain, no-spend, monthly and purchased paths are exact'
  );
end;
$do$;

reset role;

select pg_temp.checkpoint_section('invite writer behavior', 2);

-- ---------------------------------------------------------------------------
-- Atomic withdrawal: status and a created-invite restore share one transaction;
-- delivered/viewed withdrawals never restore, and owned withdrawn retry is an
-- idempotent success that does not guess a missing historical restore.
-- ---------------------------------------------------------------------------

set local role service_role;

do $do$
declare
  v_result jsonb;
  v_consumes_before bigint;
  v_restores_before bigint;
  v_events_before bigint;
begin
  select count(*) filter (where kind = 'consume'),
         count(*) filter (where kind = 'restore'),
         count(*)
    into v_consumes_before, v_restores_before, v_events_before
    from public.invite_credit_events
   where host_profile_id = '9400b000-0000-4000-8000-000000000002';

  v_result := public.withdraw_host_invite(null, null);
  if v_result is distinct from '{"ok":false,"error":"invalid_request"}'::jsonb then
    raise exception 'host discovery: withdrawal invalid request result drifted: %', v_result;
  end if;

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000099'
  );
  if v_result is distinct from '{"ok":false,"error":"invite_not_withdrawable"}'::jsonb then
    raise exception 'host discovery: missing withdrawal concealment drifted: %', v_result;
  end if;

  v_result := public.withdraw_host_invite(
    '9400a000-0000-4000-8000-000000000001',
    '94007000-0000-4000-8000-000000000002'
  );
  if v_result is distinct from '{"ok":false,"error":"invite_not_withdrawable"}'::jsonb then
    raise exception 'host discovery: foreign withdrawal concealment drifted: %', v_result;
  end if;

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000006'
  );
  if v_result is distinct from '{"ok":false,"error":"invite_not_withdrawable"}'::jsonb then
    raise exception 'host discovery: nonwithdrawable status concealment drifted: %', v_result;
  end if;

  if (select count(*)
        from public.invite_credit_events
       where host_profile_id = '9400b000-0000-4000-8000-000000000002')
       <> v_events_before
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000002') <> 'created'
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000006') <> 'ignored' then
    raise exception 'host discovery: withdrawal refusal changed status or credit ledger';
  end if;

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000017'
  );
  if v_result is distinct from
       '{"ok":false,"error":"invite_delivery_in_progress"}'::jsonb
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000017') <> 'created'
     or not exists (
       select 1 from public.notification_deliveries
        where id = '9400d000-0000-4000-8000-000000000017'
          and status = 'processing'
          and worker_id = 'worker-live'
     )
     or exists (
       select 1 from public.invite_credit_events
        where invite_id = '94007000-0000-4000-8000-000000000017'
          and kind = 'restore'
     ) then
    raise exception 'host discovery: processing delivery did not block refund: %', v_result;
  end if;

  update public.notification_deliveries
     set lease_expires_at = null
   where id = '9400d000-0000-4000-8000-000000000017';

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000017'
  );
  if v_result is distinct from jsonb_build_object(
       'ok', true,
       'invite_id', '94007000-0000-4000-8000-000000000017'::uuid,
       'disposition', 'withdrawn',
       'credit_restored', false
     )
     or (select status from public.invites
          where id = '94007000-0000-4000-8000-000000000017') <> 'withdrawn'
     or not exists (
       select 1
        from public.notification_deliveries
       where id = '9400d000-0000-4000-8000-000000000017'
          and status = 'dead_letter'
          and failure_class = 'outcome_unknown'
          and failure_detail =
            'invite provider-started lease expired; provider outcome unknown'
          and provider_started_at is not null
          and claim_authority_version is null
          and worker_id is null
          and lease_expires_at is null
     )
     or exists (
       select 1
         from public.invite_credit_events
        where invite_id = '94007000-0000-4000-8000-000000000017'
          and kind = 'restore'
     ) then
    raise exception
      'host discovery: expired/null processing withdrawal self-terminalization drifted: %',
      v_result;
  end if;

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000016'
  );
  if v_result is distinct from jsonb_build_object(
       'ok', true,
       'invite_id', '94007000-0000-4000-8000-000000000016'::uuid,
       'disposition', 'withdrawn',
       'credit_restored', true
     )
     or not exists (
       select 1 from public.notification_deliveries d
        where d.id = '9400d000-0000-4000-8000-000000000016'
          and d.status = 'cancelled'
          and d.failure_class = 'known_unsent'
     )
     or not exists (
       select 1 from public.invites i
        where i.id = '94007000-0000-4000-8000-000000000016'
          and i.status = 'withdrawn'
          and i.delivered_at is null
     )
     or exists (
       select 1
         from public.digest_memberships dm
        where dm.event_id = '9400f000-0000-4000-8000-000000000016'
          and dm.status = 'queued'
     )
     or (select status
           from public.digest_memberships
          where id = '9400c000-0000-4000-8000-000000000096') <> 'cancelled'
     then
    raise exception
      'host discovery: known-unsent dead-letter/event-anchored digest cancellation/refund drifted: %',
      v_result;
  end if;

  -- A reclaimed item that crashes before the final provider boundary is
  -- durably known-unsent. Withdrawal may terminalize that expired claim and
  -- restore its debit even if the ordinary claim sweep is not running.
  update public.notification_deliveries
     set lease_expires_at = null
   where id = '9400d000-0000-4000-8000-00000000001d';

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-00000000001d'
  );
  if v_result is distinct from jsonb_build_object(
       'ok', true,
       'invite_id', '94007000-0000-4000-8000-00000000001d'::uuid,
       'disposition', 'withdrawn',
       'credit_restored', true
     )
     or not exists (
       select 1
         from public.notification_deliveries
        where id = '9400d000-0000-4000-8000-00000000001d'
          and status = 'cancelled'
          and failure_class = 'known_unsent'
          and provider_started_at is null
          and claim_authority_version is null
          and worker_id is null
          and lease_expires_at is null
     ) then
    raise exception
      'host discovery: expired pre-provider claim refund drifted: %',
      v_result;
  end if;

  for v_result in
    select public.withdraw_host_invite(
      '9400b000-0000-4000-8000-000000000002', invite_id
    )
      from unnest(array[
        '94007000-0000-4000-8000-000000000018'::uuid,
        '94007000-0000-4000-8000-000000000019'::uuid
      ]) as requested(invite_id)
  loop
    if (v_result ->> 'ok')::boolean is distinct from true
       or v_result ->> 'disposition' is distinct from 'withdrawn'
       or (v_result ->> 'credit_restored')::boolean is distinct from false then
      raise exception 'host discovery: delivered/unknown withdrawal refunded: %', v_result;
    end if;
  end loop;

  if exists (
       select 1
         from public.invite_credit_events
        where invite_id in (
          '94007000-0000-4000-8000-000000000018',
          '94007000-0000-4000-8000-000000000019'
        )
          and kind = 'restore'
     )
     or (select status from public.notification_deliveries
          where id = '9400d000-0000-4000-8000-000000000018') <> 'delivered'
     or (select status from public.notification_deliveries
          where id = '9400d000-0000-4000-8000-000000000019') <> 'dead_letter'
     or (select status from public.notification_deliveries
          where id = '9400d000-0000-4000-8000-00000000001a') <> 'delivered' then
    raise exception 'host discovery: delivered/dead-letter audit or no-refund invariant drifted';
  end if;

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000002'
  );
  if v_result is distinct from jsonb_build_object(
       'ok', true,
       'invite_id', '94007000-0000-4000-8000-000000000002'::uuid,
       'disposition', 'withdrawn',
       'credit_restored', true
     ) then
    raise exception 'host discovery: created withdrawal/restoration result drifted: %', v_result;
  end if;

  if not exists (
    select 1
      from public.invite_credit_events consume
      join public.invite_credit_events restore
        on restore.invite_id = consume.invite_id
       and restore.host_profile_id = consume.host_profile_id
       and restore.source = consume.source
       and restore.credits = consume.credits
       and restore.period_key = consume.period_key
       and restore.kind = 'restore'
     where consume.invite_id = '94007000-0000-4000-8000-000000000002'
       and consume.kind = 'consume'
  ) then
    raise exception 'host discovery: created withdrawal did not copy its matching consume';
  end if;

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000002'
  );
  if v_result is distinct from jsonb_build_object(
       'ok', true,
       'invite_id', '94007000-0000-4000-8000-000000000002'::uuid,
       'disposition', 'already_withdrawn',
       'credit_restored', false
     ) then
    raise exception 'host discovery: withdrawn retry idempotency result drifted: %', v_result;
  end if;

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000003'
  );
  if v_result is distinct from jsonb_build_object(
       'ok', true,
       'invite_id', '94007000-0000-4000-8000-000000000003'::uuid,
       'disposition', 'withdrawn',
       'credit_restored', false
     ) then
    raise exception 'host discovery: delivered withdrawal result drifted: %', v_result;
  end if;

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000004'
  );
  if v_result is distinct from jsonb_build_object(
       'ok', true,
       'invite_id', '94007000-0000-4000-8000-000000000004'::uuid,
       'disposition', 'withdrawn',
       'credit_restored', false
     ) then
    raise exception 'host discovery: viewed withdrawal result drifted: %', v_result;
  end if;

  v_result := public.withdraw_host_invite(
    '9400b000-0000-4000-8000-000000000002',
    '94007000-0000-4000-8000-000000000005'
  );
  if v_result is distinct from jsonb_build_object(
       'ok', true,
       'invite_id', '94007000-0000-4000-8000-000000000005'::uuid,
       'disposition', 'already_withdrawn',
       'credit_restored', false
     ) then
    raise exception 'host discovery: historical withdrawn retry result drifted: %', v_result;
  end if;

  if (select count(*) filter (where kind = 'consume')
        from public.invite_credit_events
       where host_profile_id = '9400b000-0000-4000-8000-000000000002')
       <> v_consumes_before
     or (select count(*) filter (where kind = 'restore')
           from public.invite_credit_events
          where host_profile_id = '9400b000-0000-4000-8000-000000000002')
       <> v_restores_before + 3
     or (select count(*)
           from public.invite_credit_events
          where host_profile_id = '9400b000-0000-4000-8000-000000000002')
       <> v_events_before + 3
     or exists (
       select 1
         from public.invite_credit_events
        where invite_id in (
          '94007000-0000-4000-8000-000000000003',
          '94007000-0000-4000-8000-000000000004',
          '94007000-0000-4000-8000-000000000005',
          '94007000-0000-4000-8000-000000000006'
        )
          and kind = 'restore'
     )
     or exists (
       select 1
         from public.invites
        where id in (
          '94007000-0000-4000-8000-000000000002',
          '94007000-0000-4000-8000-000000000003',
          '94007000-0000-4000-8000-000000000004'
        )
          and status <> 'withdrawn'
     ) then
    raise exception 'host discovery: withdrawal status/no-spend/restore invariant drifted';
  end if;

  insert into pg_temp.authz_log values (
    'positive',
    'atomic withdrawal, delivery cancellation, outcome handling and restoration are exact'
  );
end;
$do$;

update public.invites
   set status = 'expired'
 where id = '94007000-0000-4000-8000-000000000011'
   and status = 'created'
   and delivered_at is null;

do $do$
begin
  if not exists (
    select 1
      from public.invites
     where id = '94007000-0000-4000-8000-000000000011'
       and status = 'expired'
       and delivered_at is null
  ) then
    raise exception 'host discovery: undelivered expired visibility fixture drifted';
  end if;
end;
$do$;

reset role;

select pg_temp.checkpoint_section('invite withdrawal behavior', 1);

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_discovery_host_a","role":"authenticated"}';
select pg_temp.expect_rows(
  'refunded undelivered withdrawal stays hidden from its seeker',
  $q$select id from public.invites
      where id = '94007000-0000-4000-8000-000000000016'$q$,
  0
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_discovery_incomplete","role":"authenticated"}';
select pg_temp.expect_rows(
  'undelivered expired invite stays hidden from its seeker',
  $q$select id from public.invites
      where id = '94007000-0000-4000-8000-000000000011'$q$,
  0
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_discovery_purchased","role":"authenticated"}';
select pg_temp.expect_rows(
  'delivered expired invite remains visible to its seeker',
  $q$select id from public.invites
      where id = '94007000-0000-4000-8000-00000000001a'
        and status = 'expired'
        and delivered_at is not null$q$,
  1
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_discovery_substring","role":"authenticated"}';
select pg_temp.expect_rows(
  'delivered withdrawn invite remains visible to its seeker',
  $q$select id from public.invites
      where id = '94007000-0000-4000-8000-000000000003'
        and status = 'withdrawn'
        and delivered_at is not null$q$,
  1
);
reset role;
set local request.jwt.claims = '{}';

select pg_temp.checkpoint_section('terminal invite seeker visibility', 4);
select pg_temp.assert_suite_complete('host seeker discovery', 9, 15, 37);

rollback;
