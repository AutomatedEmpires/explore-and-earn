\set ON_ERROR_STOP on

-- Connected, non-skippable proof for migration 077. This runs only against the
-- disposable local database rebuilt by db-security.yml and rolls back every
-- fixture. It exercises the same authenticated role, Clerk-shaped JWT claims,
-- grants, RLS policies, trigger, and service_role path used by PostgREST.
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

insert into public.host_profiles (
  id,
  owner_user_id,
  clerk_user_id,
  company_name,
  slug,
  category_scopes
) values (
  '07700000-0000-4000-8000-000000000001',
  null,
  'user_db_assert_listing_lifecycle',
  'Listing lifecycle assertion host',
  'listing-lifecycle-assertion-host',
  array['farm']::text[]
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
    'Hold path',
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

update public.listings
   set status = 'under_review'
 where title in (
   'Approve path',
   'Hold path',
   'Reject path'
 );

do $assert_host_approval$
begin
  begin
    update public.listings
       set status = 'live'
     where title = 'Approve path';
    raise exception 'listing lifecycle assertion: authenticated approval succeeded';
  exception
    when check_violation then
      if sqlerrm <> 'listing_host_status_transition_forbidden' then
        raise;
      end if;
  end;
end;
$assert_host_approval$;

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
     when 'Hold path' then 'draft'
     when 'Reject path' then 'closed'
   end
 where title in (
   'Approve path',
   'Hold path',
   'Reject path'
 );

do $assert_moderation$
begin
  if not exists (
    select 1 from public.listings
     where title = 'Approve path' and status = 'live'
  ) or not exists (
    select 1 from public.listings
     where title = 'Hold path' and status = 'draft'
  ) or not exists (
    select 1 from public.listings
     where title = 'Reject path' and status = 'closed'
  ) then
    raise exception 'listing lifecycle assertion: service-role moderation failed';
  end if;
end;
$assert_moderation$;

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

reset role;
rollback;
