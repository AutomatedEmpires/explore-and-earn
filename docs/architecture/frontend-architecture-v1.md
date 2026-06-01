# Frontend Architecture & App Shell — V1 Build Pack

> **DRAFT — DO NOT MERGE. DO NOT IMPLEMENT FEATURES.** This Build Pack prepares the `apps/web` frontend foundation — route architecture, app shells, navigation model, surface patterns, overlay (modal/sheet/drawer/popover) system, state model, typed foundations, and implementation sequencing — so VS Code / Copilot / Codex / Cursor agents can build against a fixed map. It is **planning + app-shell scaffolding only**. No dashboards, no auth, no live data, no DB/API, no Stripe, no matching, no messaging, no notifications.
>
> **Source of truth.** Notion is product/UX canon; this repo mirrors it. Primary canon: *Canonical Page Registry & Route Architecture*, *Navigation Architecture Doctrine*, *UX Surface Inventory*, *Popup Architecture & Modal Families*, *Component Inventory Mapping — Phase A*, *Design Tokens & Visual System — V1*, *Discovery Card V1*. Repo mirrors: [`docs/design/`](../design), [`docs/product/`](../product). **Nothing is invented.** Founder decisions are recorded in §5.

## 0. How to read this pack

| Doc | Answers |
| --- | --- |
| this file | scope, build order, what-not-to-build, founder decisions, the 10 mission answers, typed foundations |
| [`../ux/route-map.md`](../ux/route-map.md) | top-level routes, Next route groups, **locked** paths |
| [`../ux/app-shell-and-navigation.md`](../ux/app-shell-and-navigation.md) | required layouts/shells + per-scope navigation |
| [`../ux/surface-inventory.md`](../ux/surface-inventory.md) | page/surface inventory + reusable surface patterns |
| [`../ux/surface-component-map.md`](../ux/surface-component-map.md) | per-surface map: route → pattern → primitives → contracts → overlays → states |
| [`../ux/modal-sheet-system.md`](../ux/modal-sheet-system.md) | overlay families, escalation, ModalHost contract |
| [`../ux/states.md`](../ux/states.md) | empty / loading / error / locked / restricted states |
| [`../agents/frontend-handoff-backlog.md`](../agents/frontend-handoff-backlog.md) | ordered, ready-for-engineering work items + per-item gates |

## 1. Scope (this pack only)

**In scope:** route architecture, Next App Router route groups, app-shell layouts, navigation models per audience, reusable surface patterns, the overlay system contract, the shared state model, responsive doctrine, the implementation sequence, and **typed, non-functional foundations** (route/nav/overlay registries) plus thin app-shell scaffolding so the structure compiles and is ready to fill.

**Explicitly out of scope (forbidden here):** full Discovery Card build, dashboards, auth/session flows, live data, DB/API calls, Stripe/billing, matching, messaging, notifications, and any `page.tsx` *feature* surface. See §4 and `AGENTS.md` §4.

## 2. Operating model recap

Notion decides · GitHub builds · Figma shows · everything else runs. `packages/ui` = shared primitive truth, `packages/contracts` = typed product truth, `apps/web` = the Next app shell + surfaces. App-shell chrome that is app-specific (header, bottom nav, overlay host, route/nav/overlay config) lives in `apps/web` — **not** in `packages/ui` (reusable primitives only) and **not** in `packages/contracts` (product/data types only).

## 3. Build order context

