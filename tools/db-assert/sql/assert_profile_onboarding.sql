\set ON_ERROR_STOP on

begin;

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'host_profiles'
       and column_name = 'owner_user_id'
       and is_nullable = 'YES'
  ) then
    raise exception 'profile-onboarding: host_profiles.owner_user_id is still required';
  end if;

  if has_table_privilege('authenticated', 'public.host_profiles', 'INSERT')
     or has_table_privilege('authenticated', 'public.seeker_profiles', 'INSERT')
     or has_table_privilege('anon', 'public.host_profiles', 'INSERT')
     or has_table_privilege('anon', 'public.seeker_profiles', 'INSERT') then
    raise exception 'profile-onboarding: a client role retains direct profile INSERT';
  end if;

  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename in ('host_profiles', 'seeker_profiles')
       and cmd in ('INSERT', 'ALL')
       and (roles && array['anon', 'authenticated']::name[]
            or roles = array['public']::name[])
  ) then
    raise exception 'profile-onboarding: a direct client profile INSERT policy exists';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.create_my_host_profile(text,text[],text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.ensure_my_seeker_profile()',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.create_my_host_profile(text,text[],text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.ensure_my_seeker_profile()',
       'EXECUTE'
     ) then
    raise exception 'profile-onboarding: RPC role grants are incorrect';
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public'
       and p.proname in ('create_my_host_profile', 'ensure_my_seeker_profile')
       and a.grantee = 0
       and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'profile-onboarding: an onboarding RPC is executable by PUBLIC';
  end if;
end;
$$;

-- The authenticated Postgres role is shared by Clerk and native Supabase
-- Auth. A native Supabase JWT has a UUID subject and must not enter Clerk-owned
-- RLS or either provisioning RPC.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
begin
  if public.get_clerk_user_id() is not null then
    raise exception 'profile-onboarding: native Supabase subject resolved as Clerk';
  end if;

  begin
    perform public.create_my_host_profile('Native Auth Host', array['farm'], null);
    raise exception 'profile-onboarding: native Supabase subject created a host';
  exception when insufficient_privilege then
    if sqlerrm <> 'profile_identity_required' then
      raise;
    end if;
  end;

  begin
    perform public.ensure_my_seeker_profile();
    raise exception 'profile-onboarding: native Supabase subject created a seeker';
  exception when insufficient_privilege then
    if sqlerrm <> 'profile_identity_required' then
      raise;
    end if;
  end;
end;
$$;
reset role;

-- These two hosts are given a paid tier so the assertions further down can read
-- a PAID denormalized copy back (see the subscription_tier check below). It is
-- no longer a precondition for creating them: migration 086 (commercial redesign
-- D6) removed the paid-tier refusal from create_my_host_profile, and the
-- prospect case is asserted at the end of this file.
insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values
  ('user_profile_host_one', 'starter', 'active'),
  ('user_profile_host_two', 'starter', 'active');

-- Host creation is JWT-derived, complete, and idempotent.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_host_one","role":"authenticated"}';
do $$
declare
  v_first uuid;
  v_second uuid;
begin
  begin
    insert into public.host_profiles (clerk_user_id, company_name)
    values ('user_spoofed_host', 'Spoofed Host');
    raise exception 'profile-onboarding: direct host INSERT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  v_first := public.create_my_host_profile(
    '  Glacier Orchard  ',
    array['farm', 'remote', 'farm'],
    '  Wenatchee, Washington  '
  );
  v_second := public.create_my_host_profile(
    'Ignored Double Submit',
    array['maritime'],
    'Ignored Location'
  );
  if v_first is null or v_second is distinct from v_first then
    raise exception 'profile-onboarding: host creation is not idempotent';
  end if;

  begin
    update public.host_profiles
       set category_scopes = array['mix']
     where id = v_first;
    raise exception 'profile-onboarding: raw host update persisted derived mix';
  exception when check_violation then
    null;
  end;

  begin
    update public.host_profiles
       set category_scopes = '{}'::text[]
     where id = v_first;
    raise exception 'profile-onboarding: raw host update persisted empty scopes';
  exception when check_violation then
    null;
  end;
end;
$$;
reset role;

do $$
declare
  v_host record;
begin
  select * into strict v_host
    from public.host_profiles
   where clerk_user_id = 'user_profile_host_one';

  if v_host.owner_user_id is not null
     or v_host.company_name <> 'Glacier Orchard'
     or v_host.category_scopes is distinct from array['farm', 'remote']::text[]
     or v_host.primary_location_name <> 'Wenatchee, Washington'
     or v_host.slug !~ '^glacier-orchard-[0-9a-f-]{36}$'
     or v_host.attestation_status <> 'not_attested'
     -- Seeded from the resolved tier, not left at 'none'. 083 made
     -- host_subscriptions the authority and host_profiles.subscription_tier the
     -- denormalized read copy that listing, search and badge queries join; a
     -- copy born at 'none' for a host who has already paid would render them as
     -- unsubscribed until the next webhook happened to touch the row.
     or v_host.subscription_tier <> 'starter'
     or v_host.public_status <> 'draft' then
    raise exception 'profile-onboarding: host row did not preserve canonical defaults/input: %',
      row_to_json(v_host);
  end if;
