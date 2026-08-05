-- assert_message_delivery_atomic.sql
-- Connected proof for migration 090. Runs in one transaction and rolls back.

\set ON_ERROR_STOP on

begin;

\ir _assert_helpers.sql

-- ---------------------------------------------------------------------------
-- Fixtures: one closed-listing thread plus unrelated identities.
-- Existing threads intentionally stay writable after listing closure (075).
-- ---------------------------------------------------------------------------

insert into public.host_profiles (
  id, clerk_user_id, company_name, slug, category_scopes
)
values
  (
    '9000a000-0000-4000-8000-000000000001',
    'user_message_host_a',
    'Atomic Message Host A',
    'atomic-message-host-a',
    array['farm']
  ),
  (
    '9000b000-0000-4000-8000-000000000002',
    'user_message_host_b',
    'Atomic Message Host B',
    'atomic-message-host-b',
    array['farm']
  );

insert into public.seeker_profiles (id, clerk_user_id, display_name)
values
  (
    '90005000-0000-4000-8000-000000000001',
    'user_message_seeker_a',
    'Atomic Message Seeker A'
  ),
  (
    '90005000-0000-4000-8000-000000000002',
    'user_message_seeker_b',
    'Atomic Message Seeker B'
  );

insert into public.listings (id, host_profile_id, title, category, status)
values (
  '90006000-0000-4000-8000-000000000001',
  '9000a000-0000-4000-8000-000000000001',
  'Closed listing with preserved thread',
  'farm',
  'closed'
);

insert into public.conversations (
  id, seeker_profile_id, host_profile_id, listing_id
)
values (
  '9000c000-0000-4000-8000-000000000001',
  '90005000-0000-4000-8000-000000000001',
  '9000a000-0000-4000-8000-000000000001',
  '90006000-0000-4000-8000-000000000001'
);

-- ---------------------------------------------------------------------------
-- Catalog boundary: one authenticated RPC, no direct client insert, and an
-- uncallable SECURITY DEFINER trigger function with a pinned search_path.
-- ---------------------------------------------------------------------------

do $do$
begin
  if not has_function_privilege(
    'authenticated',
    'public.send_my_conversation_message(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'message atomicity: authenticated lost RPC execution';
  end if;

  if has_function_privilege(
    'anon',
    'public.send_my_conversation_message(uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.send_my_conversation_message(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'message atomicity: a non-authenticated client can execute the RPC';
  end if;

  if has_table_privilege('authenticated', 'public.messages', 'INSERT')
     or has_table_privilege('anon', 'public.messages', 'INSERT') then
    raise exception 'message atomicity: a client role can bypass the RPC with direct INSERT';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.emit_message_sent_event()',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.emit_message_sent_event()',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.emit_message_sent_event()',
    'EXECUTE'
  ) then
    raise exception 'message atomicity: trigger function became a callable client surface';
  end if;

  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.oid = 'public.send_my_conversation_message(uuid,text)'::regprocedure
       and p.prosecdef
       and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
  ) then
    raise exception 'message atomicity: RPC is not SECURITY DEFINER with a pinned search_path';
  end if;

  if not exists (
    select 1
      from pg_trigger t
     where t.tgrelid = 'public.messages'::regclass
       and t.tgname = 'trg_messages_emit_sent_event'
       and not t.tgisinternal
       and t.tgenabled <> 'D'
  ) then
    raise exception 'message atomicity: message event trigger is absent or disabled';
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- Anon cannot call the RPC.
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $do$
begin
  perform pg_temp.expect_denied(
    'anon cannot send through the message RPC',
    $q$select * from public.send_my_conversation_message(
      '9000c000-0000-4000-8000-000000000001', 'anon message'
    )$q$,
    'permission denied for function send_my_conversation_message'
  );
end;
$do$;

reset role;

-- ---------------------------------------------------------------------------
-- A foreign authenticated user sees the same empty response as a missing id
-- and cannot bypass the RPC by writing the table directly.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_message_seeker_b","role":"authenticated"}';

