-- assert_rpc_grants.sql
-- Lane A - DB-connected security guardrail. Run against a live/local database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/assert_rpc_grants.sql
--
-- Fails (raises) if any identity-sensitive SECURITY DEFINER function is executable by
-- anon, by PUBLIC, or by authenticated where forbidden (the two trigger fns);
-- if a server-only table is missing RLS or exposes a client policy; or if the
-- storage buckets still allow anon enumeration. Emits an evidence table at the
-- end for inclusion in PR / audit artifacts.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Guardrail 1: RPC execute grants on the identity-sensitive functions.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_fail boolean := false;
  v_found int := 0;
  fn_names text[] := array[
    'set_host_attestation',
    'get_clerk_user_id',
    'current_seeker_profile_ids',
    'current_host_profile_ids',
    'current_host_listing_ids',
    'current_conversation_ids',
    'enforce_listing_cover_asset',
    'enforce_listing_media_override',
    'create_my_host_profile',
    'ensure_my_seeker_profile',
    'ensure_my_application_conversation',
    'ensure_my_host_application_conversation',
    'get_my_conversation_contexts'
  ];
  trigger_fns text[] := array[
    'enforce_listing_cover_asset',
    'enforce_listing_media_override'
  ];
begin
  for r in
    select p.oid, p.proname,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
           exists (
             select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE'
           ) as public_exec
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(fn_names)
  loop
    v_found := v_found + 1;
    raise notice 'fn=% anon_execute=% authenticated_execute=% public_execute=%',
      r.proname, r.anon_exec, r.auth_exec, r.public_exec;
    if r.anon_exec then
      v_fail := true;
      raise warning 'FORBIDDEN: anon can execute public.%', r.proname;
    end if;
    if r.public_exec then
      v_fail := true;
      raise warning 'FORBIDDEN: PUBLIC can execute public.%', r.proname;
    end if;
    if r.auth_exec and r.proname = any(trigger_fns) then
      v_fail := true;
      raise warning 'FORBIDDEN: authenticated can execute trigger fn public.%', r.proname;
    end if;
  end loop;

  if v_found < array_length(fn_names, 1) then
    raise exception 'db-assert: expected % target functions in schema public, found %',
      array_length(fn_names, 1), v_found;
  end if;
  if v_fail then
    raise exception 'db-assert: RPC execute-grant guardrail FAILED (see warnings)';
  end if;
  raise notice 'db-assert: RPC execute-grant guardrail PASSED for all % functions',
    array_length(fn_names, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardrail 2: server-only tables are RLS-on with no client-facing policy.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fail boolean := false;
  t text;
  v_rls boolean;
  v_policy_count int;
  tbls text[] := array['events', 'media_assets', 'media_buckets'];
begin
  foreach t in array tbls loop
    select c.relrowsecurity into v_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t;

    if v_rls is distinct from true then
      v_fail := true;
      raise warning 'FORBIDDEN: RLS not enabled on public.%', t;
    end if;

    select count(*) into v_policy_count
    from pg_policies pol
    where pol.schemaname = 'public' and pol.tablename = t
      and (pol.roles && array['anon', 'authenticated']::name[]
           or pol.roles = array['public']::name[]);

    if v_policy_count > 0 then
      v_fail := true;
      raise warning 'FORBIDDEN: % client-facing policy(ies) on server-only table public.%',
        v_policy_count, t;
    end if;
    raise notice 'server-only table public.%: rls=% client_policies=%', t, v_rls, v_policy_count;
  end loop;

  if v_fail then
    raise exception 'db-assert: server-only table guardrail FAILED';
  end if;
  raise notice 'db-assert: server-only table guardrail PASSED';
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardrail 3: storage buckets no longer allow client enumeration.
-- ---------------------------------------------------------------------------
do $$
declare
  v_public_count int;
  v_authenticated_count int;
  v_valid_owner_count int;
begin
  -- A SELECT policy for anon/PUBLIC applies across storage.objects even when
  -- its rendered expression does not contain a literal bucket name.
  select count(*) into v_public_count
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
    and roles && array['anon', 'public']::name[];
  raise notice 'storage anon/public SELECT policies: %', v_public_count;
  if v_public_count > 0 then
    raise exception 'db-assert: storage bucket enumeration still open to anon/PUBLIC';
  end if;

  -- Authenticated SELECT is limited to the three exact owner-folder policies.
  -- Checking both policy identity and predicate shape prevents a renamed
  -- USING (true) policy from passing merely because no bucket literal appears.
  --
  -- Migration 081 moved the two host-bearing policies off an inline
  -- `host_profiles ... clerk_user_id = auth.jwt() ->> 'sub'` sub-select and onto
  -- the SECURITY DEFINER helpers, because a cross-table sub-select inside a
  -- policy IS permission-checked against the invoking role (verified: it raises
  -- 42501 once the column grant is withdrawn). The owner-scoping evidence is
  -- therefore now the helper call, and this guardrail requires the helper form
  -- rather than merely accepting it — reverting a policy to the inline sub-select
  -- would reintroduce the hazard 081 closed, so it must fail here.
  -- community_photos_owner_select is untouched by 081 (it reads seeker_profiles,
  -- which 082 does not revoke) and keeps the legacy shape check.
  select count(*) into v_authenticated_count
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
    and roles && array['authenticated']::name[];

  select count(*) into v_valid_owner_count
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
    and roles = array['authenticated']::name[]
    and (
      (
        policyname = 'listing_media_select_own_folder'
        and coalesce(qual, '') like '%bucket_id = ''listing-media''::text%'
        and coalesce(qual, '') like '%storage.foldername(name)%'
        and coalesce(qual, '') like '%current_host_profile_ids()%'
        and coalesce(qual, '') not like '%clerk_user_id%'
      )
      or (
        policyname = 'profile_photos_select_own_folder'
        and coalesce(qual, '') like '%bucket_id = ''profile-photos''::text%'
        and coalesce(qual, '') like '%current_host_profile_ids()%'
        and coalesce(qual, '') like '%current_seeker_profile_ids()%'
        and coalesce(qual, '') like '%split_part(name, ''/''::text, 1)%'
        and coalesce(qual, '') not like '%clerk_user_id%'
      )
      or (
        policyname = 'community_photos_owner_select'
        and coalesce(qual, '') like '%bucket_id = ''community-photos''::text%'
        and coalesce(qual, '') like '%storage.foldername(name)%'
        and coalesce(qual, '') like '%seeker_profiles%'
        and coalesce(qual, '') like '%clerk_user_id%auth.jwt()%''sub''::text%'
      )
    );

  raise notice 'storage authenticated SELECT policies: % (valid owner policies: %)',
    v_authenticated_count, v_valid_owner_count;
  if v_authenticated_count <> 3 or v_valid_owner_count <> 3 then
    raise exception 'db-assert: storage authenticated SELECT policies are not the exact owner-scoped set';
  end if;
  raise notice 'db-assert: storage enumeration guardrail PASSED';
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardrail 3b: service-only workflow functions remain SECURITY INVOKER,
-- service-role-only, and pinned to an empty search_path.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_fail boolean := false;
  v_found integer := 0;
  fn_names text[] := array[
    'create_invite_with_credit',
    'restore_invite_credit',
    'transition_listing_claim',
    'convert_claimed_listing',
    'claim_notification_deliveries',
    'get_unprocessed_notification_events'
  ];
begin
  for r in
    select p.oid,
           p.proname,
           p.prosecdef,
           p.proconfig,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec,
           exists (
             select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE'
           ) as public_exec
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(fn_names)
  loop
    v_found := v_found + 1;
    if r.prosecdef
       or r.anon_exec
       or r.auth_exec
       or r.public_exec
       or not r.service_exec
       or not (
         coalesce(r.proconfig, '{}'::text[])
           @> array['search_path=""']::text[]
       ) then
      v_fail := true;
      raise warning 'service workflow function % has unsafe execution/search_path configuration',
        r.proname;
    end if;
  end loop;

  if v_found <> array_length(fn_names, 1) then
    raise exception 'db-assert: expected % service workflow functions, found %',
      array_length(fn_names, 1), v_found;
  end if;
  if v_fail then
    raise exception 'db-assert: service workflow function hardening FAILED';
  end if;
  raise notice 'db-assert: service workflow function hardening PASSED';
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardrail 4: reusable housing evidence keeps narrow grants and every
-- mutation boundary that preserves already-published claims.
-- ---------------------------------------------------------------------------
do $$
declare
  v_trigger_count integer;
  v_private_count integer;
  v_private_exec integer;
  v_storage_trigger_def text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'host_profiles'
       and column_name = 'benefit_library'
       and data_type = 'jsonb'
       and is_nullable = 'NO'
  ) then
    raise exception 'db-assert: host_profiles.benefit_library is missing or nullable';
  end if;

  if not has_column_privilege('authenticated', 'public.host_profiles', 'benefit_library', 'UPDATE')
     or has_table_privilege('authenticated', 'public.host_profiles', 'UPDATE') then
    raise exception 'db-assert: authenticated benefit_library UPDATE is not column-narrow';
  end if;
  if has_column_privilege('authenticated', 'public.host_profiles', 'benefit_library', 'SELECT')
     or has_column_privilege('anon', 'public.host_profiles', 'benefit_library', 'SELECT')
     or has_table_privilege('authenticated', 'public.host_profiles', 'SELECT')
     or has_column_privilege('anon', 'public.listings', 'benefit_details', 'SELECT')
     or has_column_privilege('authenticated', 'public.listings', 'benefit_details', 'SELECT')
     or has_table_privilege('anon', 'public.listings', 'SELECT')
     or has_table_privilege('authenticated', 'public.listings', 'SELECT')
     or exists (
       select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'host_profiles'
          and cmd in ('UPDATE', 'ALL')
          and (roles && array['anon']::name[] or roles = array['public']::name[])
     ) then
    raise exception 'db-assert: raw housing evidence columns remain directly readable';
  end if;
  if not has_function_privilege('anon', 'public.get_public_housing_photos(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_public_housing_photos(uuid)', 'EXECUTE')
     or exists (
       select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where n.nspname = 'public'
          and p.proname = 'get_public_housing_photos'
          and a.grantee = 0
          and a.privilege_type = 'EXECUTE'
     ) then
    raise exception 'db-assert: effective housing-photo RPC grants are incorrect';
  end if;
  if not has_function_privilege('anon', 'public.get_public_benefit_details(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_public_benefit_details(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_owned_benefit_context(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_owned_benefit_context(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_my_host_benefit_library()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_my_host_benefit_library()', 'EXECUTE')
     or has_function_privilege('anon', 'public.save_owned_benefit_detail(uuid,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.save_owned_benefit_detail(uuid,text,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_my_housing_library_photo(text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_my_housing_library_photo(text,text)', 'EXECUTE') then
    raise exception 'db-assert: public/owner housing-detail RPC grants are incorrect';
  end if;
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public'
       and p.proname in (
         'get_public_benefit_details',
         'get_owned_benefit_context',
         'get_my_host_benefit_library',
         'save_owned_benefit_detail',
         'set_my_housing_library_photo'
       )
       and a.grantee = 0
       and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'db-assert: housing-detail RPC exposed to PUBLIC';
  end if;

  select count(*) into v_trigger_count
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal
      and (n.nspname, c.relname, t.tgname) in (
        ('public', 'listings', 'trg_listings_claim_benefit_ownership'),
        ('public', 'listings', 'trg_listings_housing_photos'),
        ('public', 'host_profiles', 'trg_host_profiles_housing_library'),
        ('storage', 'objects', 'trg_storage_housing_photo_references')
      );
  if v_trigger_count <> 4 then
    raise exception 'db-assert: expected 4 housing evidence triggers, found %', v_trigger_count;
  end if;

  select lower(pg_get_triggerdef(t.oid)) into v_storage_trigger_def
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal
     and n.nspname = 'storage'
     and c.relname = 'objects'
     and t.tgname = 'trg_storage_housing_photo_references';
  if v_storage_trigger_def not like '%before delete or update on storage.objects%'
     or v_storage_trigger_def like '%update of%' then
    raise exception 'db-assert: storage reference trigger does not guard every UPDATE';
  end if;

  if not exists (
    select 1
      from storage.buckets b
     where b.id = 'listing-media'
       and b.file_size_limit = 5242880
       and b.allowed_mime_types @> array[
         'image/jpeg', 'image/png', 'image/webp', 'image/heic'
       ]::text[]
       and cardinality(b.allowed_mime_types) = 4
  ) then
    raise exception 'db-assert: listing-media upload limits or MIME allow-list drifted';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'listing_media_insert_own_folder'
       and cmd = 'INSERT'
       and coalesce(with_check, '') like '%split_part(name, ''/''::text, 2) = ''library''::text%'
       and coalesce(with_check, '') like '%split_part(name, ''/''::text, 4) = ''housing''::text%'
  ) or not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'listing_media_update_own_folder'
       and cmd = 'UPDATE'
       and coalesce(qual, '') like '%split_part(name, ''/''::text, 2) = ''library''::text%'
       and coalesce(with_check, '') like '%split_part(name, ''/''::text, 4) = ''housing''::text%'
  ) then
    raise exception 'db-assert: authenticated Housing storage path reservation drifted';
  end if;

  select count(*) into v_private_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in (
       'stored_housing_photo_object_name',
       'housing_photo_metadata_is_valid',
        'housing_photo_object_name',
        'housing_photo_url_is_valid',
        'missing_housing_photo_roles',
        'preserve_claim_benefit_details',
        'enforce_listing_housing_photos',
        'protect_host_housing_photo_library',
        'protect_referenced_housing_photo_object'
      );
  if v_private_count <> 9 then
    raise exception 'db-assert: expected 9 private housing functions, found %', v_private_count;
  end if;

  select count(*) into v_private_exec
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
      and p.proname in (
        'stored_housing_photo_object_name',
        'housing_photo_metadata_is_valid',
       'housing_photo_object_name',
       'housing_photo_url_is_valid',
       'missing_housing_photo_roles',
       'preserve_claim_benefit_details',
       'enforce_listing_housing_photos',
       'protect_host_housing_photo_library',
       'protect_referenced_housing_photo_object'
     )
     and (
       has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or exists (
         select 1
           from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE'
       )
     );
  if v_private_exec <> 0 then
    raise exception 'db-assert: housing evidence private functions expose EXECUTE';
  end if;

  raise notice 'db-assert: housing evidence grants/triggers PASSED';
end;
$$;

-- ---------------------------------------------------------------------------
-- Evidence table (printed for PR / audit artifacts).
-- ---------------------------------------------------------------------------
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       exists (
         select 1
         from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         where a.grantee = 0 and a.privilege_type = 'EXECUTE'
       ) as public_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'set_host_attestation', 'get_clerk_user_id', 'current_seeker_profile_ids',
    'current_host_profile_ids', 'current_host_listing_ids', 'current_conversation_ids',
    'enforce_listing_cover_asset', 'enforce_listing_media_override',
    'create_my_host_profile', 'ensure_my_seeker_profile',
    'ensure_my_application_conversation', 'ensure_my_host_application_conversation',
    'get_my_conversation_contexts',
    'get_public_housing_photos', 'get_public_benefit_details',
    'get_owned_benefit_context', 'get_my_host_benefit_library',
    'save_owned_benefit_detail', 'set_my_housing_library_photo'
  )
order by p.proname;

select p.proname as service_function_name,
       p.prosecdef as security_definer,
       p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_invite_with_credit', 'restore_invite_credit',
    'transition_listing_claim', 'convert_claimed_listing',
    'claim_notification_deliveries', 'get_unprocessed_notification_events'
  )
order by p.proname;
