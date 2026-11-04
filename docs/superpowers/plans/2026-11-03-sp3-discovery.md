# Discovery (Sub-project 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seekers and guests find jobs through Seek, Swipe and Map, read the full listing, save, skip and set alerts, and can add Explore&Earn to their Home Screen; Google indexes listings and landing pages.

**Architecture:**

- **Search projection:** a `discovery` module keeps a public-only search projection, `app.discovery_listings`, in sync with SP2 through outbox subscribers. One filter builder (Postgres full-text plus PostGIS) with keyset cursors answers every surface: Seek, Swipe, the Map pins, the pull-up list and alert matching.
- **Landing pages:** a `landing` module turns paths into pre-filtered queries and owns the sitemaps and JSON-LD.
- **Client-safe code:** the URL codec, pay, dates, install-prompt rules and the client hooks live in `src/lib/discovery`.
- **Screens:** built only from `src/ui` components and the new `src/ui/patterns`.
- **Hooks:** boosted placement (SP6) and the seeker overlay (SP4) are hooks that ship as no-ops.

**Tech Stack:**

| Area | Packages |
|---|---|
| Framework | Next.js 16.4 App Router (parallel and intercepting routes, metadata routes), React 19, TypeScript 6.0 strict |
| Data | Postgres full-text (`websearch_to_tsquery`, `ts_rank_cd`) and PostGIS (`geography`, `ST_SnapToGrid`) through Drizzle 0.45 and `queryRows`; PGlite 0.5 with PostGIS in unit tests |
| Validation | zod 4 |
| Map | `mapbox-gl` 3.x, pinned exactly and loaded by dynamic import on `/map` only |
| Media and icons | sharp (icon generation) and Foundation media URLs |
| Messaging | Foundation `notify` (Resend with React Email, web-push) |
| Testing | Vitest 5 with Testing Library (jsdom), Playwright 1.64 with `@axe-core/playwright` and `@clerk/testing`, k6 (`grafana/setup-k6-action`), Lighthouse CI (`@lhci/cli`) |

**Spec:** `docs/superpowers/specs/2026-11-03-sp3-discovery-design.md`. "Spec 8.2" below means its section 8.2.

- **Parent:** `docs/superpowers/specs/2026-11-03-explore-earn-product-design.md`, sections 3–6, 15.1, 21 and 23.
- **Builds on:** `docs/superpowers/specs/2026-11-03-foundation-design.md` and `docs/superpowers/plans/2026-11-03-foundation.md`.
- **Sibling contracts:** the SP2, SP4, SP5, SP6, SP7 and SP8 specs of the same date.

Read the SP3 spec before any task.

## Before you start

