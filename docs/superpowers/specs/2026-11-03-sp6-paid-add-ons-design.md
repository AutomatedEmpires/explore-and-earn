# Sub-project 6: Paid add-ons technical design

- **Status:** design decided by engineering under the founder's end-to-end delegation (2026-11-03).
- **Parent:** [Product design spec](2026-11-03-explore-earn-product-design.md), sections 5.4, 8 (announcement pin), 13 (paid feed items), 16 (add-ons), 17 (boost reporting) and the sub-project 6 row of section 25.
- **Builds on:** [Foundation spec](2026-11-03-foundation-design.md) and its plan. Names below (`apiRoute`, `requireHost`, `enqueue`, `audit.record`, `runCheck`, `notify`, ...) are Foundation's exact exports.
- **Where the product spec is silent,** this spec picks the simplest option and marks it **Engineering decision**. Product values are copied verbatim.

## 1. Goal and done-when

**Goal:** a host can buy every paid add-on (boosts, announcement packs, extra invite packs, extra seats), the platform delivers it with honest labels and fixed caps, and the host sees what it did.

**Done when** (each line is an automated test):

| # | Exit criterion |
|---|---|
| E1 | In Stripe test mode an Owner and an Admin each buy a 7-, 14- and 28-day boost, a 1-, 3- and 5-announcement pack, an invite pack and an extra seat. Each is fulfilled **only after** Stripe confirms payment (webhook or server reconcile), and **exactly once** when the webhook is delivered twice. A Recruiter and a Billing member get 403. |
| E2 | Every card of an actively boosted listing returned by Seek, Swipe and the Map list has `boosted: true` and renders the "Boosted" badge; its map location renders the spark pin. A running announcement renders on `/hosts/[slug]` and in `AnnouncementCard variant="community"` with the label "Paid announcement". |
| E3 | A property test over 10,000 generated inputs proves the placement caps (section 8.2): Seek inserts only on the first page, never at position 1, and no inserted boosted item has another boosted-labeled item within 4 positions; Swipe puts a boosted card first whenever one matches, and no inserted boosted item has another boosted-labeled item within 3 positions, across batch boundaries; no listing appears twice in one session. |
| E4 | Every inserted boosted item matches the seeker's current filters: a boosted Farm listing never appears in a query filtered to Maritime, and never in the Feed hook for a seeker whose preferences exclude Farm. |
| E5 | When the placement hook throws or exceeds 120 ms, Seek and Swipe return the organic results unchanged. |
| E6 | An announcement is submitted, passes `text_safety`, runs exactly 168 hours, is pinned on the host page only during that window, and is returned by `promote.getPaidFeedItems` only during that window. A rejected announcement keeps its credit. |
| E7 | The boost report shows "Shown in boosted spots", views per day before and during, and saves and applications from Boost. SP5's boost chart on `/host/analytics` shows the boost's window, read from the source SP6 registers with `analytics.registerBoostWindowsSource`. An application started from a boosted slot is counted in the Boost slice of "where applicants came from". |
| E8 | A listing that closes before payment confirmation gets no boost, a full automatic refund and a notification. A listing that closes during a boost is never served after the close, and its boost is `ended_early` within 60 seconds. |

## 2. Scope

**In:** boost purchase, placement engine with caps (Seek, Swipe, Map, Feed hook), "Boosted" labels and the map spark pin; announcement packs, composer, moderation, 7-day runs and the host page pin; extra invite packs; extra seats; one-time Stripe Checkout purchases with refunds and reconciliation; boost and announcement reporting.

**Out:**

| Item | Goes to |
|---|---|
| Feed positions and enforcement of the 1-in-5 paid cap; the Announcements tab; platform announcements | SP7 (consumes `promote.getPaidFeedItems`) |
| Search queries, filters, cursors, card DTOs, the Map renderer, `listing_events` recording | SP3 |
| Plan subscriptions, extra listing slots, the extra-seat item on the plan subscription and its `seat` grants (SP6 sets the quantity through SP2), coupons, founding rate, the Stripe webhook route, Stripe customers, the entitlements ledger | SP2 |
| Sending invites and consuming invite credits | SP5 |
| The host analytics page, all its charts (the boost chart included) and CSV export | SP5 (SP6 registers its boost windows, section 3) |
| Operator refund screens, billing ops, revenue dashboards, Stripe live mode, refund wording in the terms | SP8 |
| Report and block on announcements | SP4 safety (SP6 registers the subject handler) |
| A "Featured host" product | Never (product spec 16) |
| Auctions, CPC/CPM pricing, audience targeting beyond the seeker's own filters | Not in V1 |
| Auto-renewing announcement packs | Not in V1 (open item O2) |

## 3. Modules and contracts

Four modules under `src/modules/`. Dependencies point one way: `promote → boosts, announcements → addons`. `addons` never imports the others; it hands off fulfillment through outbox topics. **Lint rule (added to `eslint.config.mjs`):** `src/modules/hiring/**` and `src/modules/discovery/**` may not import `@/modules/{addons,boosts,announcements,promote}`, so boosts can't reach the fit score or organic ranking (discovery reaches the hook only through `src/server/placement-hook.ts`).