end;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_host_two","role":"authenticated"}';
select public.create_my_host_profile(
  'Glacier Orchard',
  array['seasonal'],
  null
);
reset role;

do $$
begin
  if (
    select count(distinct slug)
      from public.host_profiles
     where clerk_user_id in ('user_profile_host_one', 'user_profile_host_two')
  ) <> 2 then
    raise exception 'profile-onboarding: same-name hosts did not receive unique slugs';
  end if;
end;
$$;

-- A host sees only its own private draft row.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_host_one","role":"authenticated"}';
do $$
begin
  if exists (
    select 1
      from public.host_profiles
     where clerk_user_id = 'user_profile_host_two'
  ) then
    raise exception 'profile-onboarding: host draft isolation failed';
  end if;
end;
$$;
reset role;

-- Seeker fallback repairs webhook lag without opening table INSERT.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_seeker_one","role":"authenticated"}';
do $$
declare
  v_first uuid;
  v_second uuid;
  v_rows integer;
begin
  begin
    insert into public.seeker_profiles (clerk_user_id)
    values ('user_spoofed_seeker');
    raise exception 'profile-onboarding: direct seeker INSERT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  v_first := public.ensure_my_seeker_profile();
  v_second := public.ensure_my_seeker_profile();
  if v_first is null or v_second is distinct from v_first then
    raise exception 'profile-onboarding: seeker fallback is not idempotent';
  end if;

  update public.seeker_profiles
     set display_name = 'River Seeker',
         onboarding_complete = true
   where id = v_first;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'profile-onboarding: owner update after ensure affected % rows', v_rows;
  end if;
end;
$$;
reset role;

do $$
declare
  v_seeker record;
begin
  select * into strict v_seeker
    from public.seeker_profiles
   where clerk_user_id = 'user_profile_seeker_one';
  if v_seeker.user_id is not null
     or v_seeker.display_name <> 'River Seeker'
     or v_seeker.onboarding_complete is distinct from true then
    raise exception 'profile-onboarding: seeker fallback/update state is wrong';
  end if;
end;
$$;

-- A different token cannot update the ensured row.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_seeker_two","role":"authenticated"}';
do $$
declare
  v_rows integer;
begin
  perform public.ensure_my_seeker_profile();
  update public.seeker_profiles
     set display_name = 'Cross Tenant Write'
   where clerk_user_id = 'user_profile_seeker_one';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'profile-onboarding: cross-seeker update affected % rows', v_rows;
  end if;
end;
$$;
reset role;

