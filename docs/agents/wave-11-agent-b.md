# Wave 11 — Agent B: Seeker Experience Completion

**Branch:** `feature/seeker-experience`
**Lane:** Seeker-facing pages and components only — no host files, no admin files, no migrations, no packages/db query files (consume existing exports only)

---

## Your mission

Complete every seeker-facing page that currently renders a stub, placeholder, or empty state. After this wave, a seeker can sign up, onboard, swipe, save, apply, receive an offer, check their schedule, update their travel preferences, manage notification settings, and read a real home feed — all without hitting a dead end.

---

## Context: what is already built

- Swipe deck (`/swipe`) — functional, cursor pagination, save/skip actions
- Map view (`/map`) — live listings with geo pins
- Seek/search (`/seek`) — search with filters  
- Saved listings (`/saved`) — card grid with `alreadyApplied` flag
- Applied list (`/applied`) — application cards with status
- Offered page (`/offered`) — offer cards with accept/decline
- Messaging (`/messages/[id]`) — real-time transcript, functional
- Onboarding flow (`/onboarding` → `/skills` → `/done`) — complete
- Profile edit (`/profile/edit`) — functional

## Context: what is a stub or incomplete

These pages exist but are UI-only shells with no real data:

| Route | File | Status |
|---|---|---|
| `/home` | `app/(seeker)/home/page.tsx` | `getMatchedListings` is a stub component |
| `/schedule` | `app/(seeker)/schedule/page.tsx` | UI-only, no persisted data |
| `/travel` | `app/(seeker)/travel/page.tsx` | UI-only, no persisted data |
| `/journey` | `app/(seeker)/journey/page.tsx` | UI-only, no persisted data |
| `/notifications` | `app/(seeker)/notifications/page.tsx` | Likely reads but no mark-all-read |
| `/settings` | `app/(seeker)/settings/page.tsx` | Notification prefs UI exists but check if wired |
| `/accepted` | `app/(seeker)/accepted/page.tsx` | Check if stub |
| `/not-selected` | `app/(seeker)/not-selected/page.tsx` | Check if stub |

Read each file before starting. Confirm which are truly stubs vs functional.

---

## Task 1: `/home` — real match feed

The seeker home page imports `getMatchedListings` from `components/seeker`. This is currently a stub.

**What to build:**

`getMatchedListings` should return live listings ranked by match score for the seeker. The scoring logic already exists in `packages/db/src/lib/matchScore.ts` (added in wave-10). Read it to understand the inputs.

Pattern:
1. Read the seeker's `desired_categories`, `desired_roles`, `housing_preference`, `meals_preference`, `pay_expectation_min_cents` from `getSeekerProfile(token, userId)` (exported from `@explore-and-earn/db`)
2. Call `getPublicListings()` to get live listings (or `searchListings` with category filter)
3. Filter to listings the seeker has NOT already applied to or saved (use `getSeekerApplicationIds` and `getSavedListingIds`)
4. Score each listing using the `matchScore` utility from `packages/db/src/lib/matchScore.ts`
5. Sort descending by score, return top 20

**Where the logic lives:** This should be a server component data function in `apps/web/components/seeker/` or directly in the page. Do NOT add query functions to `packages/db` — compose from what's already exported.

The home page already has `PrimaryActionCard`, `LifecycleList`, `BucketChips`, `StatusStrip`, `SectionHeading`, `getSeekerStatus`, `getPrimaryActionInput` — read the file to understand what data each needs and wire them up.

---

## Task 2: `/schedule` — availability calendar

Read `apps/web/app/(seeker)/schedule/page.tsx` and `apps/web/components/seeker/schedule.ts`.

The seeker profile already stores `availability_start`, `availability_end` (timestamp columns). Build a real schedule surface:
- Display the seeker's current availability window (read from `getSeekerProfile`)
- Allow updating it (server action that updates `availability_start`, `availability_end`, `availability_status`)
- The server action goes in `apps/web/app/actions/seekerSettings.ts` (file already exists — add to it)

Keep it simple: a start-date picker, end-date picker, and an "availability status" select (`available` / `not_available` / `flexible`). No calendar widget — native `<input type="date">` is fine.

---

## Task 3: `/travel` — travel preferences

Read the travel page and `components/seeker/travel.ts`.

`seeker_profiles` already has `travel_readiness` (text) and `location_pref` (text) columns. Wire a form that:
- Shows current `travel_readiness` and `location_pref`
- Allows updating them via a server action (add to `seekerSettings.ts`)
- `travel_readiness` options: `'ready_now' | 'flexible' | 'planning' | 'not_looking'`

---

## Task 4: `/notifications` — mark as read

Read `apps/web/app/(seeker)/notifications/page.tsx`.

The notification feed likely already renders. Add:
1. A "Mark all as read" button that calls a server action
2. Server action: `markAllNotificationsReadAction()` in `apps/web/app/actions/notifications.ts` (file already exists — check what's in it and add to it)
3. The DB function `markAllNotificationsRead(token, userId)` is likely already exported from `@explore-and-earn/db` — check. If not, read `packages/db/src/queries/notifications.ts` and see if there's a `markRead` or `markAllRead` function to call from the action.

---

## Task 5: `/settings` — notification preferences

Read `apps/web/app/(seeker)/settings/page.tsx`.

`seeker_profiles` has `email_on_invite`, `email_on_status_change`, `email_on_message` boolean columns (added in migration 019). The `getNotificationPrefs` and `updateNotificationPrefs` functions are exported from `@explore-and-earn/db`.

Wire the settings page:
- Read current prefs with `getNotificationPrefs(token, userId)` in the server component
- Render three toggle switches labeled "Email me when I receive an invite", "Email me on application status changes", "Email me when I receive a message"
- Save via a server action that calls `updateNotificationPrefs` (in `apps/web/app/actions/notificationPrefs.ts` — this file exists, check it)

---

## Task 6: Seeker accepted / not-selected pages

Read `apps/web/app/(seeker)/accepted/page.tsx` and `apps/web/app/(seeker)/not-selected/page.tsx`.

These are lifecycle bucket pages. If they're stubs, wire them the same way as `/offered` — call `getSeekerApplicationsWithListings` (exported from `@explore-and-earn/db`), filter by status (`accepted` or `not_selected`/`rejected`), render using the existing `ApplicationCard` and `BucketPage` components from `components/seeker`.

---

## Rules

- `userId` MUST come from `auth().userId` — never decoded from JWT
- `getToken({ template: "supabase" })` for all Supabase queries
- `export const dynamic = "force-dynamic"` on every server component that calls Supabase
- CSS custom properties only — no hardcoded colors
- `<Icon name="domain.name" size={16|20|24} />` only
- HOUSING / MEALS / PAY triad — never "Perks"
- Do NOT touch: `packages/db/src/`, `supabase/migrations/`, host files, admin files

---

## Delivery

Single PR: `feat(seeker): complete seeker experience — home match feed, schedule, travel, settings, lifecycle pages`