- **Foundation:** Foundation is merged on the base branch through its Phase C, and the design gate is approved, which screen tasks need. SP3 uses these Foundation names as the Foundation plan defines them: `defineType`, `notify`, `getMediaUrl` and `requestUpload` (each given the `Storage` from Task 4's `getStorage()`), `raiseAlert`, `public/sw.js`, the seeker, host and admin shells, `src/ui/patterns/Placeholder.tsx` and the `/design-system` gallery.
- **Where code differs from a plan, the code wins:**
  - `queryRows` and `createDb`.
  - `OrgRole` and `CurrentUser` live in `@/modules/identity`.
  - `HostContext` and `OperatorContext` live in `src/server/guards.ts`.
  - `queryRows` returns timestamps as text, so cast counts with `::int`.
  - Playwright reads `E2E_BASE_URL`, not `BASE_URL`.
- **SP2 Phase A (its W0) is merged:**
  - `emit()` and `src/server/event-subscribers.ts`.
  - Typed stubs of `@/modules/listings`, `@/modules/hostpages` and `@/modules/locations`, exactly as in SP2 section 3.
  - `ListingContent`, `ListingContentSchema` and `GENRES`.
  - `getMediaInfo` and `raiseAlert`.
- **Unit tests use fakes:** SP3 Phases A–B2 unit-test against `tests/fakes/` (Task 5).
- **Phase B3 and later need SP2 merged:** real listings for e2e, `ListingDetailView` and `/hosts/[slug]`.
- **Environment:** Windows with no Docker. Unit tests run on PGlite. `*.int.test.ts` runs in CI only. E2E runs locally against `pnpm db:local` (pglite-socket) and `pnpm dev`, wrapped in `doppler run --` for the Clerk dev keys.

## Global Constraints

- **Foundation constraints apply:**
  - pnpm; `strict` and `noUncheckedIndexedAccess`; no `any`.
  - Every table lives in `app`, with RLS on and no policies.
  - UUIDv7 IDs from `newId()`.
  - `created_at`/`updated_at` with the `app.set_updated_at()` trigger.
  - CHECK enums.
  - The error envelope `{ error: { code, message, details?, requestId } }`.
  - Imports of a module only through `@/modules/<name>`; `drizzle-orm` only in modules and tests.
  - No raw colors or arbitrary Tailwind values outside `src/ui/**`.
  - Touch targets ≥ 44 px, visible focus, `prefers-reduced-motion`, and an `aria-label` on every icon-only control.
- **Module rules (spec 3):**
  - `src/modules/discovery/index.ts` starts with `import 'server-only'`.
  - `landing` depends on `discovery`; `discovery` never imports `landing`.
  - `src/lib/discovery/` has no database imports.
  - `src/ui/**` never imports `@/modules/*`.
  - No foreign keys to SP2 tables.
- **Migration ranges:**

  | Range | Use |
  |---|---|
  | 2000–2099 | discovery |
  | 2100–2199 | landing |
  | `2000`, `2010`, `2020`, `2100` | Written by W0 (Plan decision 1) |
  | 2001–2009 | W1 follow-ups |
  | 2011–2019 | W3 follow-ups |
  | 2021–2029 | W4 follow-ups |
  | 2101–2199 | W8 follow-ups |

- **API:**
  - Every route uses `apiRoute` with a zod input and an `openapi` entry.
  - Discovery responses carry `Cache-Control: private, no-store`.
- **Bounds (spec 5, 10):**

  | Parameter | Bound |
  |---|---|
  | Search `limit` | 1–50, default 20 |
  | Deck `limit` | 1–20, default 10 |
  | Dispositions `limit` | ≤ 50 |
  | `q` | ≤ 100 chars |
  | Suggest `q` | 2–100 chars; up to 5 per group |
  | Lists | ≤ 10 values |
  | `bbox` | lat within ±90, lng within ±180 |
  | `zoom` | 0–22 |
  | `returnTo` | ≤ 512 chars |

  Filter parameters that fail are dropped, never an error (spec 8.1). Paging and geometry parameters that fail return 400.
- **Rate limits:** `consume` limits `disp:<userId>` to 120 per minute and `ss:<userId>` to 30 per hour.
- **Settings (spec 8.8):**

  | Key | Default |
  |---|---|
  | `discovery.saved_jobs_per_user` | `1000` |
  | `discovery.saved_searches_per_user` | `20` |
  | `discovery.alert_push_daily_cap` | `5` |

- **Time:** "today" is in the viewer's IANA time zone, from the `tz` param or the `ee_tz` cookie, defaulting to `America/Chicago`. Crons are UTC.
- **Privacy (spec 10):**
  - `listing_events` has no user ID column, ever.
  - `viewer_hash` and `dedupe_key` are nulled after 24 h.
  - Search text never goes to PostHog or the logs.
  - Coordinates are rounded to 2 decimals in requests and never stored or logged.
  - Pushes and emails name filters, not the seeker.
  - The service worker caches only `/offline.html`.
  - `ee_install` never leaves the device.
- **Output safety:**
  - Host text renders as plain text.
  - JSON-LD escapes every `<` as `\u003c`.
  - Off-site links are `https` only, behind OffsiteNotice, with `noopener noreferrer`.
- **Indexing:** nothing outside prod is indexable.
- **Copy:**
  - The name is written **Explore&Earn**.
  - No emoji and no exclamation marks.
  - Straplines, verbatim: "Built for seekers, by seekers." · "Seasonal, maritime, farm and remote jobs, some with housing and meals. Free for seekers, forever." · "Explore the country. Earn as you go." · "Work worth going somewhere for."
  - Placeholder screens read "Coming in sub-project N: <name>".
- **Analytics:** only these events: `discovery_search { surface, sort, filterCount, hasQuery }`, `discovery_swipe { action }`, `listing_view { listingId, source }`, `pwa_prompt { action, platform, trigger }`, `pwa_launch`. Never the query text or coordinates.
- **Map:** styles `mapbox://styles/mapbox/light-v11` and `dark-v11`, following the theme. `mapbox-gl` is imported only dynamically.
- **Budgets:**
  - Search, deck, map and suggest p95 ≤ 800 ms; disposition and saved-search writes p95 ≤ 1 s, at 50,000 listings and 50 users.
  - Lighthouse mobile: LCP ≤ 3.0 s, TBT ≤ 300 ms, CLS ≤ 0.1.
  - Sync is visible within 60 s.
- **Commits:** end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **A removed or closed listing stays in the deck, the map pins or the location preview** (spec failure mode 1). Seek is the surface everyone checks, but the deck, `mapPins` and `locationPreview` each run their own SQL, so a missing `is_active` or a stale row shows up on one surface only. The expected behavior: once `syncListing` sees `removed` (or `closed`), the listing is gone from Seek, the deck, the Map list, `mapPins`, `locationPreview` and `getJobCards`; the preview's `activeCount` drops, and a location left with no active listing has no pin and a null preview. Pinned in Task 21.
2. **Swipe keyboard shortcuts fire while the user types or drags a slider.** On `/swipe`, ArrowLeft and ArrowRight in the filter sheet's pay slider or the search box would skip or save cards. The expected behavior: shortcuts act only when focus is not in a text field, select, slider or contenteditable, no sheet or dialog is open, and no text is selected. Pinned in Task 14.
3. **An unrecognized time zone breaks every discovery request.** Some browsers report `Etc/Unknown`, and a cookie can be garbled. The expected behavior: an invalid `tz` or `ee_tz` falls back to `America/Chicago` and the request succeeds. Pinned in Tasks 1 and 22.
4. **The bell fails on a heavily filtered search.** The default name is the filter summary, which can pass the 80-character CHECK. The expected behavior: the name is truncated to 80 characters ending in "…", and the alert is created. Pinned in Tasks 17 and 28.
5. **The map breaks when panned across the antimeridian (western Alaska, the Aleutians).** Mapbox reports unwrapped longitudes such as −190, and an east edge below the west edge. The expected behavior: the client wraps longitudes into ±180, the server accepts `west > east`, and pins on both sides show. Pinned in Tasks 20 and 38.

## Plan decisions beyond the spec

1. **W0 writes all four SP3 migrations and both Drizzle schemas (Task 2).** Every workstream reads tables that another one owns. For example, sync deletes dispositions and matches, and search excludes skipped listings. Owners keep their follow-up ranges.
2. **Additions to the module indexes.** Foundation's ESLint `deepModuleImport` rule lets `src/app`, `scripts` and `tests/**` import a module only through `@/modules/<name>`, so every name used outside its module is in the index from W0:
   - `@/modules/discovery`: `prepareQuery`, `getQueryLabels`, `getFilterOptions`, `SavedSearchItem`, `dedupeKeyFor` (the events route), `searchVectorSql`, `SearchVectorFields` and `ProjectionRowInput` (`tests/helpers/discovery-rows.ts`), and SP8's `privacyHandler` and `retentionRules`.
   - `@/modules/landing`: `renderSitemapIndex`, `renderUrlset` and `buildRobots` (the sitemap routes and `robots.ts`), `OFFICIAL_VISA_LINKS` (`/international`), `listLandingCopy` and `getLandingCopy` (the operator editor), and SP8's `privacyHandler` and `retentionRules`.
3. **Additions to `src/lib/discovery`:**
   - `resolveTimeZone`, `safeReturnTo`, `US_STATES`, `describeFilters`, `removeFilter`, `summarizeQuery`, `discoveryQuerySchema`, `useDiscoveryQuery`, `toJobCardProps`, `chipSheetContent` and `toApiBbox`.
   - `parseQuery` also returns `hostSlug`, and `serializeQuery` takes `opts.hostSlug`.
4. **The cursor also carries `pi`,** the page index for `PlacementInput.pageIndex`.
5. **The search API also accepts `bbox` for the Map pull-up list** (`surface: 'map_list'`).
6. **`getListingEventCounts` grows to cover SP6 O5:** `types` takes any `ListingEventType`, an optional `sources` filter is added, and each row carries `source` (null unless `sources` is given). This stays compatible with SP5.
7. **Foundation `JobCard` accepts preformatted labels:** `pay: { label }`, `starts: { label }` and `endLabel`. Its built-in `formatPay` writes `$18.50–22/hr`, but spec 8.2 requires `$19–$22/hr`.
8. **`getPlacementHook()` loads `src/server/placement-hook.ts` by dynamic import,** because the touchpoint imports `noopHook` from discovery.
9. **`X-Robots-Tag: noindex` outside prod is added in `buildSecurityHeaders`.**
10. **Open copy and behavior choices are fixed in the owning task:**
    - the season-mode end segment
    - the Remote location label
    - the pay detail lines
    - the crew-share chip
    - the target of a push that covers several searches
    - the landing intro phrases
11. **The detail page links to SP4's `/report?subject=listing:<id>`** (SP4 spec sections 3 and 13) instead of leaving an empty slot for SP4 to fill. Spec 8.9 expects SP4 to mount `ReportSheet` in the slot, but no SP4 task edits SP3's `listing-frame.tsx`. The link is the same pattern as Apply's link to `/apply/<id>`.
12. **`getStorage(): Storage` is added to `@/modules/media` if absent (Task 4).** `getMediaUrl` and `requestUpload` take a `Storage`, and Foundation has no env-selected accessor. The name and rule match SP4's plan (its Task 3), so whichever lands first adds it.
13. **SP8 reads `privacyHandler` and `retentionRules`, not `exportUserData` and `eraseUserData`** (SP8 section 3). Both modules export the two names in SP8's shape from W0 (Task 3), and W3 fills discovery's (Task 26). When `@/modules/privacy` is absent, W0 creates it holding SP8's types only, as SP4's W0 does.

## Phases, workstreams and shared touchpoints

| Phase | Workstreams and tasks | Starts when |
|---|---|---|
| **A** (one agent) | W0 contracts and touchpoints: Tasks 1–5 | Prerequisites above |
| **B1** (parallel) | W1 projection and sync: Tasks 6–11 · W5 design-system patterns: Tasks 12–16 | A merged |
| **B2** (parallel) | W2 query engine and read APIs: Tasks 17–22 · W3 dispositions, events and client actions: Tasks 23–26 | W1 and W5 merged |
| **B3** (fixtures first, then parallel) | Task 27, W9's e2e fixtures (one agent), then in parallel: W4 saved searches and alerts (Tasks 28–31) · W6 Seek, Swipe, detail and PWA (Tasks 32–37) · W7 Map (Tasks 38–39) | W2 and W3 merged, SP2 merged, design gate approved |
| **B4** | W8 landing and SEO: Tasks 40–44 | W6 merged (feed embed) |
| **C** | W9 verification: Tasks 45–48 | Everything above |

**Shared touchpoints.** Only the owner listed edits a file outside its workstream's own files. Every other workstream only reads it.

| File | Owner |
|---|---|
| `src/modules/discovery/index.ts`, `src/modules/landing/index.ts`, `src/lib/discovery/index.ts`, `src/lib/discovery/client.ts` (barrels; complete from W0, never edited later) | W0 |
| `src/server/{event-subscribers,schedules,job-handlers,placement-hook,viewer,page-guards}.ts`, `src/db/schema.ts`, `src/modules/settings/registry.ts`, `src/modules/notifications/types.ts` and its template registry, `src/lib/env.ts`, `.env.local.example`, `package.json`, `vitest.config.ts`, the admin Sidebar | W0 |
| `src/modules/media/storage.ts` and `src/modules/media/index.ts` (the `getStorage` addition, only if absent); `src/modules/privacy/index.ts` (SP8's types only, only if absent) | W0 |
| `src/lib/security-headers.ts` | W0 (X-Robots-Tag), then W7 (CSP) |
| `src/ui/components/JobCard.tsx`, `src/ui/icons.ts`, `src/ui/tokens.css` | W5 |
| `src/app/(seeker)/layout.tsx`, `src/app/layout.tsx`, `src/proxy.ts`, `src/server/host-routing.ts`, the onboarding route and page, `public/sw.js`, `src/ui/components/Toast.tsx`, `playwright.config.ts` | W6 |
| `src/app/(seeker)/jobs/view/**` (SEO metadata added in B4) | W6, then W8 |
| `.github/workflows/ci.yml` | W9 |

SP6 later replaces one line of `src/server/placement-hook.ts`, and SP4 replaces `src/app/(seeker)/apply/[listingId]/page.tsx`.

## File Structure

```
drizzle/2000_discovery.sql 2010_discovery.sql 2020_discovery.sql 2100_landing.sql   W0
src/lib/discovery/            client-safe
  types.ts states.ts tz.ts return-to.ts install-events.ts index.ts client.ts      W0
  pay.ts dates.ts                                                                 W1
  query.ts use-discovery-query.ts                                                 W2
  bots.ts intents.ts disposition-client.ts use-listing-actions.ts sign-in-intent.tsx   W3
  card-props.ts                                                                   W5
  install.ts use-install-prompt.tsx                                               W6
  map-view.ts                                                                     W7
src/modules/discovery/
  index.ts schema.ts projection-columns.ts search-vector.ts hooks.ts              W0
  projection.ts sync.ts cards.ts media.ts seed.ts                                 W1
  filters.ts cursor.ts search.ts placement.ts map.ts suggest.ts detail.ts query-context.ts   W2
  dispositions.ts events.ts privacy.ts                                            W3
  saved-searches.ts alerts.ts notification-types.ts                               W4
src/modules/landing/  index.ts schema.ts privacy.ts (W0) · resolve.ts jsonld.ts sitemaps.ts copy.ts (W8)
src/server/placement-hook.ts viewer.ts page-guards.ts                             W0
src/ui/patterns/  ActionBar SignInPrompt OffsiteNotice JobChipSheet SearchBox FilterPanel
  ActiveFilterChips SwipeDeck swipe-gesture MapCanvas MapPin HostPreview PullUpSheet
  LandingHero InstallPrompt                                                       W5
src/app/design-system/discovery/page.tsx                                          W5
src/app/api/v1/discovery/{search,deck,map,suggest}/route.ts, locations/[locationId]/route.ts,
  _shared/params.ts, listings/[id]/route.ts                                       W2
src/app/api/v1/listings/[id]/events/route.ts, me/dispositions/**                  W3
src/app/api/v1/me/{saved-searches/**,alert-settings/route.ts}                     W4
src/app/api/v1/landing/route.ts                                                   W8
src/app/(seeker)/
  _components/discovery-card.tsx                                                  W3
  _components/{mode-nav,seeker-providers,tz-cookie,seek-feed,discovery-toolbar,filters-sheet,
    guest-header,sw-register}.tsx, ios-push-hint.tsx (stub from W0)              W6
  page.tsx swipe/** jobs/view/** @panel/**                                        W6
    (jobs/view/_components/detail-view-props.ts is the server-side SP2 mapper call)
  map/**                                                                          W7
  profile/alerts/**                                                               W4
  jobs/[segment]/** seasons/** destinations/** international/**                   W8
  apply/[listingId]/page.tsx (placeholder)                                        W0
src/app/manifest.ts apple-icon.png favicon.ico, src/ui/brand/app-icon.svg,
  scripts/gen-icons.ts, public/icons/*, public/offline.html                       W6
src/app/sitemap.xml/route.ts, src/app/sitemaps/[name]/route.ts, src/app/robots.ts W8
src/app/admin/content/landing/**                                                  W8
tests/fakes/* tests/helpers/discovery-rows.ts                                     W0
tests/e2e/fixtures/* (incl. sp2-writes.ts) scripts/e2e-seed-discovery.ts tests/perf/* lighthouserc.discovery.json
  .github/workflows/perf-discovery.yml                                            W9
```

---

## Phase A: Contracts and touchpoints (W0, one agent)

### Task 1 (W0): Client-safe contract

**Files:**
- Create: `src/lib/discovery/types.ts`, `states.ts`, `tz.ts`, `return-to.ts`, `install-events.ts`, `index.ts` (the pure barrel) and `client.ts` (a `'use client'` barrel).
- Create the stub files. Each exports the signatures named in its owner's Interfaces block, with bodies that throw `new Error('not implemented: <name>')`:
  - `pay.ts`, `dates.ts` (W1)
  - `query.ts`, `use-discovery-query.ts` (W2)
  - `bots.ts`, `intents.ts`, `disposition-client.ts`, `use-listing-actions.ts`, `sign-in-intent.tsx` (W3)
  - `card-props.ts` (W5)
  - `install.ts`, `use-install-prompt.tsx` (W6)
  - `map-view.ts` (W7)
- Test: `src/lib/discovery/contract.test.ts`

**Interfaces:**
- **Consumes:**
  - `Category` from `@/ui/categories`
  - `import type { ListingContent } from '@/modules/listings'` (type-only)
- **Produces** (`@/lib/discovery`):
  - **Spec types, verbatim** (spec 3.1, 3.3 and 3.1's prose): `DiscoverySource`, `DiscoverySort`, `DispositionState`, `ListingEventType`, `Season`, `DiscoveryQuery`, `JobCardData`, `Amenity`, `ListingDetail`, `MapPin`, `MapCluster`, `HostPreview`, `InstallState`, `DiscoveryExport`.
  - **Constants:** `DISCOVERY_SOURCES`, `SEASONS`, `PIN_CATEGORY_ORDER = ['maritime', 'seasonal', 'farm', 'remote'] as const`.
  - `FilterOptions = { genres: { slug: string; label: string; category: Category }[]; states: { code: string; name: string }[]; destinations: { slug: string; name: string }[]; seasonYears: [number, number] }`
  - `QueryLabels = { genres: Record<string, string>; destinations: Record<string, string>; host: { orgId: string; slug: string; name: string } | null }`
  - `FilterChip = { key: string; label: string }`
  - **States:**
    - `UsState = { code: string; name: string; slug: string; centroid: { lat: number; lng: number }; landing: boolean }`
    - `US_STATES: readonly UsState[]` holds the 50 states and DC with `landing: true`, plus PR, VI, GU, AS and MP with `landing: false`, so a territory listing can still be filtered. Centroids are the 2020 Census centers of population.
    - `stateByCode(code: string): UsState | undefined`, `stateBySlug(slug: string): UsState | undefined`
  - **Time zone:** `DEFAULT_TZ = 'America/Chicago'`, `resolveTimeZone(tz: string | null | undefined): string`
  - **Return path:** `safeReturnTo(v: string | null | undefined): string`
  - **Install triggers:**
    - `INSTALL_TRIGGER_EVENT = 'ee:install-trigger'`
    - `InstallTrigger = 'save' | 'alert' | 'views' | 'manual'`
    - `emitInstallTrigger(trigger: Exclude<InstallTrigger, 'manual'>): void` dispatches `new CustomEvent(INSTALL_TRIGGER_EVENT, { detail: { trigger } })` on `window`. It is a no-op without `window`.
  - **Barrels:**
    - `index.ts` re-exports the pure files.
    - `client.ts` re-exports `useDiscoveryQuery`, `putDisposition`, `deleteDisposition`, `useListingActions`, `useUndoableDispositions`, `SignInIntentProvider`, `useSignInIntent`, `IntentRunner`, `InstallPromptProvider` and `useInstallPrompt`.

- [ ] **Step 1: Write the failing tests** in `contract.test.ts`.
  - `resolveTimeZone('America/Denver')` is `'America/Denver'`. Each of `'Etc/Unknown'`, `'Mars/Base'`, `''`, `null` and `'a'.repeat(200)` gives `'America/Chicago'`. *(Review Focus 3)*
  - `safeReturnTo` cases:
    - `'/jobs/view/1/lift-operator?intent=save%3A1'` is returned unchanged.
    - `'//evil.test'`, `'/\\evil.test'`, `'https://evil.test'`, `'javascript:alert(1)'`, `''`, `undefined` and a 513-character path each return `'/'`.
    - A 512-character path is kept.
  - States:
    - `US_STATES.length === 56`, and 51 of them are `landing`.
    - The slugs are unique and match `/^[a-z]+(-[a-z]+)*$/`.
    - `stateBySlug('district-of-columbia')?.code === 'DC'` and `stateByCode('AK')?.name === 'Alaska'`.
  - A static scan of every file in `src/lib/discovery/` finds no non-`import type` import of `@/lib/db`, `drizzle-orm`, `server-only` or `@/modules/`.
  - In jsdom, `emitInstallTrigger('save')` reaches a `window` listener with `detail.trigger === 'save'`.
- [ ] **Step 2:** Run `pnpm test src/lib/discovery/contract.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `resolveTimeZone` rejects strings over 64 characters, then tries `new Intl.DateTimeFormat('en-US', { timeZone })` inside try/catch. Fill `US_STATES` from the Census table.
- [ ] **Step 4:** Run the test and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): client-safe contract types, states, tz and returnTo`.

### Task 2 (W0): Data contract (migrations and schemas)

**Files:**
- Create: `drizzle/2000_discovery.sql`, `drizzle/2010_discovery.sql`, `drizzle/2020_discovery.sql`, `drizzle/2100_landing.sql`, `src/modules/discovery/schema.ts`, `src/modules/discovery/projection-columns.ts`, `src/modules/discovery/search-vector.ts`, `src/modules/landing/schema.ts`, `tests/helpers/discovery-rows.ts`, `src/modules/discovery/schema.test.ts`
- Modify: `src/db/schema.ts`, which re-exports both new schemas.

**Interfaces:**
- **Tables:** every table, column, CHECK and index exactly as in spec 4.
  - `2000` holds `discovery_listings` and `discovery_sync_state`.
  - `2010` holds `listing_dispositions`, `listing_events` and `listing_event_daily`.
  - `2020` holds `saved_searches`, `saved_search_matches` and `alert_settings`.
  - `2100` holds `landing_pages`.
  - Each table also gets `created_at`, `updated_at`, the `app.set_updated_at()` trigger and `enable row level security`.
  - The `users` references are `on delete cascade`.
- **Drizzle tables:** `discoveryListings`, `discoverySyncState`, `listingDispositions`, `listingEvents`, `listingEventDaily`, `savedSearches`, `savedSearchMatches`, `alertSettings`, `landingPages`. The `geog` and `search` columns use `customType` and are only read through raw SQL.
- **`projection-columns.ts`:**
  - `ProjectionRow`: every `discovery_listings` column in camelCase except `geog` and `search`, plus `lat: number` and `lng: number`. Dates and timestamps are ISO strings.
  - `PROJECTION_SELECT: SQL`: the column list with camelCase aliases, `ST_Y(geog::geometry) as "lat"` and `ST_X(geog::geometry) as "lng"`.
  - `ProjectionRowInput`: the insert shape, meaning every column except `geog` and `search`, plus `lat`, `lng` and `vector: SearchVectorFields`.
- **`search-vector.ts`:**
  - `SearchVectorFields = { title; occupationLabel; hostName; genreLabel; categoryLabel; destinationName; city; stateName; description }`, all strings or null.
  - `searchVectorSql(f: SearchVectorFields): SQL` with the weights of spec 4: A is title and occupation; B is host; C is genre, category and destination; D is city, state name and `description.slice(0, 2000)`. It uses the `english` config.
- **Test helpers:** `insertProjectionRows(db: DbOrTx, rows: Partial<ProjectionRowInput>[]): Promise<string[]>` returns the listing IDs. It imports `ProjectionRowInput` and `searchVectorSql` from `@/modules/discovery` (Task 3 re-exports them), because ESLint's `deepModuleImport` rule covers `tests/**`. The default row is an active Seasonal "Lift operator" listing:

  | Field | Default |
  |---|---|
  | Host | Kettle Ridge Lodge, `kettle-ridge-lodge` |
  | Place | Breckenridge, CO, at 39.48, −106.04 |
  | Genre | `ski-resorts` |
  | Pay | $19/hr (`payHourlyMinCents` 1900) at 40 h |
  | Housing | provided, paid |
  | Dates | `start_on` 2026-12-01 |
  | `published_at` | `now − 1 day` |

  Every default can be overridden.

- [ ] **Step 1: Write the failing tests** in `schema.test.ts`.
  - After `createTestDb()`, `to_regclass('app.<t>')` is not null for all 9 tables, and `pg_class.relrowsecurity` is true for each.
  - These `discovery_listings` inserts throw: `housing_free = true` with `housing_provided = false`; `weekly_hours = 0`; `category = 'beach'`.
  - Two `listing_events` rows with the same `dedupe_key`, inserted with `on conflict (dedupe_key) do nothing`, leave 1 row. `source = 'tiktok'` throws.
  - `saved_searches`: a second row with the same `(user_id, query_hash)` throws; `name = ''` throws; an 81-character name throws.
  - Deleting an `app.users` row removes its dispositions, its saved searches (with their matches) and its `alert_settings` row.
  - `insertProjectionRows(db, [{}])` creates a row where `search @@ to_tsquery('english', 'lift')` is true and `lat` reads back as 39.48.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the migrations and schemas.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): SP3 tables, Drizzle schemas and row helpers`.

### Task 3 (W0): Module skeletons, hooks, viewer and page guard

**Files:**
- Create the discovery module:
  - `src/modules/discovery/index.ts` and `hooks.ts`
  - stub files for only the files the index imports. Each re-exported name sits in its owner's file:

    | File | Names |
    |---|---|
    | `projection.ts` | `toHourlyCents` |
    | `sync.ts` | `rebuildSearchProjection`, `syncHandlers` |
    | `seed.ts` | `seedSynthetic` |
    | `search.ts` | `searchListings`, `getJobCards`, `matchListingIds`, `countNewListings` |
    | `map.ts` | `mapPins`, `locationPreview` |
    | `suggest.ts` | `suggest` |
    | `detail.ts` | `getListingDetail` |
    | `query-context.ts` | `prepareQuery`, `getQueryLabels`, `getFilterOptions` |
    | `dispositions.ts` | `setDisposition`, `clearDisposition`, `listSavedJobs`, `listSkippedJobs`, `unsaveJob`, `restoreSkippedJob` |
    | `events.ts` | `recordListingEvent`, `getListingEventCounts`, `listingStats`, `eventHandlers`, `dedupeKeyFor` |
    | `privacy.ts` | `exportUserData`, `eraseUserData`, `privacyHandler`, `retentionRules` |
    | `saved-searches.ts` | the six saved-search and alert-settings functions |
    | `alerts.ts` | `alertHandlers` |
    | `notification-types.ts` | empty |

    The index also re-exports Task 2's finished `searchVectorSql`, `SearchVectorFields` and `ProjectionRowInput`. Internal files (`cards.ts`, `media.ts`, `filters.ts`, `cursor.ts` and `placement.ts`) are created by their owners.
- Create the landing module: `src/modules/landing/index.ts`, `privacy.ts` (final, written by W0) and the stub files:

  | File | Names |
  |---|---|
  | `resolve.ts` | `resolveLanding`, `listLandingPaths`, `OFFICIAL_VISA_LINKS` (W0 writes its final value, the four URLs in Task 40) |
  | `jsonld.ts` | `buildJobPostingJsonLd`, `buildBreadcrumbJsonLd` |
  | `sitemaps.ts` | `sitemapNames`, `sitemapEntries`, `renderSitemapIndex`, `renderUrlset`, `buildRobots` |
  | `copy.ts` | `saveLandingCopy`, `listLandingCopy`, `getLandingCopy` |
- If `@/modules/privacy` does not exist on the base branch, create `src/modules/privacy/index.ts` holding SP8 section 3's types, types only (the same file SP4's W0 creates in that case). SP8 W0 owns it afterwards.
- Create the server files: `src/server/placement-hook.ts`, `src/server/viewer.ts`, `src/server/page-guards.ts`.
- Create `tests/stubs/server-only.ts`, which is empty.
- Create the tests: `src/modules/discovery/hooks.test.ts`, `src/modules/landing/privacy.test.ts`, `src/server/viewer.test.ts`, `src/server/page-guards.test.ts`.
- Modify: `package.json` (add `server-only` if absent), `vitest.config.ts` (alias `server-only` to the stub).

**Interfaces:**
- **Consumes:**
  - `HandlerMap` from `@/modules/jobs`
  - `registerListingStatsProvider` from `@/modules/listings`
  - `requireSeeker`, `CurrentUser` and `GuardDenial` from `src/server/guards.ts`
  - `findUserByClerkId` from `@/modules/identity`
  - `auth()` from Clerk
  - `getEnv`, `logger`, `isAppError`
  - `safeReturnTo` and `resolveTimeZone` from Task 1
  - `PrivacyHandler`, `RetentionRule` and `PrivacySubject` from `@/modules/privacy` (type-only)
- **Produces** — `@/modules/discovery`:
  - Every spec 3.1 name, plus the query context and saved-search functions, with these exact signatures:
    - `prepareQuery(db: DbOrTx, p: URLSearchParams): Promise<{ query: DiscoveryQuery; sort: DiscoverySort; labels: QueryLabels }>`
    - `getQueryLabels(db: DbOrTx, q: DiscoveryQuery): Promise<QueryLabels>`
    - `getFilterOptions(db: DbOrTx, now?: Date): Promise<FilterOptions>`
    - `listingStats(db: DbOrTx, ids: string[]): Promise<Map<string, { views: number; saves: number }>>` (internal, used by the stats provider)
    - `createSavedSearch(db: Db, userId: string, i: { query: DiscoveryQuery; name?: string }): Promise<{ item: SavedSearchItem; created: boolean }>`
    - `updateSavedSearch(db: Db, userId: string, id: string, i: { name?: string; pushEnabled?: boolean; emailDaily?: boolean }): Promise<SavedSearchItem>`
    - `deleteSavedSearch(db: Db, userId: string, id: string): Promise<void>`
    - `listSavedSearches(db: DbOrTx, userId: string): Promise<SavedSearchItem[]>`
    - `getAlertSettings(db: DbOrTx, userId: string): Promise<{ weeklyDigest: boolean }>`
    - `setAlertSettings(db: DbOrTx, userId: string, i: { weeklyDigest: boolean }): Promise<{ weeklyDigest: boolean }>`
    - `SavedSearchItem = { id: string; name: string; query: DiscoveryQuery; summary: string; pushEnabled: boolean; emailDaily: boolean; createdAt: string }`
    - `dedupeKeyFor(type: 'view' | 'share', viewerKey: string, listingId: string, at: Date): string` (Task 24)
  - **SP8 registration** (`privacy.ts`; Task 26 fills it):
    - `privacyHandler: PrivacyHandler` with `module: 'discovery'` and `tables` set to all 8 discovery tables: `discovery_listings`, `discovery_sync_state`, `listing_dispositions`, `listing_events`, `listing_event_daily`, `saved_searches`, `saved_search_matches`, `alert_settings`. Use the same table-name form SP8's coverage test expects. The W0 stub's `exportData` and `erase` throw `not implemented`.
    - `retentionRules: RetentionRule[]`, one rule with its final `key: 'discovery.listing_events_raw'` and `description`. The W0 stub's `run` returns `{ deleted: 0 }`, so SP8's daily sweep never fails on it before Task 26.
  - `jobHandlers = { ...syncHandlers, ...eventHandlers, ...alertHandlers }`. The stubs register a no-op for each of the 7 topics (`discovery.sync_listing`, `sync_host`, `drift_check`, `maintenance`, `alerts_match`, `alerts_daily` and `alerts_weekly`), so the worker never dead-letters them before the real handlers land.
  - At load, the index calls `registerListingStatsProvider('discovery', listingStats)` and imports `./notification-types` for its side effects.
- **Produces** — `hooks.ts`:
  - `noopHook: BoostPlacementHook`
  - `getPlacementHook(): Promise<BoostPlacementHook>`, which memoizes `(await import('@/server/placement-hook')).boostPlacementHook`
  - `setPlacementHookForTests(h: BoostPlacementHook | null): void`
  - `registerSeekerOverlay(p: SeekerOverlayProvider): void`
  - `overlayApplied(db: DbOrTx, userId: string, ids: string[] | 'all'): Promise<Set<string>>` and `overlayHidden(db: DbOrTx, userId: string): Promise<string[]>`. With no provider registered, or when the provider throws, they return empty values; on a throw they log `logger.warn('discovery.overlay_failed', { which })`.
  - `resetSeekerOverlayForTests(): void`
- **Produces** — `src/server/placement-hook.ts`: exactly `export const boostPlacementHook: BoostPlacementHook = noopHook;` with its imports from `@/modules/discovery`.
- **Produces** — `src/server/viewer.ts`:
  - `Viewer = { userId: string | null; seekerId: string | null; accountType: 'seeker' | 'host' | 'operator' | null; viewerKey: string; tz: string }`
  - `getViewer(req: Request): Promise<Viewer>` reads `tz` from `?tz=` or else the `ee_tz` cookie.
  - `getPageViewer(): Promise<Viewer>` reads the same through `headers()` and `cookies()`.
  - Both wrap Clerk's `auth()` in try/catch, so an error makes the viewer a guest.
  - `viewerKeyFor(i: { userId: string | null; ip: string | null; userAgent: string | null }): string` returns the user ID, or else `hmacKey(ip + '|' + userAgent)`, with `'unknown'` for a missing part.
  - `hmacKey(v: string): string` is HMAC-SHA256 keyed with `ANALYTICS_HASH_SECRET`, encoded base64url.
  - The client IP is the first value of `x-forwarded-for`, else `x-real-ip`.
  - `privateJson(body: unknown, init?: ResponseInit): Response` sets `cache-control: private, no-store`.
- **Produces** — `src/server/page-guards.ts`: `requireSeekerPage(returnPath: string): Promise<CurrentUser>`.
  - `unauthorized` redirects to `/sign-in?redirect_url=<encoded safeReturnTo(returnPath)>`.
  - `needs_onboarding` redirects to `/onboarding?returnTo=<encoded>`.
  - `wrong_account_type` redirects to `/`.
- **Produces** — `@/modules/landing`: the spec 3.2 names as stubs, `jobHandlers: HandlerMap = {}`, and these additions (Plan decision 2), as stubs unless marked final:
  - `renderSitemapIndex(names: string[], appUrl: string): string` and `renderUrlset(entries: { loc: string; lastmod: Date }[]): string` (Task 42)
  - `buildRobots(appEnv: 'dev' | 'preview' | 'prod', appUrl: string): MetadataRoute.Robots` (Task 42)
  - `OFFICIAL_VISA_LINKS: readonly { label: string; url: string }[]` (final; Task 40 lists the URLs)
  - `listLandingCopy(db: DbOrTx, now: Date): Promise<{ key: string; kind: LandingKind; path: string; title: string; custom: boolean }[]>`: every key that resolves, with its effective title and whether a `landing_pages` row exists (Task 44)
  - `getLandingCopy(db: DbOrTx, key: string, now: Date): Promise<{ page: LandingPage; stored: LandingCopyInput | null } | null>`, where `LandingCopyInput` is `saveLandingCopy`'s input shape; null when the key doesn't resolve (Task 44)
  - `privacyHandler: PrivacyHandler` (final, in `privacy.ts`):
    - `module: 'landing'`, `tables: ['landing_pages']` and `mediaColumns: [{ table: 'landing_pages', column: 'hero_media_id', array: false }]`, so SP8's orphan sweep never deletes a hero image.
    - `exportData` returns `{ records: {}, files: [] }`: the table holds operator-written public copy.
    - For a user subject, `erase` sets `updated_by = null` on the rows that user saved and returns that count as `erased`, with `retained: []`; the `landing.copy_saved` audit events keep the history. An org subject erases nothing. When `ctx.holds` includes `'all'` and the user saved rows, it changes nothing and reports `{ table: 'landing_pages', reason: 'legal_hold', until: null }`. A second run erases 0.
  - `retentionRules: RetentionRule[] = []` (final)

- [ ] **Step 1: Write the failing tests.**
  - `noopHook.place(db, { organic: ['a', 'b'], state: 's', ... })` returns `{ items: [{ listingId: 'a', boostId: null }, { listingId: 'b', boostId: null }], organicConsumed: 2, state: 's' }`. `noopHook.boostedAmong` returns an empty Map.
  - `getPlacementHook()` resolves to `noopHook`. After `setPlacementHookForTests(fake)` it resolves to `fake`.
  - With no provider, `overlayApplied` is empty and `overlayHidden` is `[]`. With a provider that throws, both are empty and `logger.warn` is called.
  - `viewerKeyFor`:
    - Two guests with the same IP and user agent get the same 43-character key; a different user agent gives a different key.
    - A signed-in user gets their ID.
  - `getViewer` (with `@clerk/nextjs/server` mocked):
    - When `auth()` throws, the viewer is a guest.
    - A seeker gets `seekerId === userId`.
    - A host gets `seekerId === null` and `accountType === 'host'`.
    - `?tz=Etc/Unknown` gives `tz === 'America/Chicago'`.
    - The cookie `ee_tz=Pacific/Honolulu` with no `tz` param gives `'Pacific/Honolulu'`.
  - `privateJson({})` carries `cache-control: private, no-store`.
  - `requireSeekerPage('/profile')` (with `next/navigation` `redirect` mocked to throw its URL):
    - Unauthorized redirects to `/sign-in?redirect_url=%2Fprofile`.
    - Needs onboarding redirects to `/onboarding?returnTo=%2Fprofile`.
    - A host redirects to `/`.
    - A seeker returns the user.
  - Importing `@/modules/discovery` in Vitest succeeds.
  - Every name in Plan decision 2 is exported from its module index (`typeof` is `'function'`, or the constant is defined).
  - SP8 registration:
    - `privacyHandler.module` is `'discovery'` and `'landing'`, and the two `tables` lists equal the lists above, with no table in both.
    - The discovery `retentionRules` keys are `['discovery.listing_events_raw']`; landing's list is empty.
    - Landing `erase` for a user who saved 2 rows nulls `updated_by` on both and returns `erased: 2`. A second run returns `erased: 0`. Another operator's row keeps its `updated_by`. `exportData` returns `{ records: {}, files: [] }`.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/hooks.test.ts src/modules/landing/privacy.test.ts src/server/viewer.test.ts src/server/page-guards.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): module skeletons, placement and overlay hooks, viewer, page guard`.

### Task 4 (W0): Foundation and SP2 touchpoints

**Files:**
- Modify:
  - `src/server/event-subscribers.ts`, `src/server/schedules.ts`, `src/server/job-handlers.ts`
  - `src/modules/settings/registry.ts`
  - `src/modules/notifications/types.ts` and the template map that `send.ts` renders from
  - `src/lib/env.ts`, `.env.local.example`
  - `src/lib/security-headers.ts`
  - `src/modules/media/storage.ts` and `src/modules/media/index.ts` (`getStorage`, only if absent)
  - `package.json`
  - `src/app/admin/layout.tsx` (the Sidebar items)
- Create:
  - `src/modules/notifications/email/templates/JobAlertDaily.tsx` and `JobAlertWeekly.tsx`. These are placeholders that render `Layout` with one line; W4 fills them.
  - `src/app/(seeker)/apply/[listingId]/page.tsx`
  - `src/app/(seeker)/_components/ios-push-hint.tsx`, a stub that returns `null`; W6 fills it.
  - `src/server/discovery-touchpoints.test.ts`
- Tests also extend: `src/lib/env.test.ts`, `src/lib/security-headers.test.ts`, `src/lib/analytics.test.ts`, `src/modules/settings/settings.test.ts`

**Interfaces:**
- **Event subscribers:** append `'discovery.sync_listing'` to `listing.published`, `listing.changed`, `listing.closed` and `listing.removed`. Append `'discovery.sync_host'` to `hostpage.updated`, `location.updated`, `org.status_changed` and `subscription.changed`. Keep SP2's existing entries.
- **Schedules:**

  | Topic | Cron |
  |---|---|
  | `discovery.drift_check` | `30 3 * * *` |
  | `discovery.alerts_match` | `*/15 * * * *` |
  | `discovery.alerts_daily` | `0 14 * * *` |
  | `discovery.alerts_weekly` | `0 14 * * 1` |
  | `discovery.maintenance` | `15 4 * * *` |

- **Job handlers:** `job-handlers.ts` merges `discovery` and `landing`.
- **Settings** (spec 8.8 values; the schemas are integers):

  | Key | Default | Range |
  |---|---|---|
  | `discovery.saved_jobs_per_user` | `1000` | 1–100000 |
  | `discovery.saved_searches_per_user` | `20` | 1–1000 |
  | `discovery.alert_push_daily_cap` | `5` | 0–50 |

- **Email templates:** `EmailTemplateName` adds `'JobAlertDaily' | 'JobAlertWeekly'`.
- **Environment:**
  - `ANALYTICS_HASH_SECRET` uses the existing `secret` schema (≥ 32 characters). The dev default is `dev-only-analytics-hash-secret-0000000`.
  - `NEXT_PUBLIC_MAPBOX_TOKEN` is optional and required unless `APP_ENV=dev`. Skip it if SP2 already added it. Its line in `.env.local.example` is empty, with the comment `# empty in dev: the Map shows the list fallback`.
- **Security headers:** `buildSecurityHeaders` adds `'X-Robots-Tag': 'noindex'` when `appEnv !== 'prod'`.
- **Analytics:** no code change. Foundation's `before_send` already runs `scrubClientProps`, which cuts every `$current_url` and `$referrer` back to origin and path with `stripUrlQuery`, so `q`, `lat`, `lng` and `bbox` never reach PostHog. A parameter-level scrub would be weaker (tokens and `redirect_url` would survive), so SP3 adds only a regression test.
- **Storage accessor** (Plan decision 12; skip it if media already exports one): `getStorage(): Storage` in `src/modules/media/storage.ts`, re-exported from `@/modules/media`. It is chosen by `STORAGE_PROVIDER` and memoized: `supabaseStorage()` for `supabase`, `localStorage(getEnv().LOCAL_STORAGE_DIR)` for `local`, and `memoryStorage()` for `stub`. Tasks 8, 40 and 44 pass it to `getMediaUrl` and `requestUpload`.
- **`package.json`:**
  - dependencies: `mapbox-gl` (latest 3.x, exact, if absent)
  - devDependencies: `@lhci/cli` (exact)
  - scripts: `discovery:seed-synthetic` (`tsx scripts/seed-synthetic.ts`), `discovery:rebuild` (`tsx scripts/discovery-rebuild.ts`), `icons:gen` (`tsx scripts/gen-icons.ts`), `e2e:seed` (`tsx scripts/e2e-seed-discovery.ts`)
- **Operator Sidebar:** one item "Landing pages" linking to the console path of `/admin/content/landing`, using the existing items' href convention.
- **Apply placeholder:** `/apply/[listingId]` renders Foundation `Placeholder` with "Coming in sub-project 4: Seeker", which is hidden in prod.

- [ ] **Step 1: Write the failing tests.**
  - `subscribers['listing.published']` contains both `'discovery.sync_listing'` and `'hostpages.notify_followers'`. Each of the other 7 events contains its discovery topic.
  - `schedules` contains the 5 lines above. Every SP3 topic has a handler, and the merge throws no duplicate error.
  - `getSetting(db, 'discovery.saved_jobs_per_user')` is `1000`, and the other two are `20` and `5`. `setSetting` with `0` for `discovery.saved_jobs_per_user` throws `bad_request`.
  - `parseEnv` without `ANALYTICS_HASH_SECRET` throws with that name; with 31 characters it throws too.
  - `buildSecurityHeaders({ appEnv: 'preview', nonce: 'abc' })['X-Robots-Tag'] === 'noindex'`. In dev the same; in prod it is undefined.
  - **Analytics regression** (in `analytics.test.ts`; it passes on Foundation's code and guards against a change): after `initAnalytics()`, the `before_send` passed to `posthog.init`, given a `$pageview` whose `$current_url` and `$referrer` are `'https://exploreandearn.com/map?q=lift+operator&cat=farm&lat=39.74&lng=-104.99&bbox=-125,24,-66,50'` and whose `$pathname` is `'/map'`, returns `$current_url` and `$referrer` of `'https://exploreandearn.com/map'` and keeps `$pathname`.
  - **Storage:** with `STORAGE_PROVIDER=stub`, two `getStorage()` calls return the same instance, and a `write` then `read` round-trips the bytes.
- [ ] **Step 2:** Run `pnpm test src/server/discovery-touchpoints.test.ts src/lib src/modules/settings`. Expected: FAIL (except the analytics regression).
- [ ] **Step 3:** Implement. Run `pnpm install` for the new dependencies.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm check:tokens`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): subscribers, schedules, settings, env, robots header, storage accessor`.

### Task 5 (W0): Fakes for SP2, SP4 and media

**Files:**
- Create: `tests/fakes/sp2.ts`, `tests/fakes/media.ts`, `tests/fakes/listing-content.ts`, `tests/fakes/fakes.test.ts`

**Interfaces:**
- **`tests/fakes/listing-content.ts`:**
  - `makeListingContent(o?: DeepPartial<ListingContent>): ListingContent`. The default listing:

    | Field | Default |
    |---|---|
    | Title | "Lift operator" |
    | Category, genre | seasonal, `ski_resorts` |
    | Place | onsite, at the default location |
    | Dates | fixed 2026-12-01 to 2027-04-15 |
    | `weeklyHours` | 40 |
    | Pay | `{ kind: 'fixed', minCents: 1900, maxCents: 1900, unit: 'hour', frequency: 'biweekly' }` |
    | Housing | `cost: { free: false, cents: 15000, period: 'week', paidBy: 'deducted' }` |
    | Meals | `{ provided: false }` |
    | `visaSponsorship` | `'none'` |
    | Cover | `coverMediaId` set |

  - `makePublishedListing(o?: Partial<PublishedListing> & { content?: DeepPartial<ListingContent> }): PublishedListing`
- **`tests/fakes/sp2.ts`:**
  - `fakeSp2`, with these methods:
    - `reset()`
    - `putListing(o): PublishedListing`, which also sets the state to `active`
    - `setListingState(id, state: ListingState)`
    - `putHost(h: Partial<HostIdentity> & { orgId })`
    - `putLocation(l: Partial<Location> & { id })`
    - `setDestinations(d)`
    - `failNext(fn: 'getPublishedListing' | 'getListingSummaries' | 'getHostIdentities' | 'getLocations')`
  - Module objects for `vi.mock`:
    - `listingsFake`: `getListingSummaries`, `getPublishedListing` (active only), `listActiveListings` (ordered by `listingId`, with `after` and `limit`), `listOccupations`, `registerListingStatsProvider` (records the calls in `fakeSp2.statsProviders`) and `GENRES`
    - `hostpagesFake`: `getHostIdentities` and `listPublicHostSlugs`
    - `locationsFake`: `getLocations` and `listDestinations`, with Yellowstone (`yellowstone`, "Yellowstone National Park", `['WY', 'MT', 'ID']`) as the default
  - `GENRES` holds the 25 product section 3 genres as `{ code, label, category }`, for example `{ code: 'ski_resorts', label: 'Ski resorts', category: 'seasonal' }`.
- **`tests/fakes/media.ts`:** `mediaFake` replaces `getMediaUrl` with `https://media.test/<id>/<variant>.webp` (ignoring its `storage` argument), `getMediaInfo` with `altText: 'Alt for <id>'`, and `getStorage` with `memoryStorage()`.
- **Usage pattern** (documented at the top of `sp2.ts`):

  ```ts
  vi.mock('@/modules/listings', async () => (await import('../../../tests/fakes/sp2')).listingsFake);
  ```

- [ ] **Step 1: Write the failing tests.**
  - `putListing` followed by `getPublishedListing` returns the listing.
  - After `setListingState(id, 'closed')`, `getPublishedListing` is null and `getListingSummaries` reports `closed`.
  - `listActiveListings({ limit: 2 })` over 3 listings returns 2 items and `next`; the next page returns 1 item and `next: null`.
  - After `failNext('getPublishedListing')`, the next call throws and the one after it works.
  - `ListingContentSchema.parse(makeListingContent())` succeeds, using SP2's real schema.
- [ ] **Step 2:** Run `pnpm test tests/fakes`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with the message `test(discovery): SP2, SP4 and media fakes with a listing content factory`.

---

## Phase B1 (parallel: W1 and W5, each in its own worktree)

### Task 6 (W1): Pay normalization and formatting

**Files:**
- Modify: `src/lib/discovery/pay.ts` (replacing the stub), `src/modules/discovery/projection.ts` (`toHourlyCents` only)
- Test: `src/lib/discovery/pay.test.ts`

**Interfaces:**
- **Produces:**
  - `normalizePay(c: Pick<ListingContent, 'pay' | 'when'>): { minCents: number | null; maxCents: number | null; yearlyMinCents: number | null }`, using the spec 8.2 rules.
  - `yearlyMinCents = Math.round(minCents × W × 52)`.
  - `formatPay(c): { chip: string; full: string; details: string[] }`
  - `toHourlyCents(c)` returns `{ minCents, maxCents }` from `normalizePay`.
- **Display rules for open choices** (Plan decision 10):
  - The chip writes amounts of $10,000 and up as `$Nk`, with at most one decimal (`$12.5k`).
  - The crew-share chip is `est. $8k–$12k/season`.
  - Detail lines, in this order:
    - `Overtime available`
    - `Tips`
    - `Bonus: <bonuses>`
    - the frequency, one of `Paid weekly`, `Paid every 2 weeks`, `Paid twice a month`, `Paid monthly`, `Paid at the end of the season`, `Paid per trip`
    - `Deductions: <deductions>`

- [ ] **Step 1: Write the failing tests** (`pay.test.ts`).

  ```ts
  it.each([
    ['$19/hr', hour(1900), 1900, null],
    ['$150/day', day(15000), 1875, null],
    ['$800/week at 40', week(80000, 40), 2000, null],
    ['$3,200/month at 40', month(320000, 40), 1846, null],
    ['$12,000/season Jun 1–Aug 31 at 48', season(1200000, fixed('2026-06-01', '2026-08-31'), 48), 1786, null],
    ['$52,000/year at 40', year(5200000, 40), 2500, null],
    ['crew $8,000–$12,000/season Jun 1–Aug 31 at 60', crew(800000, 1200000, 'season', fixed('2026-06-01', '2026-08-31'), 60), 952, 1429],
  ])('%s', (_n, c, min, max) => {
    expect(normalizePay(c).minCents).toBe(min);
    if (max !== null) expect(normalizePay(c).maxCents).toBe(max);
  });
  ```

  - Other `normalizePay` cases:
    - The season unit on a `season`-mode listing uses 13 weeks.
    - The season unit on an `ongoing` listing gives all three values null.
    - `$19/hr` at 40 gives `yearlyMinCents === 3952000`.
  - **Property test:** 1,000 cases from a seeded PRNG covering every unit. Converting `minCents` and `maxCents` back to the listing's unit stays within `[pay.minCents − tol, pay.maxCents + tol]`, where `tol` is the unit's per-hour factor ÷ 2.
  - `formatPay` (chip / full):
    - `$19/hr`; `$19–$22/hr`; `$18.50/hr`
    - `$150/day`; `$800/wk`; `$3,200/mo`
    - `$12k/season` / `$12,000/season`; `$12.5k/season`
    - `$52k/yr` / `$52,000/yr`
    - crew share: `est. $8k–$12k/season` / `Crew share · est. $8,000–$12,000/season`
  - `formatPay` details: `overtime: true, tips: true, bonuses: 'End-of-season bonus', frequency: 'biweekly', deductions: 'Housing $150/week'` gives `['Overtime available', 'Tips', 'Bonus: End-of-season bonus', 'Paid every 2 weeks', 'Deductions: Housing $150/week']`.
- [ ] **Step 2:** Run `pnpm test src/lib/discovery/pay.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `normalizePay`.** Fixed-date season weeks are `Math.ceil(inclusiveDays / 7)`. Round to the nearest cent at the end of each conversion.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): pay normalization and display formatting`.

### Task 7 (W1): Dates and seasons

**Files:**
- Modify: `src/lib/discovery/dates.ts`
- Test: `src/lib/discovery/dates.test.ts`

**Interfaces:**
- **Consumes:** `resolveTimeZone` (Task 1).
- **Produces** (dates are `YYYY-MM-DD` strings):
  - `todayIn(tz: string, now?: Date): string`
  - `addDays(d: string, n: number): string`
  - `daysBetween(a: string, b: string): number`
  - `withinMonthsEnd(today: string, n: 1 | 3 | 6): string`
  - `seasonWindow(s: Season, year: number): { from: string; to: string } | null`
  - `seasonLabel(s: Season, year: number): string` gives `'Summer 2027'`, `'Winter 2026–27'` or `'Year-round'`.
  - `effectiveStart(when: ListingContent['when']): string | null` and `effectiveEnd(when): string | null`
  - `dateLine(when: ListingContent['when'], today: string): { info: string; end: string | null }`
- **Date-line rules for open choices** (Plan decision 10):
  - A `season`-mode listing (not year-round) whose start is more than 30 days away reads its season label, and its end segment is null.
  - Fixed dates end with "Ends <date>".
  - Ongoing and year-round listings end with "Ongoing".

- [ ] **Step 1: Write the failing tests.**
  - `dateLine` with `today = '2026-06-01'`:

    | Start | Info |
    |---|---|
    | fixed start `2026-06-01` | "Starts today" |
    | fixed start `2026-06-02` | "Starts tomorrow" |
    | fixed start `2026-06-03` | "Starts in 2 days" |
    | fixed start `2026-07-01` | "Starts in 30 days" |
    | fixed start `2026-07-02` | "Begins Jul 2" |
    | fixed start `2027-01-15` | "Begins Jan 15, 2027" |
    | fixed start `2026-05-01` | "Begins now" |
    | ongoing, `start: null` | "Begins now" |
    | season summer 2027 | "Summer 2027" |
    | season winter 2026 | "Winter 2026–27" |
    | season summer 2026, with `today = '2026-05-20'` | "Starts in 12 days" |
    | season summer 2026, with `today = '2026-07-10'` | "Begins now" |

  - End segments:

    | Listing | `end` |
    |---|---|
    | fixed end `2026-09-30` | "Ends Sep 30" |
    | fixed end `2027-03-01` | "Ends Mar 1, 2027" |
    | ongoing | "Ongoing" |
    | year-round season | "Ongoing" |
    | summer 2027 season | null |

  - Season windows:
    - `seasonWindow('winter', 2026)` is `{ from: '2026-12-01', to: '2027-02-28' }`.
    - `seasonWindow('winter', 2027).to` is `'2028-02-29'`.
    - Spring is Mar 1–May 31, summer Jun 1–Aug 31, fall Sep 1–Nov 30.
    - `seasonWindow('year_round', 2026)` is null.
  - `withinMonthsEnd`:
    - `('2026-01-31', 1)` is `'2026-02-28'`.
    - `('2026-11-30', 3)` is `'2027-02-28'`.
    - `('2026-03-15', 6)` is `'2026-09-15'`.
  - `todayIn` at `2026-06-01T04:30:00Z`:

    | Time zone | Result |
    |---|---|
    | `America/Chicago` | `'2026-05-31'` |
    | `Pacific/Honolulu` | `'2026-05-31'` |
    | `UTC` | `'2026-06-01'` |
    | `Asia/Tokyo` | `'2026-06-01'` |

- [ ] **Step 2:** Run `pnpm test src/lib/discovery/dates.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `Intl.DateTimeFormat(..., { timeZone })` parts and UTC date arithmetic, with no date library.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): date lines, season windows and viewer-local today`.

### Task 8 (W1): Projection rows and listing sync

**Files:**
- Modify: `src/modules/discovery/projection.ts`, `sync.ts`
- Create: `src/modules/discovery/media.ts`
- Test: `src/modules/discovery/sync.test.ts`, `src/modules/discovery/sync.int.test.ts` (CI only)

**Interfaces:**
- **Consumes:**
  - The SP2 reads `getListingSummaries`, `getPublishedListing`, `listOccupations`, `GENRES`, `getHostIdentities`, `getLocations` and `listDestinations`.
  - `getMediaUrl`, `getMediaInfo` and `getStorage` (Task 4).
  - Foundation `slugify`, `withTx` and `queryRows`.
  - Task 2's `searchVectorSql`, `ProjectionRowInput` and `US_STATES`.
  - Tasks 6–7.
- **Produces:**
  - `buildProjectionRow(i: ProjectionSources): ProjectionRowInput`, a pure function, where
    `ProjectionSources = { published: PublishedListing; host: HostIdentity; location: Location; hostLogoUrl: string | null; cover: { src: Record<320 | 640 | 1280, string>; alt: string } | null; occupationLabel: string; genreLabel: string; destinationName: string | null; now: Date }`
  - `upsertProjectionRow(tx: Tx, row: ProjectionRowInput): Promise<void>` keeps an existing `first_active_at` and clears `closed_at`.
  - `syncListing(db: Db, listingId: string, now: Date): Promise<'upserted' | 'closed' | 'removed'>`
  - `syncHandlers['discovery.sync_listing']` takes the payload `{ listingId }`.
  - `publicMediaUrls(db: DbOrTx, ids: string[]): Promise<Map<string, Record<320 | 640 | 1280, string>>>` calls `getMediaUrl(db, getStorage(), SYSTEM_VIEWER, id, variant)` for each width, where `SYSTEM_VIEWER = { userId: '00000000-0000-0000-0000-000000000000', orgIds: [], isOperator: false }`. `mediaAlt(db: DbOrTx, ids: string[]): Promise<Map<string, string | null>>` reads `getMediaInfo`.
- **Row mapping** (spec 4; open choices per Plan decision 10):

  | Column | Source |
  |---|---|
  | `location_id` | the onsite `locationId`, or the Remote `hostLocationId` |
  | `slug` | `slugify(title)` |
  | `genre` | the genre code with `_` → `-` |
  | `destination_slug` | `genreDetails.destinationSlug` (Seasonal) |
  | `state`, `geog`, `approximate` | that location (`approximate` when `publicPrecision === 'city'`) |
  | `remote_states` | `['US']` for `all_us`, else the states |
  | `location_label` | `"<City>, <ST>"`; Remote: `"Remote · US"` or `"Remote · CO, UT"` (up to 5 codes, then `" +N more"`) |
  | `housing_cost_line` | `"Free"`, or `"$150/week · deducted from pay"` / `"$150/week · paid directly"` (the same for meals) |
  | `sponsors_visas` | `visaSponsorship !== 'none'` |
  | `published_at` | `firstPublishedAt` |
  | `indexed_at` | `now` |
  | `confirmed_active_at` | `confirmedActiveAt` |
  | `cover` | `{ src, alt }`, with the alt text from `getMediaInfo` or else the title |

- **Sync algorithm** (spec 6):
  1. In one transaction, take `pg_advisory_xact_lock(hashtext(listingId))` and read `getListingSummaries`.
  2. **`active`:** read the listing, host and location, then upsert. If any of these reads is missing, throw so the outbox retries.
  3. **`closed`:** set `is_active = false` and `closed_at = coalesce(closed_at, now)`. If there is no row, leave it absent.
  4. **Anything else, or a missing summary:** delete the row and, in the same transaction, the listing's `listing_dispositions` and `saved_search_matches`.

- [ ] **Step 1: Write the failing tests** (SP2, media and trust mocked with the Task 5 fakes).
  - `listing.published` sync of the default listing gives a row with `payHourlyMinCents 1900`, `locationLabel 'Breckenridge, CO'`, `approximate true` (precision `city`), `cover.src[640] === 'https://media.test/<cover>/640.webp'` and `isActive true`, and its `search` matches `lift`.
  - A `listing.changed` sync with a new title and revision updates `title` and `revisionId`, and keeps `firstActiveAt`.
  - `closed` gives `isActive false` with `closedAt` set, and the row is kept.
  - `removed` (and a missing summary) delete the row together with a seeded disposition and alert match for that listing; another listing's disposition remains. *(spec failure mode 1)*
  - A Remote `all_us` listing gets the host location's point and state, with `remoteStates ['US']` and `locationLabel 'Remote · US'`.
  - When `failNext('getPublishedListing')` makes a read throw, the handler throws and the existing row is unchanged.
  - When the fake state flips active → closed between two `syncListing` calls, the final row is inactive. Run in either order, the latest state wins.
  - `sync.int.test.ts`: two concurrent `syncListing` calls on real Postgres, one active and one removed, end with exactly the state SP2 holds last.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/sync.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Write the upsert as raw SQL through `queryRows`, using `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` and `searchVectorSql`.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): projection row builder and listing sync`.

### Task 9 (W1): Host fan-out, drift check and rebuild

**Files:**
- Modify: `src/modules/discovery/sync.ts`
- Create: `scripts/discovery-rebuild.ts`
- Test: `src/modules/discovery/sync.test.ts` (a new `describe`)

**Interfaces:**
- **Consumes:** `listActiveListings`, `getListingSummaries`, `enqueue`, `record` (audit) and `raiseAlert` (trust).
- **Produces:**
  - `syncHost(db: Db, i: { orgId: string; locationId?: string; after?: string }, now: Date): Promise<{ synced: number; next: string | null }>` re-syncs up to 100 projection rows of the org (or of the location), ordered by `listing_id`.
  - `syncHandlers['discovery.sync_host']` re-enqueues `{ orgId, locationId, after: next }` with the dedupe key `sync_host:<orgId>:<locationId ?? '*'>:<next>` while `next` is not null.
  - `driftCheck(db: Db, now: Date): Promise<{ upserted: number; removed: number; repaired: number }>`. It runs in two passes:
    1. Pages `listActiveListings` (500 a page) and re-syncs every listing whose projection `revision_id` differs or is missing.
    2. Pages the active projection rows (500 a page) through `getListingSummaries` and re-syncs every row SP2 no longer reports as `active`.

    When `repaired > 0`, it records the audit action `discovery.drift_repaired` with the counts and calls `raiseAlert(db, { severity: 'warning', kind: 'discovery.drift', message: 'Search projection drifted from listings', data: counts })`.
  - `syncHandlers['discovery.drift_check']`
  - `rebuildSearchProjection(db: Db): Promise<{ upserted: number; removed: number }>` runs the same passes and records `discovery.projection_rebuilt`. `pnpm discovery:rebuild` calls it.

- [ ] **Step 1: Write the failing tests.**
  - An org with 250 projection rows and a changed host name: the first `sync_host` run updates 100 and enqueues one follow-up with `after`. Running the worker three times updates all 250.
  - `location.updated` re-syncs only that location's rows. The other location's `indexed_at` is unchanged.
  - Drift: a listing that SP2 lists but the projection lacks, a revision mismatch, and an active row whose SP2 state is `closed` are repaired. The result is `{ upserted: 2, removed: 1, repaired: 3 }`, one audit event `discovery.drift_repaired` exists, and `raiseAlert` is called once with kind `discovery.drift`.
  - With no drift, there is no alert and no audit event.
  - `rebuildSearchProjection` returns its counts and records `discovery.projection_rebuilt`.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/sync.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): host and location fan-out, nightly drift check, rebuild`.

### Task 10 (W1): Card hydration

**Files:**
- Create: `src/modules/discovery/cards.ts`
- Test: `src/modules/discovery/cards.test.ts`

**Interfaces:**
- **Consumes:**
  - `PROJECTION_SELECT` and `ProjectionRow` (Task 2)
  - `getPlacementHook`, `overlayApplied` (Task 3)
  - `dateLine`, `todayIn` (Task 7)
- **Produces:**
  - `rowToCard(row: ProjectionRow, ctx: CardContext): JobCardData`, a pure function, where `CardContext = { today: string; source: DiscoverySource; viewer: JobCardData['viewer']; boostId: string | null }`
  - `href = /jobs/view/<id>/<slug>?source=<source>`, or `source=boost` when `boostId` comes from an inserted slot (`LoadCardsOptions.boostIds`).
  - `loadCards(db: DbOrTx, ids: string[], o: LoadCardsOptions): Promise<JobCardData[]>`, where `LoadCardsOptions = { viewerUserId: string | null; tz: string; source: DiscoverySource; includeClosed?: boolean; boostIds?: Map<string, string>; now?: Date }`. Cards come back in input order; unknown IDs are skipped, and so are closed ones unless `includeClosed` is set.
  - **Viewer:** null for guests. For a seeker it is `{ disposition, applied }`, read from `listing_dispositions` and `overlayApplied`.
  - **Boosted:** `boostedAmong` runs on the card IDs. It is merged with `boostIds`, where an inserted slot wins.
  - `boostedLabels(db: DbOrTx, ids: string[], now: Date): Promise<Map<string, string>>` returns an empty Map and calls `logger.warn('discovery.boosted_among_failed')` when the hook throws.

- [ ] **Step 1: Write the failing tests.**
  - `loadCards(db, [c, a, missing, b], ...)` returns `[c, a, b]`. With a closed listing `b` and no `includeClosed`, it returns `[c, a]`.
  - A guest gets `viewer` null. For a seeker who saved `a` (with the overlay fake applying `c`), `a.viewer` is `{ disposition: 'saved', applied: false }` and `c.viewer.applied` is true.
  - With a fake hook whose `boostedAmong` returns `{ a: 'b9' }`, `a.boosted` is `{ boostId: 'b9' }`. When it throws, every `boosted` is null and `logger.warn` is called.
  - `dateLine` is computed in `o.tz`, with a listing starting `2026-06-02` and `now` at `2026-06-01T04:30Z`. In `UTC` it reads "Starts tomorrow"; in `America/Chicago` it reads "Starts in 2 days".
  - `a.href` is `/jobs/view/<a>/lift-operator?source=seek`, and a slot with a boost ID reads `?source=boost`.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/cards.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): card hydration with viewer state and boosted labels`.

### Task 11 (W1): Synthetic seeder

**Files:**
- Modify: `src/modules/discovery/seed.ts`
- Create: `scripts/seed-synthetic.ts`
- Test: `src/modules/discovery/seed.test.ts`

**Interfaces:**
- **Produces:** `seedSynthetic(db: Db, i: { count: number; seed: number }): Promise<void>`. It writes projection rows only, through a seeded mulberry32 PRNG, in batches of 1,000.
  - **Locations:** about `count / 4.2` distinct `location_id`s (about 12,000 for 50,000 listings), weighted by state population.
  - **Categories:** Seasonal 40%, Farm 25%, Remote 20%, Maritime 15%. Remote is 30% overall.
  - **Pay:** mixed units.
  - **Dates:** `published_at` spread over 90 days; `start_on` spread across the next 9 months.
  - It throws `Error('seedSynthetic is not allowed in prod')` when `getEnv().APP_ENV === 'prod'`.
  - `pnpm discovery:seed-synthetic --count 50000 --seed 42` calls it on `getDb()`.

- [ ] **Step 1: Write the failing tests.**
  - `seedSynthetic({ count: 2000, seed: 42 })` into two fresh databases gives identical `md5(string_agg(... order by listing_id))` digests.
  - Remote is between 27% and 33%, and all 4 categories are present.
  - With `APP_ENV=prod` (`vi.stubEnv` plus `resetEnvCache`), it throws.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/seed.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Derive the IDs from the PRNG as UUIDv7-shaped strings, so they stay deterministic.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): deterministic synthetic projection seeder`.

### Task 12 (W5): JobCard labels, card mapping and the small patterns

**Files:**
- Modify: `src/ui/components/JobCard.tsx` and `JobCard.test.tsx`; `src/ui/icons.ts` (add `Share`, `SquarePlus`, `LocateFixed`, `Flag`, `ExternalLink`); `src/ui/tokens.css` (add `@utility pb-safe { padding-bottom: env(safe-area-inset-bottom); }`).
- Create: `src/ui/patterns/ActionBar.tsx`, `SignInPrompt.tsx`, `OffsiteNotice.tsx`, `JobChipSheet.tsx` and `src/ui/patterns/discovery-basic.test.tsx`; `src/lib/discovery/card-props.ts` (replacing the stub) with `card-props.test.ts`; `src/app/design-system/discovery/page.tsx`; `tests/e2e/discovery-patterns.spec.ts`.

**Interfaces:**
- **JobCard changes:**
  - `pay` becomes `Pay | { label: string }`.
  - `starts` gains `{ label: string }`.
  - New optional props: `endLabel?: string`, rendered as `· {endLabel}` in place of `· Ends …`, and `applied?: boolean`, which makes the Apply button read "Applied" and be disabled.
  - Foundation call sites still compile.
- **`ActionBar`:** `{ saved: boolean; applied: boolean; closed: boolean; onSkip(): void; onApply(): void; onSave(): void }`. It is pinned to the bottom with `pb-safe`.
  - A closed listing has no Apply, and Save reads "Remove" when saved.
  - Applied shows "Applied", disabled.
- **`SignInPrompt`:** `{ open; onOpenChange; action: 'save' | 'apply' | 'skip' | 'alert'; variant: 'guest' | 'wrong_account'; signInHref: string; signUpHref: string }`. It is a bottom sheet below 768 px and a `Dialog` above.
- **`OffsiteNotice`:** `{ open; onOpenChange; url: string; domain: string }`.
- **`JobChipSheet`:** `{ open; onOpenChange; title: string; icon; lines: string[]; footer: { label: string; href: string } }`.
- **`card-props.ts`:**
  - `toJobCardProps(d: JobCardData, h: { onSave?; onSkip?; onApply?; onOpenChip?; onOpen?; onInfo?; hideActions?; titleAs? }): JobCardProps`
  - The mapping:

    | JobCard prop | From |
    |---|---|
    | `pay` | `{ label: d.pay.chip }` |
    | `starts` | `{ label: d.dateLine.info }` |
    | `endLabel` | `d.dateLine.end ?? undefined` |
    | `host.href` | `/hosts/<slug>` |
    | `host.subscriber` | `d.host.subscriberSince !== null` |
    | `cover.src` | the 640 variant |
    | `cover.srcSet` | `"<320> 320w, <640> 640w, <1280> 1280w"` |
    | `saved` | `d.viewer?.disposition === 'saved'` |
    | `applied` | `d.viewer?.applied` |
    | `boosted` | `d.boosted !== null` |

  - `chipSheetContent(d: JobCardData, chip: 'housing' | 'meals' | 'pay'): { title: string; lines: string[]; footer: { label: string; href: string } }`:
    - **housing:** the lines are `[costLine, note]`, without nulls, or `['No housing']`. The footer reads "All housing details on the listing".
    - **meals:** the same, with "No meals" and "All meal details on the listing".
    - **pay:** the lines are `[full, ...details]`, and the footer reads "All pay details on the listing".
- **Gallery:** `/design-system/discovery` shows every SP3 pattern in each of its states, in light and dark. Each later W5 task adds its entries.

- [ ] **Step 1: Write the failing tests.**
  - JobCard:
    - `pay={{ label: '$52k/yr' }}` renders "$52k/yr".
    - `starts={{ label: 'Summer 2027' }}` renders "Summer 2027".
    - `endLabel="Ongoing"` renders "· Ongoing" with no "Ends".
    - `applied` renders a disabled "Applied" button.
    - The existing JobCard tests still pass.
  - `toJobCardProps(card)` maps `saved`, `boosted`, the subscriber flag, `host.href === '/hosts/kettle-ridge-lodge'` and the 3-width `srcSet`.
  - `chipSheetContent(card, 'housing').lines` is `['$150/week · deducted from pay', <note>]`.
  - SignInPrompt titles: "Sign in to save jobs", "Sign in to apply", "Sign in to hide this job", "Sign in to get job alerts".
    - `wrong_account` shows "Saving and applying need a seeker account."
    - The "Sign in" and "Create account" links point to the given hrefs.
  - OffsiteNotice:
    - It shows "You're going to apply.kettleridge.com, which isn't part of Explore&Earn. Never pay to get a job."
    - Continue is an `<a target="_blank" rel="noopener noreferrer">`.
    - An `http:` URL renders no Continue link.
  - ActionBar:
    - With `closed`, there is no "Apply".
    - With `saved` and `closed`, the button reads "Remove".
    - Its root element has the class `pb-safe`.
  - E2E `discovery-patterns.spec.ts`:
    - `/design-system/discovery` has 0 serious or critical axe violations in light and dark, at 390 px and 1280 px.
    - The screenshot baselines are created.
- [ ] **Step 2:** Run `pnpm test src/ui src/lib/discovery/card-props.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests, `pnpm check:tokens` and `pnpm e2e tests/e2e/discovery-patterns.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(ui): JobCard labels, ActionBar, SignInPrompt, OffsiteNotice, chip sheets`.

### Task 13 (W5): SearchBox, FilterPanel and ActiveFilterChips

**Files:**
- Create: `src/ui/patterns/SearchBox.tsx`, `FilterPanel.tsx`, `ActiveFilterChips.tsx`, `src/ui/patterns/filters.test.tsx`
- Modify: `src/app/design-system/discovery/page.tsx`

**Interfaces:**
- **Consumes:** the types `DiscoveryQuery`, `FilterOptions` and `FilterChip` from `@/lib/discovery`.
- **Produces:**
  - **`SearchBox`:** `{ value: string; onValueChange(v: string): void; onSubmit(q: string): void; suggestions: { jobs: { label; q }[]; places: { label; kind; value }[]; employers: { label; orgId; slug }[] }; onSelectPlace(p): void; onSelectEmployer(e): void; loading?: boolean }`. It is an ARIA 1.2 combobox with a listbox grouped as "Jobs", "Places" and "Employers". The caller debounces the fetch.
  - **`FilterPanel`:** `{ value: DiscoveryQuery; onChange(q: DiscoveryQuery): void; options: FilterOptions; layout: 'rail' | 'sheet'; onUseLocation?(): void; hasOrigin?: boolean }`. Its sections, in order:
    - Category: Pills with `aria-pressed`.
    - Genre: genres of the selected categories, or all of them.
    - State: up to 10.
    - Destination.
    - Start date: Within 1, 3 or 6 months; or a season plus a year from `seasonYears`.
    - Housing: "Housing provided", plus a "Free only" Switch that is enabled only when Housing provided is on.
    - Meals: the same pair.
    - "Sponsors visas".
    - Pay: a `SegmentedControl` hour / day / year and a `Slider` with hour $0–$60 step $1, day $0–$500 step $10, and year $0–$150,000 step $1,000. 0 means no filter.
    - A "Use my location" Button.
    - The rail is 280 px wide.
  - **`ActiveFilterChips`:** `{ chips: FilterChip[]; onRemove(key: string): void; onClearAll(): void }`. Each chip's remove button is labeled "Remove filter: {label}", followed by "Clear all".

- [ ] **Step 1: Write the failing tests** (jsdom).
  - SearchBox:
    - The input has `role="combobox"`, and `aria-expanded` turns true with suggestions.
    - The groups are named "Jobs", "Places" and "Employers".
    - ArrowDown moves `aria-activedescendant`; Enter selects the option; Escape closes the list.
  - FilterPanel:
    - Ticking "Housing provided" calls `onChange` with `housing: 'provided'`.
    - "Free only" is disabled until then, and turning it on sets `'free'`.
    - Switching the unit to "day" sets the slider's max to 500 and its step to 10.
    - Moving the slider to 0 removes `pay`.
    - The year select offers `seasonYears` [2026, 2027].
    - With `categories: ['farm']`, only farm genres are listed.
  - ActiveFilterChips: removing "Ski resorts" calls `onRemove('genre:ski-resorts')`, and "Clear all" calls `onClearAll`.
- [ ] **Step 2:** Run `pnpm test src/ui/patterns/filters.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement on Foundation `Pill`, `Checkbox`, `Switch`, `Select`, `Slider`, `SegmentedControl` and Radix Popover. Add the gallery entries.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(ui): SearchBox, FilterPanel, ActiveFilterChips patterns`.

### Task 14 (W5): SwipeDeck

**Files:**
- Create: `src/ui/patterns/swipe-gesture.ts`, `src/ui/patterns/SwipeDeck.tsx`, `src/ui/patterns/swipe.test.tsx`
- Modify: the gallery page

**Interfaces:**
- **Gesture rules:** `swipeIntent(i: { dx: number; dy: number; width: number }): 'skip' | 'save' | 'apply' | null`, per spec 8.5:
  - A horizontal swipe commits at `|dx| ≥ 0.25 × width`, with `|dx| ≥ 1.5 × |dy|`. Left is skip and right is save.
  - An upward swipe commits at `−dy ≥ 100` with `|dy| ≥ 1.5 × |dx|`, which is apply.
- **Key rules:** `keyIntent(e: { key: string; target: EventTarget | null; selection: string; overlayOpen: boolean }): 'skip' | 'save' | 'apply' | 'details' | 'undo' | null`.
  - The keys map as ArrowLeft, ArrowRight, ArrowUp, Enter and `u`/`U`.
  - It returns null when the target is an `input`, `textarea` or `select`, `[contenteditable]`, or `[role="slider"]`; when `overlayOpen`; or when `selection` is not empty.
- **`SwipeDeck<T extends { id: string }>`:** `{ cards: T[]; renderCard(card: T, top: boolean): ReactNode; onAction(card: T, a: 'skip' | 'save' | 'apply' | 'details'): void; onUndo(): void; disabled?: boolean; announcement: string; loading?: boolean }`.
  - The deck is a focusable region labeled "Job cards".
  - Pointer gestures are off when `disabled`.
  - Under reduced motion there is no fly-out, only a 150 ms fade.
  - It has a polite live region that shows `announcement`.
  - `overlayOpen` is `document.querySelector('[role="dialog"], [role="alertdialog"]') !== null`.

- [ ] **Step 1: Write the failing tests.**

  ```ts
  it.each([
    [{ dx: -100, dy: 0, width: 400 }, 'skip'], [{ dx: -99, dy: 0, width: 400 }, null],
    [{ dx: 100, dy: 10, width: 400 }, 'save'], [{ dx: 120, dy: 90, width: 400 }, null],
    [{ dx: 10, dy: -100, width: 400 }, 'apply'], [{ dx: 0, dy: -99, width: 400 }, null],
  ])('swipeIntent %o', (i, want) => expect(swipeIntent(i)).toBe(want));
  ```

  - `keyIntent` maps ArrowLeft→skip, ArrowRight→save, ArrowUp→apply, Enter→details, `u`→undo and `U`→undo.
  - The same keys return null when the target is an `<input>`, a `<textarea>`, a `<div role="slider">` or a `contenteditable` element; when `overlayOpen` is true; or when `selection` is `'Lift'`. *(Review Focus 2)*
  - Component:
    - 10 rapid ArrowRight presses on a deck of `c1`…`c10` call `onAction` 10 times with `c1`…`c10` in order.
    - With `disabled`, a press calls nothing.
    - The live region (`aria-live="polite"`) contains `announcement`.
    - An ArrowLeft inside an `<input>` within the deck's page calls nothing.
- [ ] **Step 2:** Run `pnpm test src/ui/patterns/swipe.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement with Pointer Events and `setPointerCapture`. Add the gallery entries.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(ui): SwipeDeck with gesture and keyboard rules`.

### Task 15 (W5): MapCanvas, MapPin, HostPreview and PullUpSheet

**Files:**
- Create: `src/ui/patterns/MapCanvas.tsx`, `MapPin.tsx`, `HostPreview.tsx`, `PullUpSheet.tsx`, `src/ui/patterns/map.test.tsx`
- Modify: the gallery page (MapCanvas shows its fallback state there)

**Interfaces:**
- **Consumes:** the types `MapPin`, `MapCluster` and `HostPreview`; `colors` and `categoryMeta`.
- **`MapCanvas`:** `{ token: string | null; theme: 'light' | 'dark'; bounds: [number, number, number, number]; pins: MapPin[]; clusters: MapCluster[]; onMoveEnd(b: { west: number; south: number; east: number; north: number }, zoom: number): void; onPinClick(locationId: string): void; onError(): void; flyTo?: { lat: number; lng: number; zoom: number } | null }`.
  - It loads `mapbox-gl` with `await import('mapbox-gl')`. The style is `light-v11` or `dark-v11`.
  - Pins go into a GeoJSON source with `cluster: true, clusterMaxZoom: 12, clusterRadius: 50`. Clusters are neutral circles with their count. Pins use the category's `solid` color and its lucide icon, registered with `addImage`. Server clusters render as neutral circles too.
  - `onMoveEnd` is debounced by 300 ms.
  - It calls `onError` when the token is missing, `mapboxgl.supported()` is false, the import rejects, or the map fires `error` before `load`.
- **`MapPin`:** `{ category; remoteOnly; boosted }`, the legend and marker visual. SP6 adds the boosted style.
- **`HostPreview`:** `{ host: HostPreview; matchingCount: number; activeCount: number; children: ReactNode }`. It shows the OrgLogo, name and location, "Approximate location" when `approximate`, category dots (icon plus label), a "Hiring now" `Pill`, "N active jobs", a "View page" `Button` linking to `/hosts/<slug>`, the remote line, and then "N matching jobs" above the children.
- **`PullUpSheet`:** `{ title: string; snap: 'peek' | 'half' | 'full'; onSnapChange(s): void; children }`. The snap heights are 96 px, 50% and 92%.
  - Its handle is a `<button>` labeled "Show list" or "Hide list" that cycles the snaps, and it can be dragged.
  - It pads with `pb-safe`.

- [ ] **Step 1: Write the failing tests** (jsdom, with `vi.mock('mapbox-gl')`).
  - `supported()` false, or `token: null`, call `onError` once and create no map.
  - The source options include `cluster: true`, `clusterMaxZoom: 12` and `clusterRadius: 50`.
  - `theme: 'dark'` uses `mapbox://styles/mapbox/dark-v11`.
  - Three `moveend` events within 100 ms call `onMoveEnd` once, 300 ms later (fake timers).
  - A click on a pin feature calls `onPinClick` with its `locationId`.
  - HostPreview with `approximate` shows "Approximate location", and with `matchingCount: 2` shows "2 matching jobs". "View page" points to `/hosts/seward-fishing-co`.
  - PullUpSheet: Enter on the handle moves from peek to half, and the handle's name changes accordingly.
- [ ] **Step 2:** Run `pnpm test src/ui/patterns/map.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. Add the gallery entries.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(ui): MapCanvas, MapPin, HostPreview, PullUpSheet patterns`.

### Task 16 (W5): LandingHero and InstallPrompt

**Files:**
- Create: `src/ui/patterns/LandingHero.tsx`, `InstallPrompt.tsx`, `src/ui/patterns/landing-install.test.tsx`
- Modify: the gallery page (with both InstallPrompt variants); `tests/e2e/discovery-patterns.spec.ts` (covering the new entries)

**Interfaces:**
- **`LandingHero`:** `{ title: string; intro: string; hero: { src: string; srcSet?: string; alt: string } | null }`. It always shows the strapline "Explore the country. Earn as you go.", and the title is the page's `h1`.
- **`InstallPrompt`:** `{ open: boolean; onOpenChange(o: boolean): void; variant: 'chromium' | 'ios'; line: 0 | 1; iosSavedSearch?: boolean; onAccept(): void; onDismiss(): void }`. The copy follows spec 8.15:
  - **First line:** "Work worth going somewhere for." for line 0, or "Explore the country. Earn as you go." for line 1.
  - **Title:** "Add Explore&Earn to your Home Screen".
  - **Body:** "Open your saved jobs and alerts in one tap." When `iosSavedSearch`, the body is instead "On iPhone and iPad, push alerts for your saved searches need Explore&Earn on your Home Screen. Email alerts work either way."
  - **Chromium buttons:** "Add to Home Screen" (primary) and "Not now".
  - **iOS steps:** "1. Tap Share" (with the `Share` icon) and "2. Choose Add to Home Screen" (with `SquarePlus`), then the buttons "Got it" and "Not now".
  - Focus moves to the title. Escape or swiping down calls `onDismiss`. Under reduced motion it uses a 150 ms fade.

- [ ] **Step 1: Write the failing tests.**
  - LandingHero:
    - It renders the strapline and an `h1` with the title.
    - The `img` carries the hero alt text.
    - With `hero: null`, there is no `img`.
  - InstallPrompt:
    - The Chromium variant with `line: 0` shows "Work worth going somewhere for."; with `line: 1`, the other line.
    - The iOS variant shows both steps and "Got it".
    - With `iosSavedSearch`, it shows its body.
    - Escape calls `onDismiss`.
    - The focused element is the title.
    - No rendered text contains "!".
- [ ] **Step 2:** Run `pnpm test src/ui/patterns/landing-install.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement on Foundation `Sheet`. Add the gallery entries.
- [ ] **Step 4:** Run the test and `pnpm e2e tests/e2e/discovery-patterns.spec.ts` (axe in both themes at 390 px and 1280 px, including both InstallPrompt variants). Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(ui): LandingHero and InstallPrompt patterns`.

---

## Phase B2 (parallel: W2 and W3; based on W1 and W5 merged)

### Task 17 (W2): URL codec and filter summaries

**Files:**
- Modify: `src/lib/discovery/query.ts`
- Test: `src/lib/discovery/query.test.ts`

**Interfaces:**
- **Produces:**
  - `parseQuery(p: URLSearchParams): { query: DiscoveryQuery; sort: DiscoverySort; hostSlug?: string }` applies the spec 8.1 table and drops invalid values.
    - The genre and destination slugs match `/^[a-z0-9-]{1,60}$/`.
    - `state` takes codes from `US_STATES`.
    - Lists keep their first 10 valid values.
    - `start` takes `1m`, `3m` or `6m`, or `<season>-<year>` with a year from 2000 to 2100. `year_round-2027` is valid.
    - `pay` takes whole dollars within the slider range.
    - `bbox`, `locationId` and `cursor` are never read.
  - `serializeQuery(q: DiscoveryQuery, sort: DiscoverySort, opts?: { hostSlug?: string }): URLSearchParams` writes the keys in the order `q`, `cat`, `genre`, `state`, `dest`, `host`, `start`, `soon`, `housing`, `meals`, `visa`, `pay`, `sort`. It omits `sort=relevant`.
  - `canonicalQuery(q: DiscoveryQuery): string` produces JSON with sorted keys and arrays. It leaves out `bbox`, `locationId` and empty values.
  - `describeFilters(q: DiscoveryQuery, labels: QueryLabels): FilterChip[]`, in the same key order, with one chip per list value. The labels:

    | Filter | Label |
    |---|---|
    | `q` | `"lift"` (in quotes) |
    | categories | `Farm` |
    | genres | the genre label |
    | states | the state code |
    | destination | the destination name |
    | host | the host name |
    | `start` | `Within 3 months`, `Summer 2027`, `Winter 2026–27`, `Year-round` |
    | `soon` | `Starting soon` |
    | housing | `Housing provided`, `Free housing` |
    | meals | `Meals provided`, `Free meals` |
    | `visa` | `Sponsors visas` |
    | pay | `$20+/hr`, `$150+/day`, `$40k+/yr` |

    The keys are `q`, `cat:<c>`, `genre:<slug>`, `state:<code>`, `dest`, `host`, `start`, `soon`, `housing`, `meals`, `visa` and `pay`.
  - `removeFilter(q: DiscoveryQuery, key: string): DiscoveryQuery`
  - `summarizeQuery(q, labels, maxLen = 80): string` joins the chip labels with `" · "`. An empty query reads `"All jobs"`. Past `maxLen`, the summary is cut at `maxLen − 1` and `"…"` is appended.
  - `discoveryQuerySchema: z.ZodType<DiscoveryQuery>` applies the same bounds strictly, for JSON bodies.
  - `PAY_RANGES = { hour: { max: 60, step: 1 }, day: { max: 500, step: 10 }, year: { max: 150000, step: 1000 } }`, in dollars.

- [ ] **Step 1: Write the failing tests.**
  - Parsing `?q=lift&cat=farm,beach&state=CO,PR,ZZ&start=summer-2027&soon=1&housing=free&visa=1&pay=20-hour&sort=newest` gives `{ q: 'lift', categories: ['farm'], states: ['CO', 'PR'], start: { season: 'summer', year: 2027 }, startingSoon: true, housing: 'free', sponsorsVisas: true, pay: { minCents: 2000, unit: 'hour' } }` with sort `newest`.
  - Invalid values are dropped: `pay=61-hour`, `pay=0-day`, `start=9m`, a 101-character `q`, `sort=pay` (which falls back to `relevant`), and 11 states (the first 10 are kept).
  - `?host=kettle-ridge-lodge` gives `hostSlug: 'kettle-ridge-lodge'`.
  - `serializeQuery(parseQuery(x).query, sort)` round-trips the canonical form.
  - `canonicalQuery` ignores the order of keys and arrays and drops `bbox`.
  - `summarizeQuery({ genres: ['ski-resorts'], states: ['CO'], housing: 'provided' }, labels)` is `'Ski resorts · CO · Housing provided'`, and `summarizeQuery({}, labels)` is `'All jobs'`.
  - A query with 10 genres, 10 states, pay and housing gives a summary of at most 80 characters that ends with `'…'`. *(Review Focus 4)*
  - `removeFilter(q, 'state:CO')` drops only CO.
- [ ] **Step 2:** Run `pnpm test src/lib/discovery/query.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Each parameter goes through its own zod `safeParse`.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): URL codec, canonical query and filter summaries`.

### Task 18 (W2): Filter builder, cursor and search

**Files:**
- Create: `src/modules/discovery/filters.ts`, `cursor.ts`
- Modify: `src/modules/discovery/search.ts`
- Test: `src/modules/discovery/search.test.ts`

**Interfaces:**
- **Consumes:**
  - `PROJECTION_SELECT`
  - `loadCards` (Task 10)
  - `overlayApplied` and `overlayHidden`
  - the dates helpers
  - `stateByCode`
- **Produces** — `filters.ts`:
  - `FilterContext = { today: string; viewerUserId: string | null; surface: 'seek' | 'swipe' | 'map_list' | 'alerts'; applied: string[]; hidden: string[] }`
  - `buildFilterSql(q: DiscoveryQuery, ctx: FilterContext): SQL` returns the WHERE clause. It always includes `is_active`, and applies every spec 8.1 and 8.3 rule:

    | Filter | SQL rule |
    |---|---|
    | categories | `categories && $c` |
    | states | `(not remote and state = any($s)) or (remote and remote_states && ($s || '{US}'))` |
    | within N months | `start_on is null or start_on <= withinMonthsEnd` |
    | season S, year Y | `(season = S and season_year = Y) or start_on between window.from and window.to` |
    | year-round | `schedule_kind = 'ongoing' or (season = 'year_round' and season_year = Y)` |
    | starting soon | `start_on between today and today + 30` |
    | pay, per hour | `pay_hourly_min_cents >= T` |
    | pay, per day | `pay_hourly_min_cents * 8 >= T` |
    | pay, per year | `pay_yearly_min_cents >= T` |
    | `bbox` | `bboxSql(bbox)` (below) |
    | `locationId` | `location_id = $locationId` |

  - **Exclusions, by surface** (spec 8.1):
    - Every surface excludes the viewer's skipped listings and `hidden` orgs.
    - `swipe` also excludes saved listings and `applied`.
    - `alerts` also excludes `applied`.
  - `bboxSql(b: [number, number, number, number]): SQL` is `geog && ST_MakeEnvelope(w, s, e, n, 4326)::geography`. When `west > east` (across the antimeridian), it ORs two envelopes, `[w, s, 180, n]` and `[−180, s, e, n]`.
  - `tsQuerySql(q: string): SQL`: `websearch_to_tsquery('english', q)`, OR-ed with `to_tsquery('english', word || ':*')` when `q` is a single word of 3 or more letters or digits. A query whose `numnode` is 0, such as stopwords or punctuation only, acts as no `q`.
- **Produces** — `cursor.ts`:
  - `Cursor = { v: 1; h: string; s: (string | number | null)[]; id: string; asOf: string; ps: string | null; pi: number }`
  - `cursorHash(q: DiscoveryQuery, sort: DiscoverySort): string` is the hex `sha256(canonicalQuery(q) + '|' + sort)`.
  - `encodeCursor(c: Cursor): string` is base64url JSON.
  - `decodeCursor(raw: string, expectHash: string): Cursor` throws `badRequest('This page link is out of date. Search again.')` on bad base64, bad JSON, a shape mismatch, `v !== 1` or a hash mismatch.
- **Produces** — `search.ts`:
  - `searchListings(db, i: SearchInput)` returns the spec 3.1 output. In this task it uses organic results only; Task 19 adds placement.
  - **Sorts** (spec 8.4):
    - **relevant:** with `q`, `round(ts_rank_cd(search, tsq, 32), 6) desc`; then `bucket` (0 when `start_on` is null, `≤ asOf`, or `≤ asOf + 90`, else 1); then `published_at desc`, `listing_id desc`. Without `q`, drop the rank.
    - **newest:** `published_at desc, listing_id desc`.
    - **distance:** onsite listings first, ordered by `ST_Distance(geog, origin)`, then Remote by `published_at desc`. The origin is `i.origin` or a single state's centroid; without one, the search falls back to `relevant`.
  - **Paging:** keyset over the full sort tuple (`s`, `id`). `asOf` fixes "today" for every page. `limit` defaults to 20.
  - **Count:** `select count(*)::int from (... limit 10001)`. Above 10,000, the result is `total: 10000, totalCapped: true`.
  - `filterListingIds(db: DbOrTx, i: { listingIds: string[]; query: DiscoveryQuery; viewerUserId: string | null; surface: FilterContext['surface']; today: string; firstActiveAfter?: Date; limit?: number }): Promise<string[]>` keeps input order.

- [ ] **Step 1: Write the failing tests** (table-driven, one case per rule). Each case seeds rows with `insertProjectionRows` and asserts the exact IDs returned:
  - **`q`:**
    - `'lift'` matches "Lift operator" but not "Dishwasher".
    - `'lif'` matches "Lift operator" through the prefix.
    - `'the'`, `'&&'` and `"o'brien"` return the same IDs as no `q`, with no error.
  - **`categories: ['farm']`** matches a primary Farm listing and a Seasonal listing whose secondary category is Farm.
  - **genres, destination and `orgId`:** each matches only its own rows.
  - **`states: ['CO']`** matches an onsite CO listing, Remote `{CO}` and Remote `{US}`, but not Remote `{UT}` or onsite UT.
  - **`start: { withinMonths: 1 }`** with `today = 2026-01-31` matches `start_on` null, `2026-01-10` and `2026-02-28`, but not `2026-03-01`.
  - **Summer 2026** matches the `summer`/2026 season row and a fixed `2026-07-04` start, but not summer 2027.
  - **`year_round-2026`** matches ongoing rows and the `year_round`/2026 season row.
  - **`startingSoon`** matches today and today + 30, but not a listing that begins now or today + 31.
  - **housing and meals:** `provided` and `free` each match their rows.
  - **`sponsorsVisas`** matches its rows.
  - **pay:**
    - `{ minCents: 2000, unit: 'hour' }` matches hourly minimum 2000 but not 1999.
    - `{ minCents: 16000, unit: 'day' }` matches hourly minimum 2000.
    - `{ minCents: 4000000, unit: 'year' }` matches yearly minimum 4,000,000 but not 3,999,999.
  - **Exclusions:**
    - The viewer's skipped listings are gone on every surface.
    - A saved listing shows on `seek` with its viewer state, and is excluded on `swipe`.
    - A listing the overlay fake applied is excluded on `swipe`.
    - A hidden org's listings are gone.
    - A guest gets no exclusions.
  - **Sorts:**
    - Relevant with `q`: the rank comes first, then the bucket (a listing starting in 100 days ranks below one starting in 20, at equal rank), then the publish date.
    - Newest orders by `published_at`.
    - Distance with origin `39.74, −104.99` puts Denver before Breckenridge before Moab, with Remote last.
    - Distance with `states: ['CO']` uses the CO centroid.
    - Distance with no origin orders the same as relevant.
  - **Paging:** 45 matches at `limit: 20` give pages of 20, 20 and 5 with no duplicate or missing ID, and `nextCursor` is null at the end.
  - **Cursors:** a cursor from `cat=farm` used with `cat=remote` throws `bad_request`, and so does `'garbage'`.
  - **Count:** 10,001 matching rows (inserted with `generate_series`) give `total: 10000, totalCapped: true`. 3 rows give `3, false`.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/search.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Write the keyset comparison as an expanded OR over the sort tuple, honoring each column's direction.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): filter builder, keyset cursors, search and counts`.

### Task 19 (W2): Placement hook, overlay and deck

**Files:**
- Create: `src/modules/discovery/placement.ts`
- Modify: `src/modules/discovery/search.ts`
- Test: `src/modules/discovery/placement.test.ts`

**Interfaces:**
- **Consumes:** `getPlacementHook` and `setPlacementHookForTests` (Task 3); `filterListingIds` (Task 18).
- **Produces:**
  - `placeWithTimeout(db: DbOrTx, hook: BoostPlacementHook, i: PlacementInput, timeoutMs = 120): Promise<PlacementOutput>`. On a timeout or an error it returns `{ items: organic, organicConsumed: organic.length, state: i.state }` and logs `logger.warn('discovery.placement_failed')`.
  - `searchListings` changes for `surface: 'seek' | 'swipe'`:
    1. Fetch `limit` organic IDs after the cursor.
    2. Call `place` with:
       - `pageIndex = cursor?.pi + 1 ?? 0`
       - `pageSize = limit`
       - `matchIds`, bound to `filterListingIds` for this query, viewer and surface
       - `viewerKey`
       - `state = cursor?.ps ?? null`
    3. Deduplicate the items by `listingId`.
    4. Hydrate with `boostIds` from the items.
    5. The next cursor continues after the `organicConsumed`-th organic item and stores `ps = output.state` and `pi`.
  - `map_list` never calls `place`. `viewerKey` is the one `SearchInput` already carries.

- [ ] **Step 1: Write the failing tests** (spec 11, `placement.test.ts`).
  - A fake hook returns `[{ B, 'b1' }, ...organic.slice(0, 19)]`, `organicConsumed: 19` and `state: 'S1'`:
    - Page 1's first card is B, with `boosted.boostId === 'b1'` and an `href` ending `source=boost`.
    - The decoded cursor has `ps === 'S1'` and `pi === 0`.
    - Page 2 starts at organic item 20, and the hook receives `state: 'S1'` with `pageIndex: 1`.
  - Inside `place`, calling `matchIds([farmB, maritimeB, skippedB])` with `cat=farm` returns `[farmB]`. On Swipe it also drops a saved listing and an applied listing.
  - A hook that sleeps 200 ms returns the organic page within 150 ms and logs a warning. A throwing hook returns the organic page.
  - `boostedAmong` returning `{ o2: 'b9' }` labels `o2` on Seek and on the deck (the Map list, location preview, detail and `getJobCards` are asserted in Tasks 20 and 21).
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/placement.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `placement.test.ts` and `search.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): boosted placement hook with timeout and cursor state`.

### Task 20 (W2): Map pins, clusters and location preview

**Files:**
- Modify: `src/modules/discovery/map.ts`
- Test: `src/modules/discovery/map.test.ts`

**Interfaces:**
- **Consumes:** `buildFilterSql` and `bboxSql` (Task 18), `boostedLabels` (Task 10).
- **Produces:**
  - `MAX_PINS = 2000`; `clusterCellDegrees(zoom: number): number = 360 / 2 ** (zoom + 2)`.
  - `mapPins(db, i)` follows the spec 3.1 signature and 8.6. It groups matching listings by `location_id`, at the location's point.
    - **Category:** the one with the most matching listings there, with ties broken in `PIN_CATEGORY_ORDER`.
    - `categories` lists the distinct categories. `remoteOnly` is true when every match there is Remote.
    - **Boosted:** true when `boostedAmong` finds any matching ID there.
    - Above 2,000 locations, the result is grid clusters from `ST_SnapToGrid(geog::geometry, cell)`, with `capped: true`.
  - `locationPreview(db, i)` follows the spec 3.1 signature and returns null when the location has no active listing.
    - The host comes from the projection row: name, slug, logo, `"<City>, <ST>"` and `approximate`.
    - `categories` covers the location's active listings.
    - `activeCount` counts every active listing there; `matchingCount` and `items` cover the matches, in pages of 20.
    - **Remote line:** `"Remote · host based in <City>, <ST> · work from: US"`, or up to 5 state codes sorted A–Z, then `" +N more"`. It is null when the location has no Remote listing.

- [ ] **Step 1: Write the failing tests.**
  - Three onsite listings at location L1 (2 Maritime, 1 Farm) give one pin at L1 with `category: 'maritime'`, `matchingCount: 3` and both categories.
  - A 1–1 tie between Seasonal and Farm gives `seasonal`. A location with only Remote listings has `remoteOnly: true`.
  - A bbox around Colorado excludes the Alaska pins.
  - With 2,001 distinct locations, the result has `capped: true`, `pins: []` and at least one cluster, and every cluster's `listings` totals 2,001.
  - The bbox `[170, 50, −130, 72]` returns pins at longitudes 175 and −150 but not −100. *(Review Focus 5, server)*
  - `locationPreview`:
    - An approximate location reads `approximate: true`.
    - With `cat=farm`, `matchingCount` is 1 while `activeCount` is 3.
    - Remote states `['CO', 'UT', 'WA', 'OR', 'ID', 'MT', 'NV']` give "Remote · host based in Seward, AK · work from: CO, ID, MT, NV, OR +2 more".
    - A location without active listings returns null.
  - A pin is `boosted` when `boostedAmong` covers one of its matches, and the preview card for that match is labeled.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/map.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): map pins, server clusters, antimeridian bbox, location preview`.

### Task 21 (W2): Suggest, cards by ID, listing detail, counts and query context

**Files:**
- Modify: `src/modules/discovery/suggest.ts`, `detail.ts`, `query-context.ts`, `search.ts`
- Test: `src/modules/discovery/detail.test.ts`, `suggest.test.ts`, `query-context.test.ts`, `removal.test.ts`

**Interfaces:**
- **Consumes:** `getPublishedListing`, `getListingSummaries`, `getHostIdentities`, `getLocations`, `listDestinations`, `GENRES`, `buildProjectionRow`, `rowToCard` and `syncListing` (W1), `publicMediaUrls`, `boostedLabels`.
- **`suggest(db, q)`:** up to 5 results in each group.
  - **jobs:** distinct occupation labels first, then titles, from active listings where a word starts with `q` (case-insensitive). Each result is `{ label, q: label }`.
  - **places:** states whose names start with `q` (`kind: 'state'`, `value: code`), then destinations from `listDestinations` (`kind: 'destination'`, `value: slug`).
  - **employers:** `lower(host_name) like lower(q) || '%'` over active rows, as `{ label, orgId, slug }`.
- **`getJobCards`, `matchListingIds` and `countNewListings`:**
  - `getJobCards` returns active cards in input order. A card's `href` carries `source=boost` when `boostedAmong` labels it (SP7's boosted feed cards), and `source=other` otherwise.
  - `matchListingIds` is `filterListingIds` with `surface: 'seek'`.
  - `countNewListings` counts active rows with `first_active_at >= since`, returning `{ listings, hosts: distinct org_id, withHousing }`.
- **`getListingDetail(db, i)`:** follows spec 8.9.
  - **Active:** read `getPublishedListing` and build the card through `buildProjectionRow` and `rowToCard` from fresh SP2 data. A stale projection row is never used for an active listing.
  - **Not active:** when `getListingSummaries` says `closed` and an inactive row exists, return `{ status: 'closed', card }`. Otherwise return null.
  - **`photoUrls`:** the gallery, housing and meal photos.
  - **`activityLine`:**
    - "Confirmed active today", "Confirmed active 1 day ago" or "Confirmed active N days ago" when confirmed.
    - Otherwise "Posted today", "Posted 1 day ago" or "Posted N days ago" from `firstPublishedAt`.
    - Days are counted in the viewer's time zone.
  - **`categoryFields`:** labeled, non-empty values:

    | Category | Fields |
    |---|---|
    | Maritime | Vessel type, Home port, Rotation, Time at sea, Documents (TWIC, MMC, STCW) |
    | Seasonal | Destination (name), Staff perks |
    | Farm | Type of operation, Harvest window, Equipment, Certifications |
    | Remote | Time zone overlap, Equipment provided, Internet, Travel (None, Occasional or Regular) |

  - **`additionalStep`:** only for `https:` URLs, with `domain` set to the hostname; otherwise null.
  - **`validThrough`:** the deadline, else the fixed end date, else null.
- **Query context:**
  - `prepareQuery(db: DbOrTx, p: URLSearchParams): Promise<{ query: DiscoveryQuery; sort: DiscoverySort; labels: QueryLabels }>` runs `parseQuery` and resolves `hostSlug` to `orgId` through the projection. An unknown slug drops the filter.
  - `getQueryLabels(db, q): Promise<QueryLabels>` returns the genre labels (from `GENRES`), destination names and host.
  - `getFilterOptions(db, now = new Date()): Promise<FilterOptions>` returns `seasonYears = [current year, next year]` and the states sorted by name.

- [ ] **Step 1: Write the failing tests.**
  - **Detail:**
    - An active listing whose projection title is stale returns SP2's current title. *(spec failure mode 1)*
    - Closed (summary `closed` plus an inactive row) returns `{ status: 'closed' }`.
    - Removed (summary `removed`, with a stale row) returns null.
    - The activity line covers its three cases at 0, 1 and 5 days.
    - An `http://` additional step returns null. `https://apply.kettleridge.com/form` gives `domain: 'apply.kettleridge.com'`.
    - With deadline `2026-07-15`, `validThrough` is `'2026-07-15'`; with no deadline and fixed end `2026-09-30`, it is `'2026-09-30'`; for ongoing with no deadline, it is null.
    - A Maritime listing includes `{ label: 'Vessel type', value: 'Longliner' }`.
    - The detail card is labeled when `boostedAmong` covers it.
  - **Suggest:**
    - `'li'` returns "Lift operator" in `jobs`.
    - `'ala'` returns `{ label: 'Alaska', kind: 'state', value: 'AK' }`.
    - `'yell'` returns the Yellowstone destination.
    - `'kett'` returns Kettle Ridge Lodge.
    - Each group has at most 5 results.
  - **Cards and counts:**
    - `getJobCards(db, [closed, a])` returns `[a]`, labeled when boosted.
    - `countNewListings({ since })` counts only `first_active_at >= since`.
  - **Query context:**
    - `prepareQuery` with `host=kettle-ridge-lodge` sets `orgId` and `labels.host.name`; an unknown slug leaves no `orgId`.
    - `getFilterOptions(db, new Date('2026-11-03')).seasonYears` is `[2026, 2027]`.
  - **Removal across surfaces** (`removal.test.ts`, the Task 5 fakes; *Review Focus 1*, spec failure mode 1). Seed listings A and B at location L1 and listing C alone at L2 through `fakeSp2.putListing` and `syncListing`. A seeker has saved B.
    - Before: A and C are in `searchListings` on `seek`, `swipe` and `map_list`; `mapPins` has pins at L1 and L2; `locationPreview(L1)` has `activeCount: 2`.
    - `setListingState(A, 'removed')`, then `syncListing(A)`: A is in none of the three surfaces, in no pin's `matchingCount`, and not in `locationPreview(L1).items`, whose `activeCount` is 1. `getJobCards(db, [A, B])` returns `[B]`.
    - `setListingState(C, 'closed')`, then `syncListing(C)`: C is in no surface, `mapPins` has no pin at L2, and `locationPreview(L2)` is null. `getJobCards(db, [C])` is empty.
    - A projection row left stale on purpose (the summary says `removed` but the row still reads active, with no sync run) still makes `getListingDetail` return null.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/detail.test.ts src/modules/discovery/suggest.test.ts src/modules/discovery/query-context.test.ts src/modules/discovery/removal.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): suggest, listing detail, cards by id, new-listing counts, query context`.

### Task 22 (W2): Read API routes and `useDiscoveryQuery`

**Files:**
- Create:
  - `src/app/api/v1/discovery/_shared/params.ts`
  - `src/app/api/v1/discovery/search/route.ts`, `deck/route.ts`, `map/route.ts`, `suggest/route.ts`, `locations/[locationId]/route.ts`
  - `src/app/api/v1/listings/[id]/route.ts`
  - `src/app/api/v1/discovery/routes.test.ts`
- Modify: `src/lib/discovery/use-discovery-query.ts`
- Test: `src/lib/discovery/use-discovery-query.test.tsx`

**Interfaces:**
- **Consumes:** `apiRoute`, `getViewer`, `privateJson`, `prepareQuery`, `searchListings`, `mapPins`, `locationPreview`, `suggest`, `getListingDetail` and `track`.
- **`_shared/params.ts`:** zod schemas for the paging and geometry parameters.
  - `sort`, `cursor` (≤ 2,048 characters), `tz`, `bbox` (`w,s,e,n`, with lng ±180 and lat ±90, and `west > east` allowed) and `zoom` (0–22).
  - `lat` and `lng` are numbers within range and rounded to 2 decimals.
  - Search `limit` is 1–50 (default 20); deck `limit` is 1–20 (default 10).
  - `surface` takes `map_list`, which is only valid together with `bbox`.
  - Filter parameters come from `prepareQuery(new URL(req.url).searchParams)`.
- **Routes:** the spec 5 contracts.
  - Every route uses `auth: 'none'`, registers an `openapi` entry, and responds through `privateJson`.
  - The search route calls `track('discovery_search', { surface, sort, filterCount, hasQuery })` without the query text.
  - An unknown location returns 404 `not_found`, and so does an unknown or removed listing.
  - The listing route returns `ListingDetail`, or `{ status: 'closed', card }`.
- **`useDiscoveryQuery(): { query: DiscoveryQuery; sort: DiscoverySort; hostSlug?: string; setQuery(q: DiscoveryQuery): void; setSort(s: DiscoverySort): void }`** (client):
  - It reads `useSearchParams()` through `parseQuery`.
  - Its setters call `router.replace` with `serializeQuery` and `scroll: false`. They keep `source` and drop `cursor` and `intent`.

- [ ] **Step 1: Write the failing tests** (call the handlers with `Request` objects and mock `getViewer`).
  - `GET /api/v1/discovery/search?tz=Etc/Unknown` returns 200 *(Review Focus 3)*, and `?limit=51` returns 400 with `details` set.
  - `?cat=bogus` returns 200, with the filter dropped.
  - Every response carries `cache-control: private, no-store`.
  - Deck: `?limit=21` returns 400.
  - Map: `bbox=0,91,1,92` returns 400 and `zoom=23` returns 400. `bbox=170,50,-130,72&zoom=4` returns 200.
  - `lat=39.7392&lng=-104.9903` reaches `searchListings` as `{ lat: 39.74, lng: -104.99 }`.
  - Suggest: `q=a` returns 400 and `q=ka` returns 200.
  - Listings: an unknown ID returns 404; a closed listing returns `{ status: 'closed' }`.
  - When the handler throws with `q=secretword`, `logger.error` is called and no argument contains `secretword`.
  - `track` is called with `hasQuery: true` and no `q` property.
  - `buildOpenApi().paths` contains all six paths.
  - `useDiscoveryQuery` (jsdom, with `next/navigation` mocked): `setQuery({ categories: ['farm'] })` on `/?cursor=x&intent=save%3A1&source=landing` calls `replace('/?cat=farm&source=landing', { scroll: false })`.
- [ ] **Step 2:** Run `pnpm test src/app/api/v1/discovery src/lib/discovery/use-discovery-query.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): public read API routes and URL-state hook`.

### Task 23 (W3): Dispositions service and API

**Files:**
- Modify: `src/modules/discovery/dispositions.ts`
- Create: `src/app/api/v1/me/dispositions/route.ts`, `src/app/api/v1/me/dispositions/[listingId]/route.ts`
- Test: `src/modules/discovery/dispositions.test.ts`, `src/app/api/v1/me/dispositions/routes.test.ts`

**Interfaces:**
- **Consumes:** `getSetting`, `loadCards` (with `includeClosed`), `recordListingEvent` (Task 24's stub, which is real by merge time) and `hmacKey`.
- **Produces:** the spec 3.1 signatures, plus these rules from spec 8.8.
  - **`setDisposition`:**
    1. Locks the `(user, listing)` row.
    2. Throws `notFound('This job just closed.')` when the projection row is missing or inactive.
    3. When `expectedState` is given and differs from the current state, throws `conflict('This job changed in another tab.', { current })`.
    4. Saving when the user is at the limit throws `conflict("You've saved 1,000 jobs. Remove some to save more.", { reason: 'saved_limit' })`. The number comes from the setting and is formatted with `toLocaleString('en-US')`.
    5. Upserts the state, source and `acted_at`. The first save sets `first_saved_at` and records one event: `type: 'save'`, `dedupeKey: 'save:' + hmacKey(userId) + ':' + listingId`.
  - **`clearDisposition`:** deletes the row, with the same `expectedState` check.
  - **`listSavedJobs` and `listSkippedJobs`:**
    - They order by `acted_at desc, listing_id desc`.
    - `before` is base64url of `<actedAt ISO>|<listingId>`.
    - The cards include closed listings, with `source: 'other'`.
    - `total` counts all of the user's rows in that state.
  - **`unsaveJob` and `restoreSkippedJob`:** `clearDisposition` with `expectedState` set to `'saved'` and `'skipped'`.
- **Routes:** the spec 5 contracts, with `auth: 'seeker'`.
  - PUT and DELETE use `rateLimit: { key: (c) => 'disp:' + c.user?.id, limit: 120, windowSec: 60 }`.
  - GET takes `state` (required), `before`, and `limit` up to 50 (default 20).

- [ ] **Step 1: Write the failing tests.**
  - Save then skip leaves one row with state `skipped`, and the call returns `previous: 'saved'`.
  - `expectedState: 'saved'` while the row is skipped throws `conflict` with `details.current === 'skipped'`.
  - With the setting at 3, a 4th save throws `conflict` with the message "You've saved 3 jobs. Remove some to save more.".
  - Save, then skip, then save again leaves exactly 1 `save` row in `listing_events`.
  - Saving an inactive listing throws `not_found` with the message "This job just closed.".
  - `listSavedJobs`: 25 saved listings, 2 of them closed, at `limit: 10` give pages of 10, 10 and 5 with `total: 25`, and the closed cards have `status: 'closed'`.
  - `unsaveJob` on a skipped listing throws `conflict`, and `restoreSkippedJob` clears a skip.
  - Routes:
    - A host session gets 403.
    - A PUT without a body returns 400.
    - The 121st PUT in a minute returns 429.
    - DELETE returns `{ previous }`.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/dispositions.test.ts src/app/api/v1/me/dispositions`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): saved and skipped jobs with optimistic concurrency`.

### Task 24 (W3): Listing events, rollup and counts

**Files:**
- Modify: `src/modules/discovery/events.ts`, `src/lib/discovery/bots.ts`
- Create: `src/app/api/v1/listings/[id]/events/route.ts`
- Test: `src/modules/discovery/events.test.ts`, `src/lib/discovery/bots.test.ts`

**Interfaces:**
- **Produces:**
  - `isBot(userAgent: string | null): boolean` matches the spec 8.12 list (Googlebot, Bingbot, Applebot, DuckDuckBot, YandexBot, facebookexternalhit, Twitterbot, Slackbot, AhrefsBot, SemrushBot) and the generic pattern `/bot|crawl|spider|slurp|preview/i`. A null or empty user agent counts as a bot.
  - `recordListingEvent(db, e)` follows the spec 3.1 signature.
    - It reads `org_id` from the projection row and silently drops the event when there is no row.
    - `viewer_hash` is `hmacKey(viewerKey)`.
    - It inserts with `on conflict (dedupe_key) do nothing`.
  - `dedupeKeyFor(type: 'view' | 'share', viewerKey: string, listingId: string, at: Date): string` is `<type>:<hmacKey(viewerKey)>:<listingId>:<floor(epochSec / 1800)>`.
  - `getListingEventCounts(db, i: { orgId: string; listingIds?: string[]; from: Date; to: Date; types: ListingEventType[]; sources?: DiscoverySource[]; bucket: 'day' | 'week' | 'none' })` returns rows of `{ listingId: string; bucketStart: string | null; type: ListingEventType; source: DiscoverySource | null; count: number }`.
    - The range is `[from, to)` on UTC days.
    - Past days come from `listing_event_daily`; today comes from the raw events.
    - Rows are grouped by `source` only when `sources` is given (Plan decision 6).
    - Week buckets start on the ISO Monday.
  - `runMaintenance(db: Db, now: Date): Promise<{ rolledUp: number; scrubbed: number; deletedEvents: number; deletedClosed: number }>` does four things (spec 6):
    1. Recomputes yesterday's daily rows from the raw events, deleting and re-inserting that day.
    2. Nulls `viewer_hash` and `dedupe_key` on events older than 24 h.
    3. Deletes raw events older than 90 days, calling `deleteRawEventsBefore` in batches of 5,000 until a batch deletes fewer.
    4. Deletes projection rows 365 days after `closed_at`, together with their dispositions and matches.
  - `deleteRawEventsBefore(db: DbOrTx, cutoff: Date, limit: number): Promise<number>` (internal) deletes at most `limit` `listing_events` rows with `occurred_at < cutoff` and returns the count. SP8's retention rule (Task 26) calls the same function.
  - `eventHandlers['discovery.maintenance']`
  - `listingStats(db, ids): Promise<Map<string, { views: number; saves: number }>>` returns all-time totals from the daily rows plus today's raw events.
  - **`POST /api/v1/listings/:id/events`:**
    - Input: `{ type: 'view' | 'share', source }`; a source outside `DISCOVERY_SOURCES` becomes `'other'`.
    - `isBot` drops the event and returns 204.
    - Otherwise it records the event with `dedupeKeyFor` (imported from `@/modules/discovery`) and the `getViewer` key, then returns 204.

- [ ] **Step 1: Write the failing tests.**
  - Two views by the same viewer 10 minutes apart, in the same 30-minute bucket, make 1 row. A view in the next bucket makes 2.
  - Route:
    - The user agent `Mozilla/5.0 (compatible; Googlebot/2.1)` returns 204 and writes no row.
    - A request with no user agent returns 204 and writes no row.
    - A cross-origin POST returns 403.
  - Maintenance:
    - After it runs, events older than 24 h have null `viewer_hash` and `dedupe_key`, and newer ones are untouched.
    - Running it twice produces identical `listing_event_daily` rows.
    - A 91-day-old event is deleted.
    - A closed row with `closed_at` 366 days ago is deleted with its dispositions.
  - Counts:
    - `getListingEventCounts` with `bucket: 'day'` over 3 days, where the last day is today, sums the daily rows and today's raw events.
    - `bucket: 'week'` starts weeks on Monday, and `bucket: 'none'` gives one row per listing and type.
    - `sources: ['boost']` returns only boost rows, with `source: 'boost'`.
  - Stats: the provider registered as `'discovery'` returns `{ views: 3, saves: 1 }`.
  - `isBot` is true for each named bot, `'Mozilla/5.0 ... Chrome/130'` is false, and null is true.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/events.test.ts src/lib/discovery/bots.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): listing events with dedupe, scrub, rollup and counts`.