do $do$
begin
  perform pg_temp.expect_rows(
    'foreign participant receives no RPC row',
    $q$select * from public.send_my_conversation_message(
      '9000c000-0000-4000-8000-000000000001', 'foreign message'
    )$q$,
    0
  );
  perform pg_temp.expect_rows(
    'missing conversation receives no RPC row',
    $q$select * from public.send_my_conversation_message(
      '9000c000-0000-4000-8000-000000000099', 'missing message'
    )$q$,
    0
  );
  perform pg_temp.expect_denied(
    'authenticated cannot bypass RPC with direct INSERT',
    $q$insert into public.messages (
      conversation_id, sender_type, sender_profile_id, body
    ) values (
      '9000c000-0000-4000-8000-000000000001',
      'seeker',
      '90005000-0000-4000-8000-000000000002',
      'direct bypass'
    )$q$,
    'permission denied for table messages'
  );
end;
$do$;

reset role;

-- ---------------------------------------------------------------------------
-- Seeker and host sends both succeed on the existing closed-listing thread.
-- The RPC chooses the role/profile from the JWT and trims body text.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_message_seeker_a","role":"authenticated"}';

do $do$
declare
  v_row record;
begin
  select * into v_row
    from public.send_my_conversation_message(
      '9000c000-0000-4000-8000-000000000001',
      '  seeker reply on closed listing  '
    );

  if v_row.sender_role is distinct from 'seeker'
     or v_row.sender_profile_id is distinct from
        '90005000-0000-4000-8000-000000000001'::uuid
     or v_row.message_id is null
     or v_row.created_at is null then
    raise exception 'message atomicity: seeker RPC returned the wrong derived identity: %', v_row;
  end if;

  perform pg_temp.expect_denied(
    'empty message is refused',
    $q$select * from public.send_my_conversation_message(
      '9000c000-0000-4000-8000-000000000001', '   '
    )$q$,
    'message_body_empty',
    '22023'
  );
  perform pg_temp.expect_denied(
    'message over 4000 characters is refused',
    $q$select * from public.send_my_conversation_message(
      '9000c000-0000-4000-8000-000000000001', repeat('x', 4001)
    )$q$,
    'message_body_too_long',
    '22001'
  );
end;
$do$;

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_message_host_a","role":"authenticated"}';

do $do$
declare
  v_row record;
begin
  select * into v_row
    from public.send_my_conversation_message(
      '9000c000-0000-4000-8000-000000000001',
      'host reply on closed listing'
    );

  if v_row.sender_role is distinct from 'host'
     or v_row.sender_profile_id is distinct from
        '9000a000-0000-4000-8000-000000000001'::uuid then
    raise exception 'message atomicity: host RPC returned the wrong derived identity: %', v_row;
  end if;

  perform * from public.send_my_conversation_message(
    '9000c000-0000-4000-8000-000000000001',
    repeat('x', 4000)
  );
end;
$do$;

reset role;

-- ---------------------------------------------------------------------------
-- The trigger covers privileged writers too and rejects sender impersonation.
-- ---------------------------------------------------------------------------

set local role service_role;

insert into public.messages (
  id, conversation_id, sender_type, sender_profile_id, body, created_at
)
values (
  '9000d000-0000-4000-8000-000000000004',
  '9000c000-0000-4000-8000-000000000001',
  'host',
  '9000a000-0000-4000-8000-000000000001',
  'privileged but still outboxed',
  clock_timestamp() + interval '1 second'
);

reset role;

do $do$
begin
  perform pg_temp.expect_denied(
    'privileged writer cannot impersonate the other participant',
    $q$insert into public.messages (
      id, conversation_id, sender_type, sender_profile_id, body
    ) values (
      '9000d000-0000-4000-8000-000000000005',
      '9000c000-0000-4000-8000-000000000001',
      'host',
      '9000b000-0000-4000-8000-000000000002',
      'forged sender'
    )$q$,
    'message_sender_mismatch',
    '23514'
  );
