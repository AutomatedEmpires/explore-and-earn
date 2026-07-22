select
  (
    select exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '077'
    )
  ) as migration_077_applied,
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
    select count(*) = 4 and bool_and(t.tgenabled <> 'D')
      from pg_trigger t
      join pg_class r on r.oid = t.tgrelid
      join pg_namespace n on n.oid = r.relnamespace
     where not t.tgisinternal
       and (n.nspname, r.relname, t.tgname) in (
         ('public', 'listings', 'trg_listings_housing_photos'),
         ('public', 'host_profiles', 'trg_host_profiles_housing_library'),
         ('public', 'listings', 'trg_listings_claim_coordinate_ownership'),
         ('public', 'listings', 'trg_listings_host_status_transition')
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
