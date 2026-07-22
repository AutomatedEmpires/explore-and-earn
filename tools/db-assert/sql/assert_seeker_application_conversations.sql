\set ON_ERROR_STOP on

begin;

do $$
begin
  if not has_function_privilege(
       'authenticated',
       'public.ensure_my_application_conversation(uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.ensure_my_host_application_conversation(uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.get_my_conversation_contexts(uuid[])',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.ensure_my_application_conversation(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.ensure_my_host_application_conversation(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.get_my_conversation_contexts(uuid[])',
       'EXECUTE'
     ) then
    raise exception 'seeker-conversation: RPC role grants are incorrect';
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public'
       and p.proname in (
         'ensure_my_application_conversation',
         'ensure_my_host_application_conversation',
         'get_my_conversation_contexts'
       )
       and a.grantee = 0
       and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'seeker-conversation: RPC is executable by PUBLIC';
  end if;

  if has_table_privilege('authenticated', 'public.conversations', 'INSERT')
     or has_table_privilege('anon', 'public.conversations', 'INSERT') then
    raise exception 'seeker-conversation: a client role retains direct conversation INSERT';
  end if;

  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'conversations'
       and cmd in ('INSERT', 'ALL')
       and (
         roles && array['anon', 'authenticated']::name[]
         or roles = array['public']::name[]
       )
  ) then
    raise exception 'seeker-conversation: a client conversation INSERT policy exists';
  end if;

  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and indexname = 'uq_conversations_with_application'
       and indexdef ilike '%(seeker_profile_id, host_profile_id, application_id)%'
       and indexdef ilike '%where (application_id is not null)%'
  ) then
    raise exception 'seeker-conversation: application-scoped unique index is missing';
  end if;
end;
$$;

insert into public.host_profiles (
  id,
  clerk_user_id,
  company_name,
  slug,
  category_scopes
) values
  (
    '75000000-0000-0000-0000-000000000001',
    'user_conversation_assert_host',
    'Conversation assertion host',
    'conversation-assertion-host',
    array['farm']::text[]
  ),
  (
    '75000000-0000-0000-0000-000000000006',
    'user_conversation_assert_foreign_host',
    'Foreign conversation assertion host',
    'foreign-conversation-assertion-host',
    array['farm']::text[]
  );

insert into public.seeker_profiles (id, clerk_user_id)
values
  (
    '75000000-0000-0000-0000-000000000002',
    'user_conversation_assert_owner'
  ),
  (
    '75000000-0000-0000-0000-000000000003',
    'user_conversation_assert_foreign'
  ),
  (
    '75000000-0000-0000-0000-000000000004',
    'user_conversation_assert_outsider'
  );

insert into public.listings (id, host_profile_id, title, category)
values
  (
    '75000000-0000-0000-0000-000000000011',
    '75000000-0000-0000-0000-000000000001',
    'Owned application listing',
    'farm'
  ),
  (
    '75000000-0000-0000-0000-000000000012',
    '75000000-0000-0000-0000-000000000001',
    'Terminal application listing',
    'farm'
  ),
  (
    '75000000-0000-0000-0000-000000000013',
    '75000000-0000-0000-0000-000000000006',
    'Foreign application listing',
    'farm'
  ),
  (
    '75000000-0000-0000-0000-000000000014',
    '75000000-0000-0000-0000-000000000001',
    'Host valid direct conversation listing',
    'farm'
  ),
  (
    '75000000-0000-0000-0000-000000000015',
    '75000000-0000-0000-0000-000000000001',
    'Wrong listing assertion target',
    'farm'
  ),
  (
    '75000000-0000-0000-0000-000000000016',
    '75000000-0000-0000-0000-000000000001',
    'Legacy conversation listing',
    'seasonal'
  );

insert into public.applications (
  id,
  listing_id,
  seeker_profile_id,
  status
) values
  (
    '75000000-0000-0000-0000-000000000021',
    '75000000-0000-0000-0000-000000000011',
    '75000000-0000-0000-0000-000000000002',
    'applied'
  ),
  (
    '75000000-0000-0000-0000-000000000022',
    '75000000-0000-0000-0000-000000000012',
    '75000000-0000-0000-0000-000000000002',
    'withdrawn'
  ),
  (
    '75000000-0000-0000-0000-000000000023',
    '75000000-0000-0000-0000-000000000013',
    '75000000-0000-0000-0000-000000000003',
    'applied'
  ),
  (
    '75000000-0000-0000-0000-000000000024',
    '75000000-0000-0000-0000-000000000014',
    '75000000-0000-0000-0000-000000000002',
    'applied'
  ),
  (
    '75000000-0000-0000-0000-000000000025',
    '75000000-0000-0000-0000-000000000015',
    '75000000-0000-0000-0000-000000000002',
    'applied'
  ),
  (
    '75000000-0000-0000-0000-000000000026',
    '75000000-0000-0000-0000-000000000016',
    '75000000-0000-0000-0000-000000000002',
    'applied'
  );

