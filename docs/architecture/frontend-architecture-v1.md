# Frontend Architecture & App Shell — V1 Build Pack

> **DRAFT — DO NOT MERGE. DO NOT IMPLEMENT FEATURES.** This Build Pack prepares the `apps/web` frontend foundation — route architecture, app shells, navigation model, surface patterns, overlay (modal/sheet/drawer/popover) system, state model, and implementation sequencing — so VS Code / Copilot / Codex / Cursor agents can build against a fixed map. It is **planning + app-shell scaffolding only**. No dashboards, no auth, no live data, no DB/API, no Stripe, no matching, no messaging, no notifications.
>
> **Source of truth.** Notion is product/UX canon; this repo mirrors it. Primary canon: *Canonical Page Registry & Route Architecture*, *Navigation Architecture Doctrine*, *UX Surface Inventory*, *Popup Architecture & Modal Families*, *Component Inventory Mapping — Phase A*, *Design Tokens & Visual System — V1*, *Discovery Card V1*. Repo mirrors: [`docs/design/`](../design), [`docs/product/`](../product). **Nothing is invented.** Anything unconfirmed against canon is marked `TODO(?)` and routed to the founder approval queue.

## 0. How to read this pack

| Doc | Answers |
| --- | --- |
| this file | scope, build order, what-not-to-build, founder gates, the 10 mission answers |
| [`../ux/route-map.md`](../ux/route-map.md) | top-level routes, Next route groups, proposed paths |
| [`../ux/app-shell-and-navigation.md`](../ux/app-shell-and-navigation.md) | required layouts/shells + per-scope navigation |
| [`../ux/surface-inventory.md`](../ux/surface-inventory.md) | page/surface inventory + reusable surface patterns |
| [`../ux/modal-sheet-system.md`](../ux/modal-sheet-system.md) | overlay families, escalation, ModalHost contract |
| [`../ux/states.md`](../ux/states.md) | empty / loading / error / locked / restricted states |

## 1. Scope (this pack only)

**In scope:** route architecture, Next App Router route groups, app-shell layouts, navigation models per audience, reusable surface patterns, the overlay system contract, the shared state model, responsive doctrine, and the implementation sequence. Plus thin, non-functional **app-shell scaffolding** (route-group `layout.tsx` shells + placeholder shell chrome) so the structure compiles and is ready to fill.

**Explicitly out of scope (forbidden here):** full Discovery Card build, dashboards, auth/session flows, live data, DB/API calls, Stripe/billing, matching, messaging, notifications, and any `page.tsx` *feature* surface. See §4 and `AGENTS.md` §4.

## 2. Operating model recap

Notion decides · GitHub builds · Figma shows · everything else runs. `packages/ui` = shared primitive truth, `packages/contracts` = typed product truth, `apps/web` = the Next app shell + surfaces. App-shell chrome that is app-specific (header, bottom nav, overlay host) lives in `apps/web/components/shell` — **not** in `packages/ui` (which holds reusable primitives only).

## 3. Build order context

