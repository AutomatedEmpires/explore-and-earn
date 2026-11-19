# Sub-project 3: Discovery technical design

- **Status:** design decided by engineering under the founder's end-to-end delegation (2026-11-03).
- **Parent:** [Product design spec](2026-11-03-explore-earn-product-design.md), sections 3, 4, 5, 6, 15.1, 21 (the "Add to Home Screen" prompt line), 23 (web app and PWA) and the SP3 row of section 25.
- **Builds on:** [Foundation design](2026-11-03-foundation-design.md) and its [plan](../plans/2026-11-03-foundation.md). Every Foundation name below (apiRoute, enqueue, notify, getSetting, getMediaUrl, Card, Sheet...) is used exactly as defined there. Sibling contracts are aligned with the SP2, SP4, SP5, SP6, SP7 and SP8 specs of the same date.
- **Goal:** seekers and guests find jobs through Seek, Swipe and Map, read the full listing, save, skip and set alerts, and can add Explore&Earn to their Home Screen; Google indexes listings and landing pages.

## 1. Goal and done-when

| # | Exit criterion | Proven by |
|---|---|---|
| 1 | A guest can use Seek, Swipe and Map and open a listing; Save, Skip, Apply and the bell ask them to sign in, and after sign-in the started action completes (Save, Skip, alert) or the apply review opens (Apply). | `tests/e2e/discovery-guest.spec.ts` |
| 2 | Every filter, sort and the Starting soon chip return exactly the listings the rules in section 8 select, on Seek, Swipe, the Map pins and the pull-up list. | `src/modules/discovery/search.test.ts` (table-driven, one case per rule) |
| 3 | A listing published, edited, closed or removed in SP2 is reflected in search and on the map within 60 s. | `tests/e2e/discovery-freshness.spec.ts` (polls the API, fails at 60 s) |
| 4 | With 50,000 synthetic listings and 50 concurrent users: search, deck, map and suggest p95 ≤ 800 ms; disposition and saved-search writes p95 ≤ 1 s. | `.github/workflows/perf-discovery.yml` (k6; fails over budget) |
| 5 | Lighthouse mobile preset on `/`, `/swipe`, one landing page and one listing page: LCP ≤ 3.0 s, TBT ≤ 300 ms, CLS ≤ 0.1. | `lighthouserc.discovery.json` in the e2e CI job |
| 6 | A saved search sends one push for new matches and one daily email; a closed listing is never in either. | `src/modules/discovery/alerts.test.ts` |
| 7 | `/sitemap.xml` lists every active listing and every indexable landing page; each active listing page carries valid JobPosting JSON-LD; closed pages carry none and are `noindex`. | `src/modules/landing/seo.test.ts`, `tests/e2e/seo.spec.ts` |
| 8 | Every mode works on the real founding-host listings: a read-only guest smoke run against production finds results in Seek, a card in Swipe, pins on Map, and a listing page with JSON-LD. | `tests/e2e/discovery-smoke.spec.ts` with `BASE_URL` set to prod |
| 9 | Every SP3 screen, including both InstallPrompt variants, passes axe (no serious or critical) in light and dark at 390 px and 1280 px, and every Swipe action works from the keyboard. | `tests/e2e/discovery-a11y.spec.ts` |
| 10 | The app is installable: the manifest and icons give no Chrome installability errors; the InstallPrompt opens only under the rules of section 8.15 and honors every hold; an offline navigation shows the offline page. | `src/lib/discovery/install.test.ts`, `tests/e2e/pwa.spec.ts` |

## 2. Scope

**In:** the search projection and its sync from SP2 events; search, filters, sort and pay normalization; Seek, Swipe and Map; the public listing detail route (page and desktop side panel); saved and skipped jobs (data, APIs and client actions); saved searches, push alerts, the daily email, the weekly digest and the Job alerts page; landing pages with a minimal operator editor for their copy; sitemaps, `robots.txt`, JobPosting and BreadcrumbList structured data; guest browsing and sign-in intents; `listing_events` (view, save, share, apply source) with daily aggregates; the boosted-placement hook touchpoint (no-op until SP6) and the seeker-overlay hook (no-op until SP4); the PWA install path (web app manifest, icons, the offline fallback page, service worker registration and the "Add to Home Screen" prompt, section 8.15); the discovery performance gate.

**Out:**

| Item | Owner |
|---|---|
| Listing model, `ListingContent`, builder, publishing, slots, reminders, auto-close, repost, genres, occupations, the destinations list, locations, host page `/hosts/[slug]`, follows, weather, host pricing page, the `ListingDetailView` pattern | SP2 |
| Apply review and submit, application state, the My jobs tabs (including rendering Saved and Skipped), `/profile`, Report and Block storage and the `ReportSheet` | SP4 |
| Fit score (never on the seeker card), invites, messaging, host analytics charts and applies-by-source | SP5 |
| Boost purchase, the placement engine and its caps, the "Boosted" badge and spark-pin visuals, boost reporting | SP6 (implements the SP3 hook) |
| Community feed and its paid mix | SP7 |
| Full operator console, About page, help center, cookie banner, legal review of the visa wording, the launch-wide performance audit on `ee-perf` and its seeder, Search Console DNS verification | SP8 |
| More sorts (pay, start date), geocoding of arbitrary places, Google Indexing API, offline mode (cached jobs or pages; V1 has only the offline fallback page), an in-app install prompt on desktop browsers | Not in V1 (Engineering decision) |

## 3. Modules and contracts

| Path | Owns |
|---|---|
| `src/modules/discovery/` | Projection, sync handlers, search, map, deck, dispositions, listing events, saved searches and alerts, hooks. `index.ts` starts with `import 'server-only'`. |
| `src/modules/landing/` | Landing page resolution and copy, sitemaps, JSON-LD builders. Depends on `discovery`; `discovery` never imports `landing`. |
| `src/lib/discovery/` | Client-safe pure code: types, URL codec, pay and date formatting, season windows, the bot pattern, the install-prompt rules, the `useListingActions` and `useInstallPrompt` client hooks. No database imports. |
| `src/app/manifest.ts`, `public/icons/`, `public/offline.html`, `src/ui/brand/app-icon.svg`, `scripts/gen-icons.ts` | The PWA install path (section 8.15) |
| `src/ui/patterns/` | New design-system patterns (section 7), added with gallery entries before any screen uses them |
| `src/server/placement-hook.ts` | Touchpoint: `export const boostPlacementHook: BoostPlacementHook = noopHook` (SP6 replaces the line) |

### 3.1 `@/modules/discovery`