-- Preserve representative pre-075 rows. The first is a valid foreign thread,
-- the second carries a forged listing/application tuple migration 050 allowed,
-- and the third is a legitimate legacy host-created row with no listing_id.
insert into public.conversations (
  id,
  seeker_profile_id,
  host_profile_id,
  listing_id,
  application_id
) values
  (
    '75000000-0000-0000-0000-000000000031',
    '75000000-0000-0000-0000-000000000003',
    '75000000-0000-0000-0000-000000000006',
    '75000000-0000-0000-0000-000000000013',
    '75000000-0000-0000-0000-000000000023'
  ),
  (
    '75000000-0000-0000-0000-000000000032',
    '75000000-0000-0000-0000-000000000002',
    '75000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000013',
    '75000000-0000-0000-0000-000000000025'
  ),
  (
    '75000000-0000-0000-0000-000000000033',
    '75000000-0000-0000-0000-000000000002',
    '75000000-0000-0000-0000-000000000001',
    null,
    '75000000-0000-0000-0000-000000000026'
  );

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"user_conversation_assert_owner","role":"authenticated"}';

do $$
declare
  v_first uuid;
  v_second uuid;
  v_after_close uuid;
begin
  begin
    insert into public.conversations (
      seeker_profile_id,
      host_profile_id,
      listing_id,
      application_id
    ) values (
      '75000000-0000-0000-0000-000000000002',
      '75000000-0000-0000-0000-000000000001',
      '75000000-0000-0000-0000-000000000011',
      '75000000-0000-0000-0000-000000000021'
    );
    raise exception 'seeker-conversation: direct seeker INSERT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  v_first := public.ensure_my_application_conversation(
    '75000000-0000-0000-0000-000000000021'
  );
  v_second := public.ensure_my_application_conversation(
    '75000000-0000-0000-0000-000000000021'
  );
  if v_first is null or v_second is distinct from v_first then
    raise exception 'seeker-conversation: application RPC is not idempotent';
  end if;

  if not exists (
    select 1
      from public.conversations c
     where c.id = v_first
       and c.seeker_profile_id = '75000000-0000-0000-0000-000000000002'
       and c.host_profile_id = '75000000-0000-0000-0000-000000000001'
       and c.listing_id = '75000000-0000-0000-0000-000000000011'
       and c.application_id = '75000000-0000-0000-0000-000000000021'
  ) then
    raise exception 'seeker-conversation: RPC persisted the wrong relationship';
  end if;

  if public.ensure_my_application_conversation(
       '75000000-0000-0000-0000-000000000022'
     ) is not null then
    raise exception 'seeker-conversation: terminal application opened a new thread';
  end if;

  if public.ensure_my_application_conversation(
       '75000000-0000-0000-0000-000000000023'
     ) is not null then
    raise exception 'seeker-conversation: foreign application leaked or opened a thread';
  end if;

  update public.applications
     set status = 'withdrawn'
   where id = '75000000-0000-0000-0000-000000000021';

  v_after_close := public.ensure_my_application_conversation(
    '75000000-0000-0000-0000-000000000021'
  );
  if v_after_close is distinct from v_first then
    raise exception 'seeker-conversation: closed application lost its existing thread';
  end if;

  if (
    select count(*)
      from public.conversations
     where application_id = '75000000-0000-0000-0000-000000000021'
  ) <> 1 then
    raise exception 'seeker-conversation: duplicate application thread exists';
  end if;
end;
$$;

reset role;

-- Host creation uses the same identity-derived, lifecycle-locking boundary.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"user_conversation_assert_host","role":"authenticated"}';

do $$
declare
  v_first uuid;
  v_second uuid;
begin
  begin
    insert into public.conversations (
      seeker_profile_id,
      host_profile_id,
      listing_id,
      application_id
    ) values (
      '75000000-0000-0000-0000-000000000002',
      '75000000-0000-0000-0000-000000000001',
      '75000000-0000-0000-0000-000000000014',
      '75000000-0000-0000-0000-000000000024'
    );
    raise exception 'seeker-conversation: direct host INSERT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  v_first := public.ensure_my_host_application_conversation(
    '75000000-0000-0000-0000-000000000024'
  );
  v_second := public.ensure_my_host_application_conversation(
    '75000000-0000-0000-0000-000000000024'
  );
  if v_first is null or v_second is distinct from v_first then
    raise exception 'seeker-conversation: host application RPC is not idempotent';
  end if;

  if public.ensure_my_host_application_conversation(
       '75000000-0000-0000-0000-000000000022'
     ) is not null then
    raise exception 'seeker-conversation: host opened a terminal application thread';
  end if;

  if public.ensure_my_host_application_conversation(
       '75000000-0000-0000-0000-000000000023'
     ) is not null then
    raise exception 'seeker-conversation: host opened another host''s application';
  end if;

  if not exists (
    select 1
      from public.conversations c
     where c.id = v_first
       and c.seeker_profile_id = '75000000-0000-0000-0000-000000000002'
       and c.host_profile_id = '75000000-0000-0000-0000-000000000001'
       and c.listing_id = '75000000-0000-0000-0000-000000000014'
       and c.application_id = '75000000-0000-0000-0000-000000000024'
  ) then
    raise exception 'seeker-conversation: host RPC persisted the wrong relationship';
  end if;
