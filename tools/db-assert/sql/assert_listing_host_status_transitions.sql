\set ON_ERROR_STOP on

-- Connected, non-skippable proof for migrations 077 and 082. This runs only
-- against the disposable local database rebuilt by db-security.yml and rolls
-- back every fixture. It exercises the same authenticated role, Clerk-shaped JWT
-- claims, grants, RLS policies, trigger, and service_role path used by
-- PostgREST.
--
-- 082 (founder, 2026-07-26) made publication a HOST action: under_review -> live
-- is now permitted for `authenticated`, and closed -> draft reopens an
-- operator-rejected listing. Everything 077 established otherwise is asserted
-- here unchanged: a direct insert must still begin in draft, draft -> live is
-- still refused for a listing that answers EVERYTHING, archived is still
-- terminal, and a SOURCED closed listing still cannot be reopened. 070's
-- publication triad is proved to still refuse an unanswered listing.
begin;

do $assert_shape$
declare
  v_function oid;
begin
  select p.oid
    into v_function
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname = 'enforce_listing_host_status_transition'
     and p.pronargs = 0
     and not p.prosecdef
     and 'search_path=""' = any(coalesce(p.proconfig, '{}'::text[]));

  if v_function is null then
    raise exception 'listing lifecycle assertion: security-invoker function is missing or unsafe';
  end if;

  if has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'listing lifecycle assertion: authenticated can execute trigger function';
  end if;

  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.listings'::regclass
       and tgname = 'trg_listings_host_status_transition'
       and not tgisinternal
       and tgenabled <> 'D'
  ) then
    raise exception 'listing lifecycle assertion: trigger is missing or disabled';
  end if;
end;
$assert_shape$;

-- A PAID host, because migration 083 added a database cap on how many listings
-- one host may hold in a counted status (live, paused, under_review) and an
-- unsubscribed host's allowance is zero. This suite is about the TRANSITION
-- GRAPH, not the allowance — that has its own proof in
-- assert_listing_allowance_enforcement.sql — so the fixture is given an
-- enterprise plan and enough purchased slots that the cap can never be the
-- thing refusing an edge here. Without this every case below fails with
-- listing_allowance_exceeded and stops testing what it claims to test.
insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values ('user_db_assert_listing_lifecycle', 'enterprise', 'active');

insert into public.host_profiles (
  id,
  owner_user_id,
  clerk_user_id,
  company_name,
  slug,
  category_scopes,
  subscription_tier,
  purchased_listing_slots
) values (
  '07700000-0000-4000-8000-000000000001',
  null,
  'user_db_assert_listing_lifecycle',
  'Listing lifecycle assertion host',
  'listing-lifecycle-assertion-host',
  array['farm']::text[],
  'enterprise',
  50
);

-- A sourced posting the ingestion lifecycle has closed, carrying a
-- host_profile_id (064 allows that, and a claim attaches one before conversion)
-- so listings_update_own genuinely matches for the host below. Inserted as the
-- table owner because `authenticated` holds no grant on `provenance` (071).
insert into public.listing_sources (id, name, kind, compliance_status)
values (
  '07700000-0000-4000-8000-000000000010',
  'Listing lifecycle assertion source',
  'csv',
  'approved'
);

insert into public.listings (
  id,
  host_profile_id,
  title,
  category,
  status,
  provenance,
  source_id,
  source_name,
  source_status,
  housing_included,
  meals_included
) values (
  '07700000-0000-4000-8000-000000000002',
  '07700000-0000-4000-8000-000000000001',
  'Sourced and withdrawn at source',
  'farm',
  'closed',
  'sourced',
  '07700000-0000-4000-8000-000000000010',
  'Listing lifecycle assertion source',
  'removed',
  false,
  false
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"user_db_assert_listing_lifecycle"}',
  true
);