```ts
// Types re-exported from src/lib/discovery. Category comes from SP2; Season = 'spring'|'summer'|'fall'|'winter'|'year_round'.
export type DiscoverySource = 'seek' | 'swipe' | 'map' | 'invite' | 'boost' | 'landing' | 'other'; // = SP4 ApplicationSource
export type DiscoverySort = 'relevant' | 'newest' | 'distance'; export type DispositionState = 'saved' | 'skipped';
export type ListingEventType = 'view' | 'save' | 'share' | 'apply';
export type DiscoveryQuery = {
  q?: string; categories?: Category[]; genres?: string[]; states?: string[]; destination?: string;
  orgId?: string; start?: { withinMonths: 1 | 3 | 6 } | { season: Season; year: number };
  startingSoon?: boolean; housing?: 'provided' | 'free'; meals?: 'provided' | 'free';
  sponsorsVisas?: boolean; pay?: { minCents: number; unit: 'hour' | 'day' | 'year' };
  bbox?: [west: number, south: number, east: number, north: number]; locationId?: string;
};
export type JobCardData = {
  listingId: string; href: string; title: string; category: Category; secondaryCategory: Category | null;
  genre: string | null; status: 'active' | 'closed'; remote: boolean; locationLabel: string;
  host: { orgId: string; name: string; slug: string; logoUrl: string | null; subscriberSince: string | null };
  cover: { src: Record<320 | 640 | 1280, string>; alt: string } | null; dateLine: { info: string; end: string | null };
  housing: Amenity; meals: Amenity; pay: { chip: string; full: string; details: string[] }; sponsorsVisas: boolean;
  boosted: { boostId: string } | null;                                       // from boostedAmong
  viewer: { disposition: DispositionState | null; applied: boolean } | null; // null for guests
};
export type Amenity = { provided: boolean; free: boolean; costLine: string | null; note: string | null };
export type ListingDetail = JobCardData & { content: ListingContent; revisionId: string; publishedAt: string;
  photoUrls: Record<string, Record<320 | 640 | 1280, string>>; activityLine: string; categoryFields: { label: string; value: string }[];
  additionalStep: { note: string; url: string; domain: string } | null; validThrough: string | null };
export type SearchInput = { query: DiscoveryQuery; sort: DiscoverySort; surface: 'seek' | 'swipe' | 'map_list';
  cursor?: string; limit?: number; origin?: { lat: number; lng: number }; tz: string; viewerUserId: string | null; viewerKey: string };
export function searchListings(db: DbOrTx, i: SearchInput): Promise<{ items: JobCardData[]; nextCursor: string | null; total: number; totalCapped: boolean }>;
export function mapPins(db: DbOrTx, i: { query: DiscoveryQuery; bbox: [number, number, number, number]; zoom: number; viewerUserId: string | null }): Promise<{ pins: MapPin[]; clusters: MapCluster[]; capped: boolean }>;
export function locationPreview(db: DbOrTx, i: { locationId: string; query: DiscoveryQuery; cursor?: string; tz: string; viewerUserId: string | null }): Promise<{ host: HostPreview; matchingCount: number; activeCount: number; items: JobCardData[]; nextCursor: string | null } | null>;
export function suggest(db: DbOrTx, q: string): Promise<{ jobs: { label: string; q: string }[]; places: { label: string; kind: 'state' | 'destination'; value: string }[]; employers: { label: string; orgId: string; slug: string }[] }>;
export function getJobCards(db: DbOrTx, listingIds: string[], opts?: { viewerUserId?: string | null; tz?: string }): Promise<JobCardData[]>; // active only, input order
export function matchListingIds(db: DbOrTx, i: { listingIds: string[]; query: DiscoveryQuery; viewerUserId: string | null }): Promise<string[]>;
export function getListingDetail(db: DbOrTx, i: { listingId: string; viewerUserId: string | null; tz: string }): Promise<ListingDetail | { status: 'closed'; card: JobCardData } | null>;
export function countNewListings(db: DbOrTx, i: { since: Date }): Promise<{ listings: number; hosts: number; withHousing: number }>;
export function toHourlyCents(c: Pick<ListingContent, 'pay' | 'when'>): { minCents: number | null; maxCents: number | null }; // section 8.2
export function setDisposition(db: DbOrTx, i: { userId: string; listingId: string; state: DispositionState; source: DiscoverySource; expectedState?: DispositionState | null }): Promise<{ state: DispositionState; previous: DispositionState | null }>;
export function clearDisposition(db: DbOrTx, i: { userId: string; listingId: string; expectedState?: DispositionState }): Promise<{ previous: DispositionState | null }>;
export function listSavedJobs(db: DbOrTx, userId: string, i: { limit: number; before?: string }): Promise<{ items: JobCardData[]; nextBefore: string | null; total: number }>;
export function listSkippedJobs(db: DbOrTx, userId: string, i: { limit: number; before?: string }): Promise<{ items: JobCardData[]; nextBefore: string | null; total: number }>;
export function unsaveJob(db: DbOrTx, userId: string, listingId: string): Promise<void>;
export function restoreSkippedJob(db: DbOrTx, userId: string, listingId: string): Promise<void>;
export function recordListingEvent(db: DbOrTx, e: { listingId: string; type: ListingEventType; source: DiscoverySource; at?: Date; viewerKey?: string | null; dedupeKey?: string }): Promise<void>;
export function getListingEventCounts(db: DbOrTx, i: { orgId: string; listingIds?: string[]; from: Date; to: Date; types: ('view' | 'save')[]; bucket: 'day' | 'week' | 'none' }): Promise<{ listingId: string; bucketStart: string | null; type: 'view' | 'save'; count: number }[]>;
// Placement hook: shape proposed by SP6 (its section 3) and adopted verbatim
export type PlacementInput = { surface: 'seek' | 'swipe'; pageIndex: number; pageSize: number; organic: string[];
  matchIds: (ids: string[]) => Promise<string[]>; viewerKey: string; state: string | null; now: Date };
export type PlacementOutput = { items: { listingId: string; boostId: string | null }[]; organicConsumed: number; state: string | null };
export interface BoostPlacementHook { place(db: DbOrTx, i: PlacementInput): Promise<PlacementOutput>;
  boostedAmong(db: DbOrTx, listingIds: string[], now: Date): Promise<Map<string, string>> } // listingId -> boostId
export const noopHook: BoostPlacementHook;
export interface SeekerOverlayProvider { appliedListingIds(db: DbOrTx, userId: string, listingIds: string[] | 'all'): Promise<Set<string>>;
  hiddenOrgIds(db: DbOrTx, userId: string): Promise<string[]> } // hosts the seeker blocked
export function registerSeekerOverlay(p: SeekerOverlayProvider): void; // default: none applied, none hidden
export function rebuildSearchProjection(db: Db): Promise<{ upserted: number; removed: number }>;
// Saved searches: createSavedSearch, updateSavedSearch, deleteSavedSearch, listSavedSearches, getAlertSettings, setAlertSettings (section 5 shapes)
export function exportUserData(db: DbOrTx, userId: string): Promise<DiscoveryExport>;
export function eraseUserData(db: Db, userId: string): Promise<void>;
export function seedSynthetic(db: Db, i: { count: number; seed: number }): Promise<void>; // projection rows only; throws when APP_ENV=prod
export const jobHandlers: HandlerMap;
```

`MapPin = { kind: 'pin'; locationId: string; orgId: string; lat: number; lng: number; category: Category; categories: Category[]; remoteOnly: boolean; matchingCount: number; boosted: boolean }`. `MapCluster = { kind: 'cluster'; lat: number; lng: number; listings: number; locations: number }`. `HostPreview = { orgId; name; slug; logoUrl: string | null; locationLabel: string; approximate: boolean; categories: Category[]; remoteLine: string | null }`. `DiscoveryExport = { saved: { listingId; at }[]; skipped: { listingId; at }[]; savedSearches: { name; query; createdAt }[]; alertSettings: { weeklyDigest: boolean } }`. At module load, discovery calls SP2 `registerListingStatsProvider('discovery', ...)` to supply `views` and `saves` to the listing library.

### 3.2 `@/modules/landing`

```ts
export type LandingKind = 'state' | 'category' | 'category_state' | 'category_genre' | 'season' | 'destination' | 'international';
export type LandingPage = { key: string; kind: LandingKind; path: string; title: string; intro: string;
  hero: { url: string; alt: string } | null; seoTitle: string; seoDescription: string; query: DiscoveryQuery;
  indexable: boolean; breadcrumbs: { name: string; path: string }[] };
export function resolveLanding(db: DbOrTx, path: string, now: Date): Promise<LandingPage | null>;
export function listLandingPaths(db: DbOrTx): Promise<{ path: string; lastmod: Date }[]>; // indexable only
export function buildJobPostingJsonLd(d: ListingDetail, appUrl: string): string; // every `<` escaped as \u003c
export function buildBreadcrumbJsonLd(items: { name: string; path: string }[], appUrl: string): string;
export function sitemapNames(db: DbOrTx): Promise<string[]>;
export function sitemapEntries(db: DbOrTx, name: string): Promise<{ loc: string; lastmod: Date }[]>;
export function saveLandingCopy(db: Db, key: string, i: { title: string; intro: string; heroMediaId: string | null; heroAlt: string | null; seoTitle: string | null; seoDescription: string | null }, actor: { operatorId: string }): Promise<void>;
export const jobHandlers: HandlerMap; // empty
```

### 3.3 `src/lib/discovery` (client-safe)

`parseQuery(p: URLSearchParams): { query: DiscoveryQuery; sort: DiscoverySort }` (invalid values are dropped, never thrown), `serializeQuery(q, sort): URLSearchParams`, `canonicalQuery(q): string` (sorted keys and arrays; no `bbox`, `locationId`, sort or cursor), `normalizePay(c: Pick<ListingContent, 'pay' | 'when'>)` (the pure core of `toHourlyCents`, also returning `yearlyMinCents`), `formatPay(c): { chip: string; full: string; details: string[] }`, `dateLine(when: ListingContent['when'], today: string): { info: string; end: string | null }`, `seasonWindow(s: Season, year: number): { from: string; to: string } | null`, `isBot(userAgent: string | null): boolean`, and `useListingActions(i: { listingId: string; source: DiscoverySource; initial: JobCardData['viewer'] })` returning `{ save, skip, apply, undo, state }` (handles guests, the Undo toast and its 10-second window; SP7 uses it for boosted cards). Install (section 8.15): `type InstallState = { v: 1; shows: number; holdUntil: string | null; installedAt: string | null }`; `installDecision(i: { state: InstallState | null; platform: 'chromium' | 'ios' | 'other'; canPrompt: boolean; standalone: boolean; coarsePointer: boolean; inAppBrowser: boolean; surface: 'seek' | 'map' | 'listing' | 'landing' | 'alerts' | 'other'; trigger: 'save' | 'alert' | 'views' | 'manual' | null; shownThisVisit: boolean; overlayOpen: boolean; now: Date }): { show: false } | { show: true; variant: 'chromium' | 'ios'; line: 0 | 1 }`; `nextInstallState(s: InstallState | null, outcome: 'dismissed' | 'installed', manual: boolean, now: Date): InstallState`; and `useInstallPrompt()` returning `{ eligible, open, trigger }` (stashes `beforeinstallprompt`, reads and writes `ee_install` inside try/catch, records `appinstalled`).

### 3.4 Interfaces consumed

| Interface | From | Used for |
|---|---|---|
| Events through `emit` and `src/server/event-subscribers.ts`: `listing.published`, `listing.changed`, `listing.closed`, `listing.removed` (`{ listingId, revisionId?, orgId }`), `hostpage.updated` (`{ orgId }`), `location.updated` (`{ locationId, orgId }`), `org.status_changed`, `subscription.changed` (`{ orgId, ... }`) | SP2 | Projection sync (section 6) |
| `getListingSummaries(db, ids)` (state), `getPublishedListing(db, id)` (active only), `listActiveListings(db, { after, limit })`, `ListingContent`, `Category`, `GENRES`, `listOccupations(db)`, `registerListingStatsProvider(name, fn)` | SP2 `@/modules/listings` | Projection rows, detail page, drift check, suggest, library stats |
| `getHostIdentities(db, orgIds)` (name, slug, logo, cover, `subscriber.hostSince`, `hiringNow`, home location), `listPublicHostSlugs(db, { after, limit })`, the `/hosts/[slug]` route | SP2 `@/modules/hostpages` | Card host fields, map previews, host sitemap |
| `getLocations(db, ids)` (`city`, `state`, `publicPoint`, `publicPrecision`, `timezone`), `listDestinations(db)` (`{ slug, name, states }`) | SP2 `@/modules/locations` | Pins, location labels, destination filter and landing pages |
| `ListingDetailView` pattern (props-only); `NEXT_PUBLIC_MAPBOX_TOKEN` and the Mapbox CSP entries | SP2 | Detail page body; map |
| `registerSeekerOverlay(...)` call; `/apply/[listingId]?source=`; `ReportSheet` mounted in the detail page's Report slot; `recordListingEvent` call for `apply` | SP4 | Applied and blocked overlays, Apply and Report, apply attribution |
| `boostPlacementHook` implementation in `src/server/placement-hook.ts` | SP6 | Boosted slots and labels, spark pins |
| Invite links carrying `source=invite` | SP5 | Attribution |
| `apiRoute`, `requireSeeker`, `requireOperator`, `AppError` helpers, `enqueue`, `jobHandlers`, `schedules`, `audit.record`, `getSetting`, `defineType`/`notify`, `getMediaUrl`/`requestUpload` (kind `cover`), `raiseAlert`, `track`, `consume`, `newId`, `queryRows`, `withTx` | Foundation | Everything |

