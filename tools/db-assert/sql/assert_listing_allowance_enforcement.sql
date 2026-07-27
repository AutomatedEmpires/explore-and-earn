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

-- Take the paid slots away and the cap closes again on the NEXT listing. The
-- TRIGGER leaves the two already published alone — it fires on a write, and no
-- write has happened to them. Bringing them back inside the allowance is section
-- 4's sweep, which is a different mechanism on purpose.
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
    raise exception 'listing allowance assertion: the trigger unpublished live inventory';
  end if;
end;
$assert_downgrade$;

-- ---------------------------------------------------------------------------
-- 3) AN OVER-ALLOWANCE HOST CANNOT RE-PUBLISH — but is never trapped.
--
--    The trigger used to exempt EVERY move between two already-counted
--    statuses, which is the second half of "downgrade and keep everything
--    live": a host sitting over their allowance could pause and resume the same
--    listing forever, because the counted set never changed size and the
--    allowance was never read. State on entry: allowance 1, two live listings.
-- ---------------------------------------------------------------------------

do $assert_over_allowance_resume$
begin
  -- Taking something DOWN is always allowed. A refusal here would trap a host
  -- who is trying to comply.
  update public.listings set status = 'paused'
   where id = '08300000-0000-4000-8000-000000000101';

  -- THE REFUSAL. One other listing is still live against an allowance of 1, so
  -- resuming this one would put the host back over it.
  begin
    update public.listings set status = 'live'
     where id = '08300000-0000-4000-8000-000000000101';
    raise exception
      'listing allowance assertion: an over-allowance host resumed a paused listing';
  exception
    when check_violation then
      if sqlerrm <> 'listing_allowance_exceeded' then raise; end if;
  end;

  -- POSITIVE CONTROL, and the precise one: a write that leaves the status where
  -- it already is must still be permitted on a LIVE listing while the host is
  -- over their allowance. Without the `new.status = old.status` arm of the
  -- exemption this same statement is refused, and an over-allowance host could
  -- not correct their own copy.
  update public.listings set status = 'live'
   where id = '08300000-0000-4000-8000-000000000102';
  if (select status from public.listings
       where id = '08300000-0000-4000-8000-000000000102') <> 'live' then
    raise exception 'listing allowance assertion: an edit that moved nothing was refused';
  end if;
end;
$assert_over_allowance_resume$;

reset role;

-- Speak as the WEBHOOK from here on. `reset role` alone is not enough: both
-- lifecycle triggers also read auth.jwt(), and the request claims set above are
-- transaction-scoped, so without this the service-role sections below would
-- still be judged as an authenticated host — which is exactly the confusion the
-- sweep exists to avoid.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- 4) THE LAPSE SWEEP. The half a trigger cannot reach.
--
--    A host whose subscription lapses writes nothing, so the trigger never
--    fires and their listings stay public on a plan that stopped paying for
--    them. public.close_host_listings_over_allowance() is what runs after a
--    host's effective allowance changes: the Stripe webhook's plan sync calls it
--    for the PLAN term, and 085's credit/revoke/sync functions call it for the
--    ADD-ON term. Section 5 below drives the add-on half through those
--    functions rather than calling the sweep by hand.
--
--    State on entry: allowance 1; listing 101 paused, 102 live, 103 draft.
-- ---------------------------------------------------------------------------

do $assert_sweep_grants$
begin
  -- Service role only. It writes `listings` under definer rights.
  if has_function_privilege(
       'authenticated', 'public.close_host_listings_over_allowance(text)', 'execute')
     or has_function_privilege(
       'anon', 'public.close_host_listings_over_allowance(text)', 'execute')
     or has_function_privilege(
       'public', 'public.close_host_listings_over_allowance(text)', 'execute') then
    raise exception 'listing allowance assertion: the lapse sweep is client-executable';
  end if;

  if not has_function_privilege(
       'service_role', 'public.close_host_listings_over_allowance(text)', 'execute') then
    raise exception 'listing allowance assertion: the lapse sweep is unreachable by the webhook';
  end if;
end;
$assert_sweep_grants$;

