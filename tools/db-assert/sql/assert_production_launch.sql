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
    select exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '093'
    )
  ) as migration_093_applied,
  (
    select exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '094'
    )
  ) as migration_094_applied,
  (
    select count(distinct p.proname) = 13
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
         'set_my_housing_library_photo',
         'claim_notification_deliveries_v2',
         'begin_invite_notification_delivery'
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
  -- Static tests derive both hashes from migration 093. The constraint hash
  -- normalizes only PostgreSQL deparser noise; the function hash normalizes
  -- formatting only, so code points, fields, AND/OR, and grouping stay pinned.
  (
    (
      select count(*) = 1
         and bool_and(c.contype = 'c')
         and bool_and(not c.convalidated)
         and bool_and(
           md5(
             replace(
               translate(
                 lower(pg_get_expr(c.conbin, c.conrelid, false)),
                 E' \t\n\r',
                 ''
               ),
               '::text',
               ''
             )
           ) = 'c004d6002c15e95d09fd72f5a8948bad'
         )
        from pg_constraint c
       where c.conrelid = 'public.seeker_resume_experiences'::regclass
         and c.conname = 'seeker_resume_experiences_identity_chk'
    )
    and (
      select count(*) = 1
         and bool_and(p.prosecdef)
         and bool_and(p.provolatile = 's')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
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
           md5(translate(lower(p.prosrc), E' \t\n\r', ''))
             = '0f6012420b869f71406298a9897bad90'
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private'
         and p.oid = to_regprocedure(
           'private.application_resume_is_complete(uuid)'
         )
    )
  ) as resume_experience_identity_contract_safe,
  (
    (
      select count(*) = 2
         and bool_and(not p.prosecdef)
         and bool_and(p.provolatile = 's')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           case p.proname
             when 'search_host_sourceable_seekers' then
               pg_get_function_result(p.oid) =
                 'TABLE(seeker_profile_id uuid, display_name text, short_bio text, already_invited boolean)'
             when 'get_host_sourceable_matches' then
               pg_get_function_result(p.oid) =
                 'TABLE(seeker_profile_id uuid, display_name text, short_bio text, general_skill_tags text[], desired_categories text[], score smallint, band text, already_invited boolean)'
               and position('profile_photo_url' in lower(p.prosrc)) = 0
               and position('confidence' in lower(p.prosrc)) = 0
               and position('components' in lower(p.prosrc)) = 0
             else false
           end
         )
         and bool_and(
           case p.proname
             when 'search_host_sourceable_seekers' then
               md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
                 'b62212f712bb1c3831246d593ff46597'
             when 'get_host_sourceable_matches' then
               md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
                 '72d7872064cef20ebda5b8278b977f12'
             else false
           end
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid in (
           to_regprocedure(
             'public.search_host_sourceable_seekers(uuid,uuid,text,integer)'
           ),
           to_regprocedure(
             'public.get_host_sourceable_matches(uuid,uuid,integer)'
           )
         )
    )
    and (
      select count(*) = 1
         and bool_and(not p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(pg_get_function_result(p.oid) = 'jsonb')
         and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
             '2193dbaa51bb7dcc186ba65d00b195eb'
           and
           position('application_submission:' in lower(p.prosrc)) > 0
           and position('char_length(p_message) > 500' in lower(p.prosrc)) > 0
           and position('from public.host_subscriptions hs' in lower(p.prosrc)) > 0
           and position(
             'public.host_subscription_tier_for_clerk_user'
             in lower(p.prosrc)
           ) > 0
           and position('p_monthly_allowance' in lower(p.prosrc)) = 0
           and position('p_invited_by_user_id' in lower(p.prosrc)) = 0
           and position(
             'v_monthly_used < v_authoritative_monthly_allowance'
             in lower(p.prosrc)
           ) > 0
           and position('''invalid_request''' in lower(p.prosrc)) > 0
           and position('''host_not_eligible''' in lower(p.prosrc)) > 0
           and position('''listing_not_actionable''' in lower(p.prosrc)) > 0
           and position('''seeker_not_sourceable''' in lower(p.prosrc)) > 0
           and position('''already_applied''' in lower(p.prosrc)) > 0
           and position('''already_invited''' in lower(p.prosrc)) > 0
           and position('''invite_credits_required''' in lower(p.prosrc)) > 0
           and position('insert into public.events' in lower(p.prosrc)) > 0
           and position('''invite_authority''' in lower(p.prosrc)) > 0
           and position('''authority_version'', ''094''' in lower(p.prosrc)) > 0
           and (
             length(lower(p.prosrc))
             - length(replace(lower(p.prosrc), '''error''', ''))
           ) / length('''error''') = 9
           and position('sqlerrm' in lower(p.prosrc)) = 0
           and position('message_text' in lower(p.prosrc)) = 0
           and position('get stacked diagnostics' in lower(p.prosrc)) = 0
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = to_regprocedure(
           'public.create_host_source_invite_with_credit(uuid,uuid,uuid,text)'
         )
    )
    and not has_function_privilege(
      'service_role',
      'public.create_invite_with_credit(uuid,uuid,uuid,text,uuid,integer)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'service_role',
      'public.restore_invite_credit(uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.restore_invite_credit(uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.restore_invite_credit(uuid)',
      'EXECUTE'
    )
    and not exists (
      select 1
        from pg_proc p,
             lateral aclexplode(
               coalesce(p.proacl, acldefault('f', p.proowner))
             ) a
       where p.oid = 'public.restore_invite_credit(uuid)'::regprocedure
         and a.grantee = 0
         and a.privilege_type = 'EXECUTE'
    )
    and (
      select count(*) = 1
         and bool_and(not p.prosecdef)
         and bool_and(p.provolatile = 'v')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(
           pg_get_function_result(p.oid) =
             'TABLE(invite_id uuid, status text)'
         )
         and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
             '65136e64ab86ffa0174ab267c784dc2e'
           and position('''invalid_request''' in lower(p.prosrc)) > 0
           and position('for update' in lower(p.prosrc)) > 0
           and position('clock_timestamp()' in lower(p.prosrc)) > 0
           and position('''delivered'', ''viewed''' in lower(p.prosrc)) > 0
           and position('from public.listings l,' in lower(p.prosrc)) > 0
           and position('l.host_profile_id = i.host_profile_id' in lower(p.prosrc)) > 0
           and position('l.status = ''live''' in lower(p.prosrc)) > 0
           and position('l.provenance = ''verified''' in lower(p.prosrc)) > 0
           and position('l.expires_at > v_now' in lower(p.prosrc)) > 0
           and position('h.account_status = ''active''' in lower(p.prosrc)) > 0
           and position('h.deleted_at is null' in lower(p.prosrc)) > 0
           and position('nullif(btrim(h.clerk_user_id), '''') is not null' in lower(p.prosrc)) > 0
           and position('s.deleted_at is null' in lower(p.prosrc)) > 0
           and position('nullif(btrim(s.clerk_user_id), '''') is not null' in lower(p.prosrc)) > 0
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = to_regprocedure(
           'public.deliver_seeker_invites(uuid,uuid[])'
         )
    )
    and (
      select count(*) = 1
         and bool_and(not p.prosecdef)
         and bool_and(p.provolatile = 'v')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(pg_get_function_result(p.oid) = 'jsonb')
         and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
             'b6b7a56e7a50f36abee1428de746e283'
           and position('join public.invites i on i.id = e.subject_id' in lower(p.prosrc)) > 0
           and position('d.recipient_clerk_user_id = s.clerk_user_id' in lower(p.prosrc)) > 0
           and position('for update of d' in lower(p.prosrc)) > 0
           and position('v_delivery_worker_id is distinct from p_worker_id' in lower(p.prosrc)) > 0
           and position('v_provider_started_at is null' in lower(p.prosrc)) > 0
           and position('v_claim_authority_version is distinct from ''094''' in lower(p.prosrc)) > 0
           and position('v_invite_status = ''withdrawn''' in lower(p.prosrc)) > 0
           and position('when i.status = ''created'' then ''delivered''' in lower(p.prosrc)) > 0
           and position('i.status in (''created'', ''expired'')' in lower(p.prosrc)) > 0
           and position('coalesce(i.delivered_at, v_now)' in lower(p.prosrc)) > 0
           and position('coalesce(d.delivered_at, v_now)' in lower(p.prosrc)) > 0
           and position('v_invite_expires_at' in lower(p.prosrc)) = 0
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = to_regprocedure(
           'public.settle_invite_notification_delivery(uuid,text,text,timestamptz)'
         )
    )
    and (
      select count(*) = 1
         and bool_and(not p.prosecdef)
         and bool_and(p.provolatile = 'v')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(
           pg_get_function_result(p.oid) =
             'TABLE(status text, expires_at timestamp with time zone)'
         )
         and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
             'e48ec2e60bdfb886f91a4972c0cd21ed'
           and position('from public.notification_deliveries d' in lower(p.prosrc)) > 0
           and position('d.id = p_delivery_id' in lower(p.prosrc)) > 0
           and position('i.id = p_invite_id' in lower(p.prosrc)) > 0
           and position('d.recipient_clerk_user_id = s.clerk_user_id' in lower(p.prosrc)) > 0
           and position('for share' in lower(p.prosrc)) > 0
           and position('for update of d' in lower(p.prosrc)) > 0
           and position('v_delivery_status is distinct from ''processing''' in lower(p.prosrc)) > 0
           and position('v_delivery_worker_id is distinct from p_worker_id' in lower(p.prosrc)) > 0
           and position('v_claim_authority_version is distinct from ''094''' in lower(p.prosrc)) > 0
           and position('v_delivery_lease_expires_at <= v_now' in lower(p.prosrc)) > 0
           and position('interval ''330 seconds''' in lower(p.prosrc)) > 0
           and position('''delivery_not_recheckable''' in lower(p.prosrc)) > 0
           and position('join public.listings l' in lower(p.prosrc)) > 0
           and position('join public.host_profiles h' in lower(p.prosrc)) > 0
           and position('join public.seeker_profiles s' in lower(p.prosrc)) > 0
           and position('i.status in (''created'', ''delivered'', ''viewed'')' in lower(p.prosrc)) > 0
           and position('i.expires_at > clock_timestamp()' in lower(p.prosrc)) > 0
           and position('l.status = ''live''' in lower(p.prosrc)) > 0
           and position('l.provenance = ''verified''' in lower(p.prosrc)) > 0
           and position('l.expires_at > clock_timestamp()' in lower(p.prosrc)) > 0
           and position('h.account_status = ''active''' in lower(p.prosrc)) > 0
           and position('h.deleted_at is null' in lower(p.prosrc)) > 0
           and position('s.deleted_at is null' in lower(p.prosrc)) > 0
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = to_regprocedure(
           'public.get_invite_notification_state(uuid,uuid,text)'
         )
    )
    and (
      select count(*) = 1
         and bool_and(not p.prosecdef)
         and bool_and(p.provolatile = 'v')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(
           pg_get_function_result(p.oid) =
             'TABLE(status text, expires_at timestamp with time zone)'
         )
         and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
             '3ef77cd99536a5ba9dac3e959cf6b2d9'
           and position('from public.notification_deliveries d' in lower(p.prosrc)) > 0
           and position('d.id = p_delivery_id' in lower(p.prosrc)) > 0
           and position('i.id = p_invite_id' in lower(p.prosrc)) > 0
           and position('d.recipient_clerk_user_id = s.clerk_user_id' in lower(p.prosrc)) > 0
           and position('for share' in lower(p.prosrc)) > 0
           and position('for update of d' in lower(p.prosrc)) > 0
           and position('v_delivery_worker_id is distinct from p_worker_id' in lower(p.prosrc)) > 0
           and position('v_claim_authority_version is distinct from ''094''' in lower(p.prosrc)) > 0
           and position('v_delivery_lease_expires_at <= v_now' in lower(p.prosrc)) > 0
           and position('provider_started_at = case' in lower(p.prosrc)) > 0
           and position('coalesce(d.provider_started_at, v_now)' in lower(p.prosrc)) > 0
           and position('interval ''330 seconds''' in lower(p.prosrc)) > 0
           and position('''delivery_not_startable''' in lower(p.prosrc)) > 0
           and position('i.status in (''created'', ''delivered'', ''viewed'')' in lower(p.prosrc)) > 0
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = to_regprocedure(
           'public.begin_invite_notification_delivery(uuid,uuid,text)'
         )
    )
    and (
      select count(*) = 1
         and bool_and(not p.prosecdef)
         and bool_and(p.provolatile = 'v')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(
           pg_get_function_result(p.oid) = 'SETOF notification_deliveries'
         )
         and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
             '1544e504941d2f22fd1b10b20f1f9213'
           and position(
             'd.notification_type <> ''invite_received'''
             in lower(p.prosrc)
           ) > 0
           and position(
             'd.notification_type = ''invite_received'''
             in lower(p.prosrc)
           ) = 0
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = to_regprocedure(
           'public.claim_notification_deliveries(text,integer,integer)'
         )
    )
    and (
      select count(*) = 1
         and bool_and(not p.prosecdef)
         and bool_and(p.provolatile = 'v')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(
           pg_get_function_result(p.oid) = 'SETOF notification_deliveries'
         )
         and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
             '75fdee070acebe21e4772d719619d280'
           and position('d.provider_started_at is null' in lower(p.prosrc)) > 0
           and position('d.provider_started_at is not null' in lower(p.prosrc)) > 0
           and position('failure_class = ''known_unsent''' in lower(p.prosrc)) > 0
           and position('failure_class = ''outcome_unknown''' in lower(p.prosrc)) > 0
           and position('invite provider-started lease expired; provider outcome unknown' in lower(p.prosrc)) > 0
           and position('greatest(330,' in lower(p.prosrc)) > 0
           and position('then ''094''' in lower(p.prosrc)) > 0
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = to_regprocedure(
           'public.claim_notification_deliveries_v2(text,integer,integer)'
         )
    )
    and (
      select count(*) = 1
         and bool_and(not p.prosecdef)
         and bool_and(p.provolatile = 'v')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(pg_get_function_result(p.oid) = 'trigger')
         and bool_and(not has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
             'cccd7a864734cafd44112da290c1ba1e'
           and position('old.notification_type = ''invite_received''' in lower(p.prosrc)) > 0
           and position('old.status = ''processing''' in lower(p.prosrc)) > 0
           and position('new.claim_authority_version := null' in lower(p.prosrc)) > 0
           and position('old.status = ''dead_letter''' in lower(p.prosrc)) > 0
           and position('old.failure_class = ''outcome_unknown''' in lower(p.prosrc)) > 0
           and position('new.status is distinct from old.status' in lower(p.prosrc)) > 0
           and position('new.failure_class is distinct from old.failure_class' in lower(p.prosrc)) > 0
           and position('''invite_dead_letter_immutable''' in lower(p.prosrc)) > 0
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = to_regprocedure(
           'public.prevent_invite_dead_letter_requeue_094()'
         )
    )
    and (
      select count(*) = 1
         and bool_and(not p.prosecdef)
         and bool_and(p.provolatile = 'v')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(pg_get_function_result(p.oid) = 'trigger')
         and bool_and(not has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
             '372344d0cec4b61d97249b6a40ed615a'
           and position('new.status = ''queued''' in lower(p.prosrc)) > 0
           and position(
             'd.notification_type = ''invite_received'''
             in lower(p.prosrc)
           ) > 0
           and position(
             'e.event_type in (''invite_created'', ''invite_sent'')'
             in lower(p.prosrc)
           ) > 0
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = to_regprocedure(
           'public.prevent_queued_invite_digest_membership_094()'
         )
    )
    and (
      select count(*) = 1
         and bool_and(not p.prosecdef)
         and bool_and(p.provolatile = 'v')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(pg_get_function_result(p.oid) = 'jsonb')
         and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
             'a248a4973e83513ef7c1b6c7ab6ed79f'
           and position('''invalid_request''' in lower(p.prosrc)) > 0
           and position('''invite_authority_rollout_draining''' in lower(p.prosrc)) > 0
           and position('''invite_not_withdrawable''' in lower(p.prosrc)) > 0
           and position('''invite_delivery_in_progress''' in lower(p.prosrc)) > 0
           and position('''already_withdrawn''' in lower(p.prosrc)) > 0
           and position('''credit_restored''' in lower(p.prosrc)) > 0
           and position('invite_credit:' in lower(p.prosrc)) > 0
           and position('d.status = ''delivered''' in lower(p.prosrc)) > 0
           and position('d.status = ''dead_letter''' in lower(p.prosrc)) > 0
           and position('d.failure_class = ''outcome_unknown''' in lower(p.prosrc)) > 0
           and position('d.failure_class is distinct from ''outcome_unknown''' in lower(p.prosrc)) > 0
           and position(
             'invite provider-started lease expired; provider outcome unknown'
             in lower(p.prosrc)
           ) > 0
           and position('d.provider_started_at is null' in lower(p.prosrc)) > 0
           and position('d.provider_started_at is not null' in lower(p.prosrc)) > 0
           and position('update public.digest_memberships' in lower(p.prosrc)) > 0
           and position('sqlerrm' in lower(p.prosrc)) = 0
           and position('message_text' in lower(p.prosrc)) = 0
           and position('get stacked diagnostics' in lower(p.prosrc)) = 0
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = to_regprocedure(
           'public.withdraw_host_invite(uuid,uuid)'
         )
    )
    and (
      select count(*) = 2
         and bool_and(p.prosecdef)
         and bool_and(p.provolatile = 's')
         and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
         and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
         and bool_and(not exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0
              and a.privilege_type = 'EXECUTE'
         ))
         and bool_and(
           case p.proname
             when 'host_can_view_seeker' then
               pg_get_function_result(p.oid) = 'boolean'
               and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
               and has_function_privilege('service_role', p.oid, 'EXECUTE')
               and md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
                 '60715a76f7b8dd9518b5cf6773690014'
               and position('from public.invites i' in lower(p.prosrc)) = 0
             when 'get_host_applicant_display_names' then
               pg_get_function_result(p.oid) =
                 'TABLE(seeker_profile_id uuid, display_name text)'
               and has_function_privilege('authenticated', p.oid, 'EXECUTE')
               and has_function_privilege('service_role', p.oid, 'EXECUTE')
               and md5(translate(lower(p.prosrc), E' \t\n\r', '')) =
                 '7f97c3497c19d35cf8245cf1a8db8d34'
               and position('from public.invites i' in lower(p.prosrc)) > 0
             else false
           end
         )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid in (
           to_regprocedure('public.host_can_view_seeker(uuid)'),
           to_regprocedure('public.get_host_applicant_display_names(uuid[])')
         )
    )
    and to_regclass('public.idx_seeker_profiles_visible_onboarded') is null
    and exists (
      select 1
        from pg_index i
       where i.indexrelid =
         to_regclass('public.idx_seeker_profiles_platform_onboarded')
         and i.indisvalid
         and i.indisready
         and i.indnkeyatts = 1
         and pg_get_indexdef(i.indexrelid, 1, true) = 'id'
         and lower(pg_get_expr(i.indpred, i.indrelid)) like
           '%host_discovery_enabled%true%'
         and lower(pg_get_expr(i.indpred, i.indrelid)) like
           '%visibility_status%platform%'
         and lower(pg_get_expr(i.indpred, i.indrelid)) like
           '%onboarding_complete%true%'
         and lower(pg_get_expr(i.indpred, i.indrelid)) like
           '%deleted_at is null%'
    )
    and exists (
      select 1
        from pg_index i
       where i.indexrelid =
         to_regclass('public.idx_events_invite_created_authority_094')
         and i.indisvalid
         and i.indisready
         and i.indisunique
         and i.indnkeyatts = 1
         and pg_get_indexdef(i.indexrelid, 1, true) = 'subject_id'
         and lower(pg_get_expr(i.indpred, i.indrelid)) like
           '%event_type%invite_created%'
         and lower(pg_get_expr(i.indpred, i.indrelid)) like
           '%source_surface%invite_authority%'
         and lower(pg_get_expr(i.indpred, i.indrelid)) like
           '%authority_version%094%'
    )
    and exists (
      select 1
        from pg_constraint c
       where c.conrelid = 'public.notification_deliveries'::regclass
         and c.conname = 'notification_deliveries_invite_claim_authority_094_chk'
         and c.contype = 'c'
         and c.convalidated
         and lower(pg_get_constraintdef(c.oid, false)) like
           '%notification_type%invite_received%'
         and lower(pg_get_constraintdef(c.oid, false)) like
           '%not (status is distinct from%processing%not (claim_authority_version is distinct from%094%'
         and lower(pg_get_constraintdef(c.oid, false)) like
           '%status%is distinct from%processing%claim_authority_version is null%'
    )
    and (
      select count(*) = 2
         and bool_and(
           case a.attname
             when 'provider_started_at' then
               format_type(a.atttypid, a.atttypmod) =
                 'timestamp with time zone'
             when 'claim_authority_version' then
               format_type(a.atttypid, a.atttypmod) = 'text'
             else false
           end
         )
        from pg_attribute a
       where a.attrelid = 'public.notification_deliveries'::regclass
         and a.attname in ('provider_started_at', 'claim_authority_version')
         and a.attnum > 0
         and not a.attisdropped
    )
    and exists (
      select 1
        from pg_constraint c
       where c.conrelid = 'public.notification_deliveries'::regclass
         and c.conname = 'notification_deliveries_invite_open_cadence_chk'
         and c.contype = 'c'
         and c.convalidated
         and lower(pg_get_constraintdef(c.oid, false)) like
           '%notification_type%invite_received%'
         and lower(pg_get_constraintdef(c.oid, false)) like
           '%cadence%immediate%'
         and lower(pg_get_constraintdef(c.oid, false)) like
           '%status%dead_letter%cancelled%'
    )
    and exists (
      select 1
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
       where t.tgrelid = 'public.digest_memberships'::regclass
         and t.tgname = 'trg_digest_memberships_no_invite_queue_094'
         and not t.tgisinternal
         and t.tgenabled <> 'D'
         and p.proname = 'prevent_queued_invite_digest_membership_094'
    )
    and exists (
      select 1
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
       where t.tgrelid = 'public.notification_deliveries'::regclass
         and t.tgname = 'trg_notification_deliveries_invite_dead_letter_094'
         and not t.tgisinternal
         and t.tgenabled <> 'D'
         and p.proname = 'prevent_invite_dead_letter_requeue_094'
    )
    and exists (
      select 1
        from pg_class c
       where c.oid = 'public.seeker_profiles'::regclass
         and c.relrowsecurity
    )
    and (
      select count(*) = 2 and bool_and(c.relrowsecurity)
        from pg_class c
       where c.oid in (
         'public.invites'::regclass,
         'public.match_scores'::regclass
       )
    )
    and (select count(*) from pg_policy
          where polrelid = 'public.match_scores'::regclass) = 2
    and exists (
      select 1 from pg_policy p
       where p.polrelid = 'public.match_scores'::regclass
         and p.polname = 'match_scores_select_host'
         and p.polcmd = 'r'
         and p.polpermissive
         and p.polroles = array['authenticated'::regrole::oid]::oid[]
         and p.polwithcheck is null
         and md5(regexp_replace(
               lower(pg_get_expr(p.polqual, p.polrelid)),
               '[[:space:]]+', '', 'g'
             )) = '19f529e501c5b60cbef691bb5793e204'
    )
    and exists (
      select 1 from pg_policy p
       where p.polrelid = 'public.match_scores'::regclass
         and p.polname = 'match_scores_select_seeker'
         and p.polcmd = 'r'
         and p.polpermissive
         and p.polroles = array['authenticated'::regrole::oid]::oid[]
         and p.polwithcheck is null
         and md5(regexp_replace(
               lower(pg_get_expr(p.polqual, p.polrelid)),
               '[[:space:]]+', '', 'g'
             )) = 'efea6a7c51d72911569def4741592a97'
    )
    and (select count(*) from pg_policy
          where polrelid = 'public.invites'::regclass) = 2
    and not exists (
      select 1
        from pg_policy p
       where p.polrelid = 'public.invites'::regclass
         and p.polname = 'invites_update_host'
    )
    and exists (
      select 1 from pg_policy p
       where p.polrelid = 'public.invites'::regclass
         and p.polname = 'invites_select_party'
         and p.polcmd = 'r'
         and p.polpermissive
         and p.polroles = array['authenticated'::regrole::oid]::oid[]
         and p.polwithcheck is null
         and md5(regexp_replace(
               lower(pg_get_expr(p.polqual, p.polrelid)),
               '[[:space:]]+', '', 'g'
             )) = 'd67462759e3b4fd145fb71131c41e42e'
    )
    and exists (
      select 1 from pg_policy p
       where p.polrelid = 'public.invites'::regclass
         and p.polname = 'invites_update_seeker'
         and p.polcmd = 'w'
         and p.polpermissive
         and p.polroles = array['authenticated'::regrole::oid]::oid[]
         and md5(regexp_replace(
               lower(pg_get_expr(p.polqual, p.polrelid)),
               '[[:space:]]+', '', 'g'
             )) = 'd8237c2cc19af204163ad38685840885'
         and md5(regexp_replace(
               lower(pg_get_expr(p.polwithcheck, p.polrelid)),
               '[[:space:]]+', '', 'g'
             )) = '1922082763d7c9a267806360a3e0ee7e'
    )
    and exists (
      select 1
        from pg_attribute a
        join pg_attrdef d
          on d.adrelid = a.attrelid
         and d.adnum = a.attnum
       where a.attrelid = 'public.seeker_profiles'::regclass
         and a.attname = 'host_discovery_enabled'
         and a.attnotnull
         and not a.attisdropped
         and lower(pg_get_expr(d.adbin, d.adrelid)) in (
           'false',
           'false::boolean'
         )
    )
    and has_column_privilege(
      'authenticated',
      'public.seeker_profiles',
      'host_discovery_enabled',
      'UPDATE'
    )
    and not has_table_privilege(
      'authenticated',
      'public.seeker_profiles',
      'UPDATE'
    )
    and (
      select count(*) = 1
         and bool_and(p.polname = 'seeker_profiles_select_own')
         and bool_and(
           lower(pg_get_expr(p.polqual, p.polrelid)) like '%clerk_user_id%'
           and lower(pg_get_expr(p.polqual, p.polrelid)) like
             '%get_clerk_user_id%'
           and lower(pg_get_expr(p.polqual, p.polrelid)) not like
             '%current_host_profile_ids%'
           and lower(pg_get_expr(p.polqual, p.polrelid)) not like
             '%host_profiles%'
           and lower(pg_get_expr(p.polqual, p.polrelid)) not like
             '%applications%'
           and lower(pg_get_expr(p.polqual, p.polrelid)) not like '%invites%'
         )
        from pg_policy p
       where p.polrelid = 'public.seeker_profiles'::regclass
         and p.polcmd = 'r'
    )
    and (
      select count(*) = 1
         and bool_and(p.polname = 'seeker_profiles_update_own')
         and bool_and(
           lower(pg_get_expr(p.polqual, p.polrelid)) like '%clerk_user_id%'
           and lower(pg_get_expr(p.polqual, p.polrelid)) like
             '%get_clerk_user_id%'
           and lower(pg_get_expr(p.polwithcheck, p.polrelid)) like
             '%clerk_user_id%'
           and lower(pg_get_expr(p.polwithcheck, p.polrelid)) like
             '%get_clerk_user_id%'
           and lower(pg_get_expr(p.polqual, p.polrelid)) not like
             '%current_host_profile_ids%'
           and lower(pg_get_expr(p.polwithcheck, p.polrelid)) not like
             '%current_host_profile_ids%'
         )
        from pg_policy p
       where p.polrelid = 'public.seeker_profiles'::regclass
         and p.polcmd = 'w'
    )
    and not exists (
      select 1
        from pg_class c,
             lateral aclexplode(
               coalesce(c.relacl, acldefault('r', c.relowner))
             ) a
       where c.oid = 'public.seeker_profiles'::regclass
         and a.grantee = 0
         and a.privilege_type = 'SELECT'
    )
    and to_regclass('public.invite_authority_rollout_094') is not null
    and (
      select c.relrowsecurity
        from pg_class c
       where c.oid = 'public.invite_authority_rollout_094'::regclass
    )
    and (
      select count(*) = 1
         and bool_and(r.singleton is true)
         and bool_and(r.applied_at is not null)
        from public.invite_authority_rollout_094 r
    )
    and has_table_privilege(
      'service_role',
      'public.invite_authority_rollout_094',
      'SELECT'
    )
    and not has_table_privilege(
      'service_role',
      'public.invite_authority_rollout_094',
      'INSERT'
    )
    and not has_table_privilege(
      'service_role',
      'public.invite_authority_rollout_094',
      'UPDATE'
    )
    and not has_table_privilege(
      'service_role',
      'public.invite_authority_rollout_094',
      'DELETE'
    )
    and not has_table_privilege(
      'anon',
      'public.invite_authority_rollout_094',
      'SELECT'
    )
    and not has_table_privilege(
      'authenticated',
      'public.invite_authority_rollout_094',
      'SELECT'
    )
    and not exists (
      select 1
        from pg_class c,
             lateral aclexplode(
               coalesce(c.relacl, acldefault('r', c.relowner))
             ) a
       where c.oid = 'public.invite_authority_rollout_094'::regclass
         and (
           a.grantee = 0
           or a.grantee in (
             'anon'::regrole::oid,
             'authenticated'::regrole::oid
           )
           or (
             a.grantee = 'service_role'::regrole::oid
             and a.privilege_type <> 'SELECT'
           )
         )
    )
    and not exists (
      select 1
        from pg_policy p
       where p.polrelid = 'public.invite_authority_rollout_094'::regclass
    )
    and not exists (
      select 1
        from public.notification_deliveries d
        join public.events e on e.id = d.event_id
        join public.invites i on i.id = e.subject_id
        join public.seeker_profiles s on s.id = i.seeker_profile_id
       where d.notification_type = 'invite_received'
         and d.status = 'delivered'
         and e.event_type in ('invite_created', 'invite_sent')
         and e.subject_type = 'invite'
         and e.subject_id = i.id
         and e.listing_id = i.listing_id
         and e.host_profile_id = i.host_profile_id
         and e.seeker_profile_id = i.seeker_profile_id
         and d.recipient_clerk_user_id = s.clerk_user_id
         and (i.status = 'created' or i.delivered_at is null)
    )
    and not exists (
      select 1
        from public.notification_deliveries d
        join public.events e on e.id = d.event_id
        join public.invites i on i.id = e.subject_id
        join public.seeker_profiles s on s.id = i.seeker_profile_id
        join public.invite_credit_events restore
          on restore.invite_id = i.id
         and restore.host_profile_id = i.host_profile_id
         and restore.kind = 'restore'
       where d.notification_type = 'invite_received'
         and (
           d.status = 'delivered'
           or (
             d.status = 'dead_letter'
             and d.failure_class = 'outcome_unknown'
           )
         )
         and e.event_type in ('invite_created', 'invite_sent')
         and e.subject_type = 'invite'
         and e.subject_id = i.id
         and e.listing_id = i.listing_id
         and e.host_profile_id = i.host_profile_id
         and e.seeker_profile_id = i.seeker_profile_id
         and d.recipient_clerk_user_id = s.clerk_user_id
    )
    and not exists (
      select 1
        from public.digest_memberships dm
       where dm.status = 'queued'
         and dm.cadence in ('daily', 'weekly')
         and (
           exists (
             select 1
              from public.notification_deliveries d
             where d.id = dm.delivery_id
                and d.notification_type = 'invite_received'
           )
           or exists (
             select 1
               from public.events e
              where e.id = dm.event_id
                and e.event_type in ('invite_created', 'invite_sent')
                and e.subject_type = 'invite'
           )
         )
    )
    and not exists (
      select 1
        from public.notification_deliveries d
       where d.notification_type = 'invite_received'
         and d.cadence in ('daily', 'weekly')
         and d.status in (
           'pending',
           'deferred',
           'failed_retryable',
           'processing'
         )
    )
    and not exists (
      select 1
        from public.notification_deliveries d
       where d.notification_type = 'invite_received'
         and (
           (d.status = 'processing' and d.claim_authority_version is distinct from '094')
           or (d.status <> 'processing' and d.claim_authority_version is not null)
         )
    )
    and not exists (
      select 1
        from public.invites i
        join public.invite_credit_events consume
          on consume.invite_id = i.id
         and consume.host_profile_id = i.host_profile_id
         and consume.kind = 'consume'
       where i.status = 'withdrawn'
         and i.delivered_at is null
         and not exists (
           select 1
             from public.invite_credit_events restore
            where restore.invite_id = i.id
              and restore.host_profile_id = i.host_profile_id
              and restore.kind = 'restore'
         )
         and not exists (
           select 1
             from public.notification_deliveries d
             join public.events e on e.id = d.event_id
             join public.seeker_profiles s on s.id = i.seeker_profile_id
            where d.notification_type = 'invite_received'
              and e.event_type in ('invite_created', 'invite_sent')
              and e.subject_type = 'invite'
              and e.subject_id = i.id
              and e.listing_id = i.listing_id
              and e.host_profile_id = i.host_profile_id
              and e.seeker_profile_id = i.seeker_profile_id
              and d.recipient_clerk_user_id = s.clerk_user_id
              and (
                d.status = 'delivered'
                or d.delivered_at is not null
                or d.provider_started_at is not null
                or (
                  d.status = 'dead_letter'
                  and d.failure_class = 'outcome_unknown'
                )
              )
         )
    )
  ) as host_seeker_discovery_contract_safe,
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
    select count(distinct p.proname) = 13
       and bool_and('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'create_host_source_invite_with_credit',
         'transition_listing_claim',
         'convert_claimed_listing',
         'claim_notification_deliveries',
         'claim_notification_deliveries_v2',
         'get_unprocessed_notification_events',
         'search_host_sourceable_seekers',
         'get_host_sourceable_matches',
         'deliver_seeker_invites',
         'settle_invite_notification_delivery',
         'get_invite_notification_state',
         'begin_invite_notification_delivery',
         'withdraw_host_invite'
       )
  ) as service_function_search_paths_pinned;