-- Soft deletion is never silently undone by an onboarding retry.
insert into public.host_profiles (
  owner_user_id, clerk_user_id, company_name, slug, category_scopes, deleted_at
) values (
  null, 'user_profile_deleted_host', 'Deleted Host',
  'deleted-host-profile-test', array['farm'], now()
);
insert into public.seeker_profiles (clerk_user_id, deleted_at)
values ('user_profile_deleted_seeker', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_deleted_host","role":"authenticated"}';
do $$
begin
  begin
    perform public.create_my_host_profile('Replacement', array['farm'], null);
    raise exception 'profile-onboarding: deleted host was silently recreated';
  exception when sqlstate '55000' then
    if sqlerrm <> 'profile_identity_disabled' then
      raise;
    end if;
  end;
end;
$$;

set local request.jwt.claims = '{"sub":"user_profile_deleted_seeker","role":"authenticated"}';
do $$
begin
  begin
    perform public.ensure_my_seeker_profile();
    raise exception 'profile-onboarding: deleted seeker was silently recreated';
  exception when sqlstate '55000' then
    if sqlerrm <> 'profile_identity_disabled' then
      raise;
    end if;
  end;
end;
$$;
reset role;

-- Invalid host facts fail before a row exists.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_invalid_host","role":"authenticated"}';
do $$
begin
  begin
    perform public.create_my_host_profile('', array['farm'], null);
    raise exception 'profile-onboarding: blank company name was accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'host_company_name_required' then
      raise;
    end if;
  end;

  begin
    perform public.create_my_host_profile('Invalid Lane', array['not-a-lane'], null);
    raise exception 'profile-onboarding: invalid category was accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'host_category_scope_invalid' then
      raise;
    end if;
  end;

  begin
    perform public.create_my_host_profile('Derived Mix', array['mix'], null);
    raise exception 'profile-onboarding: derived mix category was accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'host_category_scope_invalid' then
      raise;
    end if;
  end;
end;
$$;
reset role;

-- ---------------------------------------------------------------------------
-- THE PRE-BILLING HOST (migration 086, commercial redesign D6).
--
-- Creation is ALLOWED with no plan; PUBLICATION is not. Asserted here, in the
-- database, on one host, in that order — the two halves only mean anything
-- together. Migration 083 used to refuse the first of them.
--
-- Note what this host is given: nothing. No host_subscriptions row is inserted
-- for this Clerk id, which is the state of every account that has never opened
-- checkout, and the state the allowance resolves to zero for.
-- ---------------------------------------------------------------------------
-- ROLE CONTEXT IS PART OF THE ASSERTION HERE, and the first version of this
-- block got it wrong: it read private.host_listing_allowance() while still
-- under `set local role authenticated` and failed with "permission denied for
-- schema private". That was the hardening working. Schema private is revoked
-- from anon and authenticated on purpose (083) — a host who could execute the
-- allowance helpers could read every other host's entitlement — so a diagnostic
-- that needs them has to speak as the DEFAULT role, exactly as sections 1 and 2
-- of assert_listing_allowance_enforcement.sql do.
--
-- So this splits into three, and the split is not cosmetic:
--
--   (1) CREATION, as the host. create_my_host_profile derives identity from the
--       JWT, so it can only be proved from inside the restricted role.
--   (2) THE DIAGNOSTICS, as the default role. These exist to make a failure name
--       its CAUSE ("allowance is 3, expected 0") instead of only its symptom
--       ("the update was not refused"), and they need both the private helper
--       and an RLS-free read. Doing the tier read here rather than under
--       `authenticated` also closes a quieter hole: a prospect's profile row is
--       not public, so an RLS-filtered read could return NO ROW, leave v_tier
--       NULL, and make `v_tier <> 'none'` evaluate to NULL — which is not TRUE,
--       so the check would pass while asserting nothing.
--   (3) THE REFUSAL PROBES, as the host again, unchanged. These are the part
--       that has to run as a real client: a refusal proved under a privileged
--       role proves nothing about what a browser can do.
--
-- The profile id crosses (1) -> (3) through create_my_host_profile itself,
-- which is idempotent and returns the existing id (083 calls it "the one path
-- the application has onto an existing profile id"). That avoids re-reading
-- host_profiles under the restricted role, where RLS could hide the row.

-- (1) The prospect builds their workspace, with no subscription row anywhere.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_prospect","role":"authenticated"}';
do $assert_prospect_creates$
declare
  v_profile_id uuid;
begin
  v_profile_id := public.create_my_host_profile(
    'Prospect Orchard',
    array['farm'],
    'Nowhere'
  );
  if v_profile_id is null then
    raise exception 'profile-onboarding: a prospect could not create a host profile';
  end if;
end;
$assert_prospect_creates$;
reset role;

-- (2) The diagnostics, as the default role.
do $assert_prospect_is_unentitled$
declare
  v_profile_id uuid;
  v_tier text;
  v_allowance integer;
begin
  select id, subscription_tier
    into v_profile_id, v_tier
    from public.host_profiles
   where clerk_user_id = 'user_profile_prospect';
  if v_profile_id is null then
    raise exception 'profile-onboarding: no prospect profile row exists to inspect';
  end if;

  -- The denormalized copy is seeded honestly rather than left unset or
  -- optimistic. 'none' is both the true value and the one that makes the
  -- allowance trigger refuse the publication probed below.
  if v_tier is distinct from 'none' then
    raise exception
      'profile-onboarding: a prospect profile was born at tier %, expected none', v_tier;
  end if;

  -- And the allowance the trigger will actually consult is zero.
  v_allowance := private.host_listing_allowance(v_profile_id);
  if v_allowance <> 0 then
    raise exception
      'profile-onboarding: a prospect holds a listing allowance of %, expected 0', v_allowance;
  end if;
end;
$assert_prospect_is_unentitled$;

-- (3) The refusal probes, as the host.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_prospect","role":"authenticated"}';
do $assert_prospect_cannot_publish$
declare
  v_profile_id uuid;
  v_listing_id uuid;
begin
  -- Idempotent: returns the id created in (1) without touching host_profiles
  -- through a role that RLS may filter.
  v_profile_id := public.create_my_host_profile(
    'Prospect Orchard',
    array['farm'],
    'Nowhere'
  );

  -- Drafts are free on every tier, including none — a draft is not a counted
  -- status. Column set mirrors the proven authenticated insert in
  -- assert_listing_allowance_enforcement.sql, so no column outside the client
  -- INSERT grant is named.
  insert into public.listings (
    host_profile_id, title, category, status,
    housing_included, meals_included,
    housing_evidence, meals_evidence, pay_evidence, compensation_min_cents
  ) values (
    v_profile_id, 'Prospect draft', 'farm', 'draft',
    false, false, 'confirmed', 'confirmed', 'confirmed', 22000
  ) returning id into v_listing_id;

  -- TWO FENCES STAND BETWEEN A PROSPECT AND A SEEKER, AND THEY ARE DIFFERENT
  -- FENCES. Asserting the same error on both edges is what failed CI here: it
  -- described an idealized system rather than the one that exists.
  --
  -- Both are BEFORE triggers on public.listings, and BEFORE triggers fire in
  -- NAME order:
  --
  --     trg_listings_host_status_transition   (082, supersedes 077)  <- first
  --     trg_listings_plan_allowance           (083)                  <- second
  --
  -- 083's own header states that ordering and its reason: a forbidden
  -- transition should report as forbidden rather than as an allowance failure
  -- that happened to be checked first. So which error a prospect meets depends
  -- on whether the edge is legal at all.
  --
  -- 082's legal host edges are: draft->under_review, under_review->{draft,live},
  -- live->{paused,archived}, paused->{live,archived}, closed->draft
  -- (non-sourced). draft->live is NOT among them.

  -- EDGE 1 - draft -> under_review. Legal, so it reaches the allowance, and the
  -- allowance is the real entitlement gate. THIS is the assertion that proves a
  -- prospect cannot publish: the slot is charged at submit time, so the refusal
  -- lands here, one step BEFORE the publish button.
  begin
    update public.listings set status = 'under_review' where id = v_listing_id;
    raise exception 'profile-onboarding: a prospect moved a listing into review';
  exception when check_violation then
    if sqlerrm <> 'listing_allowance_exceeded' then raise; end if;
  end;

  -- EDGE 2 - draft -> live. Refused by the TRANSITION trigger before the
  -- allowance is ever consulted, so the allowance error can never be observed
  -- on this edge from draft. Still a refusal, and still worth pinning: it is
  -- the fence that stops a prospect skipping review entirely. Naming the exact
  -- error is the point -- accepting any check_violation here would let the
  -- allowance silently stop firing on edge 1 while this still passed.
  begin
    update public.listings set status = 'live' where id = v_listing_id;
    raise exception 'profile-onboarding: a prospect skipped review to publish';
  exception when check_violation then
    if sqlerrm <> 'listing_host_status_transition_forbidden' then raise; end if;
  end;

  if (select status from public.listings where id = v_listing_id) <> 'draft' then
    raise exception 'profile-onboarding: a refused transition still moved the listing';
  end if;
end;
$assert_prospect_cannot_publish$;
reset role;

-- POSITIVE CONTROL. Without it, "publication is refused" is equally satisfied by
-- a database that refuses everyone, and the assertions above would survive the
-- trigger being broken outright.
insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values ('user_profile_prospect', 'starter', 'active')
on conflict (clerk_user_id) do update set tier = 'starter', billing_status = 'active';

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_prospect","role":"authenticated"}';
do $assert_activated_host_publishes$
declare
  v_profile_id uuid;
  v_listing_id uuid;
begin
  -- Same idempotent resolution as the block above, for the same reason.
  v_profile_id := public.create_my_host_profile(
    'Prospect Orchard',
    array['farm'],
    'Nowhere'
  );
  select id into v_listing_id
    from public.listings where host_profile_id = v_profile_id limit 1;
  if v_listing_id is null then
    raise exception 'profile-onboarding: the prospect draft is not visible to its own host';
  end if;

  -- THE LEGAL PATH, walked in full: draft -> under_review -> live. Not a
  -- shortcut, because there is no legal shortcut -- draft -> live is refused
  -- for a PAID host too (082), so a positive control that tried it would fail
  -- for a reason that has nothing to do with entitlement.
  --
  -- Every publication precondition is already satisfied by the draft this host
  -- created above, and none of them is faked: 070's triad CHECK is met because
  -- housing/meals/pay evidence are all stated and a pay figure is present, and
  -- 072's photo gate does not apply because housing_included is false. That is
  -- the same fixture shape assert_listing_allowance_enforcement.sql publishes.
  update public.listings set status = 'under_review' where id = v_listing_id;
  update public.listings set status = 'live' where id = v_listing_id;

  if (select status from public.listings where id = v_listing_id) <> 'live' then
    raise exception 'profile-onboarding: an activated host could not publish';
  end if;
end;
$assert_activated_host_publishes$;
reset role;

-- An anonymous token cannot invoke either provisioning surface.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform public.create_my_host_profile('Anonymous Host', array['farm'], null);
    raise exception 'profile-onboarding: anon host RPC unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.ensure_my_seeker_profile();
    raise exception 'profile-onboarding: anon seeker RPC unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

rollback;
