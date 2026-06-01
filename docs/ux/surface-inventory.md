# Surface Inventory & Reusable Patterns — V1

> Source: Notion *UX Surface Inventory*, *Canonical Page Registry*, *Component Inventory Mapping — Phase A*, *Discovery Card V1*; **founder decisions locked 2026-05-31**. Defines the surfaces and the **reusable patterns** they compose, so feature agents reuse instead of reinventing. One component system across all categories — vary imagery + accent, never fork (AGENTS.md §6).

## Surface taxonomy

| Type | Examples | Frame |
| --- | --- | --- |
| Marketing/brand | Landing, About, How It Works, Pricing | full-bleed sections + global nav/footer |
| Public marketplace | Explore (`/explore`), Opportunity Detail (`/opportunities/[slug]`), Host Profile (`/hosts/[slug]`) | DiscoveryFeed / DetailLayout |
| Seeker (V1) | Seeker Home, Saved, Applications, Offers, Profile | DashboardLayout / CardGrid + state model |
| Host (V1) | Host Home, Listings, Applicants, Offers, Profile, Analytics | DashboardLayout / ListPane+DetailPane |
| Admin (V1) | Admin Home (sub-queues deferred) | QueueLayout |
| Community (V1, light) | Community feed (`/community`) | feed (keep minimal) |
| Demo | `/demo` + design-system / discovery-card / listing-detail / seeker-dashboard / host-dashboard | isolated showcases |

## Reusable surface patterns (to define as primitives/layouts)

| Pattern | Role | Likely home |
| --- | --- | --- |
| `PageShell` / `PageHeader` | consistent title, breadcrumb, primary action slot | `packages/ui` |
| `DiscoveryFeed` | scrollable card feed + filter slot (Explore) | feature surface using `<DiscoveryCard />` |
| `FilterBar` / filter chips | search/filter affordances; minimal typing | `packages/ui` (chips exist) |
| `CardGrid` / `CardRail` | responsive card layouts for pipeline + dashboards | `packages/ui` |
| `DetailLayout` | media + summary + actions — **shared by listing-detail route AND overlay** | layout |
| `DashboardLayout` | greeting/status + rails + quick stats (seeker/host/demo) | layout |
| `QueueLayout` | admin queue list + case detail | layout |
| `ListPane` + `DetailPane` | desktop side-by-side master/detail | layout |
| `EmptyState` / `LoadingState` / `ErrorState` / `LockedState` | shared non-feature states | `packages/ui` (see states.md) |

## Listing/Opportunity detail — one component, two containers

Per A-FE-LISTING-DETAIL-MODE, the detail surface renders identically whether it's the `/opportunities/[slug]` **route** (public/SEO/share) or the in-app **overlay** (discovery tap). Build one `DetailLayout`; the container (page vs modal/sheet) is the only difference. See [`modal-sheet-system.md`](./modal-sheet-system.md).

## Core primitive: Discovery Card

The Discovery Card is the central reused surface (Explore, Saved, Applications, Offers, host applicant review, community). **Do not build it in this pack** — its contract lives in `packages/contracts` (`DiscoveryCardProps`, 8 card zones, card states, events) and its design spec in [`../design/discovery-card-v1.md`](../design/discovery-card-v1.md). The non-negotiable **Housing / Meals / Pay** triad and the mandatory **Verified Host** badge are card law; never collapse the triad into "Perks."

## Community (V1) — keep light

A single `/community` feed surface in V1 (A-FE-COMMUNITY-GROUP). Detail pages are deferred. Community must not absorb effort before core marketplace surfaces work, and is excluded from the seeker bottom nav.

## Patterns that must NOT be forked

Badge stack, BenefitChip (triad), Verified Host badge, MediaFrame (frame-not-filter), Match meter (rendered **neutral**, never red/green). These are single-source primitives; surfaces pass props.