### Task 25 (W3): Client actions, undo and sign-in intents

**Files:**
- Modify: `src/lib/discovery/disposition-client.ts`, `use-listing-actions.ts`, `intents.ts`, `sign-in-intent.tsx`
- Create: `src/app/(seeker)/_components/discovery-card.tsx`
- Test: `src/lib/discovery/intents.test.ts`, `src/lib/discovery/use-listing-actions.test.tsx`, `src/lib/discovery/sign-in-intent.test.tsx`

**Interfaces:**
- **Consumes:**
  - `useToast` (Foundation)
  - `SignInPrompt`, `JobChipSheet`, `JobCard`, `toJobCardProps`, `chipSheetContent` (W5)
  - `safeReturnTo`, `emitInstallTrigger`
  - Clerk `useAuth()` and `useUser()` for the signed-in state and `publicMetadata.account_type`
- **`disposition-client.ts`:**
  - `DispositionResult = { ok: true; state: DispositionState | null; previous: DispositionState | null } | { ok: false; reason: 'conflict'; current: DispositionState | null } | { ok: false; reason: 'closed' | 'unauthorized' | 'network' } | { ok: false; reason: 'saved_limit'; message: string }`
  - `putDisposition(listingId: string, b: { state: DispositionState; source: DiscoverySource; expectedState?: DispositionState | null }): Promise<DispositionResult>`
  - `deleteDisposition(listingId: string, b: { expectedState?: DispositionState }): Promise<DispositionResult>`