-- A sourced listing belongs to no paying host (070 decision 4) and must survive
-- every sweep below. Inserted under the service role, as the importer does.
insert into public.listing_sources (id, name, kind)
values ('08300000-0000-4000-8000-0000000000f1', 'Allowance assertion source', 'json');

insert into public.listings (
  id, host_profile_id, title, category, status, provenance,
  source_id, source_name,
  housing_included, meals_included,
  housing_evidence, meals_evidence, pay_evidence, compensation_min_cents
) values (
  '08300000-0000-4000-8000-000000000104',
  '08300000-0000-4000-8000-000000000001',
  'Sourced listing', 'farm', 'live', 'sourced',
  '08300000-0000-4000-8000-0000000000f1', 'Allowance assertion source',
  false, false,
  'not_stated', 'not_stated', 'not_stated', null
);

do $assert_sweep$
declare
  v_closed integer;
begin
  -- ONE listing is over the allowance of 1, and the LIVE one is the one kept:
  -- the order decides what survives, and taking the shopfront down while
  -- leaving a paused listing standing would be the wrong way round.
  v_closed := public.close_host_listings_over_allowance('user_db_assert_allowance');
  if v_closed <> 1 then
    raise exception 'listing allowance assertion: the sweep closed % listings, expected 1', v_closed;
  end if;
  if (select status from public.listings
       where id = '08300000-0000-4000-8000-000000000102') <> 'live' then
    raise exception 'listing allowance assertion: the sweep closed the live listing first';
  end if;
  if (select status from public.listings
       where id = '08300000-0000-4000-8000-000000000101') <> 'closed' then
    raise exception 'listing allowance assertion: the excess listing was not closed';
  end if;

  -- Drafts are not counted and are never swept — a host keeps their work.
  if (select status from public.listings
       where id = '08300000-0000-4000-8000-000000000103') <> 'draft' then
    raise exception 'listing allowance assertion: the sweep touched a draft';
  end if;

  -- IDEMPOTENT, and the positive control at the same time: a host now INSIDE
  -- their allowance loses nothing on the next delivery.
  v_closed := public.close_host_listings_over_allowance('user_db_assert_allowance');
  if v_closed <> 0 then
    raise exception 'listing allowance assertion: a second sweep closed % listings', v_closed;
  end if;
  if (select status from public.listings
       where id = '08300000-0000-4000-8000-000000000102') <> 'live' then
    raise exception 'listing allowance assertion: a re-run of the sweep unpublished a permitted listing';
  end if;

  -- THE LAPSE ITSELF. Tier 'none' is an allowance of 0, and nothing the host
  -- owns may remain public.
  update public.host_subscriptions set tier = 'none', billing_status = 'cancelled'
   where clerk_user_id = 'user_db_assert_allowance';

  v_closed := public.close_host_listings_over_allowance('user_db_assert_allowance');
  if v_closed <> 1 then
    raise exception
      'listing allowance assertion: a lapse closed % listings, expected the last live one', v_closed;
  end if;
  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000001'
         and provenance <> 'sourced'
         and status in ('live', 'paused', 'under_review')) <> 0 then
    raise exception 'listing allowance assertion: a lapsed host still holds public inventory';
  end if;

  -- …and the sourced row never moved. No host pays for its slot, so no lapse
  -- may take it down.
  if (select status from public.listings
       where id = '08300000-0000-4000-8000-000000000104') <> 'live' then
    raise exception 'listing allowance assertion: the sweep took down sourced inventory';
  end if;

  -- Nothing was deleted. 082 gives the host closed -> draft, so the path back
  -- after re-subscribing is theirs.
  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000001') <> 4 then
    raise exception 'listing allowance assertion: the sweep destroyed rows';
  end if;
end;
$assert_sweep$;

