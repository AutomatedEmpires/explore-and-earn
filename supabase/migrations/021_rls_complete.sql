-- 021_rls_complete.sql
-- Closes the RLS gaps flagged in code comments across wave-9 and wave-10.
--
-- ADAPTED FROM THE ORIGINAL BRIEF after auditing migrations 013 and 015:
-- the brief assumed messages/conversations RLS was unenabled and that
-- saved_listings only had a SELECT policy. The live lineage already does more:
--   * 013_rls_policies.sql ENABLEs RLS on saved_listings, messages, and
--     conversations. It creates SELECT + INSERT + UPDATE policies on
--     saved_listings, plus participant SELECT and identity-checked INSERT
--     policies on messages and conversations.
--   * 015_rls_remaining_tables.sql ENABLEs RLS on notifications and creates
--     notifications_select_own (SELECT) + notifications_update_own (UPDATE).
--
-- So the ONLY genuine remaining gap is DELETE on saved_listings (013 covers
-- SELECT/INSERT/UPDATE but not DELETE). Everything else the brief listed is
-- already enforced at the DB layer. In particular the 013 messages INSERT
-- policy carries a sender_type / sender_profile_id identity check; adding a
-- second, broader "participants can insert" policy would be UNIONed in by
-- Postgres and silently defeat that impersonation guard, so it is deliberately
-- NOT recreated here.
--
-- This migration is idempotent (DROP POLICY IF EXISTS + CREATE, matching the
-- 013 house style) and safe to run whether or not the 013/015 policies are
-- present in a given environment (repo<->DB drift, see the 015 header note).

begin;

-- Defensive, idempotent: ensure RLS stays ON for the four user-facing tables
-- the brief targeted. These are no-ops when RLS is already enabled (013/015).
alter table public.saved_listings enable row level security;
alter table public.messages       enable row level security;
alter table public.conversations  enable row level security;
alter table public.notifications  enable row level security;

-- ── saved_listings: add the missing DELETE policy ──────────────────────────────────
-- 013 created saved_listings_select_own / _insert_own / _update_own. The swipe
-- and saved surfaces upsert (insert+update) and soft-remove via UPDATE
-- (status='removed'), so SELECT/INSERT/UPDATE are already enforced. A hard
-- DELETE had no policy, leaving deletes blocked under RLS. Add an owner-scoped
-- DELETE policy so a seeker can also hard-delete their own saved rows.
drop policy if exists saved_listings_delete_own on public.saved_listings;
create policy saved_listings_delete_own on public.saved_listings
  for delete to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()));

-- ── messages / conversations / notifications: intentionally unchanged ─────────
-- messages:      013 messages_select_participant (SELECT) +
--                messages_insert_participant (INSERT, with a sender_type /
--                sender_profile_id identity check). NOT recreated: a second
--                permissive INSERT policy without the identity check would be
--                UNIONed in and defeat the anti-impersonation guard.
-- conversations: 013 conversations_select_party (SELECT) +
--                conversations_insert_party (INSERT, both-sides check).
-- notifications: 015 notifications_select_own (SELECT) +
--                notifications_update_own (UPDATE, recipient_clerk_user_id).
-- All already enforce ownership at the DB layer, so no new policy is needed.

commit;