**Consumers of SP3:** SP4 (`listSavedJobs`, `listSkippedJobs`, `unsaveJob`, `restoreSkippedJob`, `recordListingEvent`, `JobCardData`, `/profile/alerts`), SP5 (`getListingEventCounts`, `toHourlyCents`, `getJobCards`, source values), SP6 (`BoostPlacementHook` types, `matchListingIds`), SP7 (`JobCardData`, `getJobCards`, `useListingActions`, `countNewListings`, `robots.txt` `Disallow: /community`, `/seasons/[season]`, `/?sort=newest`), SP8 (`rebuildSearchProjection`, `exportUserData`, `eraseUserData`, the search and map endpoints for k6, `/sitemap.xml`, `/admin/content/landing`, the InstallPrompt states, `/offline.html` and `pwa.spec.ts` for its audits).

### 3.5 Foundation touchpoints SP3 changes

| File | Change |
|---|---|
| `src/lib/env.ts`, `.env.local.example` | Add `ANALYTICS_HASH_SECRET` (≥ 32 chars); a dev default for `NEXT_PUBLIC_MAPBOX_TOKEN` (SP2 adds the key) |
| `src/lib/security-headers.ts` | Beyond SP2's Mapbox entries: `connect-src https://*.tiles.mapbox.com`, `img-src blob: data:`, `child-src blob:`; `worker-src 'self' blob:` (the service worker and Mapbox's blob workers; without it `worker-src` falls back to `child-src blob:` and blocks `/sw.js`) and `manifest-src 'self'` |
| `src/app/layout.tsx`; `public/sw.js`; bottom-pinned `src/ui` parts | Root `metadata.appleWebApp` and `viewport` (`themeColor` per color scheme, `viewportFit: 'cover'`); `sw.js` gains the offline fallback, push handlers unchanged; BottomNav, the host bottom tabs and `Toast` pad by `env(safe-area-inset-bottom)` (section 8.15) |
| `src/app/(seeker)/layout.tsx`; `POST /api/v1/onboarding` | Discovery routes render for guests (TopBar shows "Sign in"); onboarding accepts an optional `returnTo` (section 8.7) and returns it as `redirectTo` for seekers |
| `src/modules/settings` `SettingValues`; `src/modules/notifications` `EmailTemplateName` and templates | Keys in section 8.8; `JobAlertDaily`, `JobAlertWeekly` |
| `src/server/schedules.ts`, `job-handlers.ts`, `event-subscribers.ts`, `placement-hook.ts`; `src/db/schema.ts` | Append SP3 lines (section 6); create `placement-hook.ts` |
| Operator Sidebar; `package.json` | A "Landing pages" item until SP8's `/admin/content` links to it; `mapbox-gl` (exact version) unless SP2 added it |

## 4. Data model

All tables: `app` schema, RLS on with no policies, UUIDv7 IDs from `newId()`, `created_at`/`updated_at` with `app.set_updated_at()`, CHECK enums. No foreign keys to SP2 tables (Engineering decision: modules stay decoupled; sync and maintenance keep integrity).

| Migration | Workstream | Tables |
|---|---|---|
| `drizzle/2000_discovery.sql` | W1 | `discovery_listings`, `discovery_sync_state` |
| `drizzle/2010_discovery.sql` | W3 | `listing_dispositions`, `listing_events`, `listing_event_daily` |
| `drizzle/2020_discovery.sql` | W4 | `saved_searches`, `saved_search_matches`, `alert_settings` |
| `drizzle/2100_landing.sql` | W8 | `landing_pages` |

**`app.discovery_listings`** (one row per listing that is active or closed; removed listings have no row)

| Columns | Type and constraints |
|---|---|
| `listing_id` pk, `revision_id`, `org_id`, `location_id`; `is_active` | uuid not null; boolean not null |
| `slug`, `title`, `occupation_code`, `occupation_label`, `location_label` not null; `city`, `genre`, `destination_slug` null | text |
| `category` not null, `secondary_category` null; `categories` (primary plus secondary) | text CHECK in (`maritime`,`seasonal`,`farm`,`remote`); text[] not null |
| `employment_type`, `hours_type` | text not null CHECK (`employee`,`contractor`), (`full_time`,`part_time`) |
| `host_name`, `host_slug` not null; `host_logo_url` null; `host_since` | text; date null |
| `state` (pin state), `geog`, `approximate` | char(2) not null; geography(Point,4326) not null; boolean not null (`publicPrecision = 'city'`) |
| `remote`; `remote_states` (`{US}` means anywhere in the US) | boolean not null; text[] not null default '{}' |
| `schedule_kind`; `start_on` (effective start, 8.3), `end_on`; `season`, `season_year` | text not null CHECK (`fixed`,`season`,`ongoing`); date null; text null CHECK (`spring`,`summer`,`fall`,`winter`,`year_round`), int null |
| `weekly_hours`; `pay_hourly_min_cents`, `pay_hourly_max_cents`, `pay_yearly_min_cents` | numeric(4,1) not null CHECK (> 0 and ≤ 100); int null |
| `pay_chip`, `pay_full`; `pay_details` | text not null; text[] not null |
| `housing_provided`, `housing_free`, `meals_provided`, `meals_free`, `sponsors_visas` | boolean not null; CHECK (`housing_free` implies `housing_provided`; same for meals) |
| `housing_cost_line`, `housing_note`, `meals_cost_line`, `meals_note`; `cover` | text null; jsonb null (`{ "src": {"320","640","1280"}, "alt" }`) |
| `published_at` (SP2 `firstPublishedAt`), `first_active_at`, `indexed_at` not null; `confirmed_active_at`, `closed_at` null | timestamptz |
| `search` | tsvector not null: A = title, occupation label; B = host name; C = genre label, category label, destination name; D = city, state name, first 2,000 chars of the description (`english` config) |

Indexes, each partial `WHERE is_active`: GIN `search`; GiST `geog`; btree `(published_at desc, listing_id desc)`, `start_on`, `pay_hourly_min_cents`, `pay_yearly_min_cents`, `state`, `genre`, `destination_slug`, `location_id`, `first_active_at`; GIN `categories`; GIN `remote_states WHERE is_active AND remote`. Plus btree `org_id` (all rows) and `lower(host_name) text_pattern_ops` (suggest).

| Table | Columns, constraints and indexes |
|---|---|
| `discovery_sync_state` | `key text pk CHECK in ('alerts_match')`, `watermark timestamptz not null` |
| `listing_dispositions` | `user_id uuid not null references app.users on delete cascade`, `listing_id uuid not null`, `state text not null CHECK in ('saved','skipped')`, `source text not null CHECK in (sources)`, `first_saved_at timestamptz null`, `acted_at timestamptz not null`; `primary key (user_id, listing_id)`; index `(user_id, state, acted_at desc)` |
| `listing_events` | `id uuid pk`, `listing_id uuid not null`, `org_id uuid not null`, `type text not null CHECK in ('view','save','share','apply')`, `source text not null CHECK in ('seek','swipe','map','invite','boost','landing','other')`, `viewer_hash text null`, `dedupe_key text null unique`, `occurred_at timestamptz not null`; indexes `(org_id, occurred_at)`, `(listing_id, type, occurred_at)`. No user ID column, ever. Raw rows kept 90 days (SP8 retention). |
| `listing_event_daily` | `listing_id uuid`, `org_id uuid not null`, `day date`, `type text`, `source text` (same CHECKs), `count int not null CHECK (count >= 0)`; `primary key (listing_id, day, type, source)`; index `(org_id, day)`. Kept indefinitely. |
| `saved_searches` | `id uuid pk`, `user_id uuid not null references app.users on delete cascade`, `name text not null CHECK (char_length between 1 and 80)`, `query jsonb not null`, `query_hash text not null`, `push_enabled boolean not null default true`, `email_daily boolean not null default true`; `unique (user_id, query_hash)`; index `user_id` |
| `saved_search_matches` | `saved_search_id uuid references app.saved_searches on delete cascade`, `listing_id uuid not null`, `matched_at timestamptz not null`, `pushed_at`, `daily_emailed_at`, `weekly_emailed_at` timestamptz null; `primary key (saved_search_id, listing_id)`; partial index `(saved_search_id) WHERE daily_emailed_at IS NULL` |
| `alert_settings` | `user_id uuid pk references app.users on delete cascade`, `weekly_digest boolean not null default false`, `push_day date null`, `push_count int not null default 0` |
| `landing_pages` | Copy overrides; a page without a row uses generated copy. `key text pk` (`state:alaska`, `category:farm`, `category_state:farm:california`, `category_genre:seasonal:ski-resorts`, `season:summer`, `destination:yellowstone`, `international`), `kind text CHECK in (LandingKind)`, `title text not null` (≤ 80), `intro text not null default ''` (≤ 1,200), `hero_media_id uuid null`, `hero_alt text null` (≤ 150), `seo_title text null` (≤ 60), `seo_description text null` (≤ 160), `updated_by uuid null` |

## 5. API