- **`use-listing-actions.ts`:**
  - `useUndoableDispositions(): { act(listingId: string, next: DispositionState | null, source: DiscoverySource, current: DispositionState | null): Promise<DispositionResult>; undo(): Promise<boolean>; canUndo: boolean }`. Undo covers the last act only, for 10 s: it restores `previous` with `expectedState` set to the current state. On a 409 it reports the server's `current` state rather than overwriting it.
  - `useListingActions(i: { listingId: string; source: DiscoverySource; initial: JobCardData['viewer'] }): { save(): Promise<void>; skip(): Promise<void>; apply(): void; undo(): Promise<boolean>; state: { disposition: DispositionState | null; applied: boolean; pending: boolean } }`
    - `save` toggles between saved and not saved.
    - Successful actions show a Toast with an "Undo" action lasting 10 s: "Job saved", "Removed from saved" or "Job skipped".
    - "closed" shows "This job just closed.", and a saved-limit conflict shows its message.
    - A successful save calls `emitInstallTrigger('save')`.
    - Guests call `requestSignIn`. A non-seeker gets the `wrong_account` variant.
    - `apply()` navigates to `/apply/<id>?source=<source>`.
- **`intents.ts`:**
  - `buildSignInUrls(i: { action: 'save' | 'skip' | 'alert' | 'apply'; listingId?: string; source?: DiscoverySource; path: string; search: string }): { returnUrl: string; signIn: string; signUp: string }`
    - The return URL is the current path with `intent=save:<id>`, `intent=skip:<id>` or `intent=alert` added. Apply returns to `/apply/<id>?source=<source>`.
    - `signIn` is `/sign-in?redirect_url=<encoded>` and `signUp` is `/sign-up?redirect_url=<encoded>`.
  - `parseIntent(p: URLSearchParams): { action: 'save' | 'skip'; listingId: string } | { action: 'alert' } | null`
  - `stripIntent(href: string): string`
