-- Migration 043: enable Row Level Security on notifications — the seeker/host
-- notification feed was protected only by an application-level
-- recipient_clerk_user_id filter. Defense in depth: a bug in the query layer can
-- no longer leak one user's notifications to another.
--
-- Ownership is keyed to the caller's Clerk identity via the existing
-- SECURITY DEFINER helper public.get_clerk_user_id() (013 lineage), so this uses
-- the same trust model as the rest of the schema.
--
-- NOTE: conversations + messages RLS is intentionally NOT enabled here. Those
-- tables have participant policies from 013, but the 013 conversations INSERT
-- policy requires the caller to own BOTH the seeker AND host side of a
-- conversation — which no single user does — so enabling RLS would break all
-- conversation creation. Hardening messaging needs the conversation-creation
-- model resolved (service-role create vs. a corrected single-side INSERT policy)
-- and live verification under a real Clerk JWT; it is tracked as a follow-up.

-- ---------------------------------------------------------------------------
-- notifications — recipient reads and mutates only their own row
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_clerk_user_id = public.get_clerk_user_id());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_clerk_user_id = public.get_clerk_user_id())
  with check (recipient_clerk_user_id = public.get_clerk_user_id());

-- No INSERT or DELETE policy: every notification is a cross-user write (you
-- notify someone else), so rows are created exclusively by the service-role
-- client in the db layer (notifyHostOfApplication / notifyPhotoReaction /
-- notifyAnnouncementReaction), which bypasses RLS.