do $assert_live_insert$
begin
  begin
    insert into public.listings (
      host_profile_id,
      title,
      category,
      status,
      housing_included,
      meals_included,
      housing_evidence,
      meals_evidence,
      pay_evidence,
      compensation_min_cents
    ) values (
      '07700000-0000-4000-8000-000000000001',
      'Direct live insert must fail',
      'farm',
      'live',
      false,
      false,
      'confirmed',
      'confirmed',
      'confirmed',
      100
    );
    raise exception 'listing lifecycle assertion: authenticated live insert succeeded';
  exception
    when check_violation then
      if sqlerrm <> 'listing_initial_status_must_be_draft' then
        raise;
      end if;
  end;
end;
$assert_live_insert$;

insert into public.listings (
  host_profile_id,
  title,
  category,
  status,
  housing_included,
  meals_included,
  housing_evidence,
  meals_evidence,
  pay_evidence,
  compensation_min_cents
) values
  (
    '07700000-0000-4000-8000-000000000001',
    'Approve path',
    'farm',
    'draft',
    false,
    false,
    'confirmed',
    'confirmed',
    'confirmed',
    100
  ),
  (
    '07700000-0000-4000-8000-000000000001',
    'Self publish path',
    'farm',
    'draft',
    false,
    false,
    'confirmed',
    'confirmed',
    'confirmed',
    100
  ),
  (
    '07700000-0000-4000-8000-000000000001',
    'Direct publish path',
    'farm',
    'draft',
    false,
    false,
    'confirmed',
    'confirmed',
    'confirmed',
    100
  ),
  (
    '07700000-0000-4000-8000-000000000001',
    'Reject path',
    'farm',
    'draft',
    false,
    false,
    'confirmed',
    'confirmed',
    'confirmed',
    100
  );

-- An UNANSWERED draft for 070's publication triad: pay evidence stays at the
-- 070 default ('not_stated') and no compensation figure is supplied.
insert into public.listings (
  host_profile_id,
  title,
  category,
  status,
  housing_included,
  meals_included,
  housing_evidence,
  meals_evidence
) values (
  '07700000-0000-4000-8000-000000000001',
  'Unanswered path',
  'farm',
  'draft',
  false,
  false,
  'confirmed',
  'confirmed'
);

-- ── 070 still refuses an unanswered listing at the publication boundary ─────
do $assert_publication_triad$
begin
  begin
    update public.listings
       set status = 'under_review'
     where title = 'Unanswered path';
    raise exception 'listing lifecycle assertion: unanswered listing reached under_review';
  exception
    when check_violation then
      if sqlerrm not like '%listings_publication_triad_chk%' then
        raise;
      end if;
  end;
end;
$assert_publication_triad$;

-- ── draft -> live is STILL refused, on a listing that answers everything ────
-- The negative control for 082: this row would satisfy the triad, so the only
-- thing that can refuse it is the transition graph itself.
do $assert_draft_to_live$
begin
  begin
    update public.listings
       set status = 'live'
     where title = 'Direct publish path';
    raise exception 'listing lifecycle assertion: complete draft reached live directly';
  exception
    when check_violation then
      if sqlerrm <> 'listing_host_status_transition_forbidden' then
        raise;
      end if;
  end;
end;
$assert_draft_to_live$;

update public.listings
   set status = 'under_review'
 where title in (
   'Approve path',
   'Self publish path',
   'Reject path'
 );

-- ── 082: the host publishes their own listing ───────────────────────────────
update public.listings
   set status = 'live'
 where title = 'Self publish path';

do $assert_self_publish$
begin
  if not exists (
    select 1 from public.listings
     where title = 'Self publish path' and status = 'live'
  ) then
    raise exception 'listing lifecycle assertion: host could not publish under_review -> live';
  end if;
end;
$assert_self_publish$;

reset role;
set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role","sub":"service_role"}',
  true
);

update public.listings
   set status = case title
     when 'Approve path' then 'live'
     when 'Reject path' then 'closed'
   end
 where title in (
   'Approve path',
   'Reject path'
 );

