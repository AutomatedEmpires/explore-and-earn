-- Migration 048: enable Row Level Security on conversations + messages.
--
-- The participant policies were authored back in 013 but RLS was never enabled,
-- so they were inert and the tables were protected only by application-level
-- ownership guards. This activates them (defense in depth: a private thread can
-- no longer leak through a query-layer bug) and fixes/extends them so every
-- operation the app performs is covered:
--
--   * 013 conversations INSERT required owning BOTH the seeker AND host side of
--     the thread — which no single user does — so enabling RLS as-is would have
--     blocked all conversation creation. Corrected to OR: the creator must own
--     the side they claim (their own). You can never insert a thread on a side
--     you don't own, so identity still cannot be spoofed.
--   * Added UPDATE policies the app relies on: sendMessage bumps
--     conversations.last_message_at; markMessagesRead sets messages.read_at.
--
-- Trust model is the existing SECURITY DEFINER helpers (current_seeker_profile_ids
-- / current_host_profile_ids / current_conversation_ids), verified to resolve a
-- real signed JWT correctly under live RLS.

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- conversations INSERT — own the side you claim (corrects the 013 AND → OR).
drop policy if exists conversations_insert_party on public.conversations;
create policy conversations_insert_party on public.conversations
  for insert to authenticated
  with check (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    or host_profile_id in (select public.current_host_profile_ids())
  );

-- conversations UPDATE — a participant may bump their own thread.
drop policy if exists conversations_update_party on public.conversations;
create policy conversations_update_party on public.conversations
  for update to authenticated
  using (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    or host_profile_id in (select public.current_host_profile_ids())
  )
  with check (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    or host_profile_id in (select public.current_host_profile_ids())
  );

-- messages UPDATE — a participant may mark messages read in their threads.
drop policy if exists messages_update_participant on public.messages;
create policy messages_update_participant on public.messages
  for update to authenticated
  using (conversation_id in (select public.current_conversation_ids()))
  with check (conversation_id in (select public.current_conversation_ids()));

-- (013's conversations_select_party, messages_select_participant, and
--  messages_insert_participant policies remain in force, now activated.)