Every route uses `apiRoute` with zod input and an `openapi` entry. Discovery responses carry `Cache-Control: private, no-store`. Errors use the Foundation envelope.

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| GET | `/api/v1/discovery/search` | none | URL query params (8.1) + `sort`, `cursor`, `limit` (1–50, default 20), `lat`, `lng`, `tz` | `{ items: JobCardData[], nextCursor, total, totalCapped }` |
| GET | `/api/v1/discovery/deck` | none | Same, `limit` 1–20 (default 10) | `{ items, nextCursor }` |
| GET | `/api/v1/discovery/map` | none | Query params + `bbox=w,s,e,n` + `zoom` (0–22) | `{ pins: MapPin[], clusters: MapCluster[], capped }` |
| GET | `/api/v1/discovery/locations/:locationId` | none | Query params + `cursor`, `tz` | `{ host, matchingCount, activeCount, items, nextCursor }`; 404 if no active listing there |
| GET | `/api/v1/discovery/suggest` | none | `q` (2–100 chars) | `{ jobs, places, employers }`, up to 5 each |
| GET | `/api/v1/listings/:id` | none | `tz` | `ListingDetail`; closed: `{ status: 'closed', card }`; removed or unknown: 404 |
| POST | `/api/v1/listings/:id/events` | none | `{ type: 'view' \| 'share', source }` | 204 (bots and duplicates silently dropped) |
| GET | `/api/v1/landing` | none | `path` | `LandingPage`; 404 if invalid |
| PUT | `/api/v1/me/dispositions/:listingId` | seeker | `{ state, source, expectedState?: 'saved' \| 'skipped' \| null }` | `{ state, previous }`; 409 on `expectedState` mismatch or the saved limit; 404 if not active |
| DELETE | `/api/v1/me/dispositions/:listingId` | seeker | `expectedState?` | `{ previous }` |
| GET | `/api/v1/me/dispositions` | seeker | `state`, `before`, `limit` (≤ 50) | `{ items: JobCardData[], nextBefore, total }` |
| GET | `/api/v1/me/saved-searches` | seeker | none | `{ items: { id, name, query, summary, pushEnabled, emailDaily, createdAt }[] }` |
| POST | `/api/v1/me/saved-searches` | seeker | `{ query: DiscoveryQuery, name? }` | the item; the same query hash returns the existing one (200); 409 at the limit |
| PATCH | `/api/v1/me/saved-searches/:id` | seeker | `{ name?, pushEnabled?, emailDaily? }` | the item |
| DELETE | `/api/v1/me/saved-searches/:id` | seeker | none | 204 |
| GET / PATCH | `/api/v1/me/alert-settings` | seeker | PATCH `{ weeklyDigest: boolean }` | `{ weeklyDigest }` |

**Non-API routes:** `GET /sitemap.xml` (index), `GET /sitemaps/[name].xml` (`jobs-1`…`jobs-N` at 10,000 URLs each, `landing`, `hosts`), `GET /robots.txt`, `GET /manifest.webmanifest`, the static `/sw.js` and `/offline.html` (section 8.15). Sitemaps render per request from the projection; there is no sitemap job (Engineering decision).

**Operator server actions** (`src/app/admin/content/landing/actions.ts`, each calls `requireOperator()`): `saveLandingCopyAction(key, input)`, `requestHeroUploadAction(mime, sizeBytes)` (Foundation `requestUpload`, kind `cover`). **Rate limits:** a Vercel Firewall rule of 300 requests per minute per IP on `/api/v1/discovery/*` and `/api/v1/listings/*/events` (no database write on public reads). Foundation `consume` on writes: `disp:<userId>` 120 per minute, `ss:<userId>` 30 per hour.

## 6. Jobs, notifications, trust and audit

| Topic | Trigger | Cron (UTC) | Does |
|---|---|---|---|
| `discovery.sync_listing` | Subscriber of `listing.published`, `listing.changed`, `listing.closed`, `listing.removed` | n/a | Takes `pg_advisory_xact_lock(hashtext(listingId))`; reads `getListingSummaries`. `active`: `getPublishedListing` + `getHostIdentities` + `getLocations`, then upserts. `closed`: `is_active = false`, `closed_at = now()`. Anything else or missing: deletes the row and, in the same transaction, its dispositions and alert matches. |
| `discovery.sync_host` | Subscriber of `hostpage.updated`, `location.updated`, `org.status_changed`, `subscription.changed` | n/a | Re-syncs every projection row of the org (or of the location), 100 per job, re-enqueuing itself for the rest |
| `discovery.drift_check` | schedule | `30 3 * * *` | Pages `listActiveListings`; re-syncs every listing whose `revisionId` differs or is missing, and every active row SP2 no longer lists; any repair records `discovery.drift_repaired` and raises `raiseAlert({ severity: 'warning', kind: 'discovery.drift' })` |
| `discovery.alerts_match` | schedule | `*/15 * * * *` | Section 8.10; saved searches in chunks of 500, re-enqueuing itself with the next chunk |
| `discovery.alerts_daily` | schedule | `0 14 * * *` | Daily email per user |
| `discovery.alerts_weekly` | schedule | `0 14 * * 1` | Weekly digest for opted-in users |
| `discovery.maintenance` | schedule | `15 4 * * *` | Recomputes yesterday's `listing_event_daily` rows from raw events (idempotent upsert); nulls `viewer_hash` and `dedupe_key` older than 24 h; deletes raw events older than 90 days and closed rows 365 days after `closed_at` |

`emit` runs in SP2's transaction and the worker is kicked after commit, so sync lands in seconds; the 1-minute cron bounds it at 60 s. `rebuildSearchProjection` runs the drift check without paging limits (SP8 restore runbook).

**Notification types** (`defineType`):

| Type | Category | Channels | Batching and caps |
|---|---|---|---|
| `discovery.alert_match` | `alerts` | in-app, push | At most 1 per user per `alerts_match` run, and `discovery.alert_push_daily_cap` (5) per user per UTC day; over the cap, the match still goes to the daily email |
| `discovery.alert_daily` | `alerts` | in-app, email (`JobAlertDaily`) | One per user per day, only when at least one match is still active |
| `discovery.alert_weekly` | `alerts` | email (`JobAlertWeekly`) | One per opted-in user per week, only when at least one match is still active |

**Trust:** SP3 adds no check kinds and opens no review items; it uses `raiseAlert` (warning) for drift. Listing reports go through SP4. **Audit actions:** `landing.copy_saved` (operator), `discovery.drift_repaired` and `discovery.projection_rebuilt` (system, with counts). Seeker saves, skips and alerts are not audited (personal and high volume; they are in the data export).

## 7. Screens

Every screen uses `src/ui` only. **New patterns** (W5, in `src/ui/patterns/` with gallery entries, axe and screenshots, reviewed like any design-system change): `SearchBox` (Combobox with Jobs / Places / Employers groups), `FilterPanel` (rail or Sheet content), `ActiveFilterChips`, `SwipeDeck`, `MapCanvas` with `MapPin` (dynamic `mapbox-gl` import, category color plus lucide icon, neutral clusters; SP6 adds the `boosted` visual), `HostPreview`, `PullUpSheet` (snap points 96 px, 50%, 92%), `ActionBar` (pinned Skip · Apply · Save), `LandingHero`, `SignInPrompt`, `OffsiteNotice`, `InstallPrompt` (Sheet content in a Chromium and an iOS variant). `ActionBar` and `PullUpSheet` pad by `env(safe-area-inset-bottom)`. The "Boosted" badge on `JobCard` is SP6's prop; SP3 passes `boosted` through.