- **`sign-in-intent.tsx`:**
  - `SignInIntentProvider` renders `SignInPrompt` once.
  - `useSignInIntent(): { requestSignIn(i: { action; listingId?; source? }): void }`
  - **`IntentRunner`:** when the user is a signed-in seeker, it runs the intent once and calls `history.replaceState` with `stripIntent`.
    - save and skip call `putDisposition` without `expectedState`.
    - alert POSTs `/api/v1/me/saved-searches` with the current query, then shows the Toast "Job alert created" with a "Manage" action linking to `/profile/alerts`.
    - "closed" shows "This job just closed.".
    - A user with a host account sees "Saving jobs needs a seeker account."
    - It never applies.
- **`DiscoveryCard`:** `{ card: JobCardData; source: DiscoverySource; titleAs?: 'h2' | 'h3'; onOpen?(e): void }`. It combines `JobCard`, `useListingActions` and one `JobChipSheet` for whichever chip is open.

- [ ] **Step 1: Write the failing tests** (jsdom, with fake timers and a mocked `fetch`).
  - `buildSignInUrls({ action: 'save', listingId: 'L1', path: '/', search: '?cat=farm' })`:
    - `returnUrl` is `'/?cat=farm&intent=save%3AL1'`.
    - `signIn` is `'/sign-in?redirect_url=' + encodeURIComponent(returnUrl)`.
  - Apply's `returnUrl` is `'/apply/L1?source=seek'`.
  - `parseIntent` reads all three forms, and a malformed intent returns null.
  - `useUndoableDispositions`:
    - An undo 9 s after a save calls DELETE with `expectedState: 'saved'`.
    - An undo after 10 s does nothing and returns false.
    - An undo that gets a 409 with `current: 'skipped'` sets that state.
  - `useListingActions`:
    - A guest's `save()` calls `requestSignIn` with `action: 'save'` and makes no fetch.
    - A host gets the `wrong_account` variant.
    - A successful save dispatches the `ee:install-trigger` event.
    - A 404 shows the Toast "This job just closed.".
  - `IntentRunner`:
    - On `?intent=save%3AL1` it makes exactly one PUT, and the URL is replaced without `intent`.
    - With the intent `alert`, it POSTs once and shows "Job alert created".
    - A host account shows "Saving jobs needs a seeker account."
