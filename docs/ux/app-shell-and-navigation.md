# App Shell & Navigation — V1

> Source: Notion *Navigation Architecture Doctrine*, *UX Surface Inventory*, *Canonical Page Registry*. Shells provide **chrome only** (header, audience nav, overlay host). They must not read sessions, gate roles, fetch data, or contain dashboard logic — that arrives in later, surface-specific Build Packs.

## Shell layers

1. **Root layout** (`app/layout.tsx`, exists) — `<html>`/`<body>`, imports `tokens.css` (+ `primitives.css` per PR #5). Global, audience-agnostic.
2. **Route-group shell** (`app/(group)/layout.tsx`) — frames one audience: which header, which nav, whether the overlay host mounts. Added in this pack as **non-functional placeholders**.
3. **Surface layout** (per-section, later) — e.g. host sub-section tabs, admin queue rail. Out of scope here.

## Required shells

| Route group | Shell responsibility | Primary nav pattern |
| --- | --- | --- |
| `(marketing)` | global marketing chrome + footer | top global nav |
| `(public)` | public discovery chrome + auth entry | top public nav |
| `(seeker)` | seeker app frame | **mobile bottom nav** + more-hub |
| `(host)` | host app frame | **mobile bottom nav** + More popup; desktop side nav |
| `(admin)` | admin console frame | queue-oriented nav |
| `(demo)` | demo frame (isolated, watermarked) | demo-scoped nav, no production actions |

## Navigation models (from Navigation Doctrine)

### Marketing / public global nav
Items: **Explore · For Hosts · Pricing · About · Sign In · Get Started.** Persistent top bar; converts logged-out visitors. Footer carries Trust & Safety, About, legal/IA (see Footer/Static IA canon).

### Seeker bottom nav (mobile-first)
Primary tabs: **Seek · Swipe · Map · Saved/Profile hub.** `TODO(?)` — order conflict (Doctrine: Seek/Swipe/Map/Saved; UX Surface Inventory: Swipe/Map/Seek/Profile). Gate **A-FE-SEEKER-NAV-ORDER**. Secondary surfaces (Applied, Invites, Offers, Accepted, Travel, Messages, Schedule, Resume, Settings, Journey) reached via the profile/more hub, not the primary bar.

### Host nav
Mobile bottom nav: **Home · Listings · Applicants · Analytics · More.** "More" opens the **Host More popup** (Matches, Saved/Skipped Seekers, Messages, Scheduling, Offers, Announcements, Billing, Team, Settings, Help). Desktop may promote these into a persistent side nav.

### Admin nav
Queue-oriented: **Critical · Reports · Moderation · Verification · Refunds · Disputes · Users · Billing · Content · Analytics · Management.** Critical Queue is the default landing emphasis.

### Demo nav
Mirrors host nav visually but is **isolated**: no production side effects, isolated telemetry, persistent "demo" affordance, and a convert-to-signup CTA.

## Responsive doctrine (mobile-first)

- **Mobile is the design target.** Large tap targets (buttons ≥ 44px, chips ≥ 36px per PR #5), vertical hierarchy, bottom action rows, media-forward cards, bottom-sheet escalation for actions/filters/detail.
- **Desktop (≥ 1024):** denser metadata, hover quick actions, side-by-side list+detail panes, side nav for host/admin, quick-peek popovers.
- Breakpoints come from the locked token set (`--breakpoint-*`); never hardcode widths.
- **Interaction Preservation Rule (locked):** opening/closing an overlay must restore the exact prior scroll / card / map position. Shells must not remount surfaces on overlay open. See [`modal-sheet-system.md`](./modal-sheet-system.md).

## Shell scaffolding shipped in this pack

- `app/(group)/layout.tsx` for all six groups — render `{children}` inside a `data-shell` wrapper, with TODO markers pointing here. **No** data/auth/nav logic yet.
- `apps/web/components/shell/{AppHeader,BottomNav,ModalHost}.tsx` — non-functional placeholders the shells will compose later.