```ts
// @/modules/addons: catalog, one-time Stripe Checkout, refunds, invite packs, extra seats
export type AddonSku = 'boost_7d' | 'boost_14d' | 'boost_28d'
  | 'announcement_pack_1' | 'announcement_pack_3' | 'announcement_pack_5'
  | 'invite_pack_s' | 'invite_pack_m' | 'invite_pack_l';
export type SeatSku = 'extra_seat_month' | 'extra_seat_year';
export type PurchaseStatus = 'pending' | 'paid' | 'expired' | 'refunded' | 'partially_refunded';
export type CatalogEntry = { sku: AddonSku | SeatSku; amountCents: number; currency: 'USD';
  credits: number | null; interval: 'month' | 'year' | null; available: boolean };
export type PurchaseView = { id: string; sku: AddonSku; status: PurchaseStatus; amountTotalCents: number | null;
  refundedCents: number; paidAt: string | null; fulfilledRef: string | null; targetListingId: string | null };
export type RefundReason = 'not_started' | 'listing_unavailable' | 'operator';
export function getCatalog(db: DbOrTx): Promise<CatalogEntry[]>;
export function createCheckout(db: Db, i: { orgId: string; buyerUserId: string; sku: AddonSku;
  targetListingId?: string }): Promise<{ purchaseId: string; checkoutUrl: string }>;
export function reconcilePurchase(db: Db, purchaseId: string): Promise<PurchaseStatus>;
export function getPurchase(db: DbOrTx, orgId: string, purchaseId: string): Promise<PurchaseView>;
export function listPurchases(db: DbOrTx, orgId: string, f?: { before?: string; limit?: number }):
  Promise<{ items: PurchaseView[]; nextBefore: string | null }>;
export function refundPurchase(db: Db, i: { purchaseId: string; amountCents: number; reason: RefundReason;
  actor: { type: 'system' | 'operator'; id: string | null } }): Promise<{ refundId: string }>;
export function previewExtraSeats(db: Db, i: { orgId: string; extraSeats: number }):   // wraps billing.previewSubscriptionAddon
  Promise<{ amountDueNowCents: number; nextRenewalCents: number; effectiveAt: Date }>;
export function setExtraSeats(db: Db, i: { orgId: string; actorUserId: string; extraSeats: number }): // wraps billing.setSubscriptionAddon
  Promise<{ effectiveAt: Date }>;
export function revenueSummary(db: DbOrTx, i: { from: Date; to: Date }):   // for SP8
  Promise<{ grossCents: number; refundedCents: number; bySku: Partial<Record<AddonSku, number>> }>;
export const jobHandlers: HandlerMap;

// @/modules/boosts: boosts, placement engine (implements SP3's hook), boost stats
export type BoostDuration = 7 | 14 | 28;
export type BoostStatus = 'scheduled' | 'active' | 'completed' | 'ended_early' | 'void';
export type BoostEligibility = { eligible: boolean;
  reason: null | 'listing_not_active' | 'subscription_inactive' | 'boost_already_queued' | 'listing_ends_too_soon';
  startsAt: Date; options: { durationDays: BoostDuration; amountCents: number; endsAt: Date; available: boolean }[] };
export type BoostReport = { id: string; listingId: string; listingTitle: string; status: BoostStatus;
  startsAt: string; endsAt: string; endedAt: string | null; servedBySurface: { seek: number; swipe: number; feed: number };
  viewsPerDayBefore: number | null; viewsPerDayDuring: number; savesFromBoost: number; applicationsFromBoost: number;
  daily: { day: string; views: number; served: number }[] };
export function checkBoostEligibility(db: DbOrTx, i: { orgId: string; listingId: string; now?: Date }): Promise<BoostEligibility>;
export function startBoostCheckout(db: Db, i: { orgId: string; buyerUserId: string; listingId: string;
  durationDays: BoostDuration }): Promise<{ purchaseId: string; checkoutUrl: string }>;
export const placementHook: BoostPlacementHook;                 // type owned by SP3, see below
export function boostedAmong(db: DbOrTx, listingIds: string[], now?: Date): Promise<Map<string, string>>; // listingId -> boostId
export function getBoostStatusForListings(db: DbOrTx, orgId: string, listingIds: string[]):
  Promise<Map<string, { status: BoostStatus; startsAt: Date; endsAt: Date }>>;   // for SP2 listing rows
export function listBoosts(db: DbOrTx, orgId: string, f?: { status?: BoostStatus; before?: string }):
  Promise<{ items: BoostReport[]; nextBefore: string | null }>;
export function getBoostReport(db: DbOrTx, orgId: string, boostId: string): Promise<BoostReport>;
export const boostWindowsSource: BoostWindowsSource;            // type owned by SP5; registered with analytics.registerBoostWindowsSource
export function feedBoostCandidates(db: DbOrTx, i: { viewerUserId: string; exclude: string[]; now: Date }):
  Promise<{ boostId: string; listingId: string }[]>;
export function stopBoostsForOrg(db: DbOrTx, i: { orgId: string; reason: 'org_stopped' }): Promise<number>;
export const jobHandlers: HandlerMap;

// @/modules/announcements: packs, credits, announcements, host page pin, cards
export type AnnouncementStatus = 'draft' | 'in_review' | 'scheduled' | 'running' | 'ended' | 'rejected' | 'canceled' | 'removed';
export type AnnouncementInput = { title: string; body: string;
  target: { type: 'host_page' } | { type: 'listing'; listingId: string };
  image: { mediaId: string; alt: string } | null;
  start: { mode: 'on_approval' } | { mode: 'at_time'; at: string } };
export type AnnouncementCardData = { id: string; orgId: string; orgName: string; orgSlug: string;
  orgLogoUrl: string | null; title: string; body: string; imageUrl: string | null; imageAlt: string | null;
  ctaLabel: 'View jobs' | 'View job'; ctaHref: string; endsAt: string; label: 'Paid announcement' };
export function createAnnouncement(db: Db, ctx: HostContext, i: AnnouncementInput): Promise<{ id: string }>;
export function updateAnnouncement(db: Db, ctx: HostContext, id: string, i: Partial<AnnouncementInput>): Promise<{ status: AnnouncementStatus }>;
export function submitAnnouncement(db: Db, ctx: HostContext, id: string): Promise<{ status: 'in_review' }>;
export function cancelAnnouncement(db: Db, ctx: HostContext, id: string): Promise<{ creditReturned: boolean }>;
export function endAnnouncement(db: Db, ctx: HostContext, id: string): Promise<void>;
export function listPinnedForHostPage(db: DbOrTx, orgId: string, o: { now?: Date; countServe: boolean }): Promise<AnnouncementCardData[]>; // SP2
export function getAnnouncementCards(db: DbOrTx, ids: string[], now?: Date): Promise<AnnouncementCardData[]>;  // SP7
export function listRunningAnnouncements(db: DbOrTx, i: { hiddenOrgIds: string[]; before?: string; limit: number; now?: Date }):
  Promise<{ items: AnnouncementCardData[]; nextBefore: string | null }>;   // SP7 Announcements tab
export function stopAnnouncementsForOrg(db: DbOrTx, i: { orgId: string; reason: 'org_stopped' }): Promise<number>;
export const jobHandlers: HandlerMap;

// @/modules/promote: read-side composition for other sub-projects
export type PaidFeedItem =
  | { kind: 'boosted_job'; listingId: string; boostId: string; label: 'Boosted' }
  | { kind: 'announcement'; announcementId: string; label: 'Paid announcement' };
export type PromoteSummary = { activeBoosts: number; scheduledBoosts: number; runningAnnouncements: number;
  announcementCredits: { available: number; nextExpiry: string | null };
  inviteCredits: { monthlyRemaining: number; packRemaining: number };
  seats: { included: number; extra: number; used: number } };
export function getPaidFeedItems(db: DbOrTx, i: { viewerUserId: string; limit: number; state: string | null; now?: Date }):
  Promise<{ items: PaidFeedItem[]; state: string }>;                                   // SP7
export function recordPaidServes(db: DbOrTx, i: { items: PaidFeedItem[]; surface: 'feed' | 'announcements_tab' }): Promise<void>; // SP7
export function stopPromotionsForOrg(db: Db, i: { orgId: string; reason: 'org_suspended' | 'org_deleted';
  actor: { type: 'operator' | 'system'; id: string | null } }): Promise<void>;                  // SP8
export function getPromoteSummary(db: DbOrTx, orgId: string): Promise<PromoteSummary>;
export function isLikelyBot(userAgent: string | null): boolean;   // /bot|crawl|spider|slurp|preview/i
```

**SP3 hook contract SP6 implements.** SP3 owns the type in `@/modules/discovery` and the touchpoint `src/server/placement-hook.ts` (ships `export const boostPlacementHook = noopHook`). SP6 changes that one line to `export { placementHook as boostPlacementHook } from '@/modules/boosts'`.

```ts
export type PlacementInput = { surface: 'seek' | 'swipe'; pageIndex: number; pageSize: number;
  organic: string[];                                   // ranked listing IDs SP3 fetched for this page
  matchIds: (ids: string[]) => Promise<string[]>;      // re-runs this query's filters and exclusions on ids
  viewerKey: string; state: string | null; now: Date }; // viewerKey = user ID or guest ID, never stored
export type PlacementOutput = { items: { listingId: string; boostId: string | null }[];
  organicConsumed: number; state: string | null };    // SP3 stores state opaquely in its cursor
export interface BoostPlacementHook {
  place(db: DbOrTx, i: PlacementInput): Promise<PlacementOutput>;
  boostedAmong(db: DbOrTx, listingIds: string[], now: Date): Promise<Map<string, string>>;
}
```

SP3 calls `place` for every Seek and Swipe page, wrapped in a 120 ms timeout that falls back to `{ items: organic, organicConsumed: organic.length }`. SP3 calls `boostedAmong` for every card set it returns (Seek, Swipe, Map list, listing detail) to set the card DTO's `boosted` flag and the map location's `boosted` pin.

**SP5 hook SP6 registers.** SP5 owns the boost chart on `/host/analytics` (`HostAnalytics.boost`, views during each boost window against the same number of days before it) and the `BoostWindowsSource` type in `@/modules/analytics`. At module load, `@/modules/boosts` calls `analytics.registerBoostWindowsSource(boostWindowsSource)`. For `(db, q)` it returns the boosts of `q.orgId` (only `q.listingIds` when given) with status `active`, `completed` or `ended_early` whose window overlaps `[q.from, q.to)`, as `{ listingId, startsAt: starts_at, endsAt: ended_at ?? ends_at }`. SP6 adds no card, chart or route to the analytics page.

