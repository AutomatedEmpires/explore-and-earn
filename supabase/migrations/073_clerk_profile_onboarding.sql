-- Clerk-native profile provisioning.
--
-- Clerk is the authentication source of truth. The legacy profile schema still
-- required a Supabase Auth UUID for hosts, while neither profile table exposed
-- a safe INSERT path to an authenticated Clerk token. Keep the legacy FK for
-- old rows, make it nullable for Clerk-native rows, and expose only two narrow,
-- identity-derived creation functions. Direct client INSERT remains denied.

begin;

-- Supabase's authenticated role may also be reached by native Supabase Auth.
-- Normalize the shared ownership helper so only Clerk-shaped subject ids can
-- enter any owner policy or provisioning RPC. Native Supabase users have UUID
-- subjects and therefore resolve to NULL here.
create or replace function public.get_clerk_user_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (auth.jwt() ->> 'sub') ~ '^user_[A-Za-z0-9_-]+$'
      then auth.jwt() ->> 'sub'
    else null
  end
$$;

alter table public.host_profiles
  alter column owner_user_id drop not null;

-- A host selects one or more concrete lanes. `mix` is derived for listings
-- spanning multiple lanes and must never be persisted as a host scope. Add the
-- replacement without validating under the strong ALTER lock, validate it
-- separately, then preserve the canonical constraint name.
alter table public.host_profiles
  add constraint host_profiles_category_scopes_lane_check
  check (
    category_scopes is not null
    and cardinality(category_scopes) between 1 and 4
    and category_scopes <@ array['farm', 'maritime', 'remote', 'seasonal']::text[]
    and array_position(category_scopes, null) is null
  ) not valid;

alter table public.host_profiles
  validate constraint host_profiles_category_scopes_lane_check;

alter table public.host_profiles
  drop constraint host_profiles_category_scopes_check;

alter table public.host_profiles
  rename constraint host_profiles_category_scopes_lane_check
  to host_profiles_category_scopes_check;

comment on column public.host_profiles.owner_user_id is
  'Legacy Supabase Auth owner UUID. Nullable for Clerk-native profiles; clerk_user_id is the canonical application identity.';

-- Profile creation must go through the functions below. This prevents a raw
-- PostgREST caller from choosing identity, trust, subscription, moderation, or
-- lifecycle columns even if a future row policy is accidentally broadened.
revoke insert on table public.host_profiles from anon, authenticated;
revoke insert on table public.seeker_profiles from anon, authenticated;

