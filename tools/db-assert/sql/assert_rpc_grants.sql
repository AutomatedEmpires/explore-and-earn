-- assert_rpc_grants.sql
-- Lane A - DB-connected security guardrail. Run against a live/local database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/assert_rpc_grants.sql
--
-- Fails (raises) if any of the 8 SECURITY DEFINER functions are executable by
-- anon, by PUBLIC, or by authenticated where forbidden (the two trigger fns);
-- if a server-only table is missing RLS or exposes a client policy; or if the
-- storage buckets still allow anon enumeration. Emits an evidence table at the
-- end for inclusion in PR / audit artifacts.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Guardrail 1: RPC execute grants on the 8 functions.
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
    'enforce_listing_media_override'
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
  raise notice 'db-assert: RPC execute-grant guardrail PASSED for all 8 functions';
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
-- Guardrail 3: storage buckets no longer allow anon enumeration.
-- ---------------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
    and roles && array['anon', 'public']::name[]
    and (coalesce(qual, '') like '%listing-media%'
         or coalesce(qual, '') like '%profile-photos%');
  raise notice 'storage anon/public SELECT policies referencing the two buckets: %', v_count;
  if v_count > 0 then
    raise exception 'db-assert: storage bucket enumeration still open (anon/public SELECT policy present)';
  end if;
  raise notice 'db-assert: storage enumeration guardrail PASSED';
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
    'enforce_listing_cover_asset', 'enforce_listing_media_override'
  )
order by p.proname;
