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
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_prospect","role":"authenticated"}';
do $$
declare
  v_profile_id uuid;
  v_listing_id uuid;
  v_tier text;
  v_allowance integer;
begin
  v_profile_id := public.create_my_host_profile(
    'Prospect Orchard',
    array['farm'],
    'Nowhere'
  );
  if v_profile_id is null then
    raise exception 'profile-onboarding: a prospect could not create a host profile';
  end if;

  -- The copy is seeded honestly rather than left unset or optimistic.
  select subscription_tier into v_tier
    from public.host_profiles where id = v_profile_id;
  if v_tier <> 'none' then
    raise exception
      'profile-onboarding: a prospect profile was born at tier %, expected none', v_tier;
  end if;

  -- And the allowance the trigger will consult is zero. Read explicitly so a
  -- failure names the CAUSE rather than only the symptom below.
  v_allowance := private.host_listing_allowance(v_profile_id);
  if v_allowance <> 0 then
    raise exception
      'profile-onboarding: a prospect holds a listing allowance of %, expected 0', v_allowance;
  end if;

  -- Drafts are free on every tier, including none.
  insert into public.listings (
    host_profile_id, title, category, status,
    housing_included, meals_included,
    housing_evidence, meals_evidence, pay_evidence,
    compensation_min_cents, location_display
  ) values (
    v_profile_id, 'Prospect draft', 'farm', 'draft',
    false, false, 'confirmed', 'confirmed', 'confirmed',
    22000, 'Nowhere'
  ) returning id into v_listing_id;

  -- BOTH edges into the counted set are refused, not just the obvious one. The
  -- allowance counts under_review, so the refusal lands at "mark ready" — one
  -- step before publish. Asserting only the live edge would still pass if
  -- under_review were exempted, and a prospect could park listings in review.
  begin
    update public.listings set status = 'under_review' where id = v_listing_id;
    raise exception 'profile-onboarding: a prospect moved a listing into review';
  exception when check_violation then
    if sqlerrm <> 'listing_allowance_exceeded' then raise; end if;
  end;

  begin
    update public.listings set status = 'live' where id = v_listing_id;
    raise exception 'profile-onboarding: a prospect published a listing';
  exception when check_violation then
    if sqlerrm <> 'listing_allowance_exceeded' then raise; end if;
  end;

  if (select status from public.listings where id = v_listing_id) <> 'draft' then
    raise exception 'profile-onboarding: a refused transition still moved the listing';
  end if;
end;
$$;
reset role;

-- POSITIVE CONTROL. Without it, "publication is refused" is equally satisfied by
-- a database that refuses everyone, and the assertions above would survive the
-- trigger being broken outright.
insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
values ('user_profile_prospect', 'starter', 'active')
on conflict (clerk_user_id) do update set tier = 'starter', billing_status = 'active';

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_profile_prospect","role":"authenticated"}';
do $$
declare
  v_profile_id uuid;
  v_listing_id uuid;
begin
  select id into v_profile_id
    from public.host_profiles where clerk_user_id = 'user_profile_prospect';
  select id into v_listing_id
    from public.listings where host_profile_id = v_profile_id limit 1;

  update public.listings set status = 'under_review' where id = v_listing_id;
  update public.listings set status = 'live' where id = v_listing_id;

  if (select status from public.listings where id = v_listing_id) <> 'live' then
    raise exception 'profile-onboarding: an activated host could not publish';
  end if;
end;
$$;
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