-- A host with no clerk identity, and an empty argument, must not sweep the
-- world. Both are no-ops.
do $assert_sweep_bounds$
begin
  if public.close_host_listings_over_allowance('') <> 0
     or public.close_host_listings_over_allowance('   ') <> 0
     or public.close_host_listings_over_allowance('user_nobody_at_all') <> 0 then
    raise exception 'listing allowance assertion: the sweep acted without a host';
  end if;
  if (select status from public.listings
       where id = '08300000-0000-4000-8000-000000000104') <> 'live' then
    raise exception 'listing allowance assertion: an empty sweep still wrote rows';
  end if;
end;
$assert_sweep_bounds$;

-- ---------------------------------------------------------------------------
-- 5) THE ADD-ON HALF OF THE ALLOWANCE SWEEPS ITSELF.
--
--    Section 4 called the sweep BY HAND, which proves the sweep works and
--    nothing about whether anything ever calls it. It did not: the sweep had
--    exactly one caller in the whole system, syncHostSubscriptionTier, and the
--    add-on branch of syncSubscriptionEvent returns before reaching it. So
--    cancelling an add-on, letting it go unpaid, or reducing its quantity in the
--    billing portal lowered the allowance and left every listing above it live
--    indefinitely -- Stripe billing for one slot while the database served four
--    public listings.
--
--    Reproduced before the fix, against this database: credit 3 slots onto a
--    starter host (allowance 4), publish 4, cancel the add-on -- allowance 1,
--    four listings still live, and the hand-called sweep then closed exactly 3.
--
--    Nothing below calls close_host_listings_over_allowance. Every case drives
--    the REAL webhook entry points and asserts what the listings did, so a fix
--    that only worked when the sweep was invited never passes.
-- ---------------------------------------------------------------------------

insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values ('user_db_assert_addon_cancel', 'starter', 'active'),
       ('user_db_assert_addon_qty',    'starter', 'active');

insert into public.host_profiles (
  id, owner_user_id, clerk_user_id, company_name, slug, category_scopes
) values
  ('08300000-0000-4000-8000-000000000201', null, 'user_db_assert_addon_cancel',
   'Add-on cancellation host', 'addon-cancellation-host', array['farm']::text[]),
  ('08300000-0000-4000-8000-000000000202', null, 'user_db_assert_addon_qty',
   'Add-on quantity host', 'addon-quantity-host', array['farm']::text[]);

-- Four live listings each, against starter (1) + three purchased slots (3).
-- Credited through the real function, so the ledger row and the column move
-- together exactly as they do for a paid checkout.
do $assert_addon_fixture$
declare
  v_host uuid;
  v_i integer;
begin
  perform public.credit_listing_slot_purchase(
    '08300000-0000-4000-8000-000000000201', 3, 9900, 'starter',
    'cs_db_assert_addon_cancel', 'sub_db_assert_addon_cancel');
  perform public.credit_listing_slot_purchase(
    '08300000-0000-4000-8000-000000000202', 3, 9900, 'starter',
    'cs_db_assert_addon_qty', 'sub_db_assert_addon_qty');

  foreach v_host in array array[
    '08300000-0000-4000-8000-000000000201'::uuid,
    '08300000-0000-4000-8000-000000000202'::uuid
  ] loop
    if private.host_listing_allowance(v_host) <> 4 then
      raise exception
        'listing allowance assertion: starter + 3 purchased slots is not an allowance of 4';
    end if;

    for v_i in 1..4 loop
      insert into public.listings (
        host_profile_id, title, category, status,
        housing_included, meals_included,
        housing_evidence, meals_evidence, pay_evidence, compensation_min_cents
      ) values (
        v_host, 'Add-on listing ' || v_i, 'farm', 'live', false, false,
        'confirmed', 'confirmed', 'confirmed', 22000
      );
    end loop;
  end loop;
end;
$assert_addon_fixture$;

-- 5a) A CREDIT moves the allowance UPWARD and must close nothing. Without this
--     control every assertion below is satisfied by a sweep that simply closes
--     whatever it is pointed at.
do $assert_addon_credit_closes_nothing$
begin
  perform public.credit_listing_slot_purchase(
    '08300000-0000-4000-8000-000000000201', 1, 9900, 'starter',
    'cs_db_assert_addon_cancel_2', 'sub_db_assert_addon_cancel_2');

  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000201'
         and status = 'live') <> 4 then
    raise exception 'listing allowance assertion: buying a slot closed a listing';
  end if;

  -- …and giving that one slot back leaves the host exactly at their allowance,
  -- which is still not an excess.
  perform public.revoke_listing_slot_purchase('sub_db_assert_addon_cancel_2');
  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000201'
         and status = 'live') <> 4 then
    raise exception
      'listing allowance assertion: a host AT their allowance lost a listing';
  end if;