end;
$$;

reset role;
set local request.jwt.claims = '{"sub":"service_role","role":"service_role"}';

-- Context survives a listing leaving public discovery, but only when every
-- conversation/application participant tuple agrees.
update public.listings
   set status = 'closed'
 where id = '75000000-0000-0000-0000-000000000011';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"user_conversation_assert_owner","role":"authenticated"}';

do $$
declare
  v_application_conversation uuid;
  v_host_conversation uuid;
  v_requested uuid[];
  v_count integer;
begin
  select c.id into strict v_application_conversation
    from public.conversations c
   where c.application_id = '75000000-0000-0000-0000-000000000021';
  select c.id into strict v_host_conversation
    from public.conversations c
   where c.application_id = '75000000-0000-0000-0000-000000000024';

  v_requested := array[
    v_application_conversation,
    v_host_conversation,
    '75000000-0000-0000-0000-000000000031'::uuid,
    '75000000-0000-0000-0000-000000000032'::uuid,
    '75000000-0000-0000-0000-000000000033'::uuid
  ];

  select count(*) into v_count
    from public.get_my_conversation_contexts(v_requested);
  if v_count <> 3 then
    raise exception 'seeker-conversation: owner expected 3 exact contexts, got %', v_count;
  end if;

  if not exists (
    select 1
      from public.get_my_conversation_contexts(v_requested) context
     where context.conversation_id = v_application_conversation
       and context.listing_id = '75000000-0000-0000-0000-000000000011'
       and context.listing_title = 'Owned application listing'
       and context.listing_category = 'farm'
       and context.host_name = 'Conversation assertion host'
  ) then
    raise exception 'seeker-conversation: closed listing context was not preserved';
  end if;

  if not exists (
    select 1
      from public.get_my_conversation_contexts(v_requested) context
     where context.conversation_id = '75000000-0000-0000-0000-000000000033'
       and context.listing_id = '75000000-0000-0000-0000-000000000016'
       and context.listing_title = 'Legacy conversation listing'
       and context.listing_category = 'seasonal'
  ) then
    raise exception 'seeker-conversation: null-listing legacy context did not derive from its application';
  end if;

  if exists (
    select 1
      from public.get_my_conversation_contexts(v_requested) context
     where context.conversation_id in (
       '75000000-0000-0000-0000-000000000031',
       '75000000-0000-0000-0000-000000000032'
     )
  ) then
    raise exception 'seeker-conversation: foreign or forged context escaped';
  end if;

  select count(*) into v_count
    from public.get_my_conversation_contexts(null::uuid[]);
  if v_count <> 0 then
    raise exception 'seeker-conversation: null context input did not fail closed';
  end if;

  select count(*) into v_count
    from public.get_my_conversation_contexts(
      array_fill(v_application_conversation, array[201])
    );
  if v_count <> 0 then
    raise exception 'seeker-conversation: oversized context input did not fail closed';
  end if;
end;
$$;

reset role;

-- The owning host sees the same three exact contexts.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"user_conversation_assert_host","role":"authenticated"}';

do $$
declare
  v_requested uuid[];
  v_count integer;
begin
  select array_agg(c.id order by c.id) into v_requested
    from public.conversations c
   where c.application_id in (
     '75000000-0000-0000-0000-000000000021',
     '75000000-0000-0000-0000-000000000024',
     '75000000-0000-0000-0000-000000000025',
     '75000000-0000-0000-0000-000000000026'
   );

  select count(*) into v_count
    from public.get_my_conversation_contexts(v_requested);
  if v_count <> 3 then
    raise exception 'seeker-conversation: host expected 3 exact contexts, got %', v_count;
  end if;
end;
$$;

reset role;

-- A non-participant cannot recover an exact conversation context by UUID.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"user_conversation_assert_outsider","role":"authenticated"}';

do $$
begin
  if exists (
    select 1
      from public.get_my_conversation_contexts(
        array['75000000-0000-0000-0000-000000000033'::uuid]
      )
  ) then
    raise exception 'seeker-conversation: outsider recovered an owned context';
  end if;
end;
$$;

reset role;

-- The actual foreign participant can recover only their exact application row.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"user_conversation_assert_foreign","role":"authenticated"}';

do $$
begin
  if not exists (
    select 1
      from public.get_my_conversation_contexts(
        array[
          '75000000-0000-0000-0000-000000000031'::uuid,
          '75000000-0000-0000-0000-000000000033'::uuid
        ]
      ) context
     where context.conversation_id = '75000000-0000-0000-0000-000000000031'
       and context.listing_id = '75000000-0000-0000-0000-000000000013'
       and context.listing_title = 'Foreign application listing'
  ) then
    raise exception 'seeker-conversation: participant context was not returned';
  end if;

  if (
    select count(*)
      from public.get_my_conversation_contexts(
        array[
          '75000000-0000-0000-0000-000000000031'::uuid,
          '75000000-0000-0000-0000-000000000033'::uuid
        ]
      )
  ) <> 1 then
    raise exception 'seeker-conversation: foreign participant saw another thread';
  end if;
end;
$$;

reset role;

rollback;