Per `AGENTS.md` §3: Sprint Zero → Design System V1 → Discovery Card V1 → Database V1 → feature surfaces. This pack is the **app-shell readiness layer** beside Design System V1 (PR #5) and ahead of Discovery Card V1: it fixes *where* surfaces live and *how* they are framed.

## 4. What agents must NOT build yet

Until a scoped, founder-approved Build Pack exists per surface, do **not**:

- implement any `page.tsx` feature surface (dashboards, discovery feed, swipe, map, listing detail, editors, queues, community, demo dashboard);
- build the full `<DiscoveryCard />` (only the contract + design spec exist today);
- add auth guards, session reads, role gating, or redirects in layouts;
- fetch data, call APIs, or import `apps/web/services/*` runtime logic into shells;
- wire Stripe, matching, messaging, notifications, or analytics emission;
- render real Streamline icons by committing licensed assets (guardrail G30 / A-ICON-LICENSE — use registry placeholders);
- introduce a new top-level route group or route name not present in the route map / Canonical Page Registry without flagging it first.

## 5. Founder decisions — LOCKED 2026-05-31

All six gates from the original draft are resolved:

1. **A-FE-ROUTE-SLUGS — RESOLVED.** Simple slugs approved (see `route-map.md`): `/explore`, `/opportunities/[slug]`, `/hosts/[slug]`, `/seeker(+/saved,/applications,/offers,/profile)`, `/host(+/listings,/applicants,/offers,/profile,/analytics)`, `/admin`, `/community`, `/demo(+/design-system,/discovery-card,/listing-detail,/seeker-dashboard,/host-dashboard)`. Registry surfaces outside this set are **registered but deferred**.
2. **A-FE-MARKETING-SPLIT — RESOLVED.** Keep both groups. `(marketing)` = landing/about/how-it-works/pricing/brand; `(public)` = explore, opportunity detail, host profile.
3. **A-FE-COMMUNITY-GROUP — RESOLVED.** `(community)` approved as a route group; **keep V1 light** (single `/community` feed). Do not let it become a feature rabbit hole before core marketplace surfaces work.
4. **A-FE-SEEKER-NAV-ORDER — RESOLVED.** Mobile seeker bottom nav: **Explore → Saved → Applications → Offers → Profile.** Community is **not** in the V1 seeker bottom nav.
5. **A-FE-LISTING-DETAIL-MODE — RESOLVED.** Dual mode: route `/opportunities/[slug]` for public/direct/share/SEO; modal/sheet over discovery context for in-app taps. One component, two containers.
6. **A-FE-DEMO-TIER-ROUTING — RESOLVED.** No Starter/Professional/Enterprise tiers in routes for V1. Use `/demo/design-system`, `/demo/discovery-card`, `/demo/listing-detail`, `/demo/seeker-dashboard`, `/demo/host-dashboard` (+ `/demo`).

Gates owned elsewhere (auth, pricing/plans, schema, payments, verification, permissions/RLS, icon licensing) remain untouched. One small open item: confirm the **"For Hosts"** logged-out nav target (`TODO(?)` in `nav.config.ts`) — marketing host landing vs `/host`.

## 6. The ten mission answers (summary)

1. **Top-level routes (V1):** locked in `route-map.md` across seven route groups.
2. **Page groups:** `(marketing)`, `(public)`, `(seeker)`, `(host)`, `(admin)`, `(community)`, `(demo)` — all present as folders with shell layouts; `app/api` is the backend track.
3. **Layouts/shells:** root layout (exists) + one shell layout per route group (placeholders). Chrome only — never data/auth. See `app-shell-and-navigation.md`.
4. **Navigation:** marketing/public global nav; **locked** seeker bottom nav (Explore/Saved/Applications/Offers/Profile); host bottom nav + More; admin queue nav; light community nav; isolated demo nav. Encoded as typed config in `components/shell/nav.config.ts`.
5. **Reusable surface patterns:** PageShell/PageHeader, DiscoveryFeed, FilterBar, CardGrid/Rail, DetailLayout (shared by listing route + overlay), DashboardLayout, QueueLayout, ListPane+DetailPane, state surfaces. See `surface-inventory.md` + per-surface `surface-component-map.md`.
6. **Overlay system:** one ModalHost overlay router, five form-factors, five behavior families, dual-mode listing detail. Contract in `modal-sheet-system.md`; typed registry in `components/shell/overlays.ts`.
7. **Empty/loading/error states:** shared non-color-only model. See `states.md`.
8. **Frontend code before features:** route-group shell layouts; shell chrome placeholders (`AppHeader`, `BottomNav`, `ModalHost`); and typed foundations — `lib/routes.ts` (locked paths), `components/shell/nav.config.ts` (nav models), `components/shell/overlays.ts` (overlay registry). All non-functional. See §8.
9. **Do not build yet:** see §4.
10. **Founder approval:** all six gates resolved (§5); per-surface gates tracked in the handoff backlog.

## 7. Implementation sequencing

Detailed, ordered work items with per-item Definition-of-Ready/Done and gates live in [`../agents/frontend-handoff-backlog.md`](../agents/frontend-handoff-backlog.md). High level:

1. **(done)** Lock canon gaps (§5) + ship typed foundations (§8).
2. **WI-FE-01** Shell chrome implementation (consume `nav.config`/`overlays`, focus management, Interaction Preservation).
3. **WI-FE-02** Shared surface-pattern primitives in `packages/ui`.
4. **WI-FE-03** Discovery Card V1.
5. **WI-FE-04–08** Feature surfaces in audience order (public → seeker → host → admin → demo/community-light), one Build Pack → issue → PR each.

Nothing merges without founder review + local VS Code verification.

## 8. Typed foundations shipped (non-functional)

These are the pre-feature code modules agents import so they never hardcode or reinvent structure. They are pure types/config — no data, auth, rendering behavior, or analytics.

| Module | Provides | Rule |
| --- | --- | --- |
| `apps/web/lib/routes.ts` | `routes` (locked static paths), `dynamicRoutes` (param builders), `RouteGroup` | import paths from here; never hardcode strings |
| `apps/web/components/shell/nav.config.ts` | `NavItem`, `seekerBottomNav` (LOCKED order), `hostBottomNav`, `publicGlobalNav`, `navByGroup` | nav models are config, not hardcoded JSX |
| `apps/web/components/shell/overlays.ts` | `OverlayFormFactor`, `OverlayFamily`, `OverlayKey`, `OverlayDescriptor`, `overlayRegistry` | ModalHost consumes this; one overlay system, no bespoke modals |

The shell chrome (`AppHeader`, `BottomNav`, `ModalHost`) stays a placeholder in this pack; WI-FE-01 wires it to these registries.
