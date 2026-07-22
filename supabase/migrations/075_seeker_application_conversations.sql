-- Migration 075: seeker-initiated, application-scoped conversations.
--
-- Direct conversation INSERT is closed for both actors. Each side instead uses
-- a narrow SECURITY DEFINER function that derives every relationship identifier
-- from the caller's Clerk-owned application. This avoids trusting client-supplied
-- seeker, listing, or host ids and continues to work after the underlying listing
-- is no longer publicly visible.

-- Neither side may directly INSERT a conversation. Migration 050's host policy
-- proved only a broad relationship and could not serialize its status check
-- against a concurrent application close. Both actors now use identity-derived,
-- row-locking functions below; service-role writers remain unaffected.
drop policy if exists conversations_insert_party on public.conversations;
revoke insert on table public.conversations from anon, authenticated;

create or replace function public.ensure_my_application_conversation(
  p_application_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text := public.get_clerk_user_id();
  v_seeker_profile_id uuid;
  v_listing_id uuid;
  v_host_profile_id uuid;
  v_application_status text;
  v_conversation_id uuid;
begin
  if v_clerk_user_id is null or p_application_id is null then
    return null;
  end if;

  select
    a.seeker_profile_id,
    a.listing_id,
    l.host_profile_id,
    a.status
  into
    v_seeker_profile_id,
    v_listing_id,
    v_host_profile_id,
    v_application_status
  from public.applications a
  join public.seeker_profiles s on s.id = a.seeker_profile_id
  join public.listings l on l.id = a.listing_id
  where a.id = p_application_id
    and s.clerk_user_id = v_clerk_user_id
  for share of a, l;

  if not found or v_host_profile_id is null then
    return null;
  end if;

  -- A transcript that already exists stays reachable after either party closes
  -- the application. Closing a lifecycle must not erase its communication.
  select c.id
  into v_conversation_id
  from public.conversations c
  where c.seeker_profile_id = v_seeker_profile_id
    and c.host_profile_id = v_host_profile_id
    and c.application_id = p_application_id
  order by c.created_at asc
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  -- Do not open a brand-new channel after rejection, withdrawal, or expiry.
  if v_application_status not in (
    'applied',
    'reviewing',
    'saved_by_host',
    'offered',
    'accepted',
    'active',
    'completed'
  ) then
    return null;
  end if;

  insert into public.conversations (
    seeker_profile_id,
    host_profile_id,
    listing_id,
    application_id
  )
  values (
    v_seeker_profile_id,
    v_host_profile_id,
    v_listing_id,
    p_application_id
  )
  on conflict (seeker_profile_id, host_profile_id, application_id)
    where application_id is not null
    do nothing
  returning id into v_conversation_id;

  -- A concurrent tab may have won the unique-index race.
  if v_conversation_id is null then
    select c.id
    into v_conversation_id
    from public.conversations c
    where c.seeker_profile_id = v_seeker_profile_id
      and c.host_profile_id = v_host_profile_id
      and c.application_id = p_application_id
    order by c.created_at asc
    limit 1;
  end if;

  return v_conversation_id;
end;
$$;

create or replace function public.ensure_my_host_application_conversation(
  p_application_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text := public.get_clerk_user_id();
  v_seeker_profile_id uuid;
  v_listing_id uuid;
  v_host_profile_id uuid;
  v_application_status text;
  v_conversation_id uuid;
begin
  if v_clerk_user_id is null or p_application_id is null then
    return null;
  end if;

  select
    a.seeker_profile_id,
    a.listing_id,
    l.host_profile_id,
    a.status
  into
    v_seeker_profile_id,
    v_listing_id,
    v_host_profile_id,
    v_application_status
  from public.applications a
  join public.listings l on l.id = a.listing_id
  join public.host_profiles h on h.id = l.host_profile_id
  where a.id = p_application_id
    and h.clerk_user_id = v_clerk_user_id
  for share of a, l;

  if not found then
    return null;
  end if;

  select c.id
  into v_conversation_id
  from public.conversations c
  where c.seeker_profile_id = v_seeker_profile_id
    and c.host_profile_id = v_host_profile_id
    and c.application_id = p_application_id
  order by c.created_at asc
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  if v_application_status not in (
    'applied',
    'reviewing',
    'saved_by_host',
    'offered',
    'accepted',
    'active',
    'completed'
  ) then
    return null;
  end if;

  insert into public.conversations (
    seeker_profile_id,
    host_profile_id,
    listing_id,
    application_id
  )
  values (
    v_seeker_profile_id,
    v_host_profile_id,
    v_listing_id,
    p_application_id
  )
  on conflict (seeker_profile_id, host_profile_id, application_id)
    where application_id is not null
    do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select c.id
    into v_conversation_id
    from public.conversations c
    where c.seeker_profile_id = v_seeker_profile_id
      and c.host_profile_id = v_host_profile_id
      and c.application_id = p_application_id
    order by c.created_at asc
    limit 1;
  end if;

  return v_conversation_id;
end;
$$;

-- Conversation participants need stable inbox context after a listing is
-- paused or closed. Public listing reads intentionally hide those rows, so this
-- narrow function returns only title/category/host name for conversations owned
-- by the caller. Arbitrary conversation ids remain invisible.
create or replace function public.get_my_conversation_contexts(
  p_conversation_ids uuid[]
)
returns table (
  conversation_id uuid,
  listing_id uuid,
  listing_title text,
  listing_category text,
  host_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    a.listing_id,
    l.title,
    l.category,
    h.company_name
  from public.conversations c
  join public.applications a
    on a.id = c.application_id
   and a.seeker_profile_id = c.seeker_profile_id
  join public.listings l
    on l.id = a.listing_id
   and l.host_profile_id = c.host_profile_id
   and (c.listing_id is null or c.listing_id = a.listing_id)
  join public.seeker_profiles s on s.id = a.seeker_profile_id
  join public.host_profiles h on h.id = l.host_profile_id
  cross join lateral (
    select public.get_clerk_user_id() as clerk_user_id
  ) actor
  where actor.clerk_user_id is not null
    and cardinality(coalesce(p_conversation_ids, '{}'::uuid[])) between 1 and 200
    and c.id = any(p_conversation_ids)
    and (
      s.clerk_user_id = actor.clerk_user_id
      or h.clerk_user_id = actor.clerk_user_id
    )
$$;

revoke execute on function public.ensure_my_application_conversation(uuid)
  from public, anon;
grant execute on function public.ensure_my_application_conversation(uuid)
  to authenticated, service_role;

revoke execute on function public.ensure_my_host_application_conversation(uuid)
  from public, anon;
grant execute on function public.ensure_my_host_application_conversation(uuid)
  to authenticated, service_role;

revoke execute on function public.get_my_conversation_contexts(uuid[])
  from public, anon;
grant execute on function public.get_my_conversation_contexts(uuid[])
  to authenticated, service_role;