Per `AGENTS.md` §3: Sprint Zero → Design System V1 → Discovery Card V1 → Database V1 → feature surfaces. This pack is the **app-shell readiness layer** that sits beside Design System V1 (PR #5) and ahead of Discovery Card V1: it fixes *where* surfaces live and *how* they are framed, so the Discovery Card and feature surfaces have a home.

## 4. What agents must NOT build yet

Until a scoped, founder-approved Build Pack exists per surface, do **not**:

- implement any `page.tsx` feature surface (dashboards, discovery feed, swipe, map, listing detail, editors, queues, community, demo dashboard);
- build the full `<DiscoveryCard />` (only the contract + design spec exist today);
- add auth guards, session reads, role gating, or redirects in layouts;
- fetch data, call APIs, or import `apps/web/services/*` runtime logic into shells;
- wire Stripe, matching, messaging, notifications, or analytics emission;
- render real Streamline icons by committing licensed assets (guardrail G30 / A-ICON-LICENSE — use registry placeholders);
- introduce a new top-level route group or route name not present in the Canonical Page Registry without flagging it first.

## 5. Founder approval gates raised by this pack

Route into [`../source-of-truth/founder-approval-queue.md`](../source-of-truth/founder-approval-queue.md):

1. **A-FE-ROUTE-SLUGS** — the Canonical Page Registry names surfaces but does not pin URL path strings. All proposed slugs in `route-map.md` are `TODO(?)` until the founder confirms verbatim paths.
2. **A-FE-MARKETING-SPLIT** — registry has one "Public / Logged-Out" bucket but the repo has both `(marketing)` and `(public)` groups. Proposed split must be confirmed.
3. **A-FE-COMMUNITY-GROUP** — Community surfaces (Feed, Photo Post Detail, Host Announcement Detail, Platform Post/Blog Detail) are registered but there is **no** `(community)` route group in the repo. Need a decision: new group vs nest under `(public)`/`(seeker)`.
4. **A-FE-SEEKER-NAV-ORDER** — Navigation Doctrine and UX Surface Inventory disagree on seeker bottom-nav order (Seek/Swipe/Map/Saved vs Swipe/Map/Seek/Profile). Founder must lock the order.
5. **A-FE-LISTING-DETAIL-MODE** — whether authenticated Listing Detail is a route, a modal, or both (canon shows a Discovery Card Detail Popup *and* a public detail page). Needs reconciliation.
6. **A-FE-DEMO-TIER-ROUTING** — Demo Host Dashboard has Starter/Professional/Enterprise variants; route shape (`/demo/host/[tier]` vs separate paths) unconfirmed.

Gates already owned elsewhere (auth, pricing/plans, schema, payments, verification, permissions/RLS, icon licensing) are untouched here.

## 6. The ten mission answers (summary)

1. **Top-level routes (V1):** six audience route groups — `(marketing)`, `(public)`, `(seeker)`, `(host)`, `(admin)`, `(demo)` — plus `app/api` (owned by the backend track). Full table in `route-map.md`.
2. **Page groups:** the six Next route groups above already exist as folders; this pack defines their contents and adds shell layouts. Community is an open gap (gate A-FE-COMMUNITY-GROUP).
3. **Layouts/shells:** root layout (exists) + one shell layout per route group (added as placeholders). Shells supply chrome only — header, audience nav, overlay host — never data/auth. See `app-shell-and-navigation.md`.
4. **Navigation:** distinct models per audience (global marketing nav, public discovery nav, seeker bottom nav + more-hub, host bottom nav + More, admin queue nav). Detailed in `app-shell-and-navigation.md`.
5. **Reusable surface patterns:** PageShell/PageHeader, DiscoveryFeed, FilterBar, CardGrid/Rail, DetailLayout, DashboardLayout, QueueLayout, ListPane+DetailPane, Empty/Loading/Error/Locked states. See `surface-inventory.md`.
6. **Overlay system:** one ModalHost overlay router with five form-factors (modal, bottom sheet, drawer, popover, fullscreen) and five behavior families. See `modal-sheet-system.md`.
7. **Empty/loading/error states:** a shared, non-color-only state model (default · loading · empty · error · locked · restricted) reusing `Skeleton` + `Meter` neutrality rules. See `states.md`.
8. **Frontend code before features:** shell layouts, shell chrome placeholders (`AppHeader`, `BottomNav`, `ModalHost`), the overlay router contract, and shared surface-pattern stubs — all non-functional. Feature `page.tsx` files come later, per surface.
9. **Do not build yet:** see §4.
10. **Founder approval:** see §5.

## 7. Implementation sequencing (recommended)

1. **Lock canon gaps** (§5 gates) — especially route slugs, marketing/public split, community group, seeker nav order.
2. **Land app shells** — finalize the route-group layouts added here once tokens (PR #5) merge.
3. **Build shell chrome** — `AppHeader`, `BottomNav`, `ModalHost` against canon, using `packages/ui` primitives + the Streamline registry only.
4. **Build shared surface patterns** — PageShell/PageHeader/Empty/Loading/Error/Locked as `packages/ui` primitives where reusable.
5. **Discovery Card V1** — implement `<DiscoveryCard />` (its own Build Pack).
6. **Feature surfaces** — one Build Pack → issue → PR per surface, in audience order (public discovery → seeker → host → admin → demo → community).

Each step is its own `ready-for-engineering` issue + PR; nothing merges without founder review + local VS Code verification.