**Interfaces SP6 consumes from other sub-projects.** Phase A builds a fake for each one in `tests/fakes/`. Entries marked (O5) are additions the owning spec still has to make.

| From | Interface |
|---|---|
| SP2 `billing` | `ensureStripeCustomer(db, orgId)` (Checkout `customer`); `getSubscriptionState(db, orgId)`, read for `.status`; `previewSubscriptionAddon(db, { orgId, addon: 'extra_seat', quantity })` and `setSubscriptionAddon(db, { orgId, addon: 'extra_seat', quantity, actorUserId })` (O5); `taxEnabled(): boolean` (O5; `false` until SP2's sales-tax open item is decided); the `billing.stripe_event` domain event `{ eventId, type, objectId }`; the Stripe client `getStripe()` from `@/lib/stripe` (O5 names the export) |
| SP2 `entitlements` | `grant(db, { orgId, kind: 'invite_credit', quantity, source: 'pack', sourceRef, idempotencyKey, validUntil, actor })`, `endGrant(db, grantId, at, actor)`, `getBalance(db, orgId, 'invite_credit')`, `getCapacity(db, orgId, 'seat')` |
| SP2 `listings`, `orgs`, `hostpages` | `listings.getListingSummaries(db, ids)` (`state`, `title`, `orgId`, `locationId`); `listings.getPublishedListing(db, id)` (`autoCloseAt`, `firstPublishedAt`); `orgs.listMembers(db, orgId)` filtered by `role`; `hostpages.getHostIdentities(db, orgIds)` (name, slug, logo for cards); `hostpages.listApprovedOrgPhotos(db, orgId)` for the announcement image picker (O5) |
| SP3 `discovery` | The `BoostPlacementHook` types and `src/server/placement-hook.ts` (above); `matchListingIds(db, { listingIds, query: DiscoveryQuery, viewerUserId })`; `getListingEventCounts(db, { orgId, listingIds, from, to, types, sources?, bucket })` with `'apply'` in `types`, the optional `sources: DiscoverySource[]` filter, and `source` on each returned row (O5) |
| SP4 `profiles`, `safety` | `profiles.getPreferenceTargets(db, userId)` → `{ categories, states }`; `safety.getBlockSet(db, userId)` → `{ userIds, orgIds, mutedOrgIds }`; the `announcement` report subject |
| SP5 `analytics` | `registerBoostWindowsSource(fn)` (above) |

## 4. Data model

All tables: schema `app`, RLS on with no policies, UUIDv7 `id`, `created_at`/`updated_at` with `app.set_updated_at()`, money in integer cents with `currency text not null default 'USD'`, enums as `text` + CHECK. **Engineering decision:** `listing_id` columns carry no foreign key to SP2's listing table (listings are never hard-deleted, and SP6 migrations then don't depend on SP2 table names).

**`drizzle/5000_addons.sql`**

| Table | Columns and constraints | Indexes |
|---|---|---|
| `app.addon_prices` | `sku text pk` CHECK in the 11 `AddonSku`/`SeatSku` values; `lookup_key text unique not null` (`ee_<sku>`); `stripe_price_id text unique not null`; `unit_amount_cents int not null check (> 0)`; `currency`; `credits int null check (> 0)` (from Stripe price metadata `ee_credits`; announcement packs 1/3/5); `recurring_interval text null check in ('month','year')`; `active boolean not null`; `synced_at timestamptz not null` | pk |
| `app.addon_purchases` | `id`; `org_id uuid not null references app.organizations`; `buyer_user_id uuid not null references app.users`; `sku text not null` CHECK in `AddonSku`; `target_listing_id uuid null`, CHECK `(sku like 'boost_%') = (target_listing_id is not null)`; `amount_cents int not null` (list price at creation); `amount_total_cents int null` (charged, incl. tax); `refunded_cents int not null default 0`; `currency`; `status text not null default 'pending'` CHECK in `PurchaseStatus`; `stripe_checkout_session_id text unique`; `stripe_payment_intent_id text unique`; `checkout_url text`; `checkout_expires_at timestamptz`; `paid_at`, `expired_at`, `fulfilled_at timestamptz`; `fulfilled_ref uuid` | `(org_id, created_at desc)`; `(status, checkout_expires_at) where status='pending'`; **unique** `(target_listing_id) where status='pending' and target_listing_id is not null`; **unique** `(org_id, sku) where status='pending' and target_listing_id is null` |
| `app.addon_refunds` | `id`; `purchase_id uuid not null references app.addon_purchases`; `amount_cents int not null check (> 0)`; `reason text` CHECK in `RefundReason`; `actor_type text check in ('system','operator')`; `actor_id uuid null`; `status text default 'pending' check in ('pending','succeeded','failed')`; `stripe_refund_id text unique null`; `last_error text` | `(purchase_id)` |

**`drizzle/5100_boosts.sql`**

| Table | Columns and constraints | Indexes |
|---|---|---|
| `app.boosts` | `id`; `org_id uuid not null references app.organizations`; `listing_id uuid not null`; `purchase_id uuid unique not null references app.addon_purchases`; `duration_days int not null check in (7,14,28)`; `status text not null` CHECK in `BoostStatus`; `starts_at`, `ends_at timestamptz not null`, CHECK `ends_at = starts_at + make_interval(days => duration_days)`; `ended_at timestamptz null`; `end_reason text null check in ('listing_closed','listing_removed','org_stopped','listing_unavailable','operator')` | `(listing_id, ends_at)`; `(starts_at, ends_at) where status in ('scheduled','active')`; `(org_id, created_at desc)` |
| `app.boost_daily_stats` | `boost_id uuid references app.boosts`; `day date`; `surface text check in ('seek','swipe','feed')`; `served int not null default 0`; pk `(boost_id, day, surface)` | pk |

**`drizzle/5200_announcements.sql`**

| Table | Columns and constraints | Indexes |
|---|---|---|
| `app.announcement_packs` | `id`; `org_id uuid not null references app.organizations`; `purchase_id uuid unique not null references app.addon_purchases`; `size int not null check in (1,3,5)`; `credits_used int not null default 0`, CHECK `credits_used between 0 and size`; `valid_from`, `valid_until timestamptz not null` | `(org_id, valid_until)` |
| `app.announcements` | `id`; `org_id uuid not null references app.organizations`; `created_by uuid not null references app.users`; `pack_id uuid null references app.announcement_packs` (set at first submit); `revision int not null default 1`; `title text not null check (char_length between 1 and 80)`; `body text not null check (char_length between 1 and 500)`; `target_type text not null check in ('host_page','listing')`; `target_listing_id uuid null`, CHECK `(target_type='listing') = (target_listing_id is not null)`; `image_media_id uuid null references app.media`; `image_alt text null check (char_length <= 200)`, CHECK `(image_media_id is null) = (image_alt is null)`; `status text not null default 'draft'` CHECK in `AnnouncementStatus`; `start_mode text not null check in ('on_approval','at_time')`; `requested_start_at timestamptz null`; `starts_at`, `ends_at timestamptz null`, CHECK `ends_at is null or ends_at = starts_at + interval '7 days'`; `check_id uuid null`; `rejection_reason text`; `submitted_at`, `decided_at`, `ended_at timestamptz`; `end_reason text null check in ('completed','ended_by_host','removed','org_stopped')` | `(org_id, created_at desc)`; `(starts_at, ends_at) where status in ('scheduled','running')`; `(pack_id) where status in ('in_review','rejected','scheduled')` |
| `app.announcement_daily_stats` | `announcement_id uuid references app.announcements`; `day date`; `surface text check in ('feed','announcements_tab','host_page')`; `served int not null default 0`; `clicks int not null default 0`; pk `(announcement_id, day, surface)` | pk |

