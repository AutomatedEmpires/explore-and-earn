# Frontend Engineering Handoff Backlog — V1

> Companion to [`../architecture/frontend-architecture-v1.md`](../architecture/frontend-architecture-v1.md). Each item is a **ready-for-engineering** unit of work for VS Code / Copilot / Codex / Cursor agents. Follow `AGENTS.md` and `docs/agents/handoff-protocol.md`. **One Build Pack → one issue → one small PR.** Nothing merges without founder review + local verification. Items are ordered; do not jump ahead of dependencies.

## Conventions

- **DoR** = Definition of Ready (canon + contracts exist). **DoD** = Definition of Done (acceptance).
- Every item: cite Notion canon in the PR, use locked tokens (PR #5) + Streamline icon registry only, strict TS, no `any`, mobile-first.
- `GATE` = founder approval required before starting.

---

## WI-FE-00 — Land app-shell foundation (THIS PR #8)
- **Goal:** route groups, shell layouts, typed routes/nav/overlay registries, surface map, this backlog.
- **DoR:** route/nav/overlay/listing/demo decisions locked (done 2026-05-31).
- **DoD:** PR #8 verified locally (`typecheck`/`lint`/`build` green), still draft, no feature surfaces.
- **Do NOT:** add `page.tsx` feature surfaces, data, auth, icons.

## WI-FE-01 — Shell chrome implementation
- **Goal:** make `AppHeader`, `BottomNav`, `ModalHost` real chrome (still no feature data): render `nav.config` items, active-state, responsive header/bottom-nav, overlay portal + focus trap + Esc/Tab + ARIA.
- **Depends on:** WI-FE-00, PR #5 (tokens) merged.
- **DoR:** `nav.config.ts`, `overlays.ts`, states.md.
- **DoD:** every route group renders its shell; overlays open/close with focus management and Interaction Preservation (scroll/card/map restored); no real feature content; Storybook/demo route renders chrome.
- **Do NOT:** fetch data, gate by real session, emit analytics, render licensed icons.
- **GATE:** none (shell only) — but confirm "For Hosts" nav target (`TODO(?)` in `nav.config.ts`).

## WI-FE-02 — Shared surface-pattern primitives
- **Goal:** `PageShell`, `PageHeader`, `DetailLayout`, `DashboardLayout`, `QueueLayout`, `ListPane`+`DetailPane`, `CardGrid`/`CardRail`, `EmptyState`/`LoadingState`/`ErrorState`/`LockedState` in `packages/ui`.
- **Depends on:** WI-FE-01.
- **DoD:** each primitive is prop-driven, token-styled, has all `states.md` states, is non-color-only, and is demoed on `/demo/design-system`.
- **Do NOT:** embed feature/domain logic or data fetching in primitives.

## WI-FE-03 — Discovery Card V1
- **Goal:** build `<DiscoveryCard />` per `docs/design/discovery-card-v1.md` + `discovery-card` contract.
- **Depends on:** WI-FE-02; **PR #4** (`discovery-card`, `categories`, `benefits`, `trust`, `media` contracts) merged.
- **DoD:** 8 zones, Housing/Meals/Pay triad (never collapsed), Verified Host badge with "Self-Declared by Host" qualifier (G22), neutral match meter, frame-not-filter media, all card states; rendered on `/demo/discovery-card`.
- **GATE:** Discovery Card V1 Build Pack approval.

## WI-FE-04 — Public marketplace surfaces
- **Goal:** `(public)` `page.tsx`: Explore feed, Opportunity Detail (route + overlay mode), Host Profile.
- **Depends on:** WI-FE-03; read APIs (backend track) available or mocked behind a typed boundary.
- **DoD:** dual-mode listing detail shares one `DetailLayout`; SEO metadata on `/opportunities/[slug]`; states handled; no auth-only actions wired beyond a restricted-state prompt.
- **GATE:** per-surface Build Pack; data access (data/API gate is owned by backend track).

## WI-FE-05 — Seeker app surfaces
- **Goal:** `(seeker)` `page.tsx`: Home, Saved, Applications, Offers, Profile.
- **Depends on:** WI-FE-03/04; auth (separate gate) for real session.
- **DoD:** locked bottom-nav order; lifecycle-driven status; overlays per surface map.
- **GATE:** auth flow approval; per-surface Build Pack.

## WI-FE-06 — Host app surfaces
- **Goal:** `(host)` `page.tsx`: Home, Listings, Applicants, Offers, Profile, Analytics.
- **Depends on:** WI-FE-03/04; auth.
- **DoD:** applicant review uses ListPane+DetailPane + match explanation overlay; tier-gated actions show locked state (no billing logic).
- **GATE:** auth; pricing/plan entitlement source; per-surface Build Pack.

## WI-FE-07 — Admin console (V1 home)
- **Goal:** `(admin)` `/admin` overview with QueueLayout.
- **Depends on:** WI-FE-02; permissions contract; auth + role.
- **GATE:** auth + RBAC approval; per-surface Build Pack. Sub-queues are separate later items.

## WI-FE-08 — Community (light) + Demo dashboards
- **Goal:** `(community)` `/community` light feed; `(demo)` dashboards (`/demo/seeker-dashboard`, `/demo/host-dashboard`) as isolated showcases.
- **Depends on:** WI-FE-02/03.
- **DoD:** community stays minimal (no detail-page rabbit hole); demo has no production side effects + isolated telemetry.
- **GATE:** keep community scope-limited per A-FE-COMMUNITY-GROUP.

---

## Cross-cutting gates owned elsewhere (do not implement under frontend)
Auth/session · DB schema/migrations · route-level API · Stripe/billing/refunds · matching algorithm · notifications · RLS/permissions enforcement · Streamline asset licensing. Frontend consumes typed boundaries from these; it does not own them.