- [ ] **Step 2:** Run `pnpm test src/lib/discovery/intents.test.ts src/lib/discovery/use-listing-actions.test.tsx src/lib/discovery/sign-in-intent.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): listing actions, undo window, sign-in intents, DiscoveryCard`.

### Task 26 (W3): Export and erase

**Files:**
- Modify: `src/modules/discovery/privacy.ts`
- Test: `src/modules/discovery/privacy.test.ts`

**Interfaces:**
- **Produces:**
  - `exportUserData(db, userId): Promise<DiscoveryExport>` follows the spec 3.1 shape. It sorts each list by date, `at` is the ISO `acted_at`, and `query` is the stored `DiscoveryQuery`.
  - `eraseUserData(db: Db, userId): Promise<void>` hard-deletes, in one transaction, the user's dispositions, saved searches (whose matches cascade) and `alert_settings`.
  - **`privacyHandler: PrivacyHandler`** (SP8 section 3), replacing the Task 3 stub. The index already exports it.
    - `module: 'discovery'`; `tables` are the 8 discovery tables from Task 3; no `mediaColumns` (`cover` holds URLs, not media IDs).
    - `exportData(db, s)`: for a user subject, `records` holds `saved_jobs`, `skipped_jobs`, `saved_searches` and `alert_settings` from `exportUserData`, with `files: []`. An org subject gets `{ records: {}, files: [] }`.
    - `erase(tx, s, ctx)`: for a user subject, it runs the same deletes as `eraseUserData` on the given `tx` and returns `{ erased: <rows deleted>, retained: [] }`. An org subject erases nothing and returns `{ erased: 0, retained: [] }`: the org's projection rows leave through sync when SP2 closes or removes its listings, and the event tables hold no personal data. When `ctx.holds` includes `'all'`, it deletes nothing and reports `legal_hold` for each of the user's tables that has rows. It is idempotent: a second run erases 0.
  - **`retentionRules: RetentionRule[]`**, replacing the Task 3 stub: one rule.
    - `key: 'discovery.listing_events_raw'`
    - `description: 'Raw listing events (views, saves, shares and applies) are deleted after 90 days. Daily counts are kept.'`
    - `run(db, now, limit)` calls `deleteRawEventsBefore(db, now − 90 days, limit)` (Task 24) and returns `{ deleted }`.

- [ ] **Step 1: Write the failing tests.**
  - The export of a user with 2 saved, 1 skipped, 1 saved search and `weeklyDigest: true` matches that shape exactly, and `privacyHandler.exportData` holds the same rows.
  - After erase, the user has no rows in those four tables, and another user's rows remain.
  - `listing_events` is unchanged by erase, because it holds no user ID.
  - `privacyHandler.erase` inside `withTx` returns `erased` equal to the rows deleted. A second run returns `erased: 0`. With `holds: ['all']`, nothing is deleted and `retained` lists each of the user's tables that has rows (here `listing_dispositions`, `saved_searches` and `alert_settings`) with reason `legal_hold`.
  - **Retention:** with 3 events older than 90 days and 1 at exactly 90 days, `run(db, now, 2)` returns `{ deleted: 2 }`, the next call `{ deleted: 1 }`, and a third `{ deleted: 0 }`. The 90-day event remains (the boundary is exclusive).
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/privacy.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): seeker data export and erasure, SP8 privacy handler and retention rule`.

---

## Phase B3 (Task 27 first, then W4, W6 and W7 in parallel; SP2 merged)

### Task 27 (W9): E2E fixtures and seed

**Files:**
- Create: `tests/e2e/fixtures/sp2-writes.ts`, `tests/e2e/fixtures/discovery-seed.ts`, `tests/e2e/fixtures/auth.ts`, `scripts/e2e-seed-discovery.ts`, `tests/e2e/discovery-fixtures.spec.ts`

**Interfaces:**
- **Consumes** (the real SP2 modules on `pnpm db:local`, with `AI_PROVIDER`, `CHILD_SAFETY_PROVIDER`, `MALWARE_PROVIDER`, `BILLING_PROVIDER`, `GEOCODER_PROVIDER`, `WEATHER_PROVIDER` and `LINK_SAFETY_PROVIDER` set to `stub`, and `STORAGE_PROVIDER=local`). The names are SP2's plan's; where SP2's merged code differs, the code wins:
  - SP2's test helpers in `tests/helpers/sp2.ts`: `seedHostOrg`, `seedMedia` and `buildListingContent`
  - `@/modules/billing`: `makeFakeBillingGateway`, `syncSubscription` and `getSubscriptionState`
  - `@/modules/locations`: `createLocation`
  - `@/modules/hostpages`: `saveHostPage`
  - `@/modules/listings`: `createListing`, `patchDraft`, `SECTION_CONTENT_KEYS`, `requestPublish`, `closeListing` and `getListingSummaries`
  - `@/modules/trust`: `openReviewItem` and `decide` (removal)
  - `runWorker` and `getDb`
  - `@clerk/testing/playwright`
- **Produces** — `tests/e2e/fixtures/sp2-writes.ts`, the one place SP3's e2e code writes through SP2 (Task 45 reuses it). Each write helper takes `opts?: { drain?: boolean }`. With `drain` (the default), it runs `runWorker` until the outbox is empty before it returns. Task 45 passes `drain: false`, so the app's own worker kick and 1-minute cron do the sync, which is what exit criterion 3 measures; `publishListing` then returns right after `requestPublish`.
  - `seedHost(db: Db, i: { name: string; city: string; state: string; point: { lat: number; lng: number }; publicPrecision: 'city' | 'exact'; timezone: string }): Promise<SeedHost>`, where `SeedHost = { orgId: string; slug: string; ctx: HostContext; locationId: string }`:
    1. `seedHostOrg(db, { name })`.
    2. An entitled subscription through the stub billing gateway: `makeFakeBillingGateway()`, `setSubscription` with an `active` Professional monthly snapshot for the org, then `syncSubscription(db, <its subscription id>, gw)`. It throws unless `getSubscriptionState` then reports `canPublish: true`.
    3. `createLocation(db, ctx, { ... })` with an explicit `point`, so nothing is geocoded.
    4. `saveHostPage(db, ctx, content)` with a `seedMedia(db, orgId, 'logo')` logo and one About line.
  - `publishListing(db: Db, host: SeedHost, edit?: (c: ListingContent) => void): Promise<{ id: string; slug: string }>`:
    1. Approved media: `seedMedia(db, orgId, 'cover')`, four `'housing_photo'` rows, and four `'meal_photo'` rows when meals are provided.
    2. `buildListingContent({ locationId, coverMediaId, housingPhotos }, edit)`. The `edit` callback sets each fixture's title, category, genre, pay, housing and meals.
    3. `createListing(db, ctx, { start: 'blank' })`, then one `patchDraft(db, ctx, id, { section, baseVersion: 0, data })` per `BuilderSection`, each section's keys taken from `SECTION_CONTENT_KEYS`.
    4. `requestPublish(db, ctx, id, ackKeys)`, acknowledging the warning keys the checks return.
    5. Drain: verification, screening and `publishRevision` run on the stub providers. It throws unless `getListingSummaries` then reports `active`.
  - `editListing(db, host, id, section: BuilderSection, data: unknown)`: `patchDraft` at the section's current version, then `requestPublish`.
  - `closeListingAs(db, host, id)`: `closeListing(db, host.ctx, id)`.
  - `removeListing(db, id, operatorId)`: `openReviewItem(db, { queue: 'moderation', subjectType: 'listing', subjectId: id, reason: 'e2e removal' })`, then `decide(db, itemId, operatorId, 'remove', { note: 'e2e' })`. It throws unless `decide` returns `applied`.
- **Produces** — the seed:
  - `seedDiscoveryFixtures(db: Db): Promise<DiscoveryFixtures>` builds everything with `seedHost` and `publishListing` (and `closeListingAs` for the closed one). It is idempotent by host slug. Its final drain leaves the projection synced. It creates these hosts and listings:

    | Host | Place and category | Listings |
    |---|---|---|
    | Kettle Ridge Lodge | Breckenridge CO, Seasonal | "Lift operator", ski resorts, housing provided and paid |
    | Seward Fishing Co | Seward AK, Maritime, exact precision | "Deckhand", crew share |
    | Valley Orchards | Fresno CA, Farm | "Orchard picker", free housing and meals |
    | Cascade Support | Bend OR | "Support agent", Remote for CO and UT |

    Kettle Ridge Lodge also gets one closed listing, "Night auditor".
  - `DiscoveryFixtures = { listings: Record<'liftOperator' | 'deckhand' | 'orchardPicker' | 'supportAgent' | 'closed', { id: string; slug: string; locationId: string }>; hosts: Record<'kettle' | 'seward' | 'valley' | 'cascade', { orgId: string; slug: string }> }`. `pnpm e2e:seed` writes it to `tests/e2e/.seed.json`, which is gitignored.
  - `readSeed(): DiscoveryFixtures`
  - `signInAsSeeker(page: Page, opts?: { fresh?: boolean }): Promise<void>` and `signInAsHost(page: Page): Promise<void>`, using Clerk testing tokens and a dev-instance test user.

- [ ] **Step 1: Write the failing e2e test** (`discovery-fixtures.spec.ts`).
  - After the seed, `GET /api/v1/discovery/search` returns at least 4 items.
  - `GET /api/v1/listings/<closed.id>` returns `{ status: 'closed' }`.
- [ ] **Step 2:** Run `pnpm db:local`, `pnpm e2e:seed`, then `pnpm e2e tests/e2e/discovery-fixtures.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `test(discovery): e2e seed fixtures and sign-in helpers`.

### Task 28 (W4): Saved searches and alert settings

**Files:**
- Modify: `src/modules/discovery/saved-searches.ts`
- Create: `src/app/api/v1/me/saved-searches/route.ts`, `src/app/api/v1/me/saved-searches/[id]/route.ts`, `src/app/api/v1/me/alert-settings/route.ts`
- Test: `src/modules/discovery/saved-searches.test.ts`, `src/app/api/v1/me/saved-searches/routes.test.ts`

**Interfaces:**
- **Consumes:** `canonicalQuery`, `summarizeQuery`, `discoveryQuerySchema`, `getQueryLabels` and `getSetting`.
- **Produces:** the Task 3 signatures, plus these rules from spec 8.10.
  - The stored query drops `bbox` and `locationId`, and `query_hash` is the hex `sha256(canonicalQuery(q))`.
  - A query the user already has returns `{ item, created: false }`, which the route answers with 200.
  - At the limit, it throws `conflict('You can have up to 20 job alerts. Remove one to add another.')`, with the number from the setting.
  - The default name is `summarizeQuery(q, labels)` (≤ 80 characters). A given name is trimmed and must be 1–80 characters.
  - The `summary` returned on every read is computed fresh.
  - Update and delete check the owner and throw `notFound` otherwise.
  - Alert settings default to `{ weeklyDigest: false }`, and setting them upserts.
- **Routes:** the spec 5 contracts, with `auth: 'seeker'`.
  - POST, PATCH and DELETE use `rateLimit` with the key `ss:<userId>`, 30 per 3,600 s.
  - POST answers 201 for a new search and 200 for an existing one. It returns a `Response` built through `privateJson` with the status set.

- [ ] **Step 1: Write the failing tests.**
  - Create returns `created: true`. The same query with its keys and arrays reordered returns the same `id` with `created: false`.
  - A query given with a `bbox` is stored without it.
  - With the setting at 2, the 3rd create throws `conflict` with the message "You can have up to 2 job alerts. Remove one to add another.".
  - A query with 10 genres, 10 states, pay and housing is created, and its name has at most 80 characters and ends with "…". *(Review Focus 4)*
  - Updating or deleting another user's search throws `not_found`. Deleting a search removes its matches.
  - Alert settings: GET returns `{ weeklyDigest: false }`; after PATCH `{ weeklyDigest: true }`, GET returns `true`.
  - Routes: a host gets 403, the 31st POST in an hour gets 429, a repeated POST gets 200 and a new one gets 201.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/saved-searches.test.ts src/app/api/v1/me/saved-searches`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): saved searches and alert settings API`.

### Task 29 (W4): Alert types, matching and push

**Files:**
- Modify: `src/modules/discovery/notification-types.ts`, `src/modules/discovery/alerts.ts`
- Test: `src/modules/discovery/alerts.test.ts`

**Interfaces:**
- **Consumes:** `defineType` and `notify`, `filterListingIds` (with `surface: 'alerts'` and `firstActiveAfter`), `serializeQuery`, `getSetting`, `enqueue` and `DEFAULT_TZ`.
- **Notification types** (spec 6): `discovery.alert_match` (category `alerts`, `push: true`), `discovery.alert_daily` (category `alerts`, email template `JobAlertDaily`) and `discovery.alert_weekly` (category `alerts`, email template `JobAlertWeekly`). Their copy:

  | Type | Title | Body |
  |---|---|---|
  | `discovery.alert_match`, one search | `"1 new job for <name>"` or `"N new jobs for <name>"` | `"Open Explore&Earn to see them."` |
  | `discovery.alert_match`, several searches | `"N new jobs for your alerts"` | `"Open Explore&Earn to see them."` |
  | `discovery.alert_daily` | `"New jobs for your alerts"` | `"N new jobs across your saved searches."` |
  | `discovery.alert_weekly` | `"Your weekly job digest"` | `"N new jobs this week."` |

  The push `data.url` is `/?<serializeQuery(q)>&sort=newest` for a single search, and `/profile/alerts` when the push covers several searches (Plan decision 10).
- **`alerts_match` handler:** the payload is `{ windowStart?: string; windowEnd?: string; afterUserId?: string }`.
  1. **The first chunk** reads the watermark under `select … for update` and sets the window to `(watermark, now − 2 min]`. A missing watermark is initialized to `now − 2 min` and nothing is matched.
  2. **New IDs:** active rows whose `first_active_at` is inside the window.
  3. **Saved searches:** read in chunks of 500 ordered by `(user_id, id)`, with each chunk extended to the end of its last user.
  4. **Matching:** each saved search keeps at most 50 matches with `first_active_at > saved_search.created_at`. They are inserted with `on conflict do nothing returning listing_id`.
  5. **Push:** per user, the newly inserted matches of searches with `push_enabled` produce one `notify` call per run, unless `push_count` for the current UTC day has reached the cap. Sending stamps `pushed_at` and increments `push_count`, resetting it on a new `push_day`.
  6. **Next chunk:** if more users remain, enqueue `discovery.alerts_match` with the same window and `afterUserId`, using the dedupe key `alerts_match:<windowEnd>:<afterUserId>`.
  7. **The last chunk** sets the watermark to `windowEnd`.

- [ ] **Step 1: Write the failing tests.**
  - **Window**, with the watermark at T:
    - A listing first active at T is not matched; one at T + 1 s is.
    - A listing first active at `now − 1 min` is not matched in this run, and is matched in the next one.
  - **Creation time:** a listing first active before the search was created is never matched.
  - **Exclusions:** skipped listings, listings the overlay fake applied, and hidden orgs are excluded.
  - **Per-run limit:** 60 new matches give 50 rows.
  - **Chunking:** 1,200 saved searches over 600 users produce a follow-up event with the same `windowEnd`. The watermark changes only after the last chunk, and no user's searches are split across chunks.
  - **One push per run:** a user with 3 matching searches gets exactly one `notify('discovery.alert_match')`, titled "5 new jobs for your alerts". A single search reads "3 new jobs for Ski resorts · CO".
  - **Cap:** after 5 pushes in a UTC day, the 6th run sends none, and its matches stay with `pushed_at` null.
  - **Retry:** re-running a chunk creates no duplicate match and no second push.
  - **`push_enabled` false:** matches are stored and no push is sent.
  - **Category off:** with the user's `alerts` email and push preferences disabled, no `notifications.push` outbox row is enqueued.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/alerts.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): saved-search matching with one push per run and a daily cap`.

### Task 30 (W4): Daily and weekly emails

**Files:**
- Modify: `src/modules/discovery/alerts.ts`, `src/modules/notifications/email/templates/JobAlertDaily.tsx`, `JobAlertWeekly.tsx`
- Test: `src/modules/discovery/alerts.test.ts` (a new `describe`), `src/modules/notifications/email/templates/job-alerts.test.tsx`

**Interfaces:**
- **Template data:** `JobAlertEmailData = { searches: { name: string; url: string; items: { title: string; host: string; location: string; pay: string; housing: string; meals: string; href: string }[] }[] }`, where `url` is the "See all" link and every URL is absolute (`APP_URL`).
  - The `housing` line reads "Housing provided · <costLine>" or "No housing", and the same for meals.
  - Weekly emails use the same shape with one search named "Your saved searches".
- **`alerts_daily` handler** (14:00 UTC):
  - It runs per user, in chunks of 500 users, re-enqueuing with `afterUserId`.
  - For each search with `email_daily`, it takes up to 10 still-active unemailed matches, newest first.
  - It stamps `daily_emailed_at` on every match it considered, including closed ones and those past 10.
  - It calls `notify('discovery.alert_daily')` only when at least one item remains.
- **`alerts_weekly` handler** (Mondays):
  - It runs for users with `weekly_digest`.
  - It takes the 10 newest still-active matches with `matched_at >= now − 7 days`, then stamps `weekly_emailed_at`.
  - It notifies only when at least one item remains.

- [ ] **Step 1: Write the failing tests.**
  - **Daily, size:** a user whose search has 12 active matches and 1 closed match gets one notification with 10 items. All 13 matches are stamped.
  - **Daily, closed only:** a user whose only match is now closed gets no notification, and that match is stamped. *(spec failure modes 1 and 5)*
  - **Daily, opt-out:** a search with `email_daily: false` is left out.
  - **Weekly:** only opted-in users get it, the 10 newest active matches of the past 7 days are included, and a user with none gets nothing.
  - **Category off:** with the `alerts` email preference disabled, no `notifications.email` outbox row is enqueued for either type.
  - **Templates:** rendering `JobAlertDaily` with 2 searches gives HTML containing both names, "See all" twice and "Housing provided · $150/week · deducted from pay". The rendered text contains no seeker name.
- [ ] **Step 2:** Run `pnpm test src/modules/discovery/alerts.test.ts src/modules/notifications/email/templates`. Expected: FAIL.
- [ ] **Step 3:** Implement. Build the templates with `@react-email/components` inside the Foundation `Layout`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): daily and weekly job alert emails`.

### Task 31 (W4): Job alerts page

**Files:**
- Create: `src/app/(seeker)/profile/alerts/page.tsx`, `src/app/(seeker)/profile/alerts/alerts-list.tsx`, `tests/e2e/discovery-alerts.spec.ts`

**Interfaces:**
- **Consumes:** `requireSeekerPage('/profile/alerts')`, `listSavedSearches`, `getAlertSettings`, the PATCH and DELETE routes, `IosPushHint` (the Task 4 stub, which W6 fills), and Foundation `Switch`, `IconButton`, `EmptyState`, `Skeleton` and `ErrorState`.
- **Page:** one column, 640 px wide on desktop.
  - Each saved search shows its name, its summary, a "Push" `Switch`, a "Daily email" `Switch`, and a delete `IconButton` labeled "Delete alert <name>".
  - A "Weekly digest" `Switch` follows the list, then `<IosPushHint />`.
  - The empty state reads "Tap the bell on any search to get alerts for new jobs."

- [ ] **Step 1: Write the failing e2e test.**
  - A seeker with no alerts sees the empty line.
  - After a POST to the saved-searches API, the page lists the item.
  - Toggling "Push" off persists across a reload, and so does "Weekly digest".
  - Deleting the alert removes it.
  - A guest is redirected to `/sign-in?redirect_url=%2Fprofile%2Falerts`.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/discovery-alerts.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): Job alerts page`.

### Task 32 (W6): Seeker shell for guests, page guards and onboarding `returnTo`

**Files:**
- Modify:
  - `src/app/(seeker)/layout.tsx`
  - `src/app/(seeker)/profile/page.tsx`, `inbox/page.tsx`, `notifications/page.tsx`, `community/page.tsx` (each starts with `await requireSeekerPage('<path>')`)
  - `src/app/api/v1/onboarding/route.ts`, `src/app/onboarding/page.tsx`
  - `src/proxy.ts`, `src/server/host-routing.ts` and `host-routing.test.ts`
- Create:
  - `src/app/(seeker)/_components/mode-nav.tsx`, `seeker-providers.tsx`, `tz-cookie.tsx`
  - `src/app/(seeker)/@panel/default.tsx`
  - `src/app/api/v1/onboarding/route.test.ts`
  - `tests/e2e/discovery-shell.spec.ts`

**Interfaces:**
- **Consumes:** `getPageViewer`, `requireSeekerPage`, `safeReturnTo`, `SignInIntentProvider` and `IntentRunner`, and `ToastProvider`.
- **Layout:**
  - It renders for everyone.
  - The `TopBar` shows a "Sign in" `Button` linking to `/sign-in?redirect_url=<current>` for guests. Seekers see Foundation's Inbox and Notifications.
  - `ModeNav` renders the desktop links Seek · Swipe · Map · Community and the mobile `BottomNav` Seek · Swipe · Map · Profile. Its hrefs keep the current filter query, without `cursor` or `intent`.
  - It renders `{children}{panel}` inside `SeekerProviders`, which holds the toast, sign-in intent and intent runner providers. W6 adds the install provider in Task 37.
  - `TzCookie` sets `ee_tz` from `Intl.DateTimeFormat().resolvedOptions().timeZone` (`path=/; max-age=31536000; samesite=lax`) when the value differs.
- **Onboarding:**
  - `onboardingRedirectUrl(pathname: string, search: string): string` in `host-routing.ts` returns `/onboarding` for `/`, and otherwise `/onboarding?returnTo=<encoded path+search>`. The proxy uses it.
  - The route's input becomes `z.intersection(onboardingRequestSchema, z.object({ returnTo: z.string().max(512).optional() }))`, and its output becomes `{ redirectTo: string }`. A seeker gets `safeReturnTo(returnTo)`; a host still gets `/host`.
  - The onboarding page sends `returnTo` from its URL.

- [ ] **Step 1: Write the failing tests.**
  - `onboardingRedirectUrl('/jobs/view/1/x', '?intent=save%3A1')` returns `'/onboarding?returnTo=%2Fjobs%2Fview%2F1%2Fx%3Fintent%3Dsave%253A1'`, and for `'/'` it returns `'/onboarding'`.
  - Onboarding route:
    - A seeker with `returnTo: '/jobs/view/1/x'` gets `redirectTo: '/jobs/view/1/x'`.
    - `'//evil.test'` gives `'/'`.
    - A host gets `'/host'`.
  - E2E:
    - A guest on `/` sees "Sign in" and the mobile nav, with "Seek" marked `aria-current="page"`.
    - A guest on `/profile` lands on `/sign-in`.
    - On `/?cat=farm`, the Swipe link is `/swipe?cat=farm`.
    - A seeker sees no "Sign in" link.
- [ ] **Step 2:** Run `pnpm test src/server/host-routing.test.ts src/app/api/v1/onboarding`, then `pnpm e2e tests/e2e/discovery-shell.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): guest-friendly seeker shell, page guards, onboarding returnTo`.

### Task 33 (W6): Seek

**Files:**
- Modify: `src/app/(seeker)/page.tsx`
- Create: `src/app/(seeker)/_components/seek-feed.tsx`, `discovery-toolbar.tsx`, `filters-sheet.tsx`, `guest-header.tsx`, `tests/e2e/discovery-seek.spec.ts`

**Interfaces:**
- **Consumes:** `prepareQuery`, `searchListings`, `getFilterOptions`, `getPageViewer`, `useDiscoveryQuery`, `describeFilters` and `removeFilter`, `DiscoveryCard`, `SearchBox`, `FilterPanel`, `ActiveFilterChips`, `useSignInIntent`, the search, suggest and saved-searches APIs, and `emitInstallTrigger`.
- **`SeekFeed`:** `{ initial: { items: JobCardData[]; nextCursor: string | null; total: number; totalCapped: boolean }; query: DiscoveryQuery; sort: DiscoverySort; source: DiscoverySource; labels: QueryLabels; emptyMessage?: ReactNode }` (W8 reuses it).
  - **Count:** "1 job", "1,248 jobs" or "10,000+ jobs".
  - **"Load more"** appends results, deduplicated by `listingId`.
  - **Empty:** "No jobs match these filters.", followed by `ActiveFilterChips` and "Clear all".
  - **Error:** `ErrorState` with a Retry button. The end of results reads "That's every match.".
  - **Loading:** 4 `CardSkeleton`s.
  - **Layout:** 2 columns at 1024 px and up, 3 at 1440 px and up.
