# Surface → Component → Contract Map — V1

> Source: Notion *Component Inventory Mapping — Phase A*, *UX Surface Inventory*, *Discovery Card V1*; cross-referenced with `packages/ui` and `packages/contracts`. **Founder routes locked 2026-05-31.** This map tells a feature agent, for each V1 surface: the route, the layout pattern, the `packages/ui` primitives to reuse, the `packages/contracts` types to bind, the overlays it triggers, and the states it must handle. **No implementation here** — it prevents reinvention.
>
> Contract notes: types on `main` today = `enums`, `events`, `lifecycles`, `permissions`, `pricing`. Types pending **PR #4** = `discovery-card`, `categories`, `benefits`, `trust`, `media` — marked `TODO(PR#4)` where a surface depends on them.

## Legend

- **Pattern** → from [`surface-inventory.md`](./surface-inventory.md).
- **Primitives** → `packages/ui/src` (today: `Card`, `Modal`, `VerifiedHostBadge`, `FoundingCountdown`, `icons/`; + PR #5 `ui-*` styled primitives).
- **Overlays** → keys from [`modal-sheet-system.md`](./modal-sheet-system.md) / `components/shell/overlays.ts`.
- **States** → from [`states.md`](./states.md): `default,loading,empty,error,locked,restricted`.

## (public)

| Surface | Route | Pattern | Primitives | Contracts | Overlays | Key states |
| --- | --- | --- | --- | --- | --- | --- |
| Explore | `/explore` | DiscoveryFeed + FilterBar | DiscoveryCard*, Card, chips, VerifiedHostBadge | `categories` TODO(PR#4), `discovery-card` TODO(PR#4) | listingDetail, quickPeek, matchScoreExplanation | loading(skeleton feed), empty(no matches), error |
| Opportunity Detail | `/opportunities/[slug]` | DetailLayout | MediaFrame*, BenefitChip*, VerifiedHostBadge, ActionRow* | `discovery-card` TODO(PR#4), `media` TODO(PR#4), `trust` TODO(PR#4) | hostProfile, housingMedia, mealsMedia, scheduling, reportPipeline | default, loading, error, restricted(auth-gated apply) |
| Host Profile | `/hosts/[slug]` | DetailLayout | VerifiedHostBadge, Card, MediaFrame* | `trust` TODO(PR#4), `media` TODO(PR#4) | hostPhotoCarousel, listingDetail | default, loading, error |

## (seeker)

| Surface | Route | Pattern | Primitives | Contracts | Overlays | Key states |
| --- | --- | --- | --- | --- | --- | --- |
| Seeker Home | `/seeker` | DashboardLayout | Card, CardRail | `lifecycles`, `discovery-card` TODO(PR#4) | listingDetail, discoveryCardDetail | loading, empty(new user), error |
| Saved | `/seeker/saved` | CardGrid | DiscoveryCard*, Card | `discovery-card` TODO(PR#4) | listingDetail, quickPeek | empty(no saves), loading |
| Applications | `/seeker/applications` | CardGrid / ListPane+DetailPane | Card, status chips | `lifecycles` (application states) | listingDetail, messaging | empty, loading, error |
| Offers | `/seeker/offers` | CardGrid | Card, status chips | `lifecycles` (offer states) | listingDetail, scheduling, messaging | empty, loading, locked(action gated) |
| Profile | `/seeker/profile` | PageShell + sections | form primitives (PR #5) | `permissions`, `trust` TODO(PR#4) | seekerProfile, seekerResume | default, loading, error |

## (host)

| Surface | Route | Pattern | Primitives | Contracts | Overlays | Key states |
| --- | --- | --- | --- | --- | --- | --- |
| Host Home | `/host` | DashboardLayout | Card, CardRail, FoundingCountdown | `lifecycles`, `pricing` | hostMore, getMoreListings | loading, empty, error |
| Listings | `/host/listings` | CardGrid / ListPane+DetailPane | DiscoveryCard*, Card | `discovery-card` TODO(PR#4), `categories` TODO(PR#4) | listingDetail, boostListing(gated), getMoreListings | empty(no listings), loading, locked(plan limit) |
| Applicants | `/host/applicants` | ListPane+DetailPane | Card, VerifiedHostBadge, match meter* | `lifecycles`, `permissions` | seekerProfile, seekerResume, matchScoreExplanation, messaging | empty, loading, restricted |
| Offers | `/host/offers` | CardGrid | Card, status chips | `lifecycles` | scheduling, messaging | empty, loading, locked |
| Profile | `/host/profile` | PageShell + sections | form primitives, VerifiedHostBadge | `trust` TODO(PR#4), `media` TODO(PR#4) | hostProfile, coverPhotoBucket, iconPhotoBucket, hostPhotoCarousel | default, loading, error |
| Analytics | `/host/analytics` | DashboardLayout (charts) | Card, chart primitives (TODO) | `events` | upgradeProfessional(gated), upgradeEnterprise(gated) | loading, empty(no data yet), locked(tier-gated) |

## (admin)

| Surface | Route | Pattern | Primitives | Contracts | Overlays | Key states |
| --- | --- | --- | --- | --- | --- | --- |
| Admin Home | `/admin` | QueueLayout (overview) | Card, status chips | `permissions`, `lifecycles` | adminProfile, reportPipeline | loading, empty(queue clear), restricted(role) |

> Admin sub-queues are deferred; when slugged they reuse QueueLayout + ListPane+DetailPane.

## (community) — light

| Surface | Route | Pattern | Primitives | Contracts | Overlays | Key states |
| --- | --- | --- | --- | --- | --- | --- |
| Community | `/community` | feed (minimal) | Card, MediaFrame* | `media` TODO(PR#4) | hostPhotoCarousel | empty, loading |

## (demo) — isolated, no production side effects

| Surface | Route | Notes |
| --- | --- | --- |
| Demo Home | `/demo` | tour entry; convert-to-signup CTA |
| Design System | `/demo/design-system` | render PR #5 tokens/primitives |
| Discovery Card | `/demo/discovery-card` | render DiscoveryCard* variants |
| Listing Detail | `/demo/listing-detail` | render DetailLayout (route + overlay modes) |
| Seeker Dashboard | `/demo/seeker-dashboard` | DashboardLayout showcase |
| Host Dashboard | `/demo/host-dashboard` | DashboardLayout showcase |

`*` = component to be built in a later Build Pack (Discovery Card V1 and shared-pattern packs). Do not build here.
