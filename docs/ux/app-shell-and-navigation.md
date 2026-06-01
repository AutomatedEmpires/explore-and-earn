# App Shell & Navigation — V1 (LOCKED)

> Source: Notion *Navigation Architecture Doctrine*, *UX Surface Inventory*, *Canonical Page Registry*; **founder decisions locked 2026-05-31**. Shells provide **chrome only** (header, audience nav, overlay host). They must not read sessions, gate roles, fetch data, or contain dashboard logic — that arrives in later, surface-specific Build Packs.

## Shell layers

1. **Root layout** (`app/layout.tsx`, exists) — `<html>`/`<body>`, imports `tokens.css` (+ `primitives.css` per PR #5). Global, audience-agnostic.
2. **Route-group shell** (`app/(group)/layout.tsx`) — frames one audience: which header, which nav, whether the overlay host mounts. Shipped here as **non-functional placeholders**.
3. **Surface layout** (per-section, later) — e.g. host sub-section tabs, admin queue rail. Out of scope here.

## Required shells

| Route group | Shell responsibility | Primary nav pattern |
| --- | --- | --- |
| `(marketing)` | brand/landing chrome + footer | top global nav |
| `(public)` | public marketplace chrome + auth entry | top public nav |
| `(seeker)` | seeker app frame | **mobile bottom nav** (locked order below) |
| `(host)` | host app frame | **mobile bottom nav** + More popup; desktop side nav |
| `(admin)` | admin console frame | queue-oriented nav |
| `(community)` | community feed frame (light) | minimal; reachable from app, **not** seeker bottom nav |
| `(demo)` | demo frame (isolated, watermarked) | demo-scoped nav, no production actions |

## Navigation models

### Marketing / public global nav
Items: **Explore · For Hosts · Pricing · About · Sign In · Get Started.** Persistent top bar. `(marketing)` carries brand/landing/about/how-it-works/pricing; `(public)` carries explore, opportunity detail, host profile. Footer carries Trust & Safety, About, legal/IA.

### Seeker bottom nav (mobile-first) — LOCKED (A-FE-SEEKER-NAV-ORDER)
Exact order:
1. **Explore** → `/explore`
2. **Saved** → `/seeker/saved`
3. **Applications** → `/seeker/applications`
4. **Offers** → `/seeker/offers`
5. **Profile** → `/seeker/profile`

**Community is NOT in the V1 seeker bottom nav.** Deferred seeker surfaces (Swipe, Map, Invites, Accepted, Travel, Messages, Schedule, Resume, Journey) are reached later via the profile/more hub, not the primary bar.

### Host nav
Mobile bottom nav (per Navigation Doctrine; not separately re-locked): **Home · Listings · Applicants · Analytics · More.** "More" opens the **Host More popup**; V1 host routes Offers (`/host/offers`) and Profile (`/host/profile`) are reachable via More / header. Desktop may promote these into a persistent side nav.

### Admin nav
Queue-oriented. V1 ships `/admin` only; sub-queues (Critical/Reports/Moderation/Verification/Refunds/Disputes/Users/Billing/Content/Analytics/Management) are deferred but registered.

### Community nav
Light. Single `/community` feed surface in V1. Accessible from the app (e.g. header/more), **never** the seeker bottom nav. Keep minimal until core marketplace surfaces work.

### Demo nav
Mirrors host/seeker visuals but is **isolated**: no production side effects, isolated telemetry, persistent "demo" affordance, convert-to-signup CTA. V1 demo routes: `/demo`, `/demo/design-system`, `/demo/discovery-card`, `/demo/listing-detail`, `/demo/seeker-dashboard`, `/demo/host-dashboard`. No tier routing.

## Responsive doctrine (mobile-first)

- **Mobile is the design target.** Large tap targets (buttons ≥ 44px, chips ≥ 36px per PR #5), vertical hierarchy, bottom action rows, media-forward cards, bottom-sheet escalation for actions/filters/detail.
- **Desktop (≥ 1024):** denser metadata, hover quick actions, side-by-side list+detail panes, side nav for host/admin, quick-peek popovers.
- Breakpoints come from the locked token set (`--breakpoint-*`); never hardcode widths.
- **Interaction Preservation Rule (locked):** opening/closing an overlay must restore the exact prior scroll / card / map position. This is essential to the dual-mode listing detail (in-app tap = overlay). Shells must not remount surfaces on overlay open. See [`modal-sheet-system.md`](./modal-sheet-system.md).

## Shell scaffolding shipped in this pack

- `app/(group)/layout.tsx` for all seven groups (incl. `(community)`) — render `{children}` inside a `data-shell` wrapper, with TODO markers pointing here. **No** data/auth/nav logic yet.
- `apps/web/components/shell/{AppHeader,BottomNav,ModalHost}.tsx` — non-functional placeholders the shells will compose later. `BottomNav` carries the locked seeker order.