`promote` owns no tables (range 5300–5399 reserved). **Settings key** added to `SettingValues`: `'promote.paid_delivery_enabled': boolean`, default `true` (an operator kill switch; see section 8.5).

## 5. API

All routes use `apiRoute` (zod input, error envelope `{ error: { code, message, details?, requestId } }`, Origin check on writes). **Host (owner, admin)** means `auth: 'host'` and `requireHost({ roles: ['owner','admin'] })`. Every host query filters by `ctx.orgId`; an ID that belongs to another organization returns `404 not_found`.

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| GET | `/api/v1/promote/catalog` | Host (owner, admin) | – | `{ skus: CatalogEntry[] }` |
| GET | `/api/v1/promote/summary` | Host (owner, admin) | – | `PromoteSummary` (active and scheduled boosts, announcement credits left and next expiry, running announcements, invite credits, seats) |
| GET | `/api/v1/promote/boosts/eligibility` | Host (owner, admin) | `{ listingId: uuid }` | `BoostEligibility` |
| POST | `/api/v1/promote/boosts/checkout` | Host (owner, admin); rate limit `addons:checkout:<orgId>` 20/hour | `{ listingId: uuid, durationDays: 7\|14\|28 }` | `{ purchaseId, checkoutUrl }`; 409 `conflict` with `details.reason` from eligibility |
| GET | `/api/v1/promote/boosts` | Host (owner, admin) | `{ status?, before? }` | `{ items: BoostReport[], nextBefore }` |
| GET | `/api/v1/promote/boosts/:id` | Host (owner, admin) | – | `BoostReport` |
| POST | `/api/v1/promote/announcement-packs/checkout` | Host (owner, admin); same rate limit | `{ size: 1\|3\|5 }` | `{ purchaseId, checkoutUrl }` |
| GET | `/api/v1/promote/announcements` | Host (owner, admin) | `{ status?, before? }` | `{ packs: { id, size, creditsUsed, validUntil }[], items: AnnouncementSummary[], nextBefore }` |
| GET | `/api/v1/promote/announcements/:id` | Host (owner, admin) | – | `{ announcement, card: AnnouncementCardData, stats: { surface, served, clicks }[] }` |
| POST | `/api/v1/promote/announcements` | Host (owner, admin) | `AnnouncementInput` | `{ id }` (status `draft`) |
| PATCH | `/api/v1/promote/announcements/:id` | Host (owner, admin) | `Partial<AnnouncementInput>` | `{ status }`; 409 when `running` or later |
| POST | `/api/v1/promote/announcements/:id/submit` | Host (owner, admin); rate limit `announcements:submit:<orgId>` 20/day | – | `{ status: 'in_review' }`; 409 `conflict` "No announcement credits left" |
| POST | `/api/v1/promote/announcements/:id/cancel` | Host (owner, admin) | – | `{ creditReturned: boolean }` (before start only) |
| POST | `/api/v1/promote/announcements/:id/end` | Host (owner, admin) | – | `{ status: 'ended' }` (while running) |
| GET | `/api/v1/promote/host-media` | Host (owner, admin) | – | `{ items: { mediaId, url, alt }[] }` (the image picker; from SP2's `hostpages.listApprovedOrgPhotos`) |
| POST | `/api/v1/promote/invite-packs/checkout` | Host (owner, admin); same rate limit | `{ sku: 'invite_pack_s'\|'invite_pack_m'\|'invite_pack_l' }` | `{ purchaseId, checkoutUrl }` |
| GET | `/api/v1/promote/credits` | Host (owner, admin) | – | `{ invites: { monthlyRemaining, monthlyResetsAt, packs: { purchaseId, remaining, validUntil }[] }, seats: { included, extra, used, pendingExtra, pendingEffectiveAt } }` |
| GET | `/api/v1/promote/seats/preview` | Host (owner, admin) | `{ extraSeats: int 0–50 }` | `{ amountDueNowCents, nextRenewalCents, effectiveAt }` |
| PUT | `/api/v1/promote/seats` | Host (owner, admin) | `{ extraSeats: int 0–50 }` | `{ extraSeats, effectiveAt }` |
| GET | `/api/v1/promote/purchases` | Host (owner, admin, billing) | `{ before? }` | `{ items: PurchaseView[], nextBefore }` |
| GET | `/api/v1/promote/purchases/:id` | Host (owner, admin) | – | `PurchaseView` (calls `reconcilePurchase` when `pending` for > 5 s) |
| GET | `/api/v1/announcements/:id/open` | `none`; rate limit `ann:open:<ipHash>` 120/minute | `{ surface: 'feed'\|'announcements_tab'\|'host_page' }` | `302` to the server-computed internal target; counts a click. Never an external URL. |

There is no new webhook route: SP2's `/api/webhooks/stripe` verifies and dedupes events and emits the ones SP6 needs as `billing.stripe_event`, which SP6's `addons.stripe_event` topic subscribes to (sections 6 and 9).

## 6. Jobs, notifications, trust and audit

**Outbox topics and schedules** (every handler is idempotent; schedules are appended to `src/server/schedules.ts`)

| Topic | Trigger | Does | Dedupe key |
|---|---|---|---|
| `addons.stripe_event` | SP2's `billing.stripe_event` (SP6 appends this topic to that event's entry in `src/server/event-subscribers.ts`) | retrieves the event from Stripe by `eventId` and acts only when it belongs to an SP6 purchase: a Checkout Session with `metadata.ee_purchase_id` (`checkout.session.completed` → paid, `checkout.session.expired` → expired), or a charge or dispute whose `payment_intent` equals the purchase's `stripe_payment_intent_id` (`charge.refunded` → refunded amounts, `charge.dispute.created` → `billing` review item). Other types and objects are ignored | `<eventId>:addons.stripe_event` (set by `emit`) |
| `boosts.fulfill` | purchase marked paid | creates the boost (section 8.1) or voids and refunds it | `fulfill:<purchaseId>` |
| `announcements.fulfill_pack` | purchase marked paid | creates the pack | `fulfill:<purchaseId>` |
| `addons.fulfill_invite_pack` | purchase marked paid | `entitlements.grant` of `invite_credit` (section 8.4) | `fulfill:<purchaseId>` |
| `addons.refund` | `refundPurchase` | calls Stripe Refunds outside any transaction | `refund:<refundId>` |
| `announcements.moderate` | submit or edit in review | deterministic checks, then `runCheck` | `moderate:<id>:<revision>` |
| `addons.reconcile_pending` | cron `*/10 * * * *` | for `pending` purchases older than 10 minutes, retrieves the Checkout Session and applies paid or expired | `reconcile:<id>:<10-min bucket>` |
| `addons.sync_prices` | cron `0 * * * *` | reads Stripe prices by lookup key into `app.addon_prices`; a fixed-price SKU whose amount differs from section 8 raises a `warning` alert | `sync:<hour>` |
| `boosts.tick` | cron `* * * * *` | sets `active`/`completed`; ends boosts whose listing is no longer Active (`state` from `listings.getListingSummaries`); voids and refunds scheduled boosts on closed listings; sends lifecycle notifications | `tick:<minute>` |
| `announcements.tick` | cron `* * * * *` | starts due `scheduled`, ends due `running`, cancels unstarted credit holders 14 days past pack expiry | `tick:<minute>` |
| `announcements.credit_reminders` | cron `0 16 * * *` | notifies orgs whose pack expires in 3 days with credits left | `remind:<packId>` |

