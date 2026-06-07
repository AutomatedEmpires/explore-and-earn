# Wave 11 — Agent A: RLS Hardening + Database Security Completion

**Branch:** `feature/rls-hardening`
**Lane:** Database security layer only — no UI files, no app/actions files, no CSS

---

## Your mission

Enable Row Level Security on the four tables that are currently unprotected in production, write correct policies for each, and harden the database security layer. Every query in the application already uses application-level scoping, so this migration cements those invariants at the DB layer where they cannot be bypassed.

You also fix the `server-only` gap in `packages/db` query files that export functions used exclusively from server components or server actions — preventing future accidental client-side imports of authed query logic.

---

## Context: what is already true

- Migrations 001–020 are applied to the remote Supabase project `mamosbzcbigcclafhmmr`
- Migration 013 (`rls_policies.sql`) enabled RLS on: `listings`, `applications`, `invites`, `host_profiles`, `seeker_profiles`, `saved_listings` (partial), `notifications` (partial)
- Migration 015 (`rls_remaining_tables.sql`) extended coverage but left gaps
- **Not yet protected at the DB layer:** `saved_listings` writes, `messages`, `notifications` (only partial read policies), `conversations`
- Code comments confirm this: `MessageTranscript.tsx` line 122 says "RLS is not yet enabled" on messages; `savedListings.ts` header says the same for saved_listings
- `packages/db/src/adminClient.ts` already has `import "server-only"` — that was added in wave-10. Check whether `packages/db/src/queries/notificationPrefs.ts`, `seekerProfiles.ts`, and `admin.ts` also need it

---

## Task 1: Migration 021 — complete RLS

Create `supabase/migrations/021_rls_complete.sql`.

### RLS policies needed

Use the helpers that already exist in the DB:
- `public.get_clerk_user_id()` — returns `auth.jwt() ->> 'sub'` (the Clerk user ID)
- `public.current_seeker_profile_ids()` — returns the seeker_profiles.id values owned by the calling Clerk user
- `public.current_host_profile_ids()` — same for host_profiles
- `public.current_conversation_ids()` — returns conversation IDs the caller is a participant in

#### `saved_listings` — currently has no write policies

```sql
-- Seekers may insert/update/delete only their own saved_listings rows
-- (seeker_profile_id must belong to the caller's Clerk user)
CREATE POLICY "seeker can manage own saved_listings"
  ON saved_listings
  FOR ALL
  TO authenticated
  USING (seeker_profile_id = ANY(public.current_seeker_profile_ids()))
  WITH CHECK (seeker_profile_id = ANY(public.current_seeker_profile_ids()));
```

#### `messages` — currently open

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Participants in the conversation may read all messages in it
CREATE POLICY "conversation participants can read messages"
  ON messages
  FOR SELECT
  TO authenticated
  USING (conversation_id = ANY(public.current_conversation_ids()));

-- Either participant may insert a message into their conversation
CREATE POLICY "conversation participants can insert messages"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (conversation_id = ANY(public.current_conversation_ids()));
```

#### `conversations` — check current state first

Run `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'conversations' AND schemaname = 'public';` via Supabase MCP. If RLS is not enabled, add:

```sql
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants can read own conversations"
  ON conversations
  FOR SELECT
  TO authenticated
  USING (
    host_profile_id = ANY(public.current_host_profile_ids())
    OR seeker_profile_id = ANY(public.current_seeker_profile_ids())
  );
```

#### `notifications` — verify existing policies cover all cases

Read migration 015 to see what notification policies already exist. If they only cover SELECT, add:
```sql
-- Service role (webhooks, server actions) may insert notifications.
-- Users may update their own (mark read). Delete not allowed.
CREATE POLICY "users can mark own notifications read"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_clerk_user_id = public.get_clerk_user_id())
  WITH CHECK (recipient_clerk_user_id = public.get_clerk_user_id());
```

### Migration structure

```sql
-- 021_rls_complete.sql
-- Closes the RLS gaps flagged in migration 013/015 comments and wave-10 code
-- comments (MessageTranscript.tsx, savedListings.ts). After this migration,
-- all user-facing tables enforce ownership at the DB layer.

begin;

-- ... all the CREATE POLICY statements above ...

commit;
```

Apply to remote Supabase with the MCP `apply_migration` tool after the file is written.

---

## Task 2: `server-only` audit on packages/db query files

For each file in `packages/db/src/queries/` and `packages/db/src/`:

- Check whether it exports functions that **only make sense server-side** (use Supabase tokens, read env vars, etc.)
- If yes and it does NOT already have `import "server-only"` at line 1, add it
- Skip `types.gen.ts`, `client.ts` (used for client setup), and any file already protected

Files most likely needing it: `notificationPrefs.ts`, `seekerProfiles.ts`, `emailContext.ts`, `admin.ts`, `hostProfiles.ts`, `messages.ts`, `invites.ts`, `applications.ts`, `listings.ts`, `savedListings.ts`, `notifications.ts`, `seekerResume.ts`

Do NOT add `server-only` to barrel exports (`index.ts`) or type-only files.

---

## Task 3: Verify no broken application queries

After adding RLS policies, verify the key read/write paths still work conceptually:

- `getSavedListingIds(token, userId)` → calls `authedClient(token)` → RLS will check `seeker_profile_id = ANY(current_seeker_profile_ids())` → will pass because the seeker_profile_id is resolved from the same `clerk_user_id`
- `saveListing(token, userId, listingId)` → upserts with `seeker_profile_id` resolved from caller's own Clerk ID → passes RLS
- `sendMessage(token, conversationId, ...)` → conversation_id is validated to be in `current_conversation_ids()` → passes

Document any query that may break under the new policies in a comment in the migration file.

---

## Delivery

- One migration file: `supabase/migrations/021_rls_complete.sql`
- `server-only` imports added where missing in `packages/db/src/`
- Migration applied to remote via Supabase MCP
- Single PR, title: `feat(security): enable RLS on messages, conversations, saved_listings writes, notifications update`
- No UI changes, no action file changes, no CSS

---

## Rules

- `userId` MUST come from `auth().userId` — never decoded from JWT
- Service role key never `NEXT_PUBLIC_`
- Do not delete or modify existing migration files
- Do not touch any file outside `supabase/migrations/` and `packages/db/src/`
- Attestation status values: `not_attested | attested | attested_stale | withdrawn` only
