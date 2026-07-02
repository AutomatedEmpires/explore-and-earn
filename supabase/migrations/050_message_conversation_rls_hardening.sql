-- Migration 050: harden conversations + messages RLS against direct-PostgREST abuse.
--
-- Migration 048 enabled RLS on conversations + messages, but its UPDATE policies
-- gate only WHICH ROWS a participant may touch. Postgres RLS cannot restrict
-- WHICH COLUMNS an UPDATE writes. Because every messaging call runs through the
-- authenticated client (anon key + the caller's Clerk JWT) and clients can call
-- PostgREST directly, a signed-in participant could:
--   (1) rewrite ANY column of ANY message in their threads (body, sender_type,
--       sender_profile_id, created_at) — not just read_at, the only column
--       markMessagesRead() writes;
--   (2) RETARGET a conversation by rewriting host_profile_id / seeker_profile_id /
--       listing_id / application_id — the 048 UPDATE policy's WITH CHECK still
--       passes as long as the caller keeps their own side, so a thread can be
--       moved or corrupted;
--   (3) INSERT a conversation against an ARBITRARY counterparty, bypassing the
--       application-relationship gate in getOrCreateConversationForHost() and
--       enabling unsolicited messages to any user.
--
-- Fixes (verified live with the minted-JWT technique before shipping):
--   * Column-level UPDATE grants pin what `authenticated` may write to exactly the
--     columns the app updates — messages.read_at (markMessagesRead) and
--     conversations.last_message_at (sendMessage). RLS still restricts the rows;
--     the grant now restricts the columns. Any other column in an UPDATE payload
--     raises "permission denied for column".
--   * The conversation INSERT policy now requires a real host<->seeker application
--     relationship, matching the check getOrCreateConversationForHost() already
--     performs in application code. (2) and (3) both close as a result.
--
-- Idempotent: REVOKE/GRANT and DROP POLICY IF EXISTS + CREATE are safe to re-run.

-- (1) messages — participants may write only read_at (mark-as-read).
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

-- (2) conversations — participants may write only last_message_at (activity bump).
revoke update on public.conversations from authenticated;
grant update (last_message_at) on public.conversations to authenticated;

-- (3) conversations INSERT — require the host<->seeker application relationship.
-- Only the host-initiated path creates conversations today, and it already
-- verifies this relationship under the host's own token; this makes the database
-- enforce it too. A seeker can no longer self-insert a thread against an arbitrary
-- host (fails the host-ownership term), and a host can no longer open a thread
-- with a seeker who never applied to one of their listings (fails the EXISTS).
-- The subquery runs under the caller's RLS, and a host can already SELECT
-- applications to their own listings, so the legitimate host path still passes.
drop policy if exists conversations_insert_party on public.conversations;
create policy conversations_insert_party on public.conversations
  for insert to authenticated
  with check (
    host_profile_id in (select public.current_host_profile_ids())
    and exists (
      select 1
      from public.applications a
      join public.listings l on l.id = a.listing_id
      where a.seeker_profile_id = conversations.seeker_profile_id
        and l.host_profile_id = conversations.host_profile_id
    )
  );
