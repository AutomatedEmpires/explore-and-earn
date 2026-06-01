# Route Map — V1 (LOCKED)

> Source: Notion *Canonical Page Registry & Route Architecture* + the `apps/web/app` route groups. **Founder-locked 2026-05-31** — gates A-FE-ROUTE-SLUGS, A-FE-MARKETING-SPLIT, A-FE-COMMUNITY-GROUP, A-FE-LISTING-DETAIL-MODE, A-FE-DEMO-TIER-ROUTING are **resolved**. These are the **V1 routes**. Registry surfaces not listed here are **registered but deferred** (no V1 slug yet) and will be slugged in their own feature Build Packs. Do not create `page.tsx` files from this table yet — it defines the map, not the implementation.

## Route groups (Next App Router)

`(marketing)`, `(public)`, `(seeker)`, `(host)`, `(admin)`, `(demo)`, **`(community)` (newly approved — keep V1 light)**, plus `app/api` (backend track). Route groups do **not** affect the URL path; they scope layout + nav chrome.

## `(marketing)` — brand, landing & conversion (logged-out)

Scope (A-FE-MARKETING-SPLIT): landing / about / how-it-works / pricing / public brand pages.

| Surface | Path |
| --- | --- |
| Landing / Homepage | `/` |
| About | `/about` |
| How It Works | `/how-it-works` |
| Pricing | `/pricing` |

> Homepage currently lives at `app/page.tsx`; move it into `(marketing)` when the landing surface is built.

## `(public)` — public marketplace surfaces

Scope (A-FE-MARKETING-SPLIT): public marketplace surfaces — explore, opportunity detail, host profile.

| Surface | Path | Notes |
| --- | --- | --- |
| Explore (Browse) | `/explore` | public marketplace discovery |
| Opportunity Detail | `/opportunities/[slug]` | public / direct / share / SEO detail (dual-mode — see below) |
| Host Profile | `/hosts/[slug]` | public host profile |

## `(seeker)` — authenticated seeker app (V1)

| Surface | Path |
| --- | --- |
| Seeker Home | `/seeker` |
| Saved | `/seeker/saved` |
| Applications | `/seeker/applications` |
| Offers | `/seeker/offers` |
| Profile | `/seeker/profile` |

> Seeker discovery entry = `/explore` (the Explore tab). Swipe and Map are registered discovery modes, **deferred** for V1 (not separate routes).

## `(host)` — authenticated host app (V1)

| Surface | Path |
| --- | --- |
| Host Home | `/host` |
| Listings | `/host/listings` |
| Applicants | `/host/applicants` |
| Offers | `/host/offers` |
| Profile | `/host/profile` |
| Analytics | `/host/analytics` |

## `(admin)` — V1

| Surface | Path |
| --- | --- |
| Admin Home | `/admin` |

> Admin sub-queues (Critical, Reports, Moderation, Verification, Refunds, Disputes, Users, Billing Support, Content CMS, Analytics, Management) are registered, **deferred** for V1.

## `(community)` — V1 (keep light)

| Surface | Path |
| --- | --- |
| Community | `/community` |

> **A-FE-COMMUNITY-GROUP (approved, light).** V1 community is a single feed surface. Detail pages (Photo Post, Host Announcement, Platform Post/Blog) are registered, **deferred**. Do not let community become a feature rabbit hole before core marketplace surfaces work. Community is **not** in the V1 seeker bottom nav.

## `(demo)` — pre-signup tour (no tier routing)

| Surface | Path |
| --- | --- |
| Demo Home | `/demo` |
| Design System | `/demo/design-system` |
| Discovery Card | `/demo/discovery-card` |
| Listing Detail | `/demo/listing-detail` |
| Seeker Dashboard | `/demo/seeker-dashboard` |
| Host Dashboard | `/demo/host-dashboard` |

> **A-FE-DEMO-TIER-ROUTING (resolved).** Do **not** encode Starter/Professional/Enterprise tiers into the route structure for V1. No production side effects; isolated telemetry.

## Listing detail — dual mode (LOCKED: A-FE-LISTING-DETAIL-MODE)

- **Route:** `/opportunities/[slug]` — public / direct / share / SEO access (full page).
- **Overlay:** in-app discovery tap opens a **listing detail modal/sheet** over the discovery context, preserving scroll / card / map position (Interaction Preservation Rule). See [`modal-sheet-system.md`](./modal-sheet-system.md).

## Registered but deferred (no V1 slug)

Kept in the Canonical Page Registry; slug them in their feature Build Packs:

- **Seeker:** Swipe, Map, Invites, Accepted Roles, Travel Plans, Messages, Schedule, Resume Builder, Journey Map.
- **Host:** Listing Editor, Matched/Saved/Skipped Seekers, Messages, Scheduling, Announcements, Billing/Plan/Add-Ons, Team, Settings.
- **Admin:** Critical, Reports, Moderation, Verification, Refunds, Disputes, Users, Billing Support, Content CMS, Analytics, Management.
- **Community:** Photo Post Detail, Host Announcement Detail, Platform Post/Blog Detail.

## Overlay surfaces (not routes)

The registry's popup/drawer/modal surfaces are **not** routes; they are rendered by the overlay system. See [`modal-sheet-system.md`](./modal-sheet-system.md).
