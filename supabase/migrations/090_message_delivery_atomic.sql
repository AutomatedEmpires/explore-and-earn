-- Migration 090: atomic message delivery and notification outbox.
--
-- A message used to be inserted through the caller's authenticated client and
-- its canonical message_sent event was written later through a separate admin
-- client. A process exit or provider failure between those writes left a real
-- message with no event for the notification dispatcher. This migration makes
-- that state impossible for every future message:
--
--   * an AFTER INSERT trigger emits one canonical message_sent event and bumps
--     conversation activity in the same PostgreSQL transaction as the message;
--   * the trigger validates sender_type/profile against the conversation, so
--     even a privileged writer cannot create an impersonated message;
--   * authenticated callers lose direct table INSERT and use one narrow RPC
--     that derives the sender from the Clerk JWT, inserts the message, and
--     updates conversation activity atomically;
--   * the event contains routing metadata only. Message body content never
--     enters the notification outbox.
--
-- Existing conversations remain sendable after their listing or application
-- closes, matching migration 075: closure prevents a new thread but preserves
-- an existing transcript and its communication path.
--
-- Additive/idempotent. Apply only through the reviewed db-migrate pipeline.

begin;

-- A durable message maps to exactly one canonical event. Historical
-- message_sent events predate message_id metadata and are intentionally outside
-- this partial index; every event produced by the trigger is covered.
create unique index if not exists events_message_sent_message_id_unique
  on public.events ((properties ->> 'message_id'))
  where event_type = 'message_sent' and properties ? 'message_id';

create or replace function public.emit_message_sent_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing_id uuid;
  v_host_profile_id uuid;
  v_seeker_profile_id uuid;
begin
  select c.listing_id, c.host_profile_id, c.seeker_profile_id
    into v_listing_id, v_host_profile_id, v_seeker_profile_id
    from public.conversations c
   where c.id = new.conversation_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'message_conversation_unavailable';
  end if;

  if (new.sender_type = 'host' and new.sender_profile_id <> v_host_profile_id)
     or (new.sender_type = 'seeker' and new.sender_profile_id <> v_seeker_profile_id)
     or new.sender_type not in ('host', 'seeker') then
    raise exception using
      errcode = '23514',
      message = 'message_sender_mismatch';
  end if;

  insert into public.events (
    event_type,
    occurred_at,
    actor_scope,
    subject_type,
    subject_id,
    listing_id,
    host_profile_id,
    seeker_profile_id,
    source_surface,
    properties
  )
  values (
    'message_sent',
    new.created_at,
    new.sender_type,
    'conversation',
    new.conversation_id,
    v_listing_id,
    v_host_profile_id,
    v_seeker_profile_id,
    'message_insert_trigger',
    jsonb_build_object(
      'sender_role', new.sender_type,
      'message_id', new.id
    )
  );

  -- Every writer, including service-role imports/admin tooling, advances inbox
  -- ordering through the same trigger. GREATEST makes an explicitly backdated
  -- insert unable to move an active conversation backwards.
  update public.conversations c
     set last_message_at = greatest(
       coalesce(c.last_message_at, new.created_at),
       new.created_at
     )
   where c.id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists trg_messages_emit_sent_event on public.messages;
create trigger trg_messages_emit_sent_event
  after insert on public.messages
  for each row execute function public.emit_message_sent_event();

-- Trigger functions do not need client EXECUTE. Remove every inherited/default
-- grant so this SECURITY DEFINER function is never a callable RPC surface.
revoke execute on function public.emit_message_sent_event()
  from public, anon, authenticated, service_role;

create or replace function public.send_my_conversation_message(
  p_conversation_id uuid,
  p_body text
)
returns table (
  message_id uuid,
  sender_role text,
  sender_profile_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text := public.get_clerk_user_id();
  v_body text := btrim(coalesce(p_body, ''));
  v_host_profile_id uuid;
  v_seeker_profile_id uuid;
  v_host_clerk_user_id text;
  v_seeker_clerk_user_id text;
  v_sender_role text;
  v_sender_profile_id uuid;
  v_message_id uuid;
  v_created_at timestamptz;
begin
  if char_length(v_body) = 0 then
    raise exception using
      errcode = '22023',
      message = 'message_body_empty';
  end if;

  if char_length(v_body) > 4000 then
    raise exception using
      errcode = '22001',
      message = 'message_body_too_long';
  end if;

  if v_clerk_user_id is null or p_conversation_id is null then
    return;
  end if;

  -- Lock the conversation so concurrent sends serialize their activity stamp.
  -- Host-first role resolution preserves the pre-090 behavior for the unusual
  -- case where one Clerk identity owns both profiles in the same thread.
  select
    c.host_profile_id,
    c.seeker_profile_id,
    h.clerk_user_id,
    s.clerk_user_id
  into
    v_host_profile_id,
    v_seeker_profile_id,
    v_host_clerk_user_id,
    v_seeker_clerk_user_id
  from public.conversations c
  join public.host_profiles h on h.id = c.host_profile_id
  join public.seeker_profiles s on s.id = c.seeker_profile_id
  where c.id = p_conversation_id
  for update of c;

  if not found then
    return;
  end if;

  if v_host_clerk_user_id = v_clerk_user_id then
    v_sender_role := 'host';
    v_sender_profile_id := v_host_profile_id;
  elsif v_seeker_clerk_user_id = v_clerk_user_id then
    v_sender_role := 'seeker';
    v_sender_profile_id := v_seeker_profile_id;
  else
    -- Missing and foreign conversations are deliberately indistinguishable.
    return;
  end if;

  insert into public.messages (
    conversation_id,
    sender_type,
    sender_profile_id,
    body
  )
  values (
    p_conversation_id,
    v_sender_role,
    v_sender_profile_id,
    v_body
  )
  returning id, messages.created_at
    into v_message_id, v_created_at;

  return query
  select v_message_id, v_sender_role, v_sender_profile_id, v_created_at;
end;
$$;

-- The RPC is the only authenticated message creation surface. Its SECURITY
-- DEFINER privilege is bounded by the Clerk-owned participant lookup above.
revoke insert on table public.messages from public, anon, authenticated;

revoke execute on function public.send_my_conversation_message(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.send_my_conversation_message(uuid, text)
  to authenticated;

commit;