end;
$assert_addon_credit_closes_nothing$;

-- 5b) CANCELLING an add-on closes the excess, and does it exactly once.
do $assert_addon_cancellation$
declare
  v_result jsonb;
begin
  v_result := public.revoke_listing_slot_purchase('sub_db_assert_addon_cancel');
  if coalesce(v_result->>'ok', '') <> 'true' or coalesce(v_result->>'found', '') <> 'true' then
    raise exception 'listing allowance assertion: the add-on cancellation did not record';
  end if;

  if private.host_listing_allowance('08300000-0000-4000-8000-000000000201') <> 1 then
    raise exception 'listing allowance assertion: cancelling 3 slots left the allowance wrong';
  end if;

  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000201'
         and status = 'live') <> 1 then
    raise exception
      'listing allowance assertion: cancelling an add-on left the excess listings live';
  end if;
  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000201'
         and status = 'closed') <> 3 then
    raise exception 'listing allowance assertion: the excess was not closed';
  end if;

  -- IDEMPOTENT. Stripe delivers at least once, and a redelivered cancellation
  -- must neither decrement again nor take a second listing down.
  v_result := public.revoke_listing_slot_purchase('sub_db_assert_addon_cancel');
  if coalesce(v_result->>'already_revoked', '') <> 'true' then
    raise exception 'listing allowance assertion: a redelivered cancellation revoked twice';
  end if;
  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000201'
         and status = 'live') <> 1 then
    raise exception
      'listing allowance assertion: a redelivered cancellation closed another listing';
  end if;
end;
$assert_addon_cancellation$;

-- 5c) A PORTAL-SIDE QUANTITY REDUCTION closes the excess, and a NON-PAYING
--     status closes the rest. Neither ever emits customer.subscription.deleted,
--     so neither reaches the cancellation path above.
do $assert_addon_quantity_and_nonpayment$
declare
  v_result jsonb;
begin
  -- Three slots reduced to one in the billing portal.
  v_result := public.sync_listing_slot_subscription('sub_db_assert_addon_qty', 1, true);
  if coalesce(v_result->>'changed', '') <> 'true' then
    raise exception 'listing allowance assertion: the quantity reduction was not applied';
  end if;
  if private.host_listing_allowance('08300000-0000-4000-8000-000000000202') <> 2 then
    raise exception 'listing allowance assertion: a reduced quantity left the allowance wrong';
  end if;
  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000202'
         and status = 'live') <> 2 then
    raise exception
      'listing allowance assertion: a portal quantity reduction left the excess live';
  end if;

  -- IDEMPOTENT: the same event redelivered computes a delta of zero, returns
  -- before the sweep, and takes nothing else down.
  v_result := public.sync_listing_slot_subscription('sub_db_assert_addon_qty', 1, true);
  if coalesce(v_result->>'changed', '') <> 'false' then
    raise exception 'listing allowance assertion: a redelivered quantity sync moved the allowance';
  end if;
  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000202'
         and status = 'live') <> 2 then
    raise exception
      'listing allowance assertion: a redelivered quantity sync closed another listing';
  end if;

  -- NON-PAYMENT. Stripe parks an uncollected subscription in 'unpaid' and may
  -- never emit deleted; the contribution goes to zero and the host is back to
  -- their plan allowance of one.
  v_result := public.sync_listing_slot_subscription('sub_db_assert_addon_qty', 1, false);
  if coalesce(v_result->>'changed', '') <> 'true' then
    raise exception 'listing allowance assertion: non-payment did not move the allowance';
  end if;
  if (select count(*) from public.listings
       where host_profile_id = '08300000-0000-4000-8000-000000000202'
         and status = 'live') <> 1 then
    raise exception
      'listing allowance assertion: a non-paying add-on kept its listings live';
  end if;

  -- Nothing was destroyed on either host: 082 gives them closed -> draft back.
  if (select count(*) from public.listings
       where host_profile_id in ('08300000-0000-4000-8000-000000000201',
                                 '08300000-0000-4000-8000-000000000202')) <> 8 then
    raise exception 'listing allowance assertion: the add-on sweep destroyed rows';
  end if;
