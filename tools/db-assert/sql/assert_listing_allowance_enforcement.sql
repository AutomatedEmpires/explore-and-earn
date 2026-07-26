\set ON_ERROR_STOP on

-- Connected, non-skippable proof for the paid listing allowance (migrations 083
-- and 085). Runs against the disposable local database and rolls everything
-- back. Every case below speaks as the `authenticated` role with Clerk-shaped
-- JWT claims — the same role, grants, policies and triggers PostgREST gives a
-- browser holding the public anon key — because that is the client the refusal
-- has to survive. Nothing here runs a line of application code.
--
-- THREE DEFECTS ARE PINNED.
--
-- 1. THE CAP WAS BYPASSABLE BY PATCHING status DIRECTLY.
--    082 opened under_review -> live for `authenticated`, 071 grants
--    UPDATE(status), and listings_update_own carries no status predicate — so a
--    host could publish by PATCHing the column. The cap lived only in
--    updateListingStatus, which such a client never executes. A starter host
--    (allowance 1) published three live listings this way.
--
-- 2. THE PAID ADD-ON BOUGHT NOTHING.
--    private.host_purchased_listing_allowance() DISCOVERED its column from a
--    guess list, and the name the add-on shipped (purchased_listing_slots) was
--    not on it. A host with five purchased slots was enforced at one while the
--    application told them six: Stripe and the database disagreeing in the
--    direction that keeps the money.
--
-- The third defect in this area — revoke_listing_slot_purchase decrementing
-- twice for a redelivered cancellation — needs two transactions that OVERLAP,
-- which a single psql script cannot express. It has its own runner:
-- tools/db-assert/assert-listing-slot-concurrency.mjs.
--
-- Every refusal is paired with a positive control, because a gate that refuses
-- everything is indistinguishable from a broken table.

begin;

-- ---------------------------------------------------------------------------
-- Shape: the allowance helper must NAME its column, not discover one.
-- ---------------------------------------------------------------------------

do $assert_shape$
declare
  v_src text;
begin
  if not exists (
    select 1
      from pg_attribute a
     where a.attrelid = 'public.host_profiles'::regclass
       and a.attname = 'purchased_listing_slots'
       and a.attnum > 0
       and not a.attisdropped
       and a.atttypid = 'integer'::regtype
  ) then
    raise exception 'listing allowance assertion: host_profiles.purchased_listing_slots is missing';
  end if;

  select p.prosrc
    into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname = 'host_purchased_listing_allowance';

  if v_src is null then
    raise exception 'listing allowance assertion: private.host_purchased_listing_allowance is missing';
  end if;
  if position('purchased_listing_slots' in v_src) = 0 then
    raise exception 'listing allowance assertion: the purchased allowance is not read by name';
  end if;
  -- Catalogue introspection here means the column is being guessed at again.
  if position('pg_attribute' in v_src) > 0 or position('attname' in v_src) > 0 then
    raise exception 'listing allowance assertion: column-name discovery is back';
  end if;

  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.listings'::regclass
       and tgname = 'trg_listings_plan_allowance'
       and not tgisinternal
       and tgenabled <> 'D'
  ) then
    raise exception 'listing allowance assertion: the allowance trigger is missing or disabled';
  end if;
end;
$assert_shape$;

-- ---------------------------------------------------------------------------
-- Fixtures: one starter host (allowance 1) with two complete drafts.
-- ---------------------------------------------------------------------------

insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values ('user_db_assert_allowance', 'starter', 'active');

insert into public.host_profiles (
  id, owner_user_id, clerk_user_id, company_name, slug, category_scopes
) values (
  '08300000-0000-4000-8000-000000000001',
  null,
  'user_db_assert_allowance',
  'Allowance assertion host',
  'allowance-assertion-host',
  array['farm']::text[]
);

insert into public.listings (
  id, host_profile_id, title, category, status,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence, compensation_min_cents
) values
  ('08300000-0000-4000-8000-000000000101',
   '08300000-0000-4000-8000-000000000001',
   'First listing', 'farm', 'draft', false, false,
   'confirmed', 'confirmed', 'confirmed', 22000),
  ('08300000-0000-4000-8000-000000000102',
   '08300000-0000-4000-8000-000000000001',
   'Second listing', 'farm', 'draft', false, false,
   'confirmed', 'confirmed', 'confirmed', 22000),
  ('08300000-0000-4000-8000-000000000103',
   '08300000-0000-4000-8000-000000000001',
   'Third listing', 'farm', 'draft', false, false,
   'confirmed', 'confirmed', 'confirmed', 22000);

-- ---------------------------------------------------------------------------
-- 1) THE REFUSAL. A starter host publishing a second listing must fail, and it
--    must fail for a client that never calls updateListingStatus.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"user_db_assert_allowance"}',
  true
);

do $assert_direct_publish$
declare
  v_live integer;