create or replace function public.create_my_host_profile(
  p_company_name text,
  p_category_scopes text[],
  p_primary_location_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text;
  v_company_name text;
  v_primary_location_name text;
  v_category_scopes text[];
  v_existing_id uuid;
  v_existing_deleted_at timestamptz;
  v_profile_id uuid;
  v_slug_base text;
  v_slug text;
  v_attempt integer;
begin
  v_clerk_user_id := nullif(btrim(public.get_clerk_user_id()), '');
  if v_clerk_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'profile_identity_required';
  end if;

  v_company_name := nullif(btrim(p_company_name), '');
  if v_company_name is null then
    raise exception using
      errcode = '22023',
      message = 'host_company_name_required';
  end if;
  if length(v_company_name) > 160 then
    raise exception using
      errcode = '22023',
      message = 'host_company_name_too_long';
  end if;

  v_primary_location_name := nullif(btrim(p_primary_location_name), '');
  if length(v_primary_location_name) > 200 then
    raise exception using
      errcode = '22023',
      message = 'host_primary_location_too_long';
  end if;

  if p_category_scopes is null or cardinality(p_category_scopes) = 0 then
    raise exception using
      errcode = '22023',
      message = 'host_category_scopes_required';
  end if;
  if cardinality(p_category_scopes) > 4 then
    raise exception using
      errcode = '22023',
      message = 'host_category_scope_invalid';
  end if;
  if exists (
    select 1
      from unnest(p_category_scopes) as scope(value)
     where scope.value is null
        or scope.value <> all(array['farm', 'maritime', 'remote', 'seasonal']::text[])
  ) then
    raise exception using
      errcode = '22023',
      message = 'host_category_scope_invalid';
  end if;

  -- Preserve first-seen order while removing duplicate client values.
  select coalesce(array_agg(deduped.value order by deduped.first_position), '{}'::text[])
    into v_category_scopes
    from (
      select scope.value, min(scope.position) as first_position
        from unnest(p_category_scopes) with ordinality as scope(value, position)
       group by scope.value
    ) as deduped;

  select hp.id, hp.deleted_at
    into v_existing_id, v_existing_deleted_at
    from public.host_profiles hp
   where hp.clerk_user_id = v_clerk_user_id
   for update;

  if found then
    if v_existing_deleted_at is not null then
      raise exception using
        errcode = '55000',
        message = 'profile_identity_disabled';
    end if;
    return v_existing_id;
  end if;

  v_slug_base := trim(both '-' from regexp_replace(
    lower(v_company_name),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
  if v_slug_base = '' then
    v_slug_base := 'host';
  end if;
  v_slug_base := left(v_slug_base, 80);

  -- A concurrent double-submit can pass the first SELECT in both sessions.
  -- The partial unique index on clerk_user_id chooses one winner; the loser
  -- reads and returns it. A full UUID suffix also makes slug collisions no more
  -- likely than primary-key collisions while retaining a human-readable base.
  for v_attempt in 1..3 loop
    v_profile_id := pg_catalog.gen_random_uuid();
    v_slug := v_slug_base || '-' || v_profile_id::text;

    insert into public.host_profiles (
      id,
      owner_user_id,
      clerk_user_id,
      company_name,
      slug,
      category_scopes,
      primary_location_name
    ) values (
      v_profile_id,
      null,
      v_clerk_user_id,
      v_company_name,
      v_slug,
      v_category_scopes,
      v_primary_location_name
    )
    on conflict do nothing
    returning id into v_existing_id;

    if v_existing_id is not null then
      return v_existing_id;
    end if;

    select hp.id, hp.deleted_at
      into v_existing_id, v_existing_deleted_at
      from public.host_profiles hp
     where hp.clerk_user_id = v_clerk_user_id
     for update;

    if found then
      if v_existing_deleted_at is not null then
        raise exception using
          errcode = '55000',
          message = 'profile_identity_disabled';
      end if;
      return v_existing_id;
    end if;
  end loop;

  raise exception using
    errcode = '23505',
    message = 'host_profile_create_conflict';
end;
$$;

create or replace function public.ensure_my_seeker_profile()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text;
  v_profile_id uuid;
  v_deleted_at timestamptz;
begin
  v_clerk_user_id := nullif(btrim(public.get_clerk_user_id()), '');
  if v_clerk_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'profile_identity_required';
  end if;

  select sp.id, sp.deleted_at
    into v_profile_id, v_deleted_at
    from public.seeker_profiles sp
   where sp.clerk_user_id = v_clerk_user_id
   for update;

  if found then
    if v_deleted_at is not null then
      raise exception using
        errcode = '55000',
        message = 'profile_identity_disabled';
    end if;
    return v_profile_id;
  end if;

  -- The Clerk webhook normally creates this row. ON CONFLICT handles a webhook
  -- commit racing this fallback without creating or updating another identity.
  insert into public.seeker_profiles (clerk_user_id)
  values (v_clerk_user_id)
  on conflict do nothing
  returning id into v_profile_id;

  if v_profile_id is not null then
    return v_profile_id;
  end if;

  select sp.id, sp.deleted_at
    into v_profile_id, v_deleted_at
    from public.seeker_profiles sp
   where sp.clerk_user_id = v_clerk_user_id
   for update;

  if not found then
    raise exception using
      errcode = '23505',
      message = 'seeker_profile_create_conflict';
  end if;
  if v_deleted_at is not null then
    raise exception using
      errcode = '55000',
      message = 'profile_identity_disabled';
  end if;
  return v_profile_id;
end;
$$;

revoke execute on function public.create_my_host_profile(text, text[], text)
  from public, anon, authenticated;
revoke execute on function public.ensure_my_seeker_profile()
  from public, anon, authenticated;

grant execute on function public.create_my_host_profile(text, text[], text)
  to authenticated, service_role;
grant execute on function public.ensure_my_seeker_profile()
  to authenticated, service_role;

commit;
