# Seeker lane (`apps/web/app/(seeker)`)

Mobile-first seeker command center. Server components, fixtures-only (Sprint Zero).
Grounded in the Seeker Dashboard Spec, Home Wireframe, and Nav/Cards/Popups canon.

## Routes

### Phase A — Home + application lifecycle
- `/home` — adventure status strip, primary next action, matched preview, bucket chips
- `/saved` `/applied` `/offered` `/accepted` `/not-selected` `/invites` — lifecycle buckets

### Phase B — Profile & account
- `/resume` — resume completion (neutral Meter) + section checklist + apply gate
- `/settings` — account, notification, privacy, and account-control groups
- `/notifications` — invites, offers, matches, reminders feed
- `/help` — support, safety, application, and account help

## Conventions
- Lane-local components live in `apps/web/components/seeker` with a barrel `index.ts`.
- All UI primitives come from `@explore-and-earn/ui` (DiscoveryCard, Icon, Meter, etc.). Frozen `packages/ui/src` and `packages/contracts` are never edited here.
- Styling uses CSS modules + semantic tokens only. `px` appears only in media-query breakpoints.
- No matching/scoring logic — relevance is display-only via the neutral Meter.
- Bottom navigation (Swipe · Map · Seek · Profile) is founder-locked and owned by the App Shell lane; it is intentionally not rendered here.

## Not yet built
- Phase C: Messages, Schedule, Travel Plans, Journey Map, Community Activity
- Phase D: `/seek`, `/swipe`, `/map` (coordinating `/discover` with the discovery lane)