begin
  -- POSITIVE CONTROL: the whole self-publish path for the FIRST listing, sent
  -- as two raw PATCHes exactly as a browser would.
  update public.listings set status = 'under_review'
   where id = '08300000-0000-4000-8000-000000000101';
  update public.listings set status = 'live'
   where id = '08300000-0000-4000-8000-000000000101';

  if (select status from public.listings
       where id = '08300000-0000-4000-8000-000000000101') <> 'live' then
    raise exception 'listing allowance assertion: the first listing did not publish';
  end if;

  -- THE REFUSAL. The second listing cannot even enter review: the slot was
  -- spent when the first one did.
  begin
    update public.listings set status = 'under_review'
     where id = '08300000-0000-4000-8000-000000000102';
    raise exception 'listing allowance assertion: a second listing entered review past the cap';
  exception
    when check_violation then
      if sqlerrm <> 'listing_allowance_exceeded' then raise; end if;
  end;

  -- …and it cannot skip review either. draft -> live is refused by 082's
  -- transition trigger, so the allowance is asked the question that 082 DOES
  -- allow: the direct PATCH to live from under_review is unreachable while the
  -- listing is still a draft. Prove the allowance refuses the INSERT route too,
  -- which is the other way into a counted status.
  begin
    insert into public.listings (
      host_profile_id, title, category, status,
      housing_included, meals_included,
      housing_evidence, meals_evidence, pay_evidence, compensation_min_cents
    ) values (
      '08300000-0000-4000-8000-000000000001',
      'Inserted straight into review', 'farm', 'under_review', false, false,
      'confirmed', 'confirmed', 'confirmed', 22000
    );
    raise exception 'listing allowance assertion: an insert reached a counted status past the cap';
  exception
    when check_violation then
      -- 077/082 refuse a non-draft insert first; either refusal is the gate
      -- doing its job, and both are check_violation.
      if sqlerrm not in ('listing_allowance_exceeded',
                         'listing_initial_status_must_be_draft') then
        raise;
      end if;
  end;

  select count(*) into v_live
    from public.listings
   where host_profile_id = '08300000-0000-4000-8000-000000000001'
     and status in ('live', 'paused', 'under_review');
  if v_live <> 1 then
    raise exception
      'listing allowance assertion: starter host holds % counted listings, expected 1', v_live;
  end if;
end;
$assert_direct_publish$;

-- A host at their allowance must still be able to PAUSE and RESUME what they
-- already hold — both statuses are counted, so neither consumes a new slot.
do $assert_no_false_refusal$
begin
  update public.listings set status = 'paused'
   where id = '08300000-0000-4000-8000-000000000101';
  update public.listings set status = 'live'
   where id = '08300000-0000-4000-8000-000000000101';

  if (select status from public.listings
       where id = '08300000-0000-4000-8000-000000000101') <> 'live' then
    raise exception 'listing allowance assertion: resume was refused at the allowance';
  end if;
end;
$assert_no_false_refusal$;

reset role;

-- ---------------------------------------------------------------------------
-- 2) THE PAID ADD-ON. allowance = plan + purchased slots, and the second
--    listing publishes once — and only once — a slot has been bought.
-- ---------------------------------------------------------------------------

do $assert_purchased_allowance$
declare
  v_allowance integer;
begin
  if private.host_listing_allowance('08300000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'listing allowance assertion: a starter host does not start at 1';
  end if;

  update public.host_profiles
     set purchased_listing_slots = 5
   where id = '08300000-0000-4000-8000-000000000001';

  v_allowance := private.host_listing_allowance('08300000-0000-4000-8000-000000000001');
  if v_allowance <> 6 then
    raise exception
      'listing allowance assertion: starter + 5 purchased slots resolved to %, expected 6',
      v_allowance;
  end if;

  -- An unsubscribed host gets the purchased slots and nothing else: a paid
  -- extra is an addition to a plan, never a plan of its own.
  update public.host_subscriptions set tier = 'none'
   where clerk_user_id = 'user_db_assert_allowance';
  if private.host_listing_allowance('08300000-0000-4000-8000-000000000001') <> 5 then
    raise exception 'listing allowance assertion: purchased slots did not survive a lapse';
  end if;
  update public.host_subscriptions set tier = 'starter'
   where clerk_user_id = 'user_db_assert_allowance';
end;
$assert_purchased_allowance$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"user_db_assert_allowance"}',
  true
);

do $assert_purchased_publish$
begin
  -- The same PATCH that was refused above now succeeds, because the host paid
  -- for the slot. Without this control the refusal above could be a broken
  -- table rather than a working cap.
  update public.listings set status = 'under_review'
   where id = '08300000-0000-4000-8000-000000000102';
  update public.listings set status = 'live'
   where id = '08300000-0000-4000-8000-000000000102';

  if (select status from public.listings
       where id = '08300000-0000-4000-8000-000000000102') <> 'live' then
    raise exception 'listing allowance assertion: a purchased slot did not permit publication';
  end if;
end;
$assert_purchased_publish$;

reset role;

-- Take the paid slots away and the cap closes again on the NEXT listing while
-- leaving the two already published alone — a downgrade must not delete
-- inventory a host is running.
update public.host_profiles
   set purchased_listing_slots = 0
 where id = '08300000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"user_db_assert_allowance"}',
  true
);

do $assert_downgrade$
begin
  begin
    update public.listings set status = 'under_review'
     where id = '08300000-0000-4000-8000-000000000103';
    raise exception 'listing allowance assertion: a third listing entered review after downgrade';
  exception
    when check_violation then
      if sqlerrm <> 'listing_allowance_exceeded' then raise; end if;
  end;

  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000001'
         and status = 'live') <> 2 then
    raise exception 'listing allowance assertion: a downgrade unpublished live inventory';
  end if;
end;
$assert_downgrade$;

reset role;

rollback;