do $assert_moderation$
begin
  if not exists (
    select 1 from public.listings
     where title = 'Approve path' and status = 'live'
  ) or not exists (
    select 1 from public.listings
     where title = 'Reject path' and status = 'closed'
  ) then
    raise exception 'listing lifecycle assertion: service-role moderation failed';
  end if;
end;
$assert_moderation$;

-- ── An operator can take down a LIVE listing ────────────────────────────────
-- Since 082 made publication a host action, `under_review` is transient and
-- every listing an operator would moderate is already `live`. The operator
-- actions in queries/admin.ts run through this same service_role path, so this
-- proves the database permits the move they now make: live -> closed, and
-- live -> draft for the reversible hold. 'Self publish path' is the row the HOST
-- published a few statements above, which is exactly the shape being moderated.
update public.listings
   set status = 'closed',
       closed_at = now()
 where title = 'Self publish path';

do $assert_live_takedown$
begin
  if not exists (
    select 1 from public.listings
     where title = 'Self publish path'
       and status = 'closed'
       and closed_at is not null
  ) then
    raise exception 'listing lifecycle assertion: operator could not take down a live listing';
  end if;

  -- And back up, so the reversible hold has a live row to act on.
  update public.listings
     set status = 'draft', closed_at = null
   where title = 'Self publish path';
  update public.listings
     set status = 'under_review'
   where title = 'Self publish path';
  update public.listings
     set status = 'live'
   where title = 'Self publish path';

  update public.listings
     set status = 'draft'
   where title = 'Self publish path';

  if not exists (
    select 1 from public.listings
     where title = 'Self publish path' and status = 'draft'
  ) then
    raise exception 'listing lifecycle assertion: operator could not hold a live listing back to draft';
  end if;
end;
$assert_live_takedown$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"user_db_assert_listing_lifecycle"}',
  true
);

update public.listings
   set status = 'paused'
 where title = 'Approve path';
update public.listings
   set status = 'live'
 where title = 'Approve path';
update public.listings
   set status = 'archived'
 where title = 'Approve path';

do $assert_terminal_states$
begin
  if not exists (
    select 1 from public.listings
     where title = 'Approve path' and status = 'archived'
  ) then
    raise exception 'listing lifecycle assertion: valid host transitions failed';
  end if;

  begin
    update public.listings
       set status = 'live'
     where title = 'Approve path';
    raise exception 'listing lifecycle assertion: archived listing returned to live';
  exception
    when check_violation then
      if sqlerrm <> 'listing_host_status_transition_forbidden' then
        raise;
      end if;
  end;

  begin
    update public.listings
       set status = 'live'
     where title = 'Reject path';
    raise exception 'listing lifecycle assertion: closed listing returned to live';
  exception
    when check_violation then
      if sqlerrm <> 'listing_host_status_transition_forbidden' then
        raise;
      end if;
  end;
end;
$assert_terminal_states$;

-- ── 082: closed -> draft, and only for verified inventory ───────────────────
do $assert_reopen$
declare
  v_rows integer;
begin
  update public.listings
     set status = 'draft'
   where title = 'Reject path';

  if not exists (
    select 1 from public.listings
     where title = 'Reject path' and status = 'draft'
  ) then
    raise exception 'listing lifecycle assertion: rejected listing could not be reopened';
  end if;

  -- The sourced row is visible and writable to this host (same host_profile_id,
  -- so listings_update_own matches). Checked explicitly so the refusal below is
  -- known to be the TRIGGER and not RLS silently filtering the row away.
  select count(*)
    into v_rows
    from public.listings
   where id = '07700000-0000-4000-8000-000000000002';
  if v_rows <> 1 then
    raise exception 'listing lifecycle assertion: sourced fixture not visible to its host';
  end if;

  begin
    update public.listings
       set status = 'draft'
     where id = '07700000-0000-4000-8000-000000000002';
    raise exception 'listing lifecycle assertion: sourced closed listing was reopened';
  exception
    when check_violation then
      if sqlerrm <> 'listing_host_status_transition_forbidden' then
        raise;
      end if;
  end;
end;
$assert_reopen$;

reset role;
rollback;
