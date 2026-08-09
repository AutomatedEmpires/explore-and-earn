select
  (
    select exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '077'
    )
  ) as migration_077_applied,
  (
    select exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '091'
    )
  ) as migration_091_applied,
  (
    select exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '092'
    )
  ) as migration_092_applied,
  (
    select count(distinct p.proname) = 11
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'create_my_host_profile',
         'ensure_my_seeker_profile',
         'ensure_my_application_conversation',
         'ensure_my_host_application_conversation',
         'get_my_conversation_contexts',
         'get_public_housing_photos',
         'get_public_benefit_details',
         'get_owned_benefit_context',
         'get_my_host_benefit_library',
         'save_owned_benefit_detail',
         'set_my_housing_library_photo'
       )
  ) as launch_functions_present,
  (
    select count(distinct p.proname) = 5
       and bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
       and bool_and(not exists (
         select 1
           from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0
            and a.privilege_type = 'EXECUTE'
       ))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'create_my_host_profile',
         'ensure_my_seeker_profile',
         'ensure_my_application_conversation',
         'ensure_my_host_application_conversation',
         'get_my_conversation_contexts'
       )
  ) as launch_rpc_grants_safe,
  (
    select count(*) = 1
       and bool_and(p.prosecdef)
       and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
       and bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
       and bool_and(not has_function_privilege('service_role', p.oid, 'EXECUTE'))
       and bool_and(not exists (
         select 1
           from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0
            and a.privilege_type = 'EXECUTE'
       ))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.oid = to_regprocedure(
         'public.submit_my_application(uuid,text,uuid)'
       )
  ) as application_submission_rpc_safe,
  (
    not has_table_privilege('authenticated', 'public.applications', 'INSERT')
    and not has_any_column_privilege(
      'authenticated', 'public.applications', 'INSERT'
    )
    and not has_table_privilege('anon', 'public.applications', 'INSERT')
    and not has_any_column_privilege('anon', 'public.applications', 'INSERT')
    and not has_table_privilege('authenticated', 'public.applications', 'UPDATE')
    and not has_table_privilege('anon', 'public.applications', 'UPDATE')
    and has_column_privilege(
      'authenticated', 'public.applications', 'status', 'UPDATE'
    )
    and has_column_privilege(
      'authenticated', 'public.applications', 'withdrawn_reason', 'UPDATE'
    )
    and not has_column_privilege(
      'authenticated', 'public.applications', 'cover_message', 'UPDATE'
    )
    and not has_column_privilege(
      'authenticated', 'public.applications', 'reactivated_at', 'UPDATE'
    )
    and not has_column_privilege(
      'authenticated', 'public.applications', 'source', 'UPDATE'
    )
    and not has_column_privilege(
      'authenticated', 'public.applications', 'origin_invite_id', 'UPDATE'
    )
    and not exists (
      select 1
        from pg_class c,
             lateral aclexplode(
               coalesce(c.relacl, acldefault('r', c.relowner))
             ) a
       where c.oid = 'public.applications'::regclass
         and a.grantee = 0
         and a.privilege_type in ('INSERT', 'UPDATE')
    )
  ) as application_submission_writes_closed,
  (
    exists (
      select 1
        from pg_trigger t
       where t.tgrelid = 'public.applications'::regclass
         and t.tgname = 'trg_applications_submission_authority'
         and not t.tgisinternal
         and t.tgenabled <> 'D'
    )
    and not exists (
      select 1
        from pg_policies p
       where p.schemaname = 'public'
         and p.tablename = 'applications'
         and p.cmd in ('INSERT', 'ALL')
         and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
    )
    and exists (
      select 1
        from pg_policy p
       where p.polrelid = 'public.applications'::regclass
         and p.polname = 'applications_update_seeker'
         and not (pg_get_expr(p.polqual, p.polrelid) like '%withdrawn%')
         and not (pg_get_expr(p.polwithcheck, p.polrelid) like '%applied%')
    )
    and exists (
      select 1
        from pg_policy p
       where p.polrelid = 'public.applications'::regclass
         and p.polname = 'applications_update_host'
    )
    and exists (
      select 1
        from pg_policy p
       where p.polrelid = 'public.invites'::regclass
         and p.polname = 'invites_update_seeker'
         and pg_get_expr(p.polwithcheck, p.polrelid) like '%ignored%'
         and not (pg_get_expr(p.polwithcheck, p.polrelid) like '%applied%')
    )
  ) as application_submission_guards_present,
  (
    select count(*) = 2
       and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
       and bool_and(
         case p.proname
           when 'preserve_listing_media_truth' then p.prosecdef
           when 'enforce_listing_media_ownership' then not p.prosecdef
           else false
         end
       )
       and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
       and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       and bool_and(not has_function_privilege('service_role', p.oid, 'EXECUTE'))
       and bool_and(not exists (
         select 1
           from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0
            and a.privilege_type = 'EXECUTE'
       ))
       and bool_and(
         case p.proname
           when 'enforce_listing_media_ownership' then
             position(
               'mamosbzcbigcclafhmmr.supabase.co'
               in lower(pg_get_functiondef(p.oid))
             ) > 0
             and position(
               'request.headers'
               in lower(pg_get_functiondef(p.oid))
             ) = 0
             and position(
               'v_url_scheme <> ''https'''
               in lower(pg_get_functiondef(p.oid))
             ) > 0
           else true
         end
       )
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in (
         'preserve_listing_media_truth',
         'enforce_listing_media_ownership'
       )
  ) as listing_media_ownership_contract_safe,
  (
    not has_table_privilege('authenticated', 'public.host_profiles', 'INSERT')
    and not has_table_privilege('authenticated', 'public.seeker_profiles', 'INSERT')
  ) as direct_profile_insert_closed,
  (
    select count(*) = 4 and bool_and(c.convalidated)
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
     where n.nspname = 'public'
       and (r.relname, c.conname) in (
         ('host_profiles', 'host_profiles_category_scopes_check'),
         ('listings', 'listings_coordinates_pair_check'),
         ('listings', 'listings_coordinates_bounds_check'),
         ('listings', 'listings_coordinates_location_check')
       )
  ) as launch_constraints_valid,
  (
    select count(*) = 6 and bool_and(t.tgenabled <> 'D')
      from pg_trigger t
      join pg_class r on r.oid = t.tgrelid
      join pg_namespace n on n.oid = r.relnamespace
     where not t.tgisinternal
       and (n.nspname, r.relname, t.tgname) in (
         ('public', 'listings', 'trg_listings_housing_photos'),
         ('public', 'host_profiles', 'trg_host_profiles_housing_library'),
         ('public', 'listings', 'trg_listings_claim_coordinate_ownership'),
         ('public', 'listings', 'trg_listings_host_status_transition'),
         ('public', 'listings', 'trg_listings_claim_media_ownership'),
         ('public', 'listings', 'trg_listings_media_ownership')
       )
  ) as launch_triggers_enabled,
  (
    not exists (
      select 1
        from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname = 'community_photos_authenticated_select'
    )
  ) as community_bucket_listing_closed,
  (
    select count(distinct p.proname) = 6
       and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'create_invite_with_credit',
         'restore_invite_credit',
         'transition_listing_claim',
         'convert_claimed_listing',
         'claim_notification_deliveries',
         'get_unprocessed_notification_events'
       )
  ) as service_function_search_paths_pinned;