- **`DiscoveryToolbar`:**
  - `SearchBox` (suggest calls are debounced by 250 ms).
  - Category `Pill` toggles and a "Starting soon" `Pill`.
  - A filter `IconButton` labeled "Filters", with the count of active filters.
  - A sort `Select` with Relevant, Newest and Distance. Distance is disabled with the hint "Share your location or pick a state to sort by distance." unless a single state is selected or `ee_origin` is in `sessionStorage`.
  - "Use my location" requests geolocation and stores it rounded to 2 decimals.
  - A bell `IconButton` labeled "Get alerts for this search".
    - For guests it opens the sign-in prompt (`alert`).
    - For seekers it POSTs the saved search, shows the Toast "Job alert created" with "Manage", and calls `emitInstallTrigger('alert')`. A 409 shows the server's message.
- **Filters:** a `Sheet` below 1024 px; the 280 px rail at 1024 px and up.
- **Guest header:** "Built for seekers, by seekers." and "Seasonal, maritime, farm and remote jobs, some with housing and meals. Free for seekers, forever."
- **Metadata:** `robots: { index: !hasQuery, follow: true }` and `alternates.canonical: '/'`. Any query string sets noindex.

- [ ] **Step 1: Write the failing e2e test**, against the Task 27 seed.
  - A guest sees both header lines and "4 jobs".
  - Selecting the Farm pill changes the URL to `/?cat=farm` and shows only "Orchard picker".
  - A filter combination that matches nothing shows "No jobs match these filters." Removing a chip restores the results, and "Clear all" resets them.
  - At 1280 px, clicking a card opens the side panel without a full navigation, and the URL becomes `/jobs/view/<id>/<slug>`.
  - A guest's Save opens "Sign in to save jobs".
  - A seeker's Save shows "Job saved" with Undo, and Undo restores the button state.
  - A seeker's bell shows "Job alert created".
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/discovery-seek.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. The first page is server-rendered and later pages go through the API.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): Seek feed with filters, sort, count, alerts bell`.

### Task 34 (W6): Listing detail page and panel

**Files:**
- Create:
  - `src/app/(seeker)/jobs/view/[id]/page.tsx` (redirect)
  - `src/app/(seeker)/jobs/view/[id]/[slug]/page.tsx`
  - `src/app/(seeker)/@panel/(.)jobs/view/[id]/[slug]/page.tsx`
  - `src/app/(seeker)/jobs/view/_components/listing-frame.tsx`
  - `src/app/(seeker)/jobs/view/_components/detail-view-props.ts` (server-only; both pages call it)
  - `src/app/(seeker)/jobs/view/_components/view-tracker.tsx`
  - `tests/e2e/discovery-detail.spec.ts`

**Interfaces:**
- **Consumes:** `getListingDetail`, `getPageViewer`, SP2's `ListingDetailView` (props only) and `toListingDetailViewProps`, `GENRES`, `PERKS` and `listOccupations` from `@/modules/listings`, `getMediaInfo`, `ActionBar`, `OffsiteNotice`, `JobChipSheet` with `chipSheetContent`, `useListingActions`, Foundation `Badge`, `Tooltip` and `Sheet`, and the events API.
- **`buildDetailViewProps(db: DbOrTx, d: ListingDetail, now: Date): Promise<ListingDetailViewProps>`** (`detail-view-props.ts`). It runs on the server, because SP2's mapper takes a function that can't cross to the client. It calls `toListingDetailViewProps(d.content, { mediaUrl, host, confirmedActiveAt: null, publishedAt: new Date(d.publishedAt), now, labels })` with these inputs, then overrides three fields:
  - `mediaUrl(id)` reads `d.photoUrls[id]` and returns `{ src: <640>, srcSet: '<320> 320w, <640> 640w, <1280> 1280w', alt }`, or null when the ID is absent. `alt` is the `getMediaInfo` alt text, else the listing title.
  - `host` is `{ name: d.host.name, logoSrc: d.host.logoUrl, href: '/hosts/<slug>' }`.
  - `labels`: the genre label from `GENRES`, the occupation label from `listOccupations`, and perk labels from `PERKS`.
  - **Overrides:** `activityLine` is `d.activityLine` (counted in the viewer's time zone; `ListingDetail` has no `confirmedActiveAt` to pass). `additionalStep` is `{ note, domain }` from `d.additionalStep`, so only `https` steps render (spec 8.9). `pay` is `{ headline: d.pay.full, lines: d.pay.details }`, the spec 8.2 format that the card uses (Plan decision 7). Every other field is the mapper's.
- **`ListingFrame`:** `{ detail: ListingDetail | { status: 'closed'; card: JobCardData }; view: ListingDetailViewProps | null; source: DiscoverySource; mode: 'page' | 'panel' }`. `view` is null for a closed listing. An active listing renders `ListingDetailView` with `view` and these slots:
  - **`afterHeader`:** the subscriber `Badge` with the `Tooltip` "Active Explore&Earn host since <Mon YYYY>", then the Housing, Meals and Pay chips with their `JobChipSheet`s. The activity line is the view's own, in product section 6 order, so the frame doesn't repeat it.
  - **`additionalStepAction`:** "Open the employer's form", which opens `OffsiteNotice`.
  - **`footer`:** Share and Report.
    - **Share:** uses `navigator.share`, or else copies the link and shows the Toast "Link copied". Either way it posts a `share` event.
    - **Report** (Plan decision 11): a "Report this job" link to `/report?subject=listing:<id>`, SP4's route. SP4 edits no SP3 file. Like Apply's `/apply/<id>`, the link is always rendered; until SP4 ships `/report`, it reaches SP4's stub, and nothing is public before SP8's go-public gate.
  - **`ActionBar`:** Apply goes to `/apply/<id>?source=<source>`.
  - **Closed:** the card with the banner "This job is closed." and the host link. There is no Apply, and Save reads "Remove" when saved.
  - **Layout:** a 720 px column on a direct load; a `Sheet` 480 px wide on desktop and full height on mobile in the panel.
- **`ViewTracker`:** a client effect that runs once per mount, never during the server render.
  - It POSTs `{ type: 'view', source }` and calls `trackClient('listing_view', { listingId, source })`.
  - It increments `sessionStorage.ee_detail_views` (inside try/catch). On reaching 3 it calls `emitInstallTrigger('views')`.
- **Routing:**
  - A wrong or missing slug calls `permanentRedirect` (308) to `/jobs/view/<id>/<slug>`, keeping `source`.
  - Removed or unknown listings call `notFound()`.
  - The `source` param is validated against `DISCOVERY_SOURCES`; anything else becomes `other`.

- [ ] **Step 1: Write the failing e2e test.**
  - `/jobs/view/<liftOperator.id>/wrong` redirects with 308 to the canonical slug.
  - The page shows "Housing ✓ Provided"; the Housing chip opens a sheet whose first line is "$150/week · deducted from pay".
  - The activity line reads "Posted today".
  - Opening the page records exactly one view (checked through the counts API, or a DB read in the test).
  - The additional step opens "You're going to …, which isn't part of Explore&Earn. Never pay to get a job." Continue opens a new tab.
  - Share without `navigator.share` shows "Link copied".
  - The "Report this job" link's `href` is `/report?subject=listing:<liftOperator.id>`.
  - The body's pay headline equals the card's `pay.full`, and the activity line appears exactly once on the page.
  - A closed listing shows "This job is closed." and no Apply button.
  - An unknown ID returns 404.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/discovery-detail.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): listing detail page and side panel`.

### Task 35 (W6): Swipe

**Files:**
- Modify: `src/app/(seeker)/swipe/page.tsx`
- Create: `src/app/(seeker)/swipe/swipe-view.tsx`, `tests/e2e/discovery-swipe.spec.ts`

**Interfaces:**
- **Consumes:** `SwipeDeck`, `useUndoableDispositions`, `useSignInIntent`, the deck API, `DiscoveryCard` (via `renderCard`, with `hideActions`), Foundation `Dialog`, `EmptyState` and `Toast`, and `trackClient`.
- **The deck** follows spec 8.5.
  - It fetches batches of 10 and fetches again when 3 remain.
  - Left skips, right saves, up goes to `/apply/<id>?source=swipe`, and a tap or ⓘ opens the panel with `source=swipe`.
  - The Skip · Apply · Save buttons below the deck do the same.
  - "U" and the Toast's Undo call `undo()`, and on success the card returns to the top of the deck.
- **Live-region copy:**
  - "Skipped <title> at <host>. Undo available for 10 seconds."
  - "Saved <title> at <host>. Undo available for 10 seconds."
  - "Opening the application for <title>."
- **Guests:** an action opens the sign-in prompt and the card snaps back.
- **Analytics:** `trackClient('discovery_swipe', { action })`.
- **Coach `Dialog`:** shown once (`localStorage.ee_swipe_coach`, inside try/catch).
  - Title: "How Swipe works".
  - Lines: "Swipe right or press → to save.", "Swipe left or press ← to skip.", "Swipe up or press ↑ to apply.", "Tap a card or press Enter for details."
  - Button: "Got it".
- **Exhausted:** "You've seen every job that matches." with "Change filters" and "Saved jobs" (linking to `/profile/saved`).
- **Loading:** one card `Skeleton`, with gestures off.
- **Layout:** a 420 px centered deck on desktop.
- **Metadata:** `robots: { index: false, follow: true }` and `canonical: '/swipe'`.

- [ ] **Step 1: Write the failing e2e test** (as a seeker; the mobile project for gestures).
  - After closing the coach:
    - ArrowRight saves card 1 and announces "Saved Lift operator at Kettle Ridge Lodge. Undo available for 10 seconds."
    - "u" restores card 1.
    - ArrowLeft skips it.
  - A drag of at least 25% of the width to the left skips the next card.
  - An up drag of 100 px or more navigates to `/apply/<id>?source=swipe`.
  - After every card has been acted on, "You've seen every job that matches." shows, and reloading shows the same state.
  - With the filters sheet open, ArrowLeft in the pay slider changes the slider and skips no card. *(Review Focus 2)*
  - The deck never contains a saved or skipped listing. *(spec failure mode 4)*
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/discovery-swipe.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): Swipe deck with gestures, keyboard, undo and coach`.

### Task 36 (W6): Install rules and hook

**Files:**
- Modify: `src/lib/discovery/install.ts`, `src/lib/discovery/use-install-prompt.tsx`
- Test: `src/lib/discovery/install.test.ts`, `src/lib/discovery/use-install-prompt.test.tsx`

**Interfaces:**
- **Produces** — the pure rules in `install.ts`:
  - `installDecision(i)` and `nextInstallState(s, outcome, manual, now)`, with exactly the spec 3.3 signatures and the spec 8.15 rules:
    - **Never shows:** after install; in standalone mode; in an in-app browser; without a coarse pointer; on platform `other`; on an excluded surface; when an overlay is open; when already shown this visit; with no trigger; or for Chromium without a stashed prompt.
    - **Holds:** after the first show, 30 days from that show; after the second, 90 days; after the third, never again.
    - **Manual:** `trigger: 'manual'` ignores the holds and `shownThisVisit`, and does not count as a show.
    - **Copy line:** `line = shows % 2`.
  - `InstallSurface = 'seek' | 'map' | 'listing' | 'landing' | 'alerts' | 'other'`; `surfaceForPath(pathname: string): InstallSurface`.
  - `detectPlatform(i: { userAgent: string; maxTouchPoints: number; supportsBeforeInstallPrompt: boolean }): 'chromium' | 'ios' | 'other'`. iOS is `iPhone`, `iPad` or `iPod`, or `Macintosh` with `maxTouchPoints > 1`.
  - `isInAppBrowser(ua: string): boolean` matches `/FBAN|FBAV|Instagram|Line\/|TikTok/`.
  - `readInstallState(): InstallState | null` and `writeInstallState(s): void` use the `localStorage` key `ee_install` inside try/catch.
- **Produces** — the provider and hook in `use-install-prompt.tsx`:
  - `InstallPromptProvider` handles the browser events:
    - It stashes `beforeinstallprompt` with `preventDefault()` and listens for `INSTALL_TRIGGER_EVENT` and `appinstalled`.
    - A launch in standalone mode sets `installedAt` and tracks `pwa_launch` once per session.
  - It keeps the visit state:
    - A trigger is held as pending in `sessionStorage.ee_install_pending` and evaluated on the next `usePathname` change.
    - `shownThisVisit` lives in `sessionStorage.ee_install_shown`.
  - It shows the prompt:
    - The prompt is loaded lazily with `dynamic(() => import('@/ui/patterns/InstallPrompt'))`, only when the decision says to show it.
    - Each outcome is tracked as `pwa_prompt { action, platform, trigger }`.
  - `useInstallPrompt(): { eligible: boolean; open(): void; trigger(t: 'save' | 'alert' | 'views', opts?: { immediate?: boolean; iosSavedSearch?: boolean }): void }`. `immediate` is the iOS saved-search exception: it opens once the bell's toast is gone.

- [ ] **Step 1: Write the failing tests** (`install.test.ts`, one case per spec 8.15 row).
  - **Base case:** with no state and no trigger, the decision is `show: false`. Each of `save`, `alert` and `views` on `seek` gives `show: true`.
  - **Excluded surfaces and contexts:** `surfaceForPath` maps `/swipe`, `/apply/1`, `/sign-in`, `/onboarding`, `/host` and `/admin` to `'other'`, which never shows. A fine pointer, standalone mode and an in-app browser (`Instagram 300.0`) never show.
  - **Holds:**
    - After one dismissal, the prompt is held at +29 days and shows at +31 days.
    - After two dismissals, it is held at +89 days and shows at +91 days.
    - After three, it never shows again.
  - **Installed:** after `installedAt` is set, it never shows.
  - **Manual:** a manual open while a hold is active shows, and `nextInstallState(s, 'dismissed', true, now)` leaves `shows` unchanged.
  - **Line:** `shows: 0` gives `line: 0`, and `shows: 1` gives `line: 1`.
  - **Overlays and Chromium:** with `overlayOpen` or `shownThisVisit`, it does not show. Chromium with `canPrompt: false` does not show.
  - **Storage:** when `localStorage` throws, `readInstallState()` returns null and the provider never opens the prompt on its own.
  - **Provider** (jsdom):
    - A synthetic `beforeinstallprompt` is stashed.
    - After the `save` trigger and a pathname change to `/map`, the prompt opens.
    - "Not now" writes a state with `shows: 1` and `holdUntil` 30 days later.
- [ ] **Step 2:** Run `pnpm test src/lib/discovery/install.test.ts src/lib/discovery/use-install-prompt.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): Add to Home Screen rules and prompt provider`.

### Task 37 (W6): PWA assets, service worker and prompt wiring

**Files:**
- Create:
  - `src/app/manifest.ts`
  - `src/ui/brand/app-icon.svg`
  - `scripts/gen-icons.ts`, and the committed outputs `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `src/app/apple-icon.png` and `src/app/favicon.ico`
  - `public/offline.html`
  - `src/app/(seeker)/_components/sw-register.tsx`
  - `src/app/manifest.test.ts`, `scripts/gen-icons.test.ts`
  - `tests/e2e/pwa.spec.ts`