**Notification types** (`defineType`; recipients are the org's Owner and Admins from SP2 `orgs.listMembers` filtered by `role`, plus Billing members for billing types). New email templates are added to `EmailTemplateName`: `PromoteReceipt`, `PromoteNotice`, `BoostReport`.

| Type | Category | Mandatory | Channels | Batching |
|---|---|---|---|---|
| `addons.purchase_confirmed` | billing | yes | in-app, email `PromoteReceipt` | none |
| `addons.refunded` | billing | yes | in-app, email `PromoteReceipt` | none |
| `boosts.started` | jobs | no | in-app, push | none |
| `boosts.ended` | jobs | no | in-app, email `BoostReport` (served, views per day before and during, applications) | none |
| `boosts.ended_early` | jobs | no | in-app, email `PromoteNotice` | none |
| `announcements.approved` | jobs | no | in-app, email `PromoteNotice` ("Starts [date]") | none |
| `announcements.rejected` | jobs | no | in-app, email `PromoteNotice` (reason, "Your credit is kept") | none |
| `announcements.ended` | jobs | no | in-app | none |
| `announcements.removed` | account | yes | in-app, email `PromoteNotice` | none |
| `announcements.credits_expiring` | jobs | no | in-app, email `PromoteNotice` | none |

**Trust.** Check kind `text_safety` on `title + body + image_alt` with `subjectType: 'announcement'`. Queues: `moderation` (opened by `runCheck` on `needs_review`), `reports` (seeker reports via SP4 safety), `billing` (`openReviewItem({ queue: 'billing', subjectType: 'addon_purchase', reason })` for `refund_failed`, `dispute`, `fulfillment_dead`). Subject handlers: `registerSubjectHandlers('announcement', { approve, remove })` and `registerSubjectHandlers('addon_purchase', { refund })` (refund uses `data.amountCents`; Foundation's second sign-off applies above $500).

**Audit actions** (`audit.record` inside the domain transaction): `addons.checkout_created`, `addons.purchase_paid`, `addons.purchase_expired`, `addons.refund_requested`, `addons.refund_succeeded`, `addons.refund_failed`, `addons.invite_pack_granted`, `addons.seats_changed`, `boosts.created`, `boosts.started`, `boosts.completed`, `boosts.ended_early`, `boosts.voided`, `announcements.created`, `announcements.submitted`, `announcements.approved`, `announcements.rejected`, `announcements.canceled`, `announcements.ended`, `announcements.removed`, `promote.org_stopped`.

## 7. Screens

Host screens live under the sidebar's **Promote** (Boosts, Announcements, credits); on phones it's under More. All use only `src/ui` components. Loading uses `Skeleton`; errors use `ErrorState` (icon and text) with Retry; tables pair with the Chart/Table `SegmentedControl`.

| Route | Components | Empty / loading / error | Mobile and desktop |
|---|---|---|---|
| `/host/promote` | `Tabs` (Boosts, Announcements, Credits and seats), `StatTile` row from the summary | Empty: "Promote your jobs with a boost, or tell seekers what's new with an announcement." with both buttons | Desktop: tiles in a row; mobile: 2-column grid |
| `/host/promote/boosts` | list of `Card` rows (listing, status `Pill`, dates, served), Button "Boost a listing" opening a `Sheet`: `Select` of Active listings, `JobCard` preview with the Boosted badge, `SegmentedControl` "7 days $49 · 14 days $79 · 28 days $99" (unavailable options disabled with "Your listing ends [date]"), summary "Starts [now / date] · Ends [date]", fine print, Button "Continue to payment" | Empty: "No boosts yet." Error on checkout: inline `ErrorState` with the conflict reason | Sheet is a bottom sheet under 768 px, a side panel above |
| `/host/promote/boosts/[id]` | `StatTile` × 4 (Shown in boosted spots, Views per day before → during, Saves from Boost, Applications from Boost), `BarChart` (views per day, before vs during) with table view | "No comparison yet: the boost started when the listing was published" when there's no before window | Charts full width on mobile |
| `/host/promote/announcements` | pack `Card` ("2 of 3 left · use by [date]"), Button "Buy announcements" (`Sheet`: `SegmentedControl` "1 · $49 / 3 · $99 / 5 · $149", line "Each runs for 7 days and pins to your host page while it runs."), `Tabs` Running / Scheduled / In review / Past with status `Pill`s | Empty: "No announcements yet. Hosts get no free announcements; buy a pack to post one." | Same |
| `/host/promote/announcements/new` and `/[id]` | `Input` title (80, counter), `Textarea` body (500, counter), `Select` button target (Host page or an Active listing), image grid from approved org photos with alt `Input`, `Radio` start (As soon as approved / On a date), live preview `Tabs` Community / Host page using `AnnouncementCard`, Button "Submit for review · uses 1 credit" | Field errors inline (icon and text), e.g. "Links, emails and phone numbers aren't allowed. Seekers use the button." | Desktop: form left, preview right; mobile: preview below |
| `/host/promote/credits` | Invite credits `StatTile` (monthly left, resets [date]), packs table, Button "Buy invite credits" (`Sheet`), Seats block: included / extra / in use, stepper `Input` with − / + `IconButton`s, preview line, Button "Confirm" | When invite pack or seat prices aren't set in Stripe: "Not on sale yet" `EmptyState` in that block | Same |
| `/host/promote/checkout/return?purchase=` | `Skeleton` + "Confirming your payment" (polls `GET /purchases/:id` every 2 s for 60 s), then success `Card`, or "We couldn't start your boost because the listing closed. We've refunded you.", or after 60 s "Still confirming. We'll notify you when it's done." | as listed | Same |
| SP2 listing rows | `Pill` "Boosted until [date]" and a "Boost" link to `/host/promote/boosts?listing=<id>` | – | – |
| Seeker cards (SP3/SP7) | `JobCard` `boosted` → cover `Badge` "Boosted" (neutral tokens, not amber) | – | – |
| Map (SP3) | `MapPin` `boosted`: 1.25× size, category color and icon kept, `Sparkles` (lucide) glyph badge | – | – |
| `/hosts/[slug]` (SP2 page) | `AnnouncementCard variant="host_page"` stack above the tabs, newest first, first one expanded, "Show N more announcements" | Nothing rendered when none run | Full width |

`/host/analytics` is SP5's page and SP6 changes nothing on it: SP5's boost chart reads the boost windows SP6 registers (section 3).

**Design-system additions** (through the gallery, never one-off styling): `AnnouncementCard` in `src/ui/patterns/` (variants `community` and `host_page`; `OrgLogo`, name, `Badge` label, title, body, optional image with alt, `Button` CTA, "Until [date]"; org name, slug and logo come from SP2's `hostpages.getHostIdentities`); the `boosted` prop on `JobCard` and on SP3's `MapPin`. The host-page variant's label is "Announcement" (the host's own page); the community variant's label is "Paid announcement" (**Engineering decision**).

## 8. Business rules

### 8.1 Boosts

| Rule | Value | Source |
|---|---|---|
| Prices | **$49 / 7 days, $79 / 14 days, $99 / 28 days**, read from Stripe | Product 16 |
| Duration | Exactly 7 × 24, 14 × 24 or 28 × 24 hours from `starts_at` | Engineering decision |
| Who buys | Owner and Admin ("manages the team and buys add-ons") | Product 2 |
| Eligibility | Listing is Active (`state` from `listings.getListingSummaries`); org subscription status (`billing.getSubscriptionState(...).status`) is `active` or `trialing` (founding free period counts); the boost window ends at or before the listing's `autoCloseAt` (from `listings.getPublishedListing`) when it's set; at most 1 active plus 1 scheduled boost per listing | Engineering decision |
| Start | When payment is confirmed, or when the listing's current boost ends (queued). Fulfillment takes `pg_advisory_xact_lock(hashtext('boost:' \|\| listing_id))` and sets `starts_at = max(now, latest ends_at of its scheduled/active boosts)` | Engineering decision |
| Fulfillment re-check | At fulfillment the listing must still be Active, the window must still fit `autoCloseAt`, and the 1 + 1 limit must hold. Otherwise the boost is created `void` with `end_reason='listing_unavailable'`, a **full automatic refund** is issued, and the host gets `boosts.ended_early` and `addons.refunded` | Engineering decision |
| Listing closes or is removed during a boost | Serving stops at once (SP3's query returns only Active listings); `boosts.tick` sets `ended_early` within 60 s. No refund once started. A scheduled boost on that listing is voided and refunded in full | Engineering decision |
| Refunds | Boosts can't be refunded once they start, except by an operator; the purchase sheet says so, plus "A boost ends if the listing closes." | Engineering decision |
| Report data | `getBoostReport` reads served counts from `app.boost_daily_stats`, and everything else through SP3's `getListingEventCounts` for the boost's listing: views per day with `types: ['view']`, `bucket: 'day'`, during the window and over the same number of days before `starts_at` (none before `firstPublishedAt`); saves and applications from Boost with `types: ['save', 'apply']`, `sources: ['boost']`, `bucket: 'none'` | Product 17 + Engineering decision |
| Fit | Never read by hiring (lint rule in section 3); boosts never change the fit score | Product 5.4 |
| Organic ranking | Never changed; boosts only fill inserted slots | Product 5.4 |

### 8.2 Placement engine

Product rule: **Boosts are paid. They are always labeled "Boosted", only appear when the job matches the seeker's filters, and never affect the fit score.**

| Surface | Product cap | Implementation |
|---|---|---|
| Seek | Near the top, at most 1 in every 5 results | First page only (`pageIndex 0`, `pageSize 20`); never position 1; k = 5 (so slots fall at 2, 7, 12, 17 at most: 4 per query) |
| Swipe | First in the deck, at most 1 in every 4 cards | Deck position 1 when a match exists; k = 4 across every batch, carried in `state` |
| Map | The larger spark-icon pin | A location gets the spark pin when any listing there that matches the current filters is boosted (`boostedAmong`); no cap |
| Community Feed | Included among paid items, which are capped at 1 in 5 feed items | `promote.getPaidFeedItems` returns candidates; SP7 positions them and enforces 1 in 5 |

**`place()` algorithm**

1. If `promote.paid_delivery_enabled` is false, return the organic list unchanged.
2. Decode `state` = `{ shown: string[] (max 200), gap: number }`; start with `gap = k − 1`.
3. Load active boosts (`status in ('scheduled','active') and starts_at <= now and ends_at > now`), cached in memory for 30 s per instance.
4. Candidates = `matchIds(active listing IDs − shown)`, ordered by FNV-1a of `boostId|viewerKey|UTC hour` (fair rotation with no writes; **Engineering decision**).
5. Walk output positions 1..`pageSize`. Insert the next candidate only when the surface allows the page and position, `gap ≥ k − 1`, and none of the next k − 1 organic items (other than the candidate itself) is boosted. An inserted candidate is removed from the organic remainder and sets `gap = 0`. Otherwise emit the next organic item not in `shown`; if it's boosted (organic position, still labeled), `gap = 0`, else `gap + 1`.
6. Return `items`, `organicConsumed` = 1 + the index of the last organic item emitted, and the new `state`. Serve counts are upserted into `app.boost_daily_stats` after the response (Next `after()`); any error inside `place` returns organic results (fail-open).

**Labels:** every card of a listing with an active boost shows "Boosted" on every discovery surface, whether it sits in an inserted slot or ranks there organically (**Engineering decision**: "always labeled"). Inserted placements never create two boosted-labeled items closer than the cap; organic order is never changed to fix natural adjacency.

**Feed candidates** (`getPaidFeedItems`): boosted jobs are matched against the seeker's private preferences from SP4's `profiles.getPreferenceTargets(db, viewerUserId)` through SP3's `matchListingIds(db, { listingIds, query: { categories, states }, viewerUserId })`; a seeker with no preferences matches every category (**Engineering decision**: the Feed has no search filters, so preferences stand in for them). Running announcements are not targeted. Orgs in SP4's `safety.getBlockSet(db, viewerUserId)` `orgIds` ∪ `mutedOrgIds` are excluded from both. The two kinds alternate, each ordered by the same rotation hash; `state` prevents repeats within one feed session.

### 8.3 Announcements

| Rule | Value | Source |
|---|---|---|
| Packs | **1, 3 or 5 per month for $49, $99 or $149** | Product 16 |
| Run | **Each runs for 7 days and pins to the host page while it runs**: exactly 168 hours from `starts_at` | Product 16, 8 |
| Free announcements | None, and no operator grant path; make-goods are refunds | Product 13 |
| Pack type | One-time purchase; credits must be used to **start** an announcement within one calendar month of payment (`valid_until = paid_at + interval '1 month'`) | Engineering decision (open item O2) |
| Content | Title 1–80 and body 1–500 characters, plain text. **No URLs, email addresses or phone numbers** (rejected at submit with field errors). One button to the host page or one of the org's Active listings. Optional image chosen from the org's approved photos, with required alt text up to 200 characters | Engineering decision |
| Credit use | Reserved at first submit from the earliest-expiring valid pack (`update ... where credits_used < size ... for update skip locked`); none left returns 409 | Engineering decision |
| Moderation | `text_safety`: approved → `scheduled`; `needs_review` → `moderation` queue (24-hour time limit); rejected → `rejected` with the reason. Edits in review or scheduled bump `revision` and re-moderate; stale results for an old revision are ignored | Foundation 8 |
| Rejected | Credit stays with the announcement; the host edits and resubmits at no cost, or cancels to return the credit | Engineering decision |
| Start | On approval, or at the requested time (between now and the pack's `valid_until`). Approval after the requested time starts it on approval. A run submitted before expiry still runs after it | Engineering decision |
| While running | No edits. "End now" stops it; no credit back | Engineering decision |
| Cancel before start | Credit returns to its pack if the pack is still valid | Engineering decision |
| Stale holders | An unstarted announcement holding a credit is canceled 14 days after its pack's `valid_until`; the credit expires | Engineering decision |
| Target listing closes | The button falls back to the host page at read time | Engineering decision |
| Concurrency | Several may run at once; the host page shows all running ones, newest first | Engineering decision |
| Where it appears | Host page pin (public, while running); Community Feed paid slots and Announcements tab (signed-in seekers, via SP7) | Product 8, 13 |
| Followers | Not notified of announcements | Engineering decision |
| Reports | A seeker report goes to the `reports` queue; `remove` sets `removed`, ends the run, and returns no credit | Engineering decision |
| Stats | Served per surface (host page serves skip `isLikelyBot` user agents) and button clicks per surface, counted in `app.announcement_daily_stats` | Engineering decision |

### 8.4 Invite packs and seats

| Rule | Value | Source |
|---|---|---|
| Prices and pack sizes | **Open** (product 26, O1). SKUs `invite_pack_s/m/l` and `extra_seat_month/year` appear only when the founder creates their Stripe price with lookup key `ee_<sku>` (invite packs also need metadata `ee_credits`); until then the block reads "Not on sale yet" | Product 16, 26 |
| Invite packs | One-time. Requires an `active` or `trialing` subscription. On payment: `entitlements.grant(db, { orgId, kind: 'invite_credit', quantity: credits, source: 'pack', sourceRef: purchaseId, idempotencyKey: 'pack:' + purchaseId, validUntil: paid_at + 365 days, actor: { type: 'system', id: null } })`; `fulfilled_ref` stores the `grantId`. Plan credits are used first (SP2 consumes earliest-expiring first). An operator refund calls `entitlements.endGrant(db, grantId, now, actor)`, so the pack's unused credits lapse; `entitlements.getBalance` before and after gives the credits removed, which goes in the audit entry | Engineering decision |
| Extra seats | Recurring, like extra listing slots: a quantity of the price with lookup key `ee_extra_seat_month` (monthly plans) or `ee_extra_seat_year` (annual) on the org's plan subscription. `setExtraSeats` calls SP2's `billing.setSubscriptionAddon(db, { orgId, addon: 'extra_seat', quantity, actorUserId })`, and `previewExtraSeats` calls `billing.previewSubscriptionAddon(db, { orgId, addon: 'extra_seat', quantity })`. SP2 treats both lookup keys as known, and its `syncSubscription` grants `seat` entitlements for the quantity (key `plan:<subId>:seat_extra:<qty>`); SP6 grants no seats itself (O5). 0–50 extra seats. Increases apply at once with Stripe proration, and the seat limit rises only when SP2's sync sees the invoice paid. Decreases apply at the next renewal and can't go below members plus pending team invitations minus plan seats (`entitlements.getCapacity(db, orgId, 'seat')`). Canceling the plan ends them | Engineering decision |

### 8.5 Purchases, refunds and failure handling

| Case | Behavior |
|---|---|
| Checkout | Stripe Checkout, `mode: 'payment'`, `payment_method_types: ['card']` (so confirmation is immediate), `customer` = `billing.ensureStripeCustomer(db, orgId)` (SP2), `automatic_tax.enabled` = `billing.taxEnabled()`, one line item at the synced price, `client_reference_id` and `metadata.ee_purchase_id`, `invoice_creation.enabled` (the receipt lands in Billing), `expires_at` = now + 30 minutes, Stripe idempotency key `checkout:<purchaseId>`. The Stripe call runs after the purchase row commits |
| Two tabs | The unique pending indexes return the existing `checkoutUrl`. A new boost checkout for the same listing with a different duration first expires the old session in Stripe, then marks it `expired` |
| Confirmation | Only `checkout.session.completed` with `payment_status='paid'` (delivered through `addons.stripe_event`), or `reconcilePurchase` retrieving the session from Stripe. The browser's return never fulfills on its own. `paid` is set with `update ... where status='pending'`, so duplicates are no-ops |
| Expiry | `checkout.session.expired` or reconcile marks `expired`; nothing is created |
| Refund | `refundPurchase` writes an `addon_refunds` row and enqueues `addons.refund` (Stripe key `refund:<refundId>`). `charge.refunded` sets `refunded_cents` and `refunded`/`partially_refunded`. After 8 failed attempts the row is `failed` and a `billing` review item opens |
| Dispute | `charge.dispute.created` opens a `billing` review item; delivery continues unless an operator acts |
| Org suspended or deleted | `promote.stopPromotionsForOrg`: active boosts `ended_early` (`org_stopped`), scheduled boosts voided and refunded, running announcements `removed`, unstarted ones canceled. Called by SP8 |
| Kill switch | `promote.paid_delivery_enabled = false`: placement and the Feed hook return organic only, and host page pins are hidden. Boost clocks keep running; operators handle make-goods. Changes are audited by `setSetting` |
| Discounts | The founding-host 30% (`founding_30_forever`, a coupon on the plan subscription) applies to everything billed on that subscription: the tier, extra listing slots and extra seats. It doesn't apply to one-time add-ons (boosts, announcement packs, invite packs), which are separate Checkout payments with no coupon (**Engineering decision**, O3: seats share the plan subscription, so no product-restricted coupon or second subscription is needed) |
| Past-due subscription | `getSubscriptionState(...).status = 'past_due'`: no new add-on purchases; running ones continue |

## 9. Integrations and environment variables

| Integration | Use | Provided by |
|---|---|---|
| Stripe Checkout, Refunds, Prices | One-time purchases, refunds, price lookup by `lookup_key` | SP6 via SP2's `getStripe()` client (`@/lib/stripe`, with a stub) |
| Stripe webhooks | `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created` | SP2's `/api/webhooks/stripe` route verifies and dedupes, then emits them as `billing.stripe_event` `{ eventId, type, objectId }`. A `checkout.session.completed` or `checkout.session.expired` with `mode = 'payment'` (or `metadata.ee_purchase_id`) is emitted there instead of enqueuing `billing.sync_subscription` (SP2 section 8.8, O5). SP6's `addons.stripe_event` subscriber (section 6) handles them |
| Stripe subscription items | Extra seats (`ee_extra_seat_month`, `ee_extra_seat_year`) | SP2 `billing.setSubscriptionAddon` / `billing.previewSubscriptionAddon`; SP2's `syncSubscription` grants the `seat` entitlements (O5) |
| Stripe Tax | Same setting as subscriptions | SP2 `billing.taxEnabled()` → `automatic_tax.enabled`; `false` while SP2 keeps Stripe Tax off (SP2 section 13) |
| Seed script | `scripts/stripe-seed-addons.ts` creates the fixed-price products and prices (`ee_boost_7d` 4900, `ee_boost_14d` 7900, `ee_boost_28d` 9900, `ee_announcement_pack_1` 4900, `_3` 9900, `_5` 14900, metadata `ee_credits` 1/3/5), idempotent by lookup key. Run against test mode now; against live mode at the SP8 cutover | SP6 |

**Environment variables.** SP6 adds **no new variables**. It reads, from Doppler project `explore-and-earn` (configs `dev`, `stg`, `prd`, synced to Vercel and GitHub Actions; `stg` is `APP_ENV=preview`):

| Variable | Defined by | Notes |
|---|---|---|
| `APP_URL` | Foundation | Checkout `success_url` / `cancel_url` |
| `BILLING_PROVIDER` (`stripe` \| `stub`) | SP2 | `stub` refused in prod by the Foundation env guard |
| `STRIPE_SECRET_KEY` | SP2 | Test key in `dev`/`stg`, live key in `prd` |
| `STRIPE_WEBHOOK_SECRET` | SP2 | Verified by SP2's route |
| `JOBS_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_POSTHOG_KEY` | Foundation | Worker, database, analytics |

## 10. Security and privacy

| Action | Owner | Admin | Recruiter | Billing | Seeker | Guest | Operator |
|---|---|---|---|---|---|---|---|
| Buy boosts, packs, invite packs; change seats | yes | yes | no | no | – | – | no |
| Create, submit, cancel, end announcements | yes | yes | no | no | – | – | – |
| Promote pages and reports | yes | yes | no | no | – | – | – |
| Boost status on listing rows (SP5's Analytics page applies its own rules to the boost chart) | yes | yes | scoped listings | no | – | – | – |
| List add-on charges | yes | yes | no | yes | – | – | – |
| See boosted placements | – | – | – | – | yes | yes (Seek, Swipe, Map) | – |
| See announcements | host page | host page | host page | host page | Community + host page | host page | – |
| Approve or remove announcements; refund | – | – | – | – | – | – | `moderation`, `reports`, `billing` queues via `requireOperator({ queue })`; refunds `sensitive: true` |

- **Owner and Admin strong sign-in** is already enforced by `requireHost` (passkey or two-step).
- **No seeker data is stored by SP6.** Serve and click counts are aggregates per boost or announcement per day. `viewerKey` is used in memory for the rotation hash and never written. Analytics never shows who viewed, saved or clicked (product 17).
- **Payments:** card data stays in Stripe Checkout; SP6 stores Stripe IDs and amounts only.
- **No open redirect:** `/api/v1/announcements/:id/open` redirects only to the internal path computed from the stored target. Announcement text can't carry links or contact details, which keeps conversations on-platform.
- **Tenant isolation:** every host query is scoped to `ctx.orgId`; foreign IDs return 404. Recruiter scope comes from SP2.
- **PostHog** events carry IDs only: `promote_checkout_started { sku }`, `promote_purchase_paid { sku }`, `boost_served { surface }` (sampled 1%).
- **Privacy hooks (SP8):** the org exporter includes purchases, boosts, packs and announcements; the seeker eraser is a no-op (nothing stored). On org deletion, announcement text and images are deleted; purchase and refund rows are kept 7 years as financial records with `buyer_user_id` kept as the ID only (**Engineering decision**).

## 11. Testing

Unit and domain tests run on PGlite; the concurrency tests marked *int* run on the CI Postgres container. SP2, SP3, SP4 and SP5 interfaces (section 3 table) are faked at their module boundaries where those sub-projects aren't merged.

**Key tests**

- Catalog: `addons.sync_prices` with a stub Stripe returns 6 fixed SKUs; invite pack SKUs are `available: false` until a price with `ee_credits` exists; a price mismatch raises one `warning` alert.
- Checkout: a Recruiter gets 403; a listing that isn't Active gets 409 `listing_not_active`; a second request in another tab returns the same URL; a different duration expires the first session.
- Stripe events: a `billing.stripe_event` for a `mode: 'payment'` `checkout.session.completed` marks the purchase paid once; a subscription Checkout Session, or a charge with no matching `stripe_payment_intent_id`, is ignored.
- Placement property test (E3, E4): 10,000 random cases of organic lists (0–40), boosted sets (0–30), organic boosted positions, batch sizes and filters; checks every cap, position rule, "matches filters" and no-repeat invariant.
- Announcement rules: "Call 555-123-4567" and "see example.com" are rejected at submit; a run lasts exactly 168 hours; the host page shows it at `starts_at` and not at `ends_at`; the feed hook returns it only while running.
- Reporting: seeded `listing_events` give the exact views per day before and during, saves and applications with source `boost` only, and "No comparison yet" when the boost started at publish. The registered boost windows source returns `ended_at` as the end of an `ended_early` boost and never returns `void` or `scheduled` ones.
- `stopPromotionsForOrg` ends, voids, refunds and removes exactly as section 8.5 says.
- E2E (Playwright, Stripe test mode in CI preview): an Admin boosts a listing for 7 days, pays with test card 4242, lands on the return page, and the listing appears second in Seek with "Boosted" for a matching seeker and absent for a non-matching filter.

**The 5 failure modes most likely to hurt real users**

| # | Failure | Test |
|---|---|---|
| 1 | **Paid but nothing delivered, or delivered twice:** the webhook is lost, delayed or duplicated | Duplicate `checkout.session.completed` creates one boost (*int*: two workers at once). With no webhook, the return page's `reconcilePurchase` and the 10-minute cron each fulfill from Stripe's session state |
| 2 | **The listing closes between checkout and payment, or before a queued boost starts** | Fulfillment produces a `void` boost, one full refund (idempotency key checked), both notifications, and no serving. A scheduled boost on a listing closed by `boosts.tick` is refunded once |
| 3 | **Caps broken or a boost shown outside the seeker's filters** (feels like spam, breaks the product promise) | The property test above, plus Swipe batch-boundary cases where a batch returns fewer than 20 cards |
| 4 | **The placement engine slows or breaks search** | `place` throwing, `matchIds` rejecting, and a 200 ms artificial delay each return organic results unchanged within the 120 ms budget; p95 added latency ≤ 30 ms at 50,000 listings and 500 active boosts |
| 5 | **Announcement credits lost or double-spent** | Two concurrent submits with 1 credit left: one succeeds, one gets 409 (*int*). Rejection keeps the credit; cancel returns it; a pack expiring while in review still lets the run start on approval |

## 12. Parallel workstreams

| Phase | Workstreams | Depends on |
|---|---|---|
| **A: Skeleton** (one agent) | Module folders `addons`, `boosts`, `announcements`, `promote` with every section 3 export as a typed stub; migration files `5000_addons.sql`, `5100_boosts.sql`, `5200_announcements.sql`; schema index and `job-handlers.ts` entries; the `addons.stripe_event` entry under `billing.stripe_event` in `src/server/event-subscribers.ts`; the settings key; the hiring/discovery import lint rule; fakes for the SP2, SP3, SP4 and SP5 interfaces in `tests/fakes/` | Foundation merged; SP2–SP5 contracts |
| **B** (in parallel) | **W1 addons** (5000–5099): price sync and seed script, checkout, the `addons.stripe_event` subscriber, reconcile, refunds, invite packs, seats, `revenueSummary` · **W2 boosts** (5100–5199): eligibility, fulfillment, tick, `placementHook`, `boostedAmong`, stats, report, the SP5 boost windows source · **W3 announcements** (5200–5299): CRUD, credits, moderation, tick, reminders, pins, cards, click route, stats · **W4 promote** (5300–5399, no tables): Feed hook, `recordPaidServes`, `stopPromotionsForOrg`, summary, privacy hooks | A. W2 and W3 call `addons.createCheckout` through its stub until W1 lands |
| **C** | **W5 screens:** Promote pages, return page, `AnnouncementCard`, the `boosted` props on `JobCard` and `MapPin`, and the touchpoints in SP2 (listing rows, host page pin) and SP3 (`placement-hook.ts`, card `boosted`) | A for layout against the API contracts; W1–W4 to finish |
| **D** | **W6 integration:** exit-criteria tests E1–E8, Stripe test-mode e2e, a seed of 500 boosts on the 50,000 synthetic listings for the latency check | everything above |

**Ownership rule:** each workstream owns its module folder and migration range. Shared files (`src/server/schedules.ts`, `src/server/event-subscribers.ts`, `src/db/schema.ts`, the notification `EmailTemplateName` union, `SettingValues`) change only at Phase A touchpoints. Feed behavior is contract-tested here and verified end to end in SP7, which is built after SP6.

## 13. Open items

| # | Item | Owner | Decide before |
|---|---|---|---|
| O1 | Prices and pack sizes for extra invite packs, and the extra seat price (monthly and annual). The code is ready; they go live when the Stripe prices exist | Founder | W6 (SP6 exit needs every add-on buyable) |
| O2 | Announcement packs as one-time monthly packs (this spec) or auto-renewing monthly subscriptions. The credit model is the same either way; auto-renew would add an SP2 subscription item | Founder | W3 starts |
| O3 | Whether the founding-host 30% discount also applies to add-ons. This spec: yes for extra seats (they're on the plan subscription, like extra slots), no for one-time add-ons. To exclude seats, SP2 restricts `founding_30_forever` with `applies_to` to the tier and slot products; SP2 section 8.7 changes to match either way | Founder | Stripe live mode (SP8) |
| O4 | Refund wording for boosts and packs in the host terms ("non-refundable once started; refunded in full if it can't start") | Founder and counsel | Launch legal review (SP8) |
| O5 | Additions this spec calls that the owning specs still have to make. **SP2:** section 8.8 emits `checkout.session.completed` and `checkout.session.expired` with `mode = 'payment'` (or `metadata.ee_purchase_id`) as `billing.stripe_event` instead of enqueuing `billing.sync_subscription`; sections 3 and 8.8 add `ee_extra_seat_month` and `ee_extra_seat_year` as known lookup keys, with `syncSubscription` granting `seat` entitlements for their quantity (key `plan:<subId>:seat_extra:<qty>`), and the extra-slot path unchanged; exports `previewSubscriptionAddon`, `setSubscriptionAddon`, `taxEnabled()` and `hostpages.listApprovedOrgPhotos`; names the `@/lib/stripe` client export `getStripe()`; section 8.7 lists extra seats under the founding discount (O3). **SP3:** `getListingEventCounts` adds `'apply'` to `types`, an optional `sources: DiscoverySource[]` filter, and `source` on each row; confirms the `BoostPlacementHook` shape, the 120 ms timeout and the `placement-hook.ts` touchpoint | SP2 and SP3 engineering | Phase A |