| Route | Components | States | Mobile / desktop |
|---|---|---|---|
| `/` Seek | TopBar, BottomNav, SearchBox, category `Pill` toggles (`aria-pressed`), "Starting soon" `Pill`, filter `IconButton` with count, `Select` sort, result count ("1,248 jobs", "10,000+ jobs"), bell `IconButton`, `JobCard` list, "Load more" `Button`. Guests see a header: "Built for seekers, by seekers." and "Seasonal, maritime, farm and remote jobs, some with housing and meals. Free for seekers, forever." | Loading: 4 card `Skeleton`s. Empty: `EmptyState` "No jobs match these filters." with `ActiveFilterChips` (each removable) and "Clear all"; never broadens silently. Error: `ErrorState` with Retry. End: "That's every match." | One column, filters in a `Sheet` / 280 px filter rail, 2 columns at ≥ 1024 px and 3 at ≥ 1440 px; the listing opens in the right `Sheet` panel (480 px) |
| `/swipe` | SwipeDeck of `Card` (JobCard slots) with an ⓘ `IconButton` on the photo, Skip · Apply · Save `Button`s below, `Toast` with Undo, first-use coach `Dialog`, live region | Loading: one card `Skeleton`, gestures off. Exhausted: `EmptyState` "You've seen every job that matches." with "Change filters" and "Saved jobs". Error as Seek. | Full-width deck / 420 px centered deck, details in the side `Sheet` |
| `/map` | MapCanvas, "Near me" `IconButton`, filter `IconButton`, PullUpSheet ("N jobs in this area", JobCards), HostPreview `Sheet` (OrgLogo, name, location, category dots, "Hiring now" `Pill`, "N active jobs", "View page" `Button`, that location's matching JobCards) | Loading: map `Skeleton` with the list usable. Map failure or no WebGL: `ErrorState` "The map couldn't load. Here's the list instead." with the list full height. Empty area: "No jobs in this area. Zoom out or change filters." | Full-screen map with the pull-up list / map with a 400 px list column on the left |
| `/jobs/view/[id]/[slug]`, intercepted as `@panel/(.)jobs/view/[id]/[slug]` from Seek, Swipe and Map | SP2's `ListingDetailView` fed from `ListingDetail`, inside SP3's frame: subscriber `Badge` with `Tooltip` "Active Explore&Earn host since [date]", the three `Chip`s with pop-up `Sheet`s, the activity line, OffsiteNotice `Dialog`, Share `Button`, the Report slot (SP4 `ReportSheet`), ActionBar | Loading: `Skeleton`. Closed: the card with the banner "This job is closed." and the host link; no Apply; Save becomes Remove if saved. Removed or unknown: 404. Error: `ErrorState`. | Full page with the ActionBar above BottomNav / side `Sheet` from discovery, full page (720 px column) on direct load |
| Landing pages (8.11) | LandingHero (hero image, title, the strapline "Explore the country. Earn as you go.", intro), breadcrumbs, then the pre-filtered Seek feed, with links to Swipe and Map that keep the filters | First page server-rendered. Empty: `EmptyState` "No open jobs here right now." with a link to all jobs | As Seek |
| `/profile/alerts` (Job alerts) | Saved searches: name, summary, `Switch` "Push", `Switch` "Daily email", delete `IconButton`; `Switch` "Weekly digest". On iPhone and iPad outside the installed app, a line under the list: "On iPhone and iPad, push alerts need Explore&Earn on your Home Screen." with the link "How to add it" (opens InstallPrompt, 8.15) | Empty: "Tap the bell on any search to get alerts for new jobs." Loading and error from `src/ui` | One column / 640 px column |
| SignInPrompt (`Sheet`) | Title per action: "Sign in to save jobs", "Sign in to apply", "Sign in to hide this job", "Sign in to get job alerts"; "Sign in" and "Create account" `Button`s. Host and operator accounts see "Saving and applying need a seeker account." | n/a | Bottom sheet / `Dialog` |
| InstallPrompt (`Sheet`) | The strapline line (8.15), title "Add Explore&Earn to your Home Screen", body line. Chromium: "Add to Home Screen" (primary) and "Not now" `Button`s. iOS: two numbered steps with decorative lucide icons, "1. Tap Share" (`Share`) and "2. Choose Add to Home Screen" (`SquarePlus`), then "Got it" and "Not now" | Opens only when 8.15 allows it. Focus moves to the title; Escape or a swipe down counts as "Not now"; focus returns to where it was. Reduced motion: a 150 ms fade | Bottom sheet / never opens on desktop |
| `/admin/content/landing`, `/admin/content/landing/[key]` | `Tabs` by kind, list with a "Custom copy" `Badge`, form (`Input`, `Textarea` with counters, hero upload, alt text), preview link | Empty, loading and error from `src/ui` | Desktop only (operator console) |

Seeker navigation follows product 15.1 exactly: mobile BottomNav Seek · Swipe · Map · Profile; desktop top bar Seek · Swipe · Map · Community on the left. Switching modes keeps the URL query.

## 8. Business rules

### 8.1 Query, filters and URL

| Param | Values | Rule |
|---|---|---|
| `q` | ≤ 100 chars | `websearch_to_tsquery('english', q)`; a single word of ≥ 3 chars is OR-ed with its prefix (`word:*`) |
| `cat` | comma list of categories | Matches the primary or secondary category |
| `genre` | comma list, ≤ 10 | Genre slugs from SP2 `GENRES` |
| `state` | comma list of USPS codes, ≤ 10 | On-site: the pin state. Remote: the worker may live there (`remote_states` contains it or `US`) |
| `dest` | destination slug from SP2 `listDestinations` | `destination_slug = dest` (the listing's Seasonal destination) |
| `host` | org slug | Resolved to `orgId`; shown as a removable chip |
| `start` | `1m`, `3m`, `6m`, or `<season>-<year>` | Section 8.3 |
| `soon` | `1` | Starting soon: `start_on` from today to today + 30 days |
| `housing`, `meals` | `provided`, `free` | "Housing provided" / "Meals provided"; `free` is the "Free only" switch |
| `visa` | `1` | "Sponsors visas": `visaSponsorship` is anything but `none` |
| `pay` | `<dollars>-<unit>`, unit `hour`, `day` or `year` | Section 8.2. Slider ranges: hour $0–$60 step $1; day $0–$500 step $10; year $0–$150,000 step $1,000; 0 means no filter |
| `sort` | `relevant` (default), `newest`, `distance` | Section 8.4 |

Skipped listings and hidden orgs (SP4 overlay) are excluded on every surface. Saved and applied listings show with their state in Seek and Map and are excluded from the Swipe deck. Hosts, operators and guests get no overlay. Invalid params are dropped, never an error, so old links keep working.

### 8.2 Pay normalization (Engineering decision; `toHourlyCents`)

Converted to cents per hour with the listing's weekly hours `W` (`when.weeklyHours`), rounded to the nearest cent: hour ×1; day ÷8; week ÷W; month ×12÷52÷W; season ÷(W × season weeks), where season weeks = ceil(days from start to end inclusive ÷ 7) for fixed dates, or 13 for a season and year; year ÷52÷W. Crew share converts `crewShareEstimate` with its `per` unit. A season unit on an ongoing listing gives null: the listing never matches a pay filter but still shows its pay.

A listing matches the slider value `T` when the **bottom** of its range qualifies: hour `hourly_min ≥ T`; day `hourly_min × 8 ≥ T`; year `yearly_min ≥ T`, where `yearly_min = hourly_min × W × 52`.

**Test table (hourly min cents):** $19/hr → 1900; $150/day → 1875; $800/week at W=40 → 2000; $3,200/month at 40 → 1846; $12,000/season Jun 1–Aug 31 (14 weeks) at 48 → 1786; $52,000/year at 40 → 2500; crew share est. $8,000–$12,000 per season, Jun 1–Aug 31, at 60 → 952 (max 1429).

**Display** (original unit, never the normalized one): `$19/hr`, `$19–$22/hr`, `$150/day`, `$800/wk`, `$3,200/mo`, `$12,000/season`, `$52,000/yr`, `Crew share · est. $8,000–$12,000/season`. The card chip shows $10,000 and up as `$52k`; the pop-up and detail page show full amounts plus overtime, tips, bonuses, pay frequency and deductions.

### 8.3 Dates and seasons (Engineering decisions)

- **Today** is computed in the viewer's IANA time zone from the `tz` param (or the `ee_tz` functional cookie the client sets), defaulting to `America/Chicago`.
- **Effective start** `start_on`: the fixed start, else the start of the season window, else the ongoing start, else null. A listing "begins now" when `start_on` is null or before today.
- **Season windows:** Spring Mar 1–May 31, Summer Jun 1–Aug 31, Fall Sep 1–Nov 30, Winter Dec 1 (year Y)–end of Feb (Y+1), labeled "Winter 2026–27". The year picker offers the current year and the next.
- **Within N months** matches `start_on` in [today, today + N calendar months, clamped to month end], and every listing that begins now.
- **Season S, year Y** matches the listing's season S with year Y, or `start_on` inside the window. **Year-round** matches ongoing listings and the `year_round` season.
- **Date line** (card info row): `start_on` today → "Starts today"; tomorrow → "Starts tomorrow"; 2–30 days → "Starts in N days"; later → "Begins Jun 1" (the year is added when it isn't the current year); begins now → "Begins now"; season only → "Summer 2027". End segment: "Ends Sep 30", or "Ongoing" for ongoing and year-round listings.

### 8.4 Sort and pagination

- **Relevant** (Engineering decision): with `q`, `round(ts_rank_cd(search, query, 32), 6)` desc; then bucket (0 when the listing begins now or `start_on` ≤ today + 90 days, else 1); then `published_at` desc; then `listing_id` desc. Without `q`, the same without the rank. Fit never changes it; boosts only through the hook.
- **Newest:** `published_at` (the original publish date) desc, `listing_id` desc. "Still hiring?" confirmations never move a listing.
- **Distance:** on-site listings by `geog <-> origin`, then Remote listings. It needs `lat`/`lng` (device location rounded to 2 decimals) or a single state filter (its centroid); otherwise the option is disabled with "Share your location or pick a state to sort by distance."
- **Cursor:** base64url JSON `{ v: 1, h: sha256(canonicalQuery + sort), s: sortValues, id, asOf, ps: placementState }`. A cursor for a different query returns 400 `bad_request`. Pages may shrink when listings close; IDs are deduplicated.
- **Count:** `count(*)` over the filtered set with `limit 10001`; above 10,000, `total = 10000` and `totalCapped = true`.

### 8.5 Swipe

| Rule | Value |
|---|---|
| Gestures | Left skips, right saves, up opens the apply review (`/apply/[listingId]?source=swipe`), a tap or ⓘ opens details. Horizontal commit at ≥ 25% of the card width; up commit at ≥ 100 px; the dominant axis must be ≥ 1.5× the other, or the card snaps back. Gestures are off while a sheet, dialog or text selection is active. |
| Keyboard and buttons | ArrowLeft Skip, ArrowRight Save, ArrowUp Apply, Enter details, U Undo; the Skip · Apply · Save buttons do the same. Each action is announced in a live region, e.g. "Skipped Lift operator at Kettle Ridge Lodge. Undo available for 10 seconds." |
| Undo | The last save or skip only, for 10 seconds: `clearDisposition`, or `setDisposition` back to `previous`, with `expectedState`; on 409 the deck reloads the current state instead of overwriting. Undo never touches an application. |
| Deck | Batches of 10, fetched again when 3 remain. Excludes saved, skipped and applied listings. Exhaustion never resets skips. Reduced motion: no fly-out, a 150 ms fade. |
| Gestures never submit | An up swipe only opens the review; SP4 requires an explicit submit |

### 8.6 Map

| Rule | Value |
|---|---|
| Default view | Contiguous US `[-125, 24, -66, 50]`; the last bounds are kept in `sessionStorage`. "Near me" uses browser geolocation and flies to zoom 8; those coordinates never leave the device. |
| Refresh | On `moveend`, debounced 300 ms; stale requests are aborted |
| Pins | One per `location_id` with ≥ 1 matching listing, at SP2's `publicPoint`; Remote listings sit at the host's location with the laptop icon. Pin category = the category with the most matching listings there (ties: Maritime, Seasonal, Farm, Remote). `boosted` when `boostedAmong` finds any matching listing there. |
| Volume | ≤ 2,000 location pins per response; above that the server returns grid clusters (`ST_SnapToGrid`, cell 360 ÷ 2^(zoom+2) degrees) with `capped: true`. Client clustering: `cluster: true`, `clusterMaxZoom: 12`, `clusterRadius: 50`, neutral color with the count. |
| Host preview | Logo, name, location ("Approximate location" when `approximate`), category dots, "Hiring now", "N active jobs" (all active there), View page (`/hosts/[slug]`), then that location's matching jobs, labeled "2 matching jobs". Remote line: "Remote · host based in X · work from: US" (or up to 5 state codes, then "+N more"). |
| Pull-up list | Every match inside the current bounds, in the chosen sort; the accessible alternative to the map |

### 8.7 Guests and sign-in intents

- Save, Skip, Apply and the bell open SignInPrompt. The return URL is the current path plus `intent=save|skip|alert` (Apply returns straight to `/apply/[listingId]?source=`). It goes to Clerk as `redirect_url` and through onboarding as `returnTo`.
- `returnTo` must start with `/`, not `//` or `/\`, and be ≤ 512 chars; anything else becomes `/`.
- On return the page runs the intent once and removes it with `history.replaceState`: Save and Skip call the idempotent PUT; the bell creates the saved search and shows a Toast with "Manage". A closed listing gives the Toast "This job just closed." A user who chose Host gets "Saving jobs needs a seeker account." Signing in never submits an application.

### 8.8 Saved and skipped, and settings

Save and skip are mutually exclusive per user and listing. Saving needs an active listing. Limit `discovery.saved_jobs_per_user` (1,000) saved: "You've saved 1,000 jobs. Remove some to save more." Skipped has no limit. The first save ever sets `first_saved_at` and records one `save` event. `listSavedJobs` returns active and closed cards (SP4 shows closed ones with Remove); a removed listing's dispositions are deleted by the sync. **Settings SP3 adds** (operator-editable, `getSetting`): `discovery.saved_jobs_per_user` = `1000`, `discovery.saved_searches_per_user` = `20`, `discovery.alert_push_daily_cap` = `5`.

### 8.9 Listing detail

- Active listings come from `getPublishedListing` on every request, so a takedown applies immediately. A closed listing renders from its inactive projection row; a removed one is a 404.
- SP2's `ListingDetailView` renders the body in its order (product 6: cover, photos and host preview; description, responsibilities, a typical day; schedule and dates; pay details with deductions; housing and meals fine print with their four photos each; qualifications, certifications, physical demands; benefits and perks; category fields). SP3 supplies the props and the frame.
- Housing and meals chips: "Housing ✓ Provided" in the `success` tone whenever provided, free or paid; "No housing" / "No meals" otherwise. The pop-up's first line is the cost: "Free", or "$150/week · deducted from pay" / "· paid directly".
- Activity line: "Confirmed active N days ago" ("today", "1 day ago") when the host has confirmed; otherwise "Posted N days ago".
- Additional step: the note plus "Open the employer's form", which opens OffsiteNotice: "You're going to {domain}, which isn't part of Explore&Earn. Never pay to get a job." with Continue (a new tab, `noopener noreferrer`) and Cancel. Only `https` URLs render.
- Share: `navigator.share`, else copy the link with the Toast "Link copied"; records a `share` event. The Report slot is empty and hidden until SP4 mounts `ReportSheet`.
- Slug: a wrong or missing slug redirects (308) to the canonical `/jobs/view/[id]/[slug]`.

### 8.10 Saved searches and alerts

| Rule | Value |
|---|---|
| Limit | `discovery.saved_searches_per_user` (20): "You can have up to 20 job alerts. Remove one to add another." |
| Identity and name | `query_hash = sha256(canonicalQuery)`; map bounds, location, sort and cursor are not part of an alert. Default name: the filter summary, ≤ 80 chars, e.g. "Ski resorts · CO · Housing provided". |
| Matching | Every 15 minutes: listings with `first_active_at` in (watermark, now − 2 min], run through the normal search SQL per saved search (`listing_id = any(newIds)`), excluding listings the user skipped or applied to and hidden orgs; only listings first active after the search was created; at most 50 per search per run |
| Push | When `push_enabled`: one push per user per run, "3 new jobs for Ski resorts · CO" (or "5 new jobs for your alerts" across searches), opening `/?<query>&sort=newest`; cap in section 6 |
| Daily email | 14:00 UTC; per search up to 10 still-active matches with title, host, location, pay, housing and meals lines, and "See all"; marks `daily_emailed_at` on every match it considered |
| Weekly digest | Separate opt-in ("Weekly digest", off by default); Mondays 14:00 UTC; the 10 newest still-active matches of the past 7 days |
| Removal | Deleting a saved search deletes its matches; turning off the `alerts` category in notification settings stops all three types |

### 8.11 Landing pages and SEO

| Path | Key | Generated title | Query |
|---|---|---|---|
| `/jobs/[state]` | `state:<slug>` | "Jobs in Alaska" | `states` |
| `/jobs/[category]` | `category:<c>` | "Farm jobs" | `categories` |
| `/jobs/[category]/[state]` | `category_state:<c>:<slug>` | "Farm jobs in California" | both |
| `/jobs/[category]/[genre]` | `category_genre:<c>:<g>` | "Seasonal jobs · Ski resorts" | category + genre |
| `/seasons/[season]` | `season:<s>` | "Summer 2027 jobs" (the current or next occurrence) | `start: season` |
| `/destinations/[slug]` | `destination:<slug>` | "Jobs near Yellowstone National Park" | `destination` |
| `/international` | `international` | "Working in the US from abroad" | `sponsorsVisas` |

- State slugs are lowercase names with hyphens (50 states and DC). `src/app/(seeker)/jobs/[segment]/page.tsx` and `[segment]/[sub]/page.tsx` resolve against categories, states and genres; a test proves no slug collides. `/jobs/view/...` is a static segment and wins. Destinations come from SP2's `listDestinations`.
- Default intro: "{Scope} jobs, some with housing and meals." Every landing page shows the strapline "Explore the country. Earn as you go."
- `/international` default copy explains visa basics in plain words, says "We can't give visa advice. These official pages explain your options.", and links only to official pages (travel.state.gov, j1visa.state.gov, dol.gov foreign labor, uscis.gov). Counsel reviews it (SP8 launch gate).
- **Indexable** when the page has ≥ 1 active listing; otherwise it renders with `noindex` and stays out of the sitemap.
- `robots.txt` in prod: `Allow: /`; `Disallow: /api/`, `/host`, `/admin`, `/profile`, `/community`, `/apply`, `/sign-in`, `/sign-up`, `/onboarding`, `/design-system`; `Sitemap: {APP_URL}/sitemap.xml`. Outside prod: `Disallow: /` and `X-Robots-Tag: noindex` on every response.
- `/`, `/swipe` and `/map` with any query string, and `/swipe` and `/map` always, are `noindex, follow` with a canonical to the bare path. Listing pages canonicalize without `source`. Open Graph and Twitter tags on listing and landing pages use the 1280 px cover or hero.
- **JobPosting JSON-LD** on active listing pages: `title`, `description` (plain text paragraphs), `datePosted` (`publishedAt`), `validThrough` (the SP2 deadline, else the end date, else omitted), `employmentType` (`FULL_TIME`, `PART_TIME` or `CONTRACTOR`, plus `TEMPORARY` for fixed and season dates), `hiringOrganization` (name, `sameAs` the host page URL, logo), `jobLocation` (`addressLocality`, `addressRegion`, `addressCountry: US`) or, for Remote, `jobLocationType: TELECOMMUTE` with `applicantLocationRequirements` (states, or `Country: US`), `baseSalary` (`USD`, min and max, `unitText` HOUR, DAY, WEEK, MONTH or YEAR; omitted for season and crew share), `directApply: true`, `identifier` (Explore&Earn, listing ID), `jobBenefits` ("Housing provided", "Meals provided" when true). Closed pages: no JSON-LD and `noindex`.

### 8.12 Events and attribution

- **Views** are recorded by the client when the detail page or panel opens (never on prefetch or server render). Dedupe key `view:<hmac(viewerKey)>:<listingId>:<floor(epoch/1800)>`. `viewerKey` is the user ID, or for guests `hmac(ANALYTICS_HASH_SECRET, ip + '|' + userAgent)` (no cookie); the same key goes to the placement hook. `isBot` user agents (Googlebot, Bingbot, Applebot, DuckDuckBot, YandexBot, facebookexternalhit, Twitterbot, Slackbot, AhrefsBot, SemrushBot and generic `bot|crawl|spider|slurp|preview`) are dropped.
- **Applies** are recorded by SP4's `applications.listing_event` subscriber with `dedupeKey: apply:<applicationId>`, so retries never double-count.
- **Source:** cards link with `?source=` (`seek`, `swipe`, `map`, `landing`, or `boost` when the item came from an inserted slot); SP5 invite links use `invite`; anything else is `other`. The detail page passes `source` on to the apply link.
- **Counts** for SP5 and SP2 read `listing_event_daily` for past days and raw events for today.

### 8.13 Boosted placement hook (SP6 contract, adopted)

- For every Seek and Swipe page, SP3 fetches `pageSize` organic IDs after the cursor, then calls `boostPlacementHook.place` with `matchIds` bound to `matchListingIds` for this query and viewer (filters, skips, hidden orgs, and for Swipe saved and applied), `viewerKey`, and the opaque `state` from the cursor (`ps`).
- A 120 ms timeout or any error falls back to `{ items: organic, organicConsumed: organic.length, state }` and logs a warning. The next cursor continues after the `organicConsumed`-th organic item and stores the returned `state`.
- `boostedAmong` runs on every card set SP3 returns (Seek, Swipe, Map list, location preview, detail, `getJobCards`) and on each map location's matching IDs; it sets `boosted` on cards and pins. The caps, positions and rotation are SP6's (its section 8.2); the noop hook returns organic results and an empty map.

### 8.14 Failure handling

| Failure | Behavior |
|---|---|
| An SP2 read fails during sync | The handler throws; the outbox retries; the row stays as it was |
| A sync job dead-letters | The nightly drift check repairs the row and raises the warning alert |
| Mapbox fails or WebGL is missing | The list takes the full screen with the ErrorState line; filters keep working |
| The placement hook or the SP4 overlay errors | Organic results and no overlay, logged as a warning |
| Push or email fails | Foundation outbox retries; matches stay unmarked until sent |
| Disposition race (two tabs) | `expectedState` mismatch returns 409; the client reloads the state |
| A listing closes between search and Save | 404 `not_found`; Toast "This job just closed." |
| The service worker fails to register, or `localStorage` is blocked | The app works as a plain web page: no offline page, and the InstallPrompt never opens on its own (the on-demand link still works) |

### 8.15 Install and "Add to Home Screen" (Engineering decisions)

| Rule | Value |
|---|---|
| Manifest | `src/app/manifest.ts`, served at `/manifest.webmanifest`: `id` and `start_url` `/`, `scope` `/`, `name` and `short_name` "Explore&Earn", `description` "Seasonal, maritime, farm and remote jobs, some with housing and meals. Free for seekers, forever.", `display: 'standalone'`, `background_color` and `theme_color` the light `bg` token, `lang: 'en-US'`, `prefer_related_applications: false`, `shortcuts` Swipe (`/swipe`), Map (`/map`) and Job alerts (`/profile/alerts`). No `orientation` lock (WCAG 1.3.4) and no `screenshots` (they go stale). Colors are read from `src/ui/tokens.ts`, never written as hex, so the token lint holds. |
| Icons | One source, `src/ui/brand/app-icon.svg`: the Explore&Earn mark on the light `bg`, full bleed, with the mark inside the central 80% so it survives masking. `scripts/gen-icons.ts` (sharp) writes `public/icons/icon-192.png` and `icon-512.png` (`purpose: 'any'`), `icon-maskable-512.png` (`purpose: 'maskable'`), `src/app/apple-icon.png` (180 px, opaque) and `src/app/favicon.ico` (32 px). The outputs are committed. |
| Head and viewport | `metadata.appleWebApp = { capable: true, title: 'Explore&Earn', statusBarStyle: 'default' }`; `viewport.themeColor` has one entry per `prefers-color-scheme`, with the light and dark `bg` tokens; `viewportFit: 'cover'`, so every bottom-pinned element pads by `env(safe-area-inset-bottom)` (BottomNav, host bottom tabs, ActionBar, PullUpSheet, Toast). |
| Service worker | Foundation's `public/sw.js` keeps its push handlers and gains: `install` caches only `/offline.html` in `ee-offline-v<n>`; `activate` deletes every other cache and claims clients; `fetch` answers `navigate` requests from the network and falls back to `/offline.html` on a network error. Nothing else is ever cached: no pages, API responses or media. The seeker layout registers it after `load` with scope `/`; it isn't registered under `next dev`. |
| Offline page | `public/offline.html`: static, inline CSS for both themes, `noindex`. The wordmark, "You're offline.", "Jobs load again as soon as you have signal." and a "Try again" button that reloads. |
| Who and where | Seekers and guests on a touch device (`pointer: coarse`) who aren't already in the installed app (`display-mode: standalone`, or iOS `navigator.standalone`). Surfaces: Seek, Map, listing pages, landing pages and `/profile/alerts`. Never on `/swipe`, `/apply`, sign-in, sign-up, onboarding, `/host` or `/admin`, and never in in-app browsers (user agent contains `FBAN`, `FBAV`, `Instagram`, `Line/` or `TikTok`), where install isn't possible. Desktop browsers keep their own install button. |
| Platforms | Chromium (Android Chrome, Samsung Internet, Edge): `beforeinstallprompt` is stashed with `preventDefault()`; the prompt shows only after it has fired, and "Add to Home Screen" calls the stashed `prompt()`. iOS and iPadOS: the instructions variant. Any other browser: no prompt. |
| When it shows | Never on the first page view, and only after a deliberate action: the first successful Save, a saved search created from the bell, or the third listing detail opened in one visit (counted in `sessionStorage`). It opens on the next navigation to an allowed surface. One exception: on iOS, a new saved search opens it on the same page once the bell's Toast closes, because push alerts there need the installed app. It never opens over another Sheet, Dialog or Toast, and opens at most once per visit. |
| How often | An automatic show that ends without installing ("Not now", "Got it", Escape, swipe down, or `userChoice.outcome = 'dismissed'`) holds the prompt for 30 days after the first show and 90 days after the second. After the third, it never opens on its own again. Once installed (`appinstalled`, or any launch in standalone mode), it never opens again on that device. Opening it from "How to add it" ignores the holds and doesn't count as a show. |
| State | `localStorage` key `ee_install` holds `InstallState`, per device and never sent to the server (strictly necessary UI state, like the theme). |
| Copy | The first line alternates between the two product 21 lines: "Work worth going somewhere for." when `shows` is even, "Explore the country. Earn as you go." when it is odd. Title: "Add Explore&Earn to your Home Screen". Body: "Open your saved jobs and alerts in one tap." For the iOS saved-search case: "On iPhone and iPad, push alerts for your saved searches need Explore&Earn on your Home Screen. Email alerts work either way." Buttons are listed in section 7. No emoji and no exclamation marks. |
| Analytics | `track('pwa_prompt', { action: 'shown' \| 'accepted' \| 'dismissed' \| 'installed', platform: 'chromium' \| 'ios', trigger: 'save' \| 'alert' \| 'views' \| 'manual' })`; `track('pwa_launch')` once per standalone session |
| Performance | `InstallPrompt` is a lazy chunk loaded only when `installDecision` returns `show: true`, and the worker registers after `load`, so neither counts against exit criterion 5 or SP8's Lighthouse budgets |

## 9. Integrations and environment variables

| Service | Use | Notes |
|---|---|---|
| Mapbox GL JS | Map tiles and rendering | Loaded only on `/map` by dynamic import; styles `mapbox://styles/mapbox/light-v11` and `dark-v11`, following the theme; the same URL-restricted public token as SP2 |
| PostGIS, Postgres full-text | Search | No external search service |
| Foundation Resend and Web Push | Alerts | Templates `JobAlertDaily`, `JobAlertWeekly` |
| PostHog (`track`) | Product analytics | `discovery_search { surface, sort, filterCount, hasQuery }`, `discovery_swipe { action }`, `listing_view { listingId, source }`, `pwa_prompt { action, platform, trigger }`, `pwa_launch`; never the query text or coordinates |
| Google Search Console | Sitemap submission | DNS TXT verification and submission are steps in SP8's runbook |
| k6 (`grafana/setup-k6-action`), Lighthouse CI (`@lhci/cli`) | Exit criteria 4 and 5 | SP8's launch audit reuses the discovery k6 scenario on `ee-perf` |

| Variable | Doppler configs | Notes |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | dev (added by SP3), stg, prd (added by SP2) | Required unless `APP_ENV=dev`; without it in dev the Map shows the list fallback |
| `ANALYTICS_HASH_SECRET` | dev, stg, prd | ≥ 32 chars; HMAC for view dedupe and the guest `viewerKey` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | stg, synced to GitHub Actions only | Lighthouse and smoke runs against protected previews |
| Reused from Foundation | all | `APP_ENV`, `APP_URL` (canonical URLs and sitemaps), `DATABASE_URL`, `JOBS_SECRET`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_DSN` |

## 10. Security and privacy

| Role | Can |
|---|---|
| Guest | Read the public projection, detail pages, landing pages, the map and suggestions; post `view` and `share` events |
| Seeker (`requireSeeker`) | Everything a guest can, plus their own dispositions, saved searches, alert settings and overlay |
| Host, operator (as a browser) | Same as a guest; seeker endpoints return 403 |
| Operator (`requireOperator()`) | Landing copy and hero images; every change audited |

- **Public data only:** the projection holds only public fields: city, state and the location's `publicPoint` (flagged approximate when SP2 says so), never a street address or private contact. Host fields come from SP2's public host identity.
- **Seeker data:** dispositions, saved searches, matches and alert settings are personal data, readable only by their owner; `exportUserData` and `eraseUserData` cover them (hard delete). Hosts never see who saved, skipped or viewed: `listing_events` has no user ID, `viewer_hash` and `dedupe_key` are erased after 24 hours, and the counts are aggregates.
- **No PII in URLs, logs or analytics:** search text is never sent to PostHog or logged (the search route redacts `q` in error logs); coordinates are rounded to 2 decimals in requests and never stored or logged; alert pushes and emails name filters, not the seeker.
- **Service worker:** it caches only `/offline.html`, never pages, API responses or media, so a shared or signed-out device shows no one's data offline; `ee_install` never leaves the device.
- **Output safety:** host text renders as plain text, never HTML; JSON-LD escapes every `<` as `\u003c`; off-site links are `https` only, behind the notice, with `noopener noreferrer`.
- **Authority:** the projection is never authoritative. The detail page reads SP2, and SP4 rechecks the listing at submit. **Indexing:** nothing outside prod is indexable; `/community`, `/profile`, `/host` and `/admin` are disallowed and `noindex`.
- **Abuse:** firewall limits on public reads; `consume` limits on writes; zod bounds on every param (bbox within lat ±90 and lng ±180, `q` ≤ 100, lists ≤ 10, `limit` ≤ 50); cursor contents are validated.

## 11. Testing

Unit and domain tests run on PGlite with PostGIS; integration and perf run on the `postgis/postgis` container. SP2, SP4 and SP6 are faked at their module boundaries (`tests/fakes/`) until they merge.

| Test | Proves |
|---|---|
| `search.test.ts` | Each filter row of 8.1, each sort of 8.4, keyset pagination with no duplicates or gaps, cursor and query mismatch, the 10,000 cap |
| `pay.test.ts` (`src/lib/discovery`) | Every case of the 8.2 table, the null cases, chip and full formatting |
| `dates.test.ts` | Date lines, season windows (Winter across years, Feb 29), Within N months with month-end clamping, time zones on both sides of midnight |
| `sync.test.ts` | Each `listing.*` event: active upsert, closed keeps the row inactive, removed deletes the row with its dispositions and matches; host and location fan-out; concurrent syncs of one listing end in the latest state; drift check repairs and alerts; `rebuildSearchProjection` |
| `placement.test.ts` | A fake hook inserting boosted items: the cursor carries `state` and resumes after `organicConsumed`; `matchIds` applies filters and exclusions; a 200 ms or throwing hook returns organic results inside 120 ms; `boostedAmong` labels cards on every surface and pins |
| `dispositions.test.ts` | Mutual exclusion, `expectedState` 409, the saved limit, one `save` event ever, closed listing 404, `listSavedJobs` totals and paging |
| `alerts.test.ts` | Matching window and the creation-time rule, chunking, push caps, daily and weekly content, closed listings left out, no email when nothing is left |
| `events.test.ts` | 30-minute dedupe, bot drop, the 24-hour scrub, the daily rollup recomputed twice gives the same rows, 90-day deletion, `getListingEventCounts` by bucket |
| `landing/seo.test.ts` | Slug collision check, landing resolution for every kind, the indexable rule, sitemap chunking at 10,000, JobPosting fields per category, a `</script>` payload escaped, robots per environment |
| `install.test.ts` (`src/lib/discovery`) | Every row of 8.15: no show on the first page view; each trigger; excluded surfaces, desktop, standalone and in-app browsers; the 30-day, 90-day and never holds; installed never shows; manual opens ignore holds and don't count; the line alternation; storage that throws gives no automatic show |
| `tests/e2e/pwa.spec.ts` | Manifest fields, icon URLs with 200 and the stated sizes; in Chromium, CDP `Page.getAppManifest` has no errors and `Page.getInstallabilityErrors` returns none; a synthetic `beforeinstallprompt` (an Event with stub `prompt` and `userChoice`) is held until the first Save, then the prompt opens on the next navigation; "Not now" holds it (clock at +29 and +31 days); the WebKit iPhone profile shows the instructions variant after a saved search; offline, a navigation shows `/offline.html`; the worker's caches hold only that page |
| `tests/e2e/*` | Guest flow, Seek, Swipe (gestures and keyboard), Map with the list fallback (WebGL disabled), the detail panel and page, alerts, the operator editor, axe (including both InstallPrompt variants and `/offline.html`), Lighthouse |
| `perf-discovery.yml` | Exit criterion 4: `pnpm build && pnpm start` on the runner, `seedSynthetic({ count: 50000, seed: 42 })` (about 12,000 locations, all four categories, 30% Remote, mixed pay units), `tests/perf/discovery.k6.js` with 50 VUs for 5 minutes (55% search, 15% deck, 20% map at zoom 4, 8 and 12, 10% suggest) plus a 50-VU write scenario; fails over budget and uploads the results |

**The five failure modes most likely to hurt real users**

1. **A closed or removed listing stays visible**, so seekers apply to dead jobs or a scam stays up. Pinned: `sync.test.ts` (removed → gone from search, deck, map pins and location preview), the detail page 404s from SP2 even with a stale row, `alerts.test.ts` drops it from emails, and `discovery-freshness.spec.ts` proves 60 s.
2. **Pay normalization is wrong**, so the slider hides good jobs or shows low ones (SP5's fit uses it too). Pinned: the 8.2 table in `pay.test.ts`, plus a property test that converting the normalized hourly pay back to the listing's unit never exceeds its own range.
3. **A guest's action is lost, doubled or misused after sign-in**: a save disappears, a skip applies twice, an application is submitted, or `returnTo` redirects off-site. Pinned: `discovery-guest.spec.ts` (Save → sign-up → onboarding → exactly one saved row; Apply → the review screen with no application) and `returnTo` unit tests with `//evil.test`, `/\evil.test` and `https://evil.test`.
4. **Swipe undo or rapid swipes corrupt state**: the wrong card is undone, a skipped job comes back, or another tab's change is overwritten. Pinned: `dispositions.test.ts` (the 409 path), a SwipeDeck component test of 10 rapid swipes giving 10 dispositions in order, an undo after 10 s doing nothing, and the deck never returning saved, skipped or applied listings.
5. **Job alerts spam or mislead**: duplicate pushes, alerts for old or closed jobs, or emails after the seeker turned alerts off. Pinned: `alerts.test.ts` (one push per run, a cap of 5 a day, PK-idempotent matches on retry, no match from before the search existed, category preference off sends nothing).

## 12. Parallel workstreams

| WS | Owns | Migrations | Depends on |
|---|---|---|---|
| **W0** Contract stubs (lands first) | `discovery` and `landing` skeletons with typed stubs of every section 3 export, `placement-hook.ts` with `noopHook`, the overlay registry, the subscriber entries in `event-subscribers.ts`, settings keys, template names, env keys, schedules lines; a placeholder `/apply/[listingId]` ("Coming in sub-project 4: Seeker", hidden in prod) | none | Foundation; SP2's `emit` |
| **W1** Projection and sync | `discovery_listings`, the two sync handlers, drift check, `rebuildSearchProjection`, `src/lib/discovery` pay, dates and seasons, `seedSynthetic` | 2000 | W0; SP2 reads (faked until merged) |
| **W2** Query engine and read APIs | Query builder, cursors, counts, search, deck, map pins and clusters, location preview, suggest, `getJobCards`, `matchListingIds`, `getListingDetail`, `countNewListings`, placement hook calls, overlay | n/a | W1 |
| **W3** Dispositions and events | Disposition APIs and SP4-facing functions, `listing_events`, rollup, `getListingEventCounts`, the SP2 stats provider, `useListingActions`, sign-in intents, export and erase | 2010 | W1 |
| **W4** Saved searches and alerts | Saved-search APIs, matching, the three notification types, the two email templates, alert settings, `/profile/alerts` | 2020 | W2, W3 |
| **W5** Design-system patterns | The section 7 patterns with gallery entries, axe and screenshots | n/a | Foundation W1 (starts immediately) |
| **W6** Seek, Swipe and detail screens | Routes and the intercepted panel, the guest header, SignInPrompt wiring, the detail frame around SP2's `ListingDetailView`; the install path (manifest, icons, `sw.js` offline fallback and registration, `offline.html`, the root layout's `appleWebApp` and `viewport`, safe-area padding, the install rules and InstallPrompt wiring) | n/a | W2, W3, W5 |
| **W7** Map screen | `/map`, Mapbox wiring, the CSP additions, the list fallback | n/a | W2, W5 |
| **W8** Landing and SEO | `landing` module, landing routes, sitemaps, robots, JSON-LD, Open Graph, the operator editor | 2100 | W2, W6 (feed embed) |
| **W9** Verification | Perf workflow and k6 scenario, Lighthouse config, e2e suites, prod smoke | n/a | All |

**Ownership rule (as Foundation section 15):** each workstream owns its files and migration numbers. Shared touchpoints (section 3.5) are edited only by W0, except the CSP (W7, including `worker-src` and `manifest-src`) and the seeker layout, onboarding `returnTo`, root layout, `sw.js` and the safe-area padding (W6).

## 13. Open items

| Item | Owner | Decide before |
|---|---|---|
| SP4 calls `registerSeekerOverlay` (applied listing IDs; orgs the seeker blocked) and passes `dedupeKey: apply:<applicationId>` to `recordListingEvent` | SP4 engineering lead | SP4 Phase A |
| SP2 confirms `getListingSummaries` returns `closed` and `removed` states, that `ListingDetailView` props can be fed from `ListingDetail`, and which sub-project adds `mapbox-gl` to `package.json` | SP2 engineering lead | SP3 W1 starts |
| SP5 confirms the `getListingEventCounts` row shape (3.1) | SP5 engineering lead | SP5 Phase A |
| Mapbox account and the URL-restricted public tokens (dev, stg, prd) in Doppler | Founder | SP3 W7 e2e |
| Legal review of the `/international` copy | Founder and counsel | Launch (SP8 gate) |
| The app icon artwork for `src/ui/brand/app-icon.svg`: the Explore&Earn mark, square, legible at 48 px, inside the central 80% | Founder (design board) | SP3 W6 merges |
| SP8 includes the install path in its audits: both InstallPrompt variants and `/offline.html` in `tests/a11y/routes.ts` (light and dark, 390 px); the iOS Add to Home Screen steps in the VoiceOver "guest browse to apply" journey; `tests/e2e/pwa.spec.ts` green on the release commit beside `a11y.audit`; Lighthouse runs with the worker registered; `ee_install` in the strictly necessary storage list next to the theme | SP8 engineering lead | SP8 W7 |