- Modify:
  - `public/sw.js`
  - `src/app/layout.tsx`
  - `src/app/(seeker)/_components/seeker-providers.tsx` (mount `InstallPromptProvider` and `SwRegister`)
  - `src/app/(seeker)/_components/discovery-toolbar.tsx` (the bell's iOS exception)
  - `src/app/(seeker)/_components/ios-push-hint.tsx`
  - `src/ui/components/Toast.tsx` (add `data-ee-toast` and the `pb-safe` viewport padding)
  - the host bottom tabs, if they don't use `BottomNav`
  - `playwright.config.ts` (add the project `{ name: 'iphone', use: devices['iPhone 15'], testMatch: /pwa\.spec\.ts/ }`)

**Interfaces:**
- **Manifest** (`manifest.ts`, spec 8.15):

  | Field | Value |
  |---|---|
  | `id`, `start_url`, `scope` | `/` |
  | `name`, `short_name` | "Explore&Earn" |
  | `description` | "Seasonal, maritime, farm and remote jobs, some with housing and meals. Free for seekers, forever." |
  | `display` | `standalone` |
  | `background_color`, `theme_color` | `colors.light.bg` from `@/ui/tokens`, never written as hex |
  | `lang` | `en-US` |
  | `prefer_related_applications` | `false` |
  | `icons` | the three PNGs, with their `purpose` |
  | `shortcuts` | Swipe (`/swipe`), Map (`/map`) and Job alerts (`/profile/alerts`) |

  There is no `orientation` and no `screenshots`.
- **Icons:**
  - `gen-icons.ts` uses sharp to render the SVG at 192, 512, 512 (maskable), 180 (opaque) and 32 px.
  - The favicon is the 32 px PNG wrapped by `pngToIco(png: Buffer): Buffer`, a 6-byte ICONDIR, a 16-byte ICONDIRENTRY, then the PNG.
  - The source SVG has the mark inside the central 80%. It is a placeholder until the founder supplies the artwork (spec 13).
- **Root layout:**
  - `metadata.appleWebApp = { capable: true, title: 'Explore&Earn', statusBarStyle: 'default' }`
  - `export const viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: colors.light.bg }, { media: '(prefers-color-scheme: dark)', color: colors.dark.bg }], viewportFit: 'cover' }`
- **Service worker (`sw.js`):** keep the push handlers.
  - `install` caches `/offline.html` in `ee-offline-v1` and calls `skipWaiting()`.
  - `activate` deletes every other cache and calls `clients.claim()`.
  - `fetch` handles only `request.mode === 'navigate'`: it answers from the network and falls back to the cached `/offline.html`.
- **`offline.html`:** static, with inline CSS for both themes, `<meta name="robots" content="noindex">`, the wordmark, "You're offline.", "Jobs load again as soon as you have signal." and a "Try again" button that reloads.
- **`SwRegister`:** registers `/sw.js` with scope `/` after `load`. It is skipped when `process.env.NODE_ENV !== 'production'`.
- **`IosPushHint`:** on iOS outside standalone mode, it shows "On iPhone and iPad, push alerts need Explore&Earn on your Home Screen." with the link "How to add it", which calls `useInstallPrompt().open()`.
- **The bell's iOS exception:** a successful saved search calls `trigger('alert', { immediate: true, iosSavedSearch: true })`.

- [ ] **Step 1: Write the failing tests.**
  - `manifest()`:
    - It has the fields above, `theme_color === colors.light.bg` and 3 shortcuts.
    - It has no `orientation` key.
  - `pngToIco(png)`:
    - It starts with the bytes `00 00 01 00 01 00`.
    - The image size in the directory entry equals `png.length`.
  - `pwa.spec.ts`:
    - Every icon URL returns 200 with its stated size.
    - In Chromium, CDP `Page.getAppManifest` reports no errors and `Page.getInstallabilityErrors` returns `[]`.
    - A synthetic `beforeinstallprompt` (an `Event` with stub `prompt` and `userChoice`) is held until the first Save, and the prompt opens on the next navigation to `/map`.
    - "Not now" with the clock at +29 days shows no prompt after another Save; at +31 days it shows.
    - The `iphone` project shows the iOS variant after a saved search.
    - With `context.setOffline(true)`, a navigation shows "You're offline.", and `caches.keys()` is `['ee-offline-v1']` holding only `/offline.html`.
    - axe passes on `/offline.html` and on both prompt variants.
- [ ] **Step 2:** Run `pnpm test src/app/manifest.test.ts scripts/gen-icons.test.ts`, then `pnpm build && pnpm start` and `E2E_BASE_URL=http://localhost:3000 pnpm e2e tests/e2e/pwa.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Run `pnpm icons:gen` and commit the outputs.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): installable PWA, offline page, Add to Home Screen prompt`.
- [ ] **Step 6: Gate.** The orchestrator asks the founder for the final `app-icon.svg` (spec 13). W6 merges only after the artwork is in place and `pnpm icons:gen` has been rerun.

### Task 38 (W7): CSP additions and map view helpers

**Files:**
- Modify: `src/lib/security-headers.ts` and `security-headers.test.ts`, `src/lib/discovery/map-view.ts`
- Test: `src/lib/discovery/map-view.test.ts`

**Interfaces:**
- **CSP:**
  - `connect-src` gains `https://api.mapbox.com` and `https://events.mapbox.com` (if SP2 didn't add them) and `https://*.tiles.mapbox.com`.
  - Add `child-src blob:`.
  - `img-src blob: data:`, `worker-src 'self' blob:` and `manifest-src 'self'` are already present; assert them.
- **`map-view.ts`:**
  - `DEFAULT_BOUNDS = [-125, 24, -66, 50] as const`
  - `toApiBbox(b: { west: number; south: number; east: number; north: number }): [number, number, number, number]`:
    - Longitudes wrap into [−180, 180], and latitudes are clamped to ±90.
    - A span of 360° or more becomes `[-180, s, 180, n]`.
    - The result may have `west > east`.
  - `readSavedBounds(): [number, number, number, number] | null` and `saveBounds(b): void` use `sessionStorage.ee_map_bounds` inside try/catch.

- [ ] **Step 1: Write the failing tests.**
  - The prod CSP's `connect-src` contains `https://*.tiles.mapbox.com`, and the CSP contains `child-src blob:` and `worker-src 'self' blob:`.
  - `toApiBbox`:
    - `{ west: -190, south: 50, east: -150, north: 70 }` gives `[170, 50, -150, 70]`.
    - `{ west: 170, east: 200 }` gives `[170, s, -160, n]`.
    - `{ west: -400, east: 400 }` gives `[-180, s, 180, n]`.
    - A latitude of 95 is clamped to 90.
    *(Review Focus 5, client)*
  - When `sessionStorage` throws, `readSavedBounds()` returns null.
- [ ] **Step 2:** Run `pnpm test src/lib/security-headers.test.ts src/lib/discovery/map-view.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): Mapbox CSP and antimeridian-safe map bounds`.

### Task 39 (W7): Map screen

**Files:**
- Modify: `src/app/(seeker)/map/page.tsx`
- Create: `src/app/(seeker)/map/map-view.tsx`, `src/app/(seeker)/map/map-filters.tsx`, `tests/e2e/discovery-map.spec.ts`

**Interfaces:**
- **Consumes:** `MapCanvas`, `PullUpSheet`, `HostPreview` and `FilterPanel`; `DiscoveryCard`; `useDiscoveryQuery`; `toApiBbox`, `readSavedBounds` and `saveBounds`; the map, locations and search APIs (`surface=map_list&bbox=…`); `NEXT_PUBLIC_MAPBOX_TOKEN`.
- **Behavior** (spec 8.6):
  - The default view is the saved bounds, else `DEFAULT_BOUNDS`.
  - On `onMoveEnd` the view saves the bounds and aborts any in-flight request with an `AbortController`. It then fetches the pins with `toApiBbox` and `zoom`, and the list with the same bbox and the chosen sort.
  - **"Near me"** is an `IconButton` with `LocateFixed`. It uses browser geolocation and flies to zoom 8, and the coordinates are never sent.
  - **Pins:** clicking a pin opens a `HostPreview` `Sheet` from `/api/v1/discovery/locations/<id>`, with the location's matching cards.
  - **The list:** a `PullUpSheet` titled "N jobs in this area".
  - **Empty area:** "No jobs in this area. Zoom out or change filters."
  - **Map failure** (`onError`): the `ErrorState` "The map couldn't load. Here's the list instead.", with the list at full height. Filters keep working.
  - **Loading:** a map `Skeleton`, while the list stays usable.
  - **Layout:** a full-screen map with the pull-up list on mobile; a 400 px list column on the left on desktop.
  - **Metadata:** `robots: { index: false, follow: true }` and `canonical: '/map'`.

- [ ] **Step 1: Write the failing e2e test.**
  - With `launchOptions.args: ['--disable-webgl', '--disable-gpu']`, `/map` shows "The map couldn't load. Here's the list instead." and the list includes "Deckhand".
  - With the Farm filter applied, the list shows only "Orchard picker".
  - With a token present (skipped when `NEXT_PUBLIC_MAPBOX_TOKEN` is unset):
    - The pins request carries a bbox and returns the 4 seeded locations.
    - Clicking the Seward pin opens "Seward Fishing Co" with "1 matching job".
  - axe passes in light and dark.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/discovery-map.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(discovery): Map with pins, host preview, pull-up list and list fallback`.

---

## Phase B4 (W8; based on W6 merged)

### Task 40 (W8): Landing resolution and API

**Files:**
- Modify: `src/modules/landing/resolve.ts`
- Create: `src/app/api/v1/landing/route.ts`
- Test: `src/modules/landing/seo.test.ts` (resolution `describe`)

**Interfaces:**
- **Consumes:**
  - `US_STATES` and `stateBySlug`
  - `GENRES` (with slugs where `_` becomes `-`) and `listDestinations`
  - `seasonWindow` and `seasonLabel`
  - `searchListings` (for the indexable count), or one `exists` query per page
  - `getMediaUrl(db, getStorage(), systemViewer, heroMediaId, 1280)` for the hero, with `getStorage` from Task 4 and the same all-zero system viewer as Task 8
- **Produces:**
  - `resolveLanding(db, path, now)` follows spec 8.11.
    - **Paths:**
      - `/jobs/<state | category>`
      - `/jobs/<category>/<state | genre of that category>`
      - `/seasons/<spring | summer | fall | winter | year-round>`
      - `/destinations/<slug>`
      - `/international`
    - **Anything else**, including a genre of another category, returns null.
    - **Season pages** use the current season if its window has not ended, else next year's. Winter of year Y covers Dec Y – Feb Y+1, and year-round uses the current year.
  - **Generated titles:**

    | Kind | Title |
    |---|---|
    | state | "Jobs in Alaska" |
    | category | "Farm jobs" |
    | category_state | "Farm jobs in California" |
    | category_genre | "Seasonal jobs · Ski resorts" |
    | season | "Summer 2027 jobs", "Winter 2026–27 jobs", "Year-round jobs" |
    | destination | "Jobs near Yellowstone National Park" |
    | international | "Working in the US from abroad" |

  - **Default intro:** `<scope phrase>, some with housing and meals.`, using these scope phrases:

    | Kind | Scope phrase |
    |---|---|
    | state | "Jobs in Alaska" |
    | category | "Farm jobs" |
    | category_state | "Farm jobs in California" |
    | category_genre | "Seasonal jobs in ski resorts" |
    | season | "Summer 2027 jobs" |
    | destination | "Jobs near Yellowstone National Park" |

  - `/international` gets its own default intro: plain visa basics, then "We can't give visa advice. These official pages explain your options."
  - `OFFICIAL_VISA_LINKS` (W0 wrote this final value in `resolve.ts`; the index exports it for `/international`):

    | Label | URL |
    |---|---|
    | U.S. visas (U.S. Department of State) | `https://travel.state.gov/content/travel/en/us-visas.html` |
    | J-1 Exchange Visitor Program | `https://j1visa.state.gov/` |
    | Foreign labor certification (U.S. Department of Labor) | `https://www.dol.gov/agencies/eta/foreign-labor` |
    | U.S. Citizenship and Immigration Services | `https://www.uscis.gov/` |
  - A `landing_pages` row overrides the title, intro, hero, SEO title and SEO description.
  - **SEO defaults:** `seoTitle` is `<title> | Explore&Earn`, cut to 60 characters. `seoDescription` is the intro cut to 160 characters.
  - **Indexable:** `indexable` is true when at least one active listing matches.
  - **Breadcrumbs:** "Jobs" (`/`) followed by the page.
  - `GET /api/v1/landing?path=` returns the `LandingPage`, or 404.

- [ ] **Step 1: Write the failing tests.**
  - **Resolution, by path:**

    | Path | Result |
    |---|---|
    | `/jobs/alaska` | kind `state`, query `{ states: ['AK'] }` |
    | `/jobs/farm` | `{ categories: ['farm'] }` |
    | `/jobs/farm/california` | both filters |
    | `/jobs/seasonal/ski-resorts` | category plus genre |
    | `/jobs/farm/ski-resorts` | null |
    | `/jobs/unknown` | null |

  - **Season pages:**
    - `/seasons/summer` at 2026-11-03 is "Summer 2027 jobs"; at 2026-07-01 it is "Summer 2026 jobs".
    - `/seasons/winter` at 2026-11-03 is "Winter 2026–27 jobs".
  - **Destination and international:**
    - `/destinations/yellowstone` is "Jobs near Yellowstone National Park".
    - `/international` has the query `{ sponsorsVisas: true }`.
  - **Overrides and defaults:**
    - A stored row's title replaces the generated one.
    - The default intro of `/jobs/alaska` is "Jobs in Alaska, some with housing and meals.".
  - **Indexable:** a page with no active listing has `indexable: false`.
  - **Slug collisions:** the sets of state slugs, category slugs, genre slugs and `{ 'view' }` are pairwise disjoint.
- [ ] **Step 2:** Run `pnpm test src/modules/landing/seo.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(landing): landing page resolution, generated copy and indexable rule`.

### Task 41 (W8): JobPosting and Breadcrumb JSON-LD and listing page metadata

**Files:**
- Modify: `src/modules/landing/jsonld.ts`, `src/app/(seeker)/jobs/view/[id]/[slug]/page.tsx` (add `generateMetadata` and the JSON-LD `<script type="application/ld+json">`)
- Test: `src/modules/landing/seo.test.ts` (JSON-LD `describe`)

**Interfaces:**
- **Produces:**
  - `buildJobPostingJsonLd(d: ListingDetail, appUrl: string): string` follows spec 8.11, using the nested schema.org types Google's JobPosting requires.
    - **Root:** `'@context': 'https://schema.org'`, `'@type': 'JobPosting'` and `title`.
    - **`employmentType`:** `FULL_TIME`, `PART_TIME` or `CONTRACTOR` (contractors take `CONTRACTOR` only), plus `TEMPORARY` for fixed and season dates.
    - **Location:**
      - Onsite listings get `jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: <city>, addressRegion: <state code>, addressCountry: 'US' } }`.
      - Remote listings get `jobLocationType: 'TELECOMMUTE'`, no `jobLocation`, and `applicantLocationRequirements`: an array of `{ '@type': 'State', name: <state name> }`, or `{ '@type': 'Country', name: 'US' }` for `all_us`.
    - **`baseSalary`:** `{ '@type': 'MonetaryAmount', currency: 'USD', value: { '@type': 'QuantitativeValue', minValue, maxValue, unitText } }`, in dollars, with `unitText` one of `HOUR`, `DAY`, `WEEK`, `MONTH` or `YEAR`. It is omitted for season pay and crew share.
    - **Other fields:**

      | Field | Value |
      |---|---|
      | `directApply` | `true` |
      | `identifier` | `{ '@type': 'PropertyValue', name: 'Explore&Earn', value: listingId }` |
      | `hiringOrganization` | `{ '@type': 'Organization', name, sameAs: '<appUrl>/hosts/<slug>', logo }`, with `logo` omitted when the host has none |
      | `jobBenefits` | "Housing provided" and "Meals provided", when true |
      | `datePosted` | `publishedAt` |
      | `validThrough` | when set |
      | `description` | plain-text paragraphs |

    - The output is `JSON.stringify(...).replace(/</g, '\\u003c')`.
  - `buildBreadcrumbJsonLd(items, appUrl): string`
- **Page metadata:**
  - Active listings: `title`, `description`, `alternates.canonical` (`/jobs/view/<id>/<slug>`, without `source`), and Open Graph and Twitter images from the 1280 px cover.
  - Closed listings: `robots: { index: false }` and no JSON-LD.

- [ ] **Step 1: Write the failing tests.**
  - **Employment type:** a full-time employee on fixed dates gives `['FULL_TIME', 'TEMPORARY']`. An ongoing contractor gives `['CONTRACTOR']`. A part-time season listing gives `['PART_TIME', 'TEMPORARY']`.
  - **Root:** the parsed output has `'@context': 'https://schema.org'` and `'@type': 'JobPosting'`.
  - **Location:**
    - The onsite Lift operator fixture's `jobLocation` equals exactly `{ '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Breckenridge', addressRegion: 'CO', addressCountry: 'US' } }`.
    - Remote `['CO', 'UT']` gives `applicantLocationRequirements` equal to `[{ '@type': 'State', name: 'Colorado' }, { '@type': 'State', name: 'Utah' }]`, with `jobLocationType: 'TELECOMMUTE'` and no `jobLocation`.
    - `all_us` gives `{ '@type': 'Country', name: 'US' }`.
  - **Salary:**
    - $19–$22/hr gives `minValue: 19, maxValue: 22, unitText: 'HOUR'`.
    - Season pay has no `baseSalary`, and neither does crew share.
  - **Escaping:** a description containing `</script><script>alert(1)</script>` gives output that contains no `<` and contains `\u003c/script`.
  - **Organization:** for the fixture without a logo, `hiringOrganization` equals exactly `{ '@type': 'Organization', name: 'Kettle Ridge Lodge', sameAs: 'https://exploreandearn.com/hosts/kettle-ridge-lodge' }`.
  - **Identifier:** `identifier` equals `{ '@type': 'PropertyValue', name: 'Explore&Earn', value: <listingId> }`.
- [ ] **Step 2:** Run `pnpm test src/modules/landing/seo.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(landing): JobPosting and breadcrumb JSON-LD, listing page metadata`.

### Task 42 (W8): Sitemaps and robots

**Files:**
- Modify: `src/modules/landing/sitemaps.ts`
- Create: `src/app/sitemap.xml/route.ts`, `src/app/sitemaps/[name]/route.ts`, `src/app/robots.ts`, `tests/e2e/seo.spec.ts`
- Test: `src/modules/landing/seo.test.ts` (sitemap and robots `describe`s)

**Interfaces:**
- **Produces:**
  - `sitemapNames(db)` returns `['jobs-1', …, 'jobs-N', 'landing', 'hosts']`, with `N = max(1, ceil(active / 10000))`.
  - `sitemapEntries(db, name)` returns entries for each sitemap:

    | Sitemap | Entries |
    |---|---|
    | `jobs-k` | active listings ordered by `listing_id`, offset `(k − 1) × 10000`, at `/jobs/view/<id>/<slug>` with `lastmod` `indexed_at` |
    | `landing` | `listLandingPaths` |
    | `hosts` | `listPublicHostSlugs`, paged, at `/hosts/<slug>` |

  - `listLandingPaths(db)` returns indexable pages only. It computes them with grouped counts over the projection, not one search per page. `lastmod` is the greater of the newest matching `indexed_at` and the row's `updated_at`.
  - `renderSitemapIndex(names: string[], appUrl: string): string` and `renderUrlset(entries: { loc: string; lastmod: Date }[]): string` XML-escape `&`, `<`, `>`, `'` and `"`.
  - The routes return `application/xml`. `/sitemaps/<name>.xml` strips `.xml`, and an unknown name returns 404. The routes and `robots.ts` import these functions from `@/modules/landing`, where W0 stubbed them.
  - `buildRobots(appEnv: 'dev' | 'preview' | 'prod', appUrl: string): MetadataRoute.Robots`:
    - In prod: `allow: '/'`; `disallow` `/api/`, `/host`, `/admin`, `/profile`, `/community`, `/apply`, `/sign-in`, `/sign-up`, `/onboarding` and `/design-system`; `sitemap: <appUrl>/sitemap.xml`.
    - Elsewhere: `disallow: '/'`.
  - `src/app/robots.ts` returns `buildRobots(getEnv().APP_ENV, getEnv().APP_URL)`.

- [ ] **Step 1: Write the failing tests.**
  - **Chunking:** 10,001 active rows give `['jobs-1', 'jobs-2', 'landing', 'hosts']`, and `jobs-2` has 1 entry.
  - **Status:** a closed listing appears in no sitemap.
  - **Landing paths:** `/jobs/alaska` is absent when no active listing is in AK.
  - **Escaping:** `renderUrlset` escapes `&` as `&amp;`.
  - **Robots:** `buildRobots('prod', …).rules` disallows `/community`. `buildRobots('preview', …)` disallows `/`.
  - **E2E (`seo.spec.ts`):**
    - `/sitemap.xml` lists `jobs-1`, and `jobs-1` contains the Lift operator URL.
    - The listing page's JSON-LD parses and has `@type: 'JobPosting'`.
    - The closed listing page has `<meta name="robots" content="noindex">` and no `application/ld+json` script.
    - Every response has `x-robots-tag: noindex` (dev).
    - `/?cat=farm` has `noindex, follow` and the canonical `/`.
- [ ] **Step 2:** Run `pnpm test src/modules/landing/seo.test.ts` and `pnpm e2e tests/e2e/seo.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(landing): sitemaps rendered from the projection and robots per environment`.

### Task 43 (W8): Landing routes

**Files:**
- Create:
  - `src/app/(seeker)/jobs/[segment]/page.tsx`, `src/app/(seeker)/jobs/[segment]/[sub]/page.tsx`
  - `src/app/(seeker)/seasons/[season]/page.tsx`, `src/app/(seeker)/destinations/[slug]/page.tsx`, `src/app/(seeker)/international/page.tsx`
  - `src/app/(seeker)/_components/landing-page.tsx`
  - `tests/e2e/discovery-landing.spec.ts`

**Interfaces:**
- **Consumes:** `resolveLanding`, `buildBreadcrumbJsonLd` and `OFFICIAL_VISA_LINKS` (all from `@/modules/landing`), `LandingHero`, `SeekFeed` (with `source: 'landing'`), `searchListings` and `serializeQuery`.
- **`LandingPageView`:**
  - The `LandingHero` and the breadcrumbs, then the first page of the pre-filtered feed, server-rendered.
  - Links to `/swipe?<query>` and `/map?<query>`.
  - On `/international`, the official links list from `OFFICIAL_VISA_LINKS`.
  - **Empty:** `EmptyState` "No open jobs here right now." with a link to `/`.
  - **Metadata:** `title` is `seoTitle`; `description` is `seoDescription`; `alternates.canonical` is the path. `robots: { index: false, follow: true }` when not indexable. Open Graph uses the 1280 px hero. The page includes the BreadcrumbList JSON-LD.
  - An unresolved path calls `notFound()`.

- [ ] **Step 1: Write the failing e2e test.**
  - `/jobs/colorado` shows the `h1` "Jobs in Colorado", the strapline "Explore the country. Earn as you go." and "Lift operator". Its Swipe link is `/swipe?state=CO`.
  - `/jobs/maritime/alaska` shows "Deckhand".
  - `/jobs/wyoming` shows "No open jobs here right now." and has `noindex`.
  - `/jobs/nowhere` returns 404.
  - Cards on a landing page link with `source=landing`.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/discovery-landing.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(landing): state, category, genre, season, destination and international pages`.

### Task 44 (W8): Operator landing copy editor

**Files:**
- Modify: `src/modules/landing/copy.ts`
- Create: `src/app/admin/content/landing/page.tsx`, `src/app/admin/content/landing/[key]/page.tsx`, `src/app/admin/content/landing/actions.ts`, `tests/e2e/landing-editor.spec.ts`
- Test: `src/modules/landing/copy.test.ts`

**Interfaces:**
- **Consumes:** `requireOperator`, `requestUpload` (kind `cover`) and `getStorage` (Task 4), `record` (audit), and Foundation `Tabs`, `Badge`, `Input`, `Textarea`, `EmptyState` and `ErrorState`.
- **Produces:**
  - `saveLandingCopy(db, key, i, actor)` follows the spec 3.2 signature.
    - The key must be one that resolves. The lengths are: title 1–80, intro ≤ 1,200, `heroAlt` ≤ 150 (required when `heroMediaId` is set), `seoTitle` ≤ 60 and `seoDescription` ≤ 160.
    - Violations throw `bad_request`.
    - It upserts with `updated_by`, and records `landing.copy_saved` with `{ key, fields }` in the same transaction.
  - `listLandingCopy(db, now)` and `getLandingCopy(db, key, now)` with the Task 3 signatures, replacing the stubs. `listLandingCopy` enumerates every key that resolves (states, categories, category and state pairs, category genres, seasons, `listDestinations`, `international`), in that order.
  - `saveLandingCopyAction(key, input)` and `requestHeroUploadAction(mime, sizeBytes)` each call `requireOperator()` first. `requestHeroUploadAction` returns `requestUpload(db, getStorage(), { userId: <the operator's user ID> }, { kind: 'cover', mime, sizeBytes })`.
- **Pages:**
  - The list reads `listLandingCopy`: `Tabs` by kind, each item a "Custom copy" `Badge` when `custom` is true.
  - The form reads `getLandingCopy` (an unknown key calls `notFound()`). It has character counters, the hero upload with alt text, and a "Preview" link to `page.path`.
  - The console is desktop only.

- [ ] **Step 1: Write the failing tests.**
  - An 81-character title throws `bad_request`.
  - A `heroMediaId` without alt text throws `bad_request`.
  - The key `state:atlantis` throws `bad_request`.
  - A save writes the row and one `landing.copy_saved` audit event.
  - A second save updates the row in place.
  - `listLandingCopy` marks `state:alaska` `custom: true` after a save and `state:colorado` `custom: false`. `getLandingCopy(db, 'state:atlantis', now)` is null.
  - E2E, as the bootstrapped owner operator:
    - Editing Alaska's title to "Work in Alaska" shows the Badge in the list.
    - `/jobs/alaska` then shows "Work in Alaska".
- [ ] **Step 2:** Run `pnpm test src/modules/landing/copy.test.ts` and `pnpm e2e tests/e2e/landing-editor.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(landing): operator editor for landing copy and hero images`.

---

## Phase C: Verification (W9)

### Task 45 (W9): Guest flow and freshness e2e (exit criteria 1, 3)

**Files:**
- Create: `tests/e2e/discovery-guest.spec.ts`, `tests/e2e/discovery-freshness.spec.ts`

**Interfaces:**
- **Consumes:** `readSeed`, `signInAsSeeker({ fresh: true })`, and Task 27's `publishListing`, `editListing`, `closeListingAs` and `removeListing` with `drain: false` (called from the test over `getDb()`; removal runs as the bootstrapped owner operator).

- [ ] **Step 1: Write the failing e2e tests.**
  - **Guest flow** (exit 1; spec failure mode 3):
    - A guest uses Seek, Swipe and Map, and opens a listing.
    - Save leads through sign-up and onboarding (seeker, 18+) back to the listing, with exactly one saved row and the "Job saved" Toast. The URL has no `intent`.
    - Skip and the bell complete the same way, giving one skipped row and one saved search.
    - Apply lands on `/apply/<id>?source=seek` and creates no application.
    - A `returnTo` of `//evil.test` ends on `/`.
  - **Freshness** (exit 3):
    - Publishing a new listing through SP2 makes it appear in `/api/v1/discovery/search?q=<unique title>` and in the map pins.
    - An edit, a close and a removal are each reflected the same way, with the removed listing's detail page returning 404.
    - Each step polls every 2 s and fails at 60 s.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/discovery-guest.spec.ts tests/e2e/discovery-freshness.spec.ts`. Expected: FAIL until everything is wired together.
- [ ] **Step 3:** Fix any integration gaps in the owning files and note each fix in the commit body.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `test(discovery): guest intents end to end and 60-second freshness`.

### Task 46 (W9): Accessibility and Lighthouse (exit criteria 5, 9)

**Files:**
- Create: `tests/e2e/discovery-a11y.spec.ts`, `lighthouserc.discovery.json`, `scripts/lhci-urls.ts`
- Modify: `.github/workflows/ci.yml`. Add a `lighthouse-discovery` step to the e2e job from Foundation Task 25, or add an `e2e` job if there is none. The step runs `pnpm build && pnpm start`, `pnpm e2e:seed` and `lhci autorun --config=lighthouserc.discovery.json`, with the URLs from `scripts/lhci-urls.ts`.

**Interfaces:**
- **Lighthouse:** mobile preset (the default emulation), 3 runs per URL, on `/`, `/swipe`, `/jobs/colorado` and the Lift operator listing page. The assertions are `largest-contentful-paint ≤ 3000`, `total-blocking-time ≤ 300` and `cumulative-layout-shift ≤ 0.1`, each at `error` level.
- **Previews:** protected previews use the header `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET`.

- [ ] **Step 1: Write the failing tests.**
  - **axe** (exit 9): 0 serious or critical violations in light and dark, at 390 px and 1280 px, on every SP3 screen:
    - `/`, `/swipe`, `/map` (list fallback), the listing page and the panel
    - a landing page, `/profile/alerts` and both admin landing pages
    - the SignInPrompt, OffsiteNotice and both InstallPrompt variants
    - `/offline.html`
  - **Keyboard:** every Swipe action works from the keyboard alone (Tab to the deck, then ArrowLeft, ArrowRight, ArrowUp, Enter and U).
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/discovery-a11y.spec.ts`, then the Lighthouse step locally. Expected: FAIL until fixed.
- [ ] **Step 3:** Fix any violations in the owning files.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5: Commit** with the message `test(discovery): axe across SP3 screens and the Lighthouse mobile budget`.

### Task 47 (W9): Performance gate (exit criterion 4)

**Files:**
- Create: `.github/workflows/perf-discovery.yml`, `tests/perf/discovery.k6.js`, `tests/perf/clerk-sessions.js`

**Interfaces:**
- **Workflow** (runs on `workflow_dispatch` and nightly):
  1. Starts a `postgis/postgis:17-3.5` service, then runs `pnpm db:migrate` and `pnpm discovery:seed-synthetic --count 50000 --seed 42`.
  2. Runs `pnpm build && pnpm start`, using the Clerk dev-instance keys from secrets.
  3. Runs `grafana/setup-k6-action`, then `k6 run tests/perf/discovery.k6.js`.
  4. Uploads the summary JSON. Any threshold failure fails the job.
- **Read scenario:** 50 VUs for 5 minutes. 55% search, with randomized filters and sorts. 15% deck. 20% map, at zooms 4, 8 and 12. 10% suggest.
- **Write scenario:** 50 VUs (`constant-vus`) for a fixed 5 minutes, one user per VU, with `sleep(2)` after every request, so a VU makes at most about 150 requests a run. The mix and pacing stay inside the app's limits (Tasks 23 and 28), because k6 counts every 4xx as failed:
  - **Dispositions:** nine of every ten iterations `PUT /api/v1/me/dispositions/:id` with a random seeded listing and state. That is at most 30 a minute per user, against the 120-per-minute `disp:<userId>` limit.
  - **Saved searches:** every tenth iteration `POST /api/v1/me/saved-searches` with a query unique to that VU and iteration, and a VU stops posting after 15. That stays under both the 20-alert setting and the 30-per-hour `ss:<userId>` limit. The workflow migrates a fresh database on every run, so no saved searches or rate-limit windows carry over and no deletes are needed.
  - **Expected statuses:** the PUT passes `responseCallback: http.expectedStatuses(200)`. The POST passes `http.expectedStatuses(200, 201, 409)`, and a `check` that it got 200 or 201, so a 409 at the alert limit shows in the summary without failing `http_req_failed`.
- **Test users** (a Clerk development instance holds at most 100 users, so runs never create new ones):
  - `setup()` uses 50 fixed users, `perf-seeker-01+clerk_test@example.com` to `perf-seeker-50+clerk_test@example.com`. It looks each one up with `GET /v1/users?email_address=<email>` and creates it with `POST /v1/users` only when absent, which happens on the first run only.
  - It then creates one session per user for this run (`POST /v1/sessions`) and onboards each user as a seeker with the header `Origin: APP_URL`. It accepts 200, or 409 when the user's Clerk metadata already makes them a seeker in the fresh database.
  - `teardown()` revokes this run's sessions (`POST /v1/sessions/{id}/revoke`) and never deletes users.
  - Each VU refreshes its session token every 50 s through `POST /v1/sessions/{id}/tokens` and sends it as `Authorization: Bearer`.
  - Requests to Clerk are tagged `external` and left out of the thresholds.
- **Thresholds:** `http_req_duration{group:read}: p(95)<800` and `http_req_duration{group:write}: p(95)<1000`, plus `http_req_failed < 1%` over the app's requests.

- [ ] **Step 1:** Write the k6 scenario and the workflow.
- [ ] **Step 2:** Run the workflow on the branch with `gh workflow run perf-discovery.yml --ref <branch>`. It may fail on budget at first.
- [ ] **Step 3:** Fix any query that misses the budget in the owning task's files. Check its plan with `EXPLAIN (ANALYZE, BUFFERS)` against the seeded container, then add any index in the follow-up range of the migration's owner.
- [ ] **Step 4:** Run it again. Expected: every threshold passes, and the uploaded summary shows search, deck, map and suggest p95 ≤ 800 ms and writes p95 ≤ 1 s.
- [ ] **Step 5: Commit** with the message `ci(discovery): k6 performance gate at 50,000 listings`.

### Task 48 (W9): Production smoke test and runbook (exit criterion 8)

**Files:**
- Create: `tests/e2e/discovery-smoke.spec.ts`, `docs/runbooks/sp3-discovery.md`

**Interfaces:**
- **Smoke test:** a read-only guest run, enabled only with `E2E_BASE_URL` set. It never signs in and never writes.
- **The runbook** gives the steps for:
  - the Mapbox URL-restricted public tokens for dev, stg and prd in Doppler
  - `ANALYTICS_HASH_SECRET` in every Doppler config
  - `VERCEL_AUTOMATION_BYPASS_SECRET` (stg, synced to GitHub Actions)
  - the Vercel Firewall rule: 300 requests per minute per IP on `/api/v1/discovery/*` and `/api/v1/listings/*/events`
  - the Clerk dev-instance secrets for the perf job, and its 50 reused `perf-seeker-NN+clerk_test@example.com` users (the instance's 100-user cap)
  - running `pnpm discovery:rebuild` after a restore
  - the handoff to SP8: Search Console verification and sitemap submission

- [ ] **Step 1: Write the smoke test.** Against the founding-host listings, the guest:
  - finds at least one result in Seek
  - sees a card in Swipe
  - gets at least one pin from the map API for the contiguous US
  - opens a listing page with a parseable JobPosting JSON-LD
  - sees `/sitemap.xml` return 200
- [ ] **Step 2:** Run `E2E_BASE_URL=https://<preview> pnpm e2e tests/e2e/discovery-smoke.spec.ts` against a preview that holds seeded data. Expected: PASS. The production run happens at release, by the orchestrator.
- [ ] **Step 3:** Write the runbook.
- [ ] **Step 4:** Run the full suite: `pnpm lint && pnpm check:tokens && pnpm typecheck && pnpm test && pnpm e2e`. Expected: all pass.
- [ ] **Step 5: Commit** with the message `test(discovery): production smoke run; docs: SP3 runbook`.
