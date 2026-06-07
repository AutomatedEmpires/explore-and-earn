# Wave 11 — Agent C: Host Experience Completion + Email Delivery

**Branch:** `feature/host-completion`
**Lane:** Host-facing pages/components, email delivery, invite creation — no seeker pages, no admin pages, no migrations, no RLS changes

---

## Your mission

Close every open TODO in the host experience, wire the full invite creation flow end-to-end, ensure all email notifications actually reach users in production, and connect the existing `hostAnalytics.ts` module to a real dashboard UI.

---

## Context: what is already built

- Host dashboard (`/host`) — `HostDashboard.tsx` component, imported analytics data
- Host listings list + create + edit — functional
- Host listing detail (`/host/listings/[id]`) — functional except applicant count is a TODO
- Applicant pipeline (`/host/applicants`) — list + per-applicant detail
- Invite list (`/host/invites`) — shows received/sent invites via `InvitesList.tsx`
- Seeker search drawer (`SeekerSearchDrawer.tsx`) — searches seekers by name/bio but does NOT yet send an invite (the button likely calls a stub)
- Messaging (`/host/messages`) — thread list and thread views work, but display names are sourced as "Unknown" (see TODO in page.tsx)
- Email templates exist: `applicationReceived.ts`, `applicationStatus.ts`, `inviteReceived.ts`, `newMessage.ts`, `layout.ts`
- `lib/email.ts` — sends via Resend REST API, logs to console in dev when `RESEND_API_KEY` is absent
- `hostAnalytics.ts` — exports `getHostAnalytics(token, clerkUserId)` returning per-listing stats

---

## Task 1: Host listing detail — real applicant count

Read `apps/web/app/(host)/host/listings/[id]/page.tsx`. It has a comment:
```
// TODO(host-applicants): real applicant counts land in the next backend PR.
```

Fix it. `getHostApplications(token, userId)` is exported from `@explore-and-earn/db`. Filter by `listingId` to get the count for this specific listing. The page already has `listing.id` — use it.

Show counts by status: pending, shortlisted/reviewed, offered, accepted. The existing `HostDashboard` component or the listing detail component likely has a stat display area — populate it.

---

## Task 2: Host messages — seeker display names

Read `apps/web/app/(host)/host/messages/page.tsx`. It has a comment:
```
// Applicant display names are not yet sourced (no exported seeker name lookup)
```

`getApplicationWithSeekerDetail(token, userId, applicationId)` is exported from `@explore-and-earn/db` and returns `seekerDisplayName`. However, the messages surface needs names tied to conversations, not applications.

Read `packages/db/src/queries/messages.ts` to see what `getConversations` or equivalent returns. It likely returns `conversation_id`, `seeker_profile_id`, `host_profile_id`, `created_at`, and possibly the last message. 

To source the display name: after fetching conversations, for each `seeker_profile_id`, look up the name. Check `packages/db/src/queries/seekerProfiles.ts` for a `getSeekerProfileById` or `getSeekerDisplayName` function. If one doesn't exist, add it to `packages/db/src/queries/seekerProfiles.ts`:

```typescript
export async function getSeekerDisplayNames(
  clerkToken: string,
  seekerProfileIds: string[],
): Promise<Map<string, string>> {
  // Returns a Map<seekerProfileId, displayName>
  // Query seeker_profiles WHERE id = ANY(seekerProfileIds)
  // SELECT id, display_name
}
```

Then in the host messages page, call this in parallel with the conversations fetch, merge by seeker_profile_id.

---

## Task 3: Invite creation — complete the flow

Read `apps/web/components/host/SeekerSearchDrawer.tsx`. The drawer shows seeker search results. The "Invite" button on each result likely calls nothing, or calls a stub.

Wire it to a real invite creation:

**Server action** (`apps/web/app/actions/invites.ts` — this file already exists, read it first):

Add `createInviteAction(seekerProfileId: string, listingId: string, message?: string)`:
1. `auth()` — get `userId`
2. `getToken({ template: "supabase" })` — Supabase JWT
3. Resolve host profile ID via `getHostProfileId` (or equivalent from `@explore-and-earn/db`)
4. Call `createInvite(token, { hostProfileId, seekerProfileId, listingId, message })` — check if this function exists in `packages/db/src/queries/invites.ts`. If not, add it:
   ```typescript
   export async function createInvite(clerkToken: string, params: {
     hostProfileId: string; seekerProfileId: string; listingId: string; message?: string;
   }): Promise<{ ok: boolean; error?: string }>
   ```
   Insert into `invites` table. Handle unique constraint violation (already invited).
5. After creating the invite, send the invite email via `sendEmail` from `lib/email.ts` using the `inviteEmail` template from `lib/emails/inviteEmail.ts`

**UI:** In `SeekerSearchDrawer.tsx`, wire the Invite button to call `createInviteAction`. Show a success/error state inline on the row.

**Email:** Read `apps/web/lib/emails/inviteEmail.ts` and `apps/web/lib/emails/inviteReceived.ts`. Wire the appropriate template to the `createInviteAction`. You'll need the seeker's email — look it up from Clerk via `clerkClient().users.getUser(seekerClerkUserId)` pattern (see how `applicationReceived` action does it in `actions/applications.ts`).

---

## Task 4: Host analytics dashboard

`packages/db/src/hostAnalytics.ts` exports `getHostAnalytics(token, clerkUserId)`. Read it to understand the shape of the returned data.

Read `apps/web/app/(host)/host/page.tsx` (the host dashboard). Currently it imports and uses `HostDashboard.tsx`. Wire `getHostAnalytics` into the page alongside the existing data:
- Total applications across all listings (by status)
- Total invites sent / accepted rate
- Per-listing application counts
- Active listing count vs total listing count

If `HostDashboard.tsx` already renders these sections with hardcoded/empty data, replace the data sources. If the component needs new props, add them.

---

## Task 5: Ensure all email sends actually fire

Audit every server action that SHOULD send an email but may not be:

| Trigger | Action file | Email template | Status to verify |
|---|---|---|---|
| Seeker applies | `actions/applications.ts` | `applicationReceived.ts` | Check it calls `sendEmail` |
| Host changes application status | `actions/applicationStatus.ts` | `applicationStatus.ts` | Check it calls `sendEmail` |
| New message sent | `actions/messages.ts` | `newMessage.ts` | Check it calls `sendEmail` with notification pref guard |
| Invite sent | `actions/invites.ts` | `inviteEmail.ts` / `inviteReceived.ts` | Wire in Task 3 |

For each action, trace the code path from the server action function to `sendEmail`. If the call is missing, add it following the established pattern:
1. Look up recipient's email via Clerk
2. Render the email template HTML
3. Call `sendEmail({ to, subject, html })`
4. Email sends are best-effort — wrap in `try/catch` and never block the primary action

---

## Rules

- `userId` MUST come from `auth().userId` — never decoded from JWT
- `getToken({ template: "supabase" })` for all Supabase queries
- `export const dynamic = "force-dynamic"` on every server component that calls Supabase
- Email sends are ALWAYS best-effort — never throw, never block the primary mutation
- CSS custom properties only — no hardcoded colors
- `<Icon name="domain.name" size={16|20|24} />` only
- HOUSING / MEALS / PAY triad — never "Perks"
- Do NOT touch: seeker pages, admin pages, `supabase/migrations/`, RLS policies

---

## Delivery

Single PR: `feat(host): host experience completion — applicant counts, display names, invite creation, analytics, email delivery`