end;
$do$;

-- Force the event insert to violate the message_id uniqueness invariant. The
-- AFTER trigger error must roll back the message row from the same statement.
insert into public.events (
  event_type, actor_scope, subject_type, subject_id, properties
)
values (
  'message_sent',
  'seeker',
  'conversation',
  '9000c000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'sender_role', 'seeker',
    'message_id', '9000d000-0000-4000-8000-000000000099'
  )
);

do $do$
begin
  perform pg_temp.expect_denied(
    'event failure rolls the message insert back',
    $q$insert into public.messages (
      id, conversation_id, sender_type, sender_profile_id, body
    ) values (
      '9000d000-0000-4000-8000-000000000099',
      '9000c000-0000-4000-8000-000000000001',
      'seeker',
      '90005000-0000-4000-8000-000000000001',
      'must roll back'
    )$q$,
    'events_message_sent_message_id_unique',
    '23505'
  );

  if exists (
    select 1 from public.messages
     where id = '9000d000-0000-4000-8000-000000000099'
  ) then
    raise exception 'message atomicity: trigger failure left a durable message';
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- Final invariant: every real fixture message has one compatible, content-free
-- event and conversation activity equals the newest message timestamp.
-- ---------------------------------------------------------------------------

do $do$
declare
  v_message_count integer;
  v_event_count integer;
begin
  select count(*) into v_message_count
    from public.messages m
   where m.conversation_id = '9000c000-0000-4000-8000-000000000001';

  select count(*) into v_event_count
    from public.events e
   where e.event_type = 'message_sent'
     and e.subject_type = 'conversation'
     and e.subject_id = '9000c000-0000-4000-8000-000000000001'
     and e.source_surface = 'message_insert_trigger'
     and e.properties ? 'message_id';

  if v_message_count <> 4 or v_event_count <> v_message_count then
    raise exception 'message atomicity: expected 4 messages and one trigger event each, got messages=% events=%',
      v_message_count, v_event_count;
  end if;

  if exists (
    select 1
      from public.messages m
      left join public.events e
        on e.event_type = 'message_sent'
       and e.properties ->> 'message_id' = m.id::text
     where m.conversation_id = '9000c000-0000-4000-8000-000000000001'
     group by m.id
    having count(e.id) <> 1
  ) then
    raise exception 'message atomicity: a durable message does not map to exactly one event';
  end if;

  if exists (
    select 1
      from public.events e
     where e.source_surface = 'message_insert_trigger'
       and (
         e.properties ? 'body'
         or e.properties ? 'content'
         or e.properties ? 'message_body'
       )
  ) then
    raise exception 'message atomicity: message content escaped into event properties';
  end if;

  if not exists (
    select 1
      from public.messages m
      join public.events e
        on e.properties ->> 'message_id' = m.id::text
     where m.body = 'seeker reply on closed listing'
       and m.sender_type = 'seeker'
       and e.actor_scope = 'seeker'
       and e.listing_id = '90006000-0000-4000-8000-000000000001'
       and e.host_profile_id = '9000a000-0000-4000-8000-000000000001'
       and e.seeker_profile_id = '90005000-0000-4000-8000-000000000001'
  ) then
    raise exception 'message atomicity: trigger event routing context is incomplete';
  end if;

  if (select char_length(body) from public.messages where char_length(body) = 4000) <> 4000 then
    raise exception 'message atomicity: the exact 4000-character boundary did not persist';
  end if;

  if (select last_message_at from public.conversations
       where id = '9000c000-0000-4000-8000-000000000001')
     is distinct from
     (select max(created_at) from public.messages
       where conversation_id = '9000c000-0000-4000-8000-000000000001') then
    raise exception 'message atomicity: conversation activity is not the newest RPC message timestamp';
  end if;
end;
$do$;

rollback;
