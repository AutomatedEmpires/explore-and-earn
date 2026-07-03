-- Migration 045: community_view_state — tracks when each seeker last opened the
-- community feed, so the seeker shell can show an honest "N new" badge on the
-- Community nav item (replacing the hardcoded 0). The unread count is derived:
-- community photos + active host announcements created since last_seen_at.
--
-- Accessed ONLY by the service-role client (the badge count + mark-seen run
-- server-side in the seeker layout / community page, scoped by the caller's
-- Clerk id). So RLS is enabled deny-by-default with no anon/authenticated
-- policies — there is nothing user-sensitive here, and service-role bypasses RLS.

create table if not exists public.community_view_state (
  clerk_user_id text primary key,
  last_seen_at  timestamptz not null default now()
);

alter table public.community_view_state enable row level security;
-- No client policies: only the service-role client reads/writes this table.
