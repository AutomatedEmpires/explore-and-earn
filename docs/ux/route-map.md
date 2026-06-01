# Route Map — V1 (proposed)

> Source: Notion *Canonical Page Registry & Route Architecture* + the existing `apps/web/app` route groups. **The registry names surfaces but does not pin URL strings**, so every path below is **proposed** and marked `TODO(?)` pending founder confirmation (gate **A-FE-ROUTE-SLUGS**). Do not create `page.tsx` files from this table yet — it defines the map, not the implementation.

## Route groups (Next App Router)

Existing folders: `(marketing)`, `(public)`, `(seeker)`, `(host)`, `(admin)`, `(demo)`, plus `app/api` (backend track). Route groups do **not** affect the URL path; they scope layout + nav chrome. Community has **no** group yet (gate **A-FE-COMMUNITY-GROUP**).

## `(marketing)` — content & conversion (logged-out)

| Surface (canon) | Proposed path | Notes |
| --- | --- | --- |
| Homepage | `/` | currently `app/page.tsx`; decide if it moves into `(marketing)` (gate A-FE-MARKETING-SPLIT) |
| Pricing Page | `/pricing` | canonical pricing locked in registry |
| About Page | `/about` | |
| Trust & Safety Page | `/trust-safety` | |

## `(public)` — public app surfaces + auth entry (logged-out/limited)

| Surface (canon) | Proposed path | Notes |
| --- | --- | --- |
| Browse Listings | `/browse` | public discovery preview |
| Listing Detail Public View | `/listings/[listingId]` | public-safe detail (gate A-FE-LISTING-DETAIL-MODE) |
| Host Profile Public View | `/hosts/[hostId]` | |
| Sign In | `/signin` | **shell/route only — no auth logic** |
| Sign Up Role Choice | `/signup` | seeker/host choice; **no auth logic** |

## `(seeker)` — authenticated seeker app

| Surface (canon) | Proposed path |
| --- | --- |
| Seeker Dashboard Home | `/seeker` |
| Seek Discovery | `/seek` |
| Swipe Discovery | `/swipe` |
| Map Discovery | `/map` |
| Saved Listings | `/saved` |
| Applied Listings | `/applied` |
| Invites | `/invites` |
| Offers | `/offers` |
| Accepted Roles | `/accepted` |
| Travel Plans | `/travel` |
| Messages | `/messages` |
| Schedule | `/schedule` |
| Resume Builder | `/resume` |
| Seeker Profile Settings | `/settings` |
| Journey Map | `/journey` |

## `(host)` — authenticated host app

| Surface (canon) | Proposed path |
| --- | --- |
| Host Dashboard Home | `/host` |
| Host Listings | `/host/listings` |
| Listing Editor | `/host/listings/new`, `/host/listings/[listingId]/edit` |
| Host Applicants | `/host/applicants` |
| Matched Seekers | `/host/matched` |
| Host Saved Seekers | `/host/saved` |
| Host Skipped Seekers | `/host/skipped` |
| Host Offers | `/host/offers` |
| Host Messages | `/host/messages` |
| Host Scheduling | `/host/scheduling` |
| Host Analytics | `/host/analytics` |
| Host Profile Editor | `/host/profile` |
| Host Announcements | `/host/announcements` |
| Billing / Plan / Add-Ons | `/host/billing` |
| Host Team | `/host/team` |
| Host Settings | `/host/settings` |

## `(admin)` — admin console

| Surface (canon) | Proposed path |
| --- | --- |
| Admin Dashboard Home | `/admin` |
| Critical Queue | `/admin/critical` |
| Reports Queue | `/admin/reports` |
| Moderation Cases | `/admin/moderation` |
| Verification Queue | `/admin/verification` |
| Refund Reviews | `/admin/refunds` |
| Disputes | `/admin/disputes` |
| Users & Restrictions | `/admin/users` |
| Billing Support | `/admin/billing` |
| Content CMS | `/admin/content` |
| Admin Analytics | `/admin/analytics` |
| Admin Management | `/admin/management` |

## `(demo)` — pre-signup tour

| Surface (canon) | Proposed path | Notes |
| --- | --- | --- |
| Demo Host Dashboard | `/demo/host` | Starter/Professional/Enterprise variants — route shape `TODO(?)` (gate A-FE-DEMO-TIER-ROUTING). No production side effects; isolated telemetry. |

## Community — REGISTERED BUT UNHOUSED `TODO(?)`

Canon surfaces with no route group yet (gate **A-FE-COMMUNITY-GROUP**): Community Feed, Photo Post Detail, Host Announcement Detail, Platform Post / Blog Detail. Decision needed: new `(community)` group vs nest under `(public)`/`(seeker)`.

## Overlay surfaces (not routes)

The registry's popup/drawer/modal surfaces are **not** routes; they are rendered by the overlay system. See [`modal-sheet-system.md`](./modal-sheet-system.md).