end;
$assert_addon_quantity_and_nonpayment$;

-- ---------------------------------------------------------------------------
-- 6) THE DENORMALIZED TIER COPY IS RECONCILED AT PROFILE CREATION.
--
--    083's gate makes a host_profiles row IMPOSSIBLE at payment time: the funnel
--    is sign up -> pay -> create profile. So the Stripe webhook's
--    `UPDATE host_profiles ... WHERE clerk_user_id = ...` matches zero rows for
--    every new customer -- asserted below rather than assumed, because the
--    webhook used to THROW on exactly that result and answer 500 to the first
--    event of every subscription.
--
--    Nothing is lost by resolving there, and this is why: host_subscriptions is
--    the authority, it is written first, and create_my_host_profile reads it to
--    decide whether creation is allowed at all. It therefore seeds the copy on
--    creation and re-seeds it on every later call, in BOTH directions.
-- ---------------------------------------------------------------------------

insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values ('user_db_assert_reconcile', 'professional', 'active');

do $assert_paid_but_profileless$
declare
  v_rows integer;
begin
  update public.host_profiles
     set subscription_tier = 'professional'
   where clerk_user_id = 'user_db_assert_reconcile';
  get diagnostics v_rows = row_count;

  if v_rows <> 0 then
    raise exception
      'listing allowance assertion: a paid-but-profileless host already had a profile row';
  end if;
end;
$assert_paid_but_profileless$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"user_db_assert_reconcile"}',
  true
);

do $assert_creation_lands_the_tier$
declare
  v_id uuid;
begin
  v_id := public.create_my_host_profile(
    'Reconcile assertion host', array['farm']::text[], 'Integration');

  if (select subscription_tier from public.host_profiles where id = v_id) <> 'professional' then
    raise exception
      'listing allowance assertion: profile creation did not land the paid tier on the copy';
  end if;
end;
$assert_creation_lands_the_tier$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Drive the copy out of step by hand — the state a failed or lost host_profiles
-- write leaves behind — and prove the next call puts it back.
update public.host_profiles
   set subscription_tier = 'none'
 where clerk_user_id = 'user_db_assert_reconcile';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"user_db_assert_reconcile"}',
  true
);

do $assert_reconcile_both_directions$
declare
  v_id uuid;
begin
  v_id := public.create_my_host_profile(
    'Reconcile assertion host', array['farm']::text[], 'Integration');

  if (select subscription_tier from public.host_profiles where id = v_id) <> 'professional' then
    raise exception
      'listing allowance assertion: a stale tier copy was not reconciled from the authority';
  end if;
end;
$assert_reconcile_both_directions$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- The lapse direction. A copy that only ever moved UP would keep selling a
-- lapsed host the tier they stopped paying for, and the host must still be able
-- to resolve their own profile id.
update public.host_subscriptions
   set tier = 'none', billing_status = 'cancelled'
 where clerk_user_id = 'user_db_assert_reconcile';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"user_db_assert_reconcile"}',
  true
);

do $assert_reconcile_downward$
declare
  v_id uuid;
begin
  v_id := public.create_my_host_profile(
    'Reconcile assertion host', array['farm']::text[], 'Integration');

  if v_id is null then
    raise exception
      'listing allowance assertion: a lapsed host could not resolve their own profile';
  end if;
  if (select subscription_tier from public.host_profiles where id = v_id) <> 'none' then
    raise exception
      'listing allowance assertion: a lapse did not reach the denormalized tier copy';
  end if;
end;
$assert_reconcile_downward$;

reset role;

rollback;

