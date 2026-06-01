# Surface Inventory & Reusable Patterns — V1

> Source: Notion *UX Surface Inventory*, *Canonical Page Registry*, *Component Inventory Mapping — Phase A*, *Discovery Card V1*. Defines the surfaces and the **reusable patterns** they compose, so feature agents reuse instead of reinventing. One component system across all categories — vary imagery + accent, never fork (AGENTS.md §6).

## Surface taxonomy

| Type | Examples | Frame |
| --- | --- | --- |
| Marketing/content | Homepage, Pricing, About, Trust & Safety | full-bleed sections + global nav/footer |
| Public discovery | Browse, public Listing Detail, public Host Profile | DiscoveryFeed / DetailLayout |
| Seeker discovery | Seek, Swipe, Map | DiscoveryFeed / SwipeStack / MapShell |
| Seeker pipeline | Saved, Applied, Invites, Offers, Accepted | CardGrid/Rail + state model |
| Seeker tools | Travel, Messages, Schedule, Resume, Settings, Journey | DetailLayout / form surfaces |
| Host operations | Dashboard, Listings, Applicants, Matched/Saved/Skipped, Offers, Analytics | DashboardLayout / ListPane+DetailPane |
| Host editors | Listing Editor, Profile Editor, Announcements, Billing, Team, Settings | form surfaces |
| Admin queues | Critical, Reports, Moderation, Verification, Refunds, Disputes, Users, Billing, Content, Management | QueueLayout |
| Community | Feed, Photo Post Detail, Announcement Detail, Blog Detail | feed + DetailLayout (unhoused — gate A-FE-COMMUNITY-GROUP) |
| Demo | Demo Host Dashboard (3 tiers) | DashboardLayout (isolated) |

## Reusable surface patterns (to define as primitives/layouts)

| Pattern | Role | Likely home |
| --- | --- | --- |
| `PageShell` / `PageHeader` | consistent title, breadcrumb, primary action slot | `packages/ui` |
| `DiscoveryFeed` | scrollable card feed + filter slot (Seek, Browse) | feature surface using `<DiscoveryCard />` |
| `FilterBar` / filter chips | search/filter affordances; minimal typing | `packages/ui` (chips exist) |
| `CardGrid` / `CardRail` | responsive card layouts for pipeline + dashboards | `packages/ui` |
| `DetailLayout` | media + summary + actions (listing/host/community detail) | layout |
| `DashboardLayout` | greeting/status + rails + quick stats (seeker/host/demo) | layout |
| `QueueLayout` | admin queue list + case detail | layout |
| `ListPane` + `DetailPane` | desktop side-by-side master/detail | layout |
| `EmptyState` / `LoadingState` / `ErrorState` / `LockedState` | shared non-feature states | `packages/ui` (see states.md) |

## Core primitive: Discovery Card

The Discovery Card is the central reused surface (Seek, Swipe, Map popup/drawer, Saved/Applied/Offered, host applicant review, community). **Do not build it in this pack** — its contract lives in `packages/contracts` (`DiscoveryCardProps`, 8 card zones, card states, events) and its design spec in [`../design/discovery-card-v1.md`](../design/discovery-card-v1.md). The non-negotiable **Housing / Meals / Pay** triad and the mandatory **Verified Host** badge are card law; never collapse the triad into "Perks."

## Patterns that must NOT be forked

Badge stack, BenefitChip (triad), Verified Host badge, MediaFrame (frame-not-filter), Match meter (rendered **neutral**, never red/green). These are single-source primitives; surfaces pass props.
