# Sub-project 2: Host supply and billing technical design

- **Status:** design decided by engineering under the founder's end-to-end delegation (2026-11-03).
- **Parent:** [Product design spec](2026-11-03-explore-earn-product-design.md): section 25 row 2, plus sections 2, 3, 7, 8, 16, 19 (host verification) and 24. Built on [Foundation](2026-11-03-foundation-design.md) and its [plan](../plans/2026-11-03-foundation.md), using their exact names.
- **Convention:** product values are copied verbatim. Where the product spec is silent, the choice is labeled **Engineering decision**. Older `docs/v1` material is used only where it doesn't conflict.

## 1. Goal and done-when

**Goal:** a host can form a team, add locations, build a public host page, publish listings through automated checks, verification and screening, and pay through Stripe. The entitlements ledger built here is reused later for invite credits and seats.

**Done when** each row passes. End-to-end tests run on `pnpm db:local` with stub AI, media, weather, geocoder and link-safety providers. The billing rows run in Stripe **test mode** with test clocks.

| # | Exit criterion | Proven by |
|---|---|---|
| 1 | An operator runs `pnpm ops:founding-codes --count 1`. A new host signs up, enters the code at Checkout (card 4242 4242 4242 4242) and lands on `/host/billing` showing "Founding host". The Stripe subscription is `trialing`, with `trial_end` = `launch.public_at` + 90 days and coupon `founding_30_forever`. Professional shows 10 slots, 5 seats and 50 invite credits. | `tests/e2e/sp2-founding.spec.ts` |
| 2 | The host adds a logo, cover, About text and one location. `/hosts/<slug>` returns 200 with the name, home location and weather (stub "54°F · Partly sunny"). After publishing, it shows **Hiring now** and the badge tooltip "Active Explore&Earn host since [date]". | `sp2-hostpage.spec.ts` |
| 3 | The host fills builder sections 1–11. Review shows "Uses 1 of your 10 listing slots". The first publish runs business verification, then screening. The listing is `active` within 30 s, exactly one `listing.published` event exists, and audit has `verification.decided` and `listings.published`. | `sp2-publish.spec.ts` |
| 4 | Billing is correct after advancing the test clock past the trial: Professional monthly founding = **20930** cents (29900 × 0.7); Starter annual founding = **69300**; non-founding Starter monthly + 1 extra slot = **13800**. | `billing.stripe.int.test.ts` |
| 5 | On Starter (2 slots), a third publish returns 409 `conflict` with `details.reason = 'listing_slot_limit'`. Two concurrent publishes for the last slot leave exactly one holding it. Closing a listing frees its slot immediately. | `listings.slots.int.test.ts` |
| 6 | Downgrading Professional → Starter with 3 active listings requires choosing 2. The third becomes `closed` with `close_reason = 'downgrade'`, appears in Library, and its applicants are untouched. | `billing.change.test.ts` |
| 7 | A deleted subscription closes every active listing (`lapsed`) and hides the badge. Resubscribing within 6 months applies the founding coupon without a code. | `billing.sync.test.ts` |
| 8 | Time travel: "Still hiring?" fires at 30, 60, 90, 180 and 270 days, each exactly once. A fixed end date of 2027-08-31 in `Pacific/Honolulu` closes at 2027-09-01 10:00 UTC. A passed application deadline makes `canAcceptApplications` return `deadline_passed` while the listing stays `active` and holds its slot. Repost creates a draft with dates moved forward a year, opening at Review. | `listings.lifecycle.test.ts` |
| 9 | The Owner invites a Recruiter scoped to one location; the Recruiter sees only that location's listings. A Starter org (1 seat) gets 409 `seat_limit` when inviting. | `orgs.team.test.ts` |

When these pass, **private pre-launch begins**, after the Stripe live-mode item in section 13 is resolved.

## 2. Scope

**In scope:** teams, invitations, roles and recruiter scopes, ownership transfer, org deletion and the team activity log · locations, geocoding and National Weather Service weather · the canonical listing model with immutable published revisions, and the taxonomy (categories, genres, occupations, destinations, perks) · the listing builder with AI paste-import and AI description drafting · automatic checks, publishing, slots, reminders, auto-close, library and repost · the public host page and host follows · business verification, plus moderation and fraud screening on publish · Stripe plans (monthly and annual), extra listing slots, coupons and founding codes · the entitlements ledger · the host Home data (reminders and quota through `listings.getHomeSummary`; SP5 owns the screen), the `/pricing` page, and the shared `ListingDetailView` pattern used in Review.

**Deferred to other sub-projects:**

| Deferred item | Goes to |
|---|---|
| Search projection, Seek/Swipe/Map, the listing detail **route**, SEO sitemaps and JobPosting (SP2 supplies `listPublicHostSlugs` and host page metadata), `listing_events` | SP3 |
| Applications, the Additional step tick, seeker safety (reports, blocks, mutes; SP4 calls `hostpages.unfollow` on mute or block), the seeker "Following" list screen | SP4 |
| Pipeline, fit score, candidate invites (consuming `entitlements.consume('invite_credit')`), messaging, reply-time measurement and the As described data (both registered via `registerHostPageProvider`), analytics, reassigning a leaving member's threads, the `/host` Home screen (it renders `listings.getHomeSummary`) | SP5 |
| Boosts (the "Boosted until" row badge via `registerListingRowBadgeProvider`), announcements (pinned via `registerHostPageProvider`), extra invite packs and seats (granted via `entitlements.grant`), one-time Stripe purchases | SP6 |
| Operator console screens for billing ops, founding codes, refunds, free accounts, trial extensions and credit grants (SP8 calls the SP2 services); Stripe live mode; privacy exporter and eraser registration; launch date operations | SP8 |
| Listing provenance `sourced`, host-adjustable fit weights | After V1 |

## 3. Modules and contracts

**Imports** (A → B means A imports B; no cycles): `orgs` → `entitlements` · `billing` → `entitlements`, `orgs` · `verification` → `billing`, `locations`, `orgs` · `listings` → `orgs`, `locations`, `billing`, `entitlements`, `verification` · `hostpages` → `orgs`, `locations`, `billing`, `listings`. `locations` and `entitlements` import no SP2 module. Reverse flows go through domain events, never imports.

| Module | Owns |
|---|---|
| `src/modules/orgs` (extends Foundation's) | team, invitations, recruiter scopes, org status and settings, slugs, the activity log |
| `src/modules/locations` | locations, geocoding, weather, destinations |
| `src/modules/listings` | taxonomy, listings, revisions, checks, lifecycle, screening, library, repost, AI import and description, the host Home summary, listing row hooks |
| `src/modules/hostpages` | host page content, the public read model, follows, provider hooks |
| `src/modules/verification` | business verification signals and decisions |
| `src/modules/billing` | Stripe customers, subscriptions, plan changes, founding codes, webhooks, reconciliation |
| `src/modules/entitlements` | grants, consumptions, capacity checks |

```ts
// @/modules/entitlements
export type EntitlementKind = 'listing_slot' | 'seat' | 'invite_credit'; // SP6 extends the CHECK and this union
export type CapacityKind = 'listing_slot' | 'seat'; export type CreditKind = 'invite_credit';
export type GrantSource = 'plan' | 'operator' | 'pack' | 'addon'; export type Actor = { type: 'user' | 'operator' | 'system'; id: string | null };
export function grant(db: DbOrTx, i: { orgId: string; kind: EntitlementKind; quantity: number; source: GrantSource; sourceRef: string;
  validFrom?: Date; validUntil?: Date | null; idempotencyKey: string; actor: Actor; reason?: string }): Promise<{ grantId: string; created: boolean }>;
export function endGrant(db: DbOrTx, grantId: string, at: Date, actor: Actor): Promise<void>;
export function consume(db: DbOrTx, i: { orgId: string; kind: CreditKind; quantity?: number; subjectType: string; subjectId: string;
  idempotencyKey: string; actor: Actor }): Promise<{ ok: true; consumptionId: string; remaining: number } | { ok: false; reason: 'insufficient'; remaining: number }>;
export function reverse(db: DbOrTx, consumptionId: string, reason: string, actor: Actor): Promise<void>;
export function getBalance(db: DbOrTx, orgId: string, kind: CreditKind, now?: Date): Promise<{ balance: number; resetsAt: Date | null }>;
export function getCapacity(db: DbOrTx, orgId: string, kind: CapacityKind, now?: Date): Promise<{ limit: number; used: number }>;
/** Takes pg_advisory_xact_lock(org), re-counts usage, throws conflict {reason:'listing_slot_limit'|'seat_limit', limit, used}. */
export function withCapacity<T>(tx: Tx, orgId: string, kind: CapacityKind, adding: number, fn: () => Promise<T>): Promise<T>;
export function registerUsageCounter(kind: CapacityKind, count: (db: DbOrTx, orgId: string) => Promise<number>): void;
// @/modules/billing
export type PlanCode = 'starter' | 'professional' | 'enterprise'; export type BillingInterval = 'month' | 'year';
export const PLANS: Record<PlanCode, { monthlyCents: number; annualCents: number; slots: number; seats: number;
  inviteCredits: number; extraSlotMonthlyCents: number }>; // section 8 values; Stripe prices are authoritative for charging
export type SubscriptionState = { status: 'none' | 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete_expired' | 'paused';
  plan: PlanCode | null; interval: BillingInterval | null; extraSlots: number; entitled: boolean; canPublish: boolean; trialEnd: Date | null;
  currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; hostSince: Date | null; founding: 'none' | 'active' | 'lapsed' | 'forfeited' };
export function getSubscriptionState(db: DbOrTx, orgId: string): Promise<SubscriptionState>;
export function getSubscriberBadges(db: DbOrTx, orgIds: string[]): Promise<Map<string, { hostSince: Date }>>; // SP3 cards
export function ensureStripeCustomer(db: Db, orgId: string): Promise<string>; // SP6 one-time purchases
export function syncSubscription(db: Db, stripeSubscriptionId: string): Promise<void>;
export function getPendingKeepList(db: DbOrTx, orgId: string): Promise<string[] | null>;
export function createFoundingCodes(db: Db, i: { count: number; note: string; operatorId: string | null }): Promise<string[]>;
export function getFoundingCount(db: DbOrTx): Promise<{ redeemed: number; held: number; max: number }>;
// @/modules/orgs (additions)
export type RecruiterScope = { kind: 'all' } | { kind: 'assigned'; listingIds: string[]; locationIds: string[] };
export type HostCapability = 'listings.manage' | 'listings.approve' | 'hostpage.edit' | 'locations.manage' | 'team.manage'
  | 'org.transfer' | 'org.delete' | 'billing.plan' | 'billing.portal' | 'activity.read' | 'applicants.access' | 'messages.access' | 'invites.send';
export type Member = { membershipId: string; userId: string; displayName: string | null; email: string | null;
  role: OrgRole; scope: RecruiterScope | null; joinedAt: Date };
export function can(ctx: HostContext, cap: HostCapability): boolean; // the role matrix in section 10
export function listMembers(db: DbOrTx, orgId: string): Promise<Member[]>;
export function getListingAccess(db: DbOrTx, ctx: HostContext): Promise<{ all: true } | { all: false; listingIds: string[]; locationIds: string[] }>;
export function canAccessListing(db: DbOrTx, ctx: HostContext, l: { id: string; locationId: string | null }): Promise<boolean>; // SP5
export function getOrgStatus(db: DbOrTx, orgId: string): Promise<'active' | 'suspended' | 'banned'>;
// @/modules/locations
export type WeatherCondition = 'clear' | 'partly_cloudy' | 'cloudy' | 'rain' | 'snow' | 'storm' | 'fog' | 'wind';
export type Location = { id: string; orgId: string; name: string; kind: 'business_site' | 'port' | 'headquarters' | 'area';
  city: string; state: string; publicPoint: { lat: number; lng: number }; publicPrecision: 'exact' | 'city'; timezone: string; archived: boolean };
export function getLocations(db: DbOrTx, ids: string[]): Promise<Map<string, Location>>;
export function listOrgLocations(db: DbOrTx, orgId: string): Promise<Location[]>;
export function getWeather(db: DbOrTx, ids: string[]): Promise<Map<string, { temperatureF: number; condition: WeatherCondition; shortForecast: string; asOf: Date }>>; // omits stale
export function listDestinations(db: DbOrTx): Promise<{ slug: string; name: string; states: string[] }[]>; // SP3 landing pages
// @/modules/listings
export type ListingState = 'draft' | 'in_review' | 'active' | 'closed' | 'removed';
export type PublishedListing = { listingId: string; revisionId: string; orgId: string; content: ListingContent;
  firstPublishedAt: Date; publishedAt: Date; confirmedActiveAt: Date | null; autoCloseAt: Date | null; applicationsCloseAt: Date | null;
  provenance: 'host_created' | 'imported' | 'sourced' }; // applicationsCloseAt: from applying.deadline (section 8.2); the listing stays active after it
export function getPublishedListing(db: DbOrTx, listingId: string): Promise<PublishedListing | null>; // state active only
export function getRevision(db: DbOrTx, revisionId: string): Promise<PublishedListing & { state: ListingState }>; // SP4 snapshots
export function listActiveListings(db: DbOrTx, i: { after?: string; limit: number }): Promise<{ items: PublishedListing[]; next: string | null }>; // SP3 backfill
export function getListingSummaries(db: DbOrTx, ids: string[]): Promise<Map<string, { orgId: string; title: string; state: ListingState;
  locationId: string | null; primaryCategory: Category; publishedRevisionId: string | null }>>;
export function canAcceptApplications(db: DbOrTx, listingId: string, now?: Date): Promise<{ ok: true; revisionId: string }
  | { ok: false; reason: 'not_active' | 'org_inactive' | 'deadline_passed' }>; // SP4 apply
export type ListingStats = { views: number; saves: number; applications: number; hires: number };
export function registerListingStatsProvider(name: string, fn: (db: DbOrTx, ids: string[]) => Promise<Map<string, Partial<ListingStats>>>): void; // SP3/4/5
export function registerListingRowBadgeProvider(fn: (db: DbOrTx, orgId: string, ids: string[]) => Promise<Map<string, { label: string; href: string }>>): void; // SP6 "Boosted until [date]"
export type HomeReminder = { kind: 'still_hiring' | 'approval' | 'verification' | 'payment' | 'repost'; listingId: string | null; title: string; href: string; at: Date };
export function getHomeSummary(db: DbOrTx, ctx: HostContext): Promise<{ reminders: HomeReminder[]; quota: { listingSlots: { used: number; limit: number };
  seats: { used: number; limit: number }; inviteCredits: { balance: number; resetsAt: Date | null } }; setup: { location: boolean; plan: boolean; firstListing: boolean } }>; // SP5 Home (section 7)
export function normalizeSkill(label: string): { key: string; label: string }; // SP4/SP5 compare skills by key
export function listOccupations(db: DbOrTx): Promise<{ code: string; label: string; socCode: string; categories: Category[] }[]>;
export { ListingContentSchema, GENRES, PERKS }; // zod schema and code lists
// @/modules/hostpages
export type HostIdentity = { orgId: string; name: string; slug: string; logoMediaId: string | null; coverMediaId: string | null;
  subscriber: { hostSince: Date } | null; hiringNow: boolean; homeLocation: { city: string; state: string } | null };
export function getHostIdentities(db: DbOrTx, orgIds: string[]): Promise<Map<string, HostIdentity>>; // SP3 cards and map previews
export function listPublicHostSlugs(db: DbOrTx, i: { after?: string; limit: number }): Promise<{ items: { slug: string; updatedAt: Date }[]; next: string | null }>;
export function unfollow(db: DbOrTx, userId: string, orgId: string): Promise<void>;
export function listFollowerIds(db: DbOrTx, orgId: string, i: { after?: string; limit: number }): Promise<{ userIds: string[]; next: string | null }>;
export function registerHostPageProvider(p:
  | { kind: 'reply_time'; fn: (db: DbOrTx, orgId: string) => Promise<{ conversations: number; withinADay: boolean } | null> }            // SP5
  | { kind: 'as_described'; fn: (db: DbOrTx, orgId: string) => Promise<{ responses: number; housing: Tally; meals: Tally; pay: Tally } | null> } // SP5
  | { kind: 'pinned_announcement'; fn: (db: DbOrTx, orgId: string) => Promise<{ id: string; title: string; body: string; mediaId: string | null; endsAt: Date; ctaHref: string }[]> } // SP6
): void; // Tally = { yes: number; partly: number; no: number }
// @/modules/verification
export type VerificationStatus = 'unverified' | 'running' | 'verified' | 'needs_review' | 'needs_info' | 'failed';
export function getVerificationStatus(db: DbOrTx, orgId: string): Promise<VerificationStatus>;
export function startVerification(db: DbOrTx, orgId: string, triggerListingId: string): Promise<void>;
```

**Provider hooks.** Later sub-projects fill SP2's slots by calling the `register*Provider` functions at module load, so SP2 never imports them and never edits for them; a slot with no provider renders nothing. SP5 registers `reply_time` (from `messaging.getReplyStats`, mapping `usuallyRepliesWithinDay` to `withinADay`) and `as_described` (from `getAsDescribedSummary`, returning null unless `visible`). SP6 registers `pinned_announcement` (every announcement running on the host page, newest first; an empty list hides the stack) and the listing row badge, instead of editing SP2 screens.

**`ListingContent`** (the zod schema `ListingContentSchema`, version 1). Drafts are `DeepPartial<ListingContent>`. Plain text only; lists are arrays.

```ts
type Category = 'maritime' | 'seasonal' | 'farm' | 'remote';
type Cost = { free: true } | { free: false; cents: number; period: 'day' | 'week' | 'month' | 'season'; paidBy: 'deducted' | 'direct' };
type ListingContent = {
  basics: { title: string; primaryCategory: Category; genre: string; secondaryCategory: Category | null; occupationCode: string;
    openings: number; employmentType: 'employee' | 'contractor'; schedule: 'full_time' | 'part_time' };
  where: { mode: 'onsite'; locationId: string } | { mode: 'remote'; scope: 'all_us' | 'states'; states: string[]; hostLocationId: string };
  when: { dates: { mode: 'fixed'; start: string; end: string } | { mode: 'season'; season: 'spring' | 'summer' | 'fall' | 'winter' | 'year_round'; year: number }
    | { mode: 'ongoing'; start: string | null }; weeklyHours: number; minCommitment: string | null };
  pay: { kind: 'fixed' | 'range'; minCents: number; maxCents: number; unit: 'hour' | 'day' | 'week' | 'month' | 'season' | 'year' | 'crew_share';
    crewShareEstimate: { minCents: number; maxCents: number; per: 'week' | 'month' | 'season' } | null; overtime: boolean; tips: boolean;
    bonuses: string | null; frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'end_of_season' | 'per_trip'; deductions: string | null };
  housing: { provided: false } | { provided: true; type: 'dorm' | 'shared_room' | 'private_room' | 'cabin' | 'rv_site' | 'berth'; cost: Cost;
    photos: { bedroom: string; bathroom: string; kitchen: string; exterior: string }; note: string;
    finePrint: { roommates: number | null; pets: boolean; couples: boolean; wifi: boolean; utilitiesIncluded: boolean; notes: string | null } };
  meals: { provided: false } | { provided: true; perDay: 1 | 2 | 3; days: 'every_day' | 'work_days'; cost: Cost;
    photos: { kitchen: string; meal_example: string; dining_area: string; other: string }; note: string; dietary: string | null };
  genreDetails:
    | { category: 'maritime'; vesselType: string; homePort: string; rotation: string | null; timeAtSea: string | null; documents: ('twic' | 'mmc' | 'stcw')[] }
    | { category: 'seasonal'; destinationSlug: string | null; staffPerks: string[] }
    | { category: 'farm'; operationType: string; harvestWindow: string | null; equipment: string[]; certifications: string[] }
    | { category: 'remote'; timeZoneOverlap: string; equipmentProvided: string | null; internet: string | null; travel: 'none' | 'occasional' | 'regular' };
  job: { description: string; responsibilities: string[]; typicalDay: string | null; requiredQualifications: string[]; preferredQualifications: string[];
    skills: string[]; certifications: string[]; physicalDemands: string | null; minAge: number; perks: string[]; visaSponsorship: 'none' | 'j1' | 'h2a' | 'h2b' };
  photos: { coverMediaId: string; galleryMediaIds: string[] };
  applying: { questions: ScreeningQuestion[]; additionalStep: { url: string; note: string } | null; deadline: string | null; notifyMemberIds: string[] };
};
type ScreeningQuestion = { id: string; prompt: string; required: boolean } &
  ({ type: 'short_answer' } | { type: 'yes_no' } | { type: 'multiple_choice'; choices: string[]; allowMultiple: boolean });
```

**Domain events.** Engineering decision: SP2 adds `emit(db, event, payload, eventId)` to `@/modules/jobs`. It enqueues one outbox row per handler topic listed for that event in the new shared touchpoint `src/server/event-subscribers.ts` (`Record<string, string[]>`). Each row's dedupe key is `<eventId>:<topic>`. Later sub-projects append their subscriber topics there.

| Event | Payload | SP2 subscribers (later ones append theirs) |
|---|---|---|
| `listing.published` | `{ listingId, revisionId, orgId, first }` | `hostpages.notify_followers` (when `first`) |
| `listing.changed` · `listing.closed` · `listing.removed` | `{ listingId, revisionId?, orgId, reason? }` | none; SP3 projects them |
| `org.status_changed` · `org.member_removed` | `{ orgId, status }` · `{ orgId, userId, reassignToUserId }` | `listings.close_for_org` · none (SP5 moves threads and interviews) |
| `location.updated` · `hostpage.updated` | `{ locationId, orgId }` · `{ orgId }` | `locations.resolve_nws_grid` · none |
| `subscription.changed` | `{ orgId, status, plan }` | `listings.enforce_slot_limit` |
| `verification.decided` | `{ orgId, status }` | `listings.resume_screening` |
| `billing.stripe_event` | `{ eventId, type, objectId }` | none (SP6 subscribes for one-time payments) |

**Touchpoints in Foundation code.** Each is made by workstream W0 in one commit. Nothing else outside SP2 modules changes.

| Where | Change |
|---|---|
| `@/modules/trust` | `RunCheckInput.kind` adds `listing_moderation`, `listing_fraud`, `business_verification` and `photo_slot`. `RunCheckInput.reviewQueue?: Queue \| null` is added (default `'moderation'`; `null` opens no item). Prompts go in `trust/prompts/<kind>.ts`. `raiseAlert` is exported. |
| `@/modules/settings` | Adds the section 8 keys to `SettingValues` and `SETTING_DEFAULTS`, and extends `trust.thresholds` with the four new kinds |
| `@/modules/notifications` | `EmailTemplateName` adds `HostNotice`, `TeamInvite` and `BillingNotice`. Adds `sendEmailTo(db, { to, template, data, category })` for people without an account. |
| `@/modules/media` | Adds `getMediaInfo(db, ids): Promise<Map<id, { ownerOrgId, kind, status, altText, width, height }>>` |
| `@/modules/audit` | Adds `orgId` and `actionPrefixes: string[]` filters to `searchAudit` |
| `@/modules/identity` | `ClerkAdmin` adds `addMembership(clerkOrgId, clerkUserId, clerkRole)`, `removeMembership`, `updateMembershipRole` and `deleteOrganization`. The onboarding redirect in `src/proxy.ts` exempts `/join/*`. |
| `@/modules/jobs`, `src/server/event-subscribers.ts` | `emit()` and the subscriber map (above) |
| `src/lib/ai.ts` | Adds `extract<T>({ model: 'claude-sonnet-5-5', system, text, schema, promptVersion })` and `write({ model: 'claude-sonnet-5-5', system, prompt, maxChars })`, with stubs. Implementers load the `claude-api` skill. |
| `src/lib/env.ts`, `src/lib/security-headers.ts`, `src/lib/stripe.ts` (new) | Section 9 variables and the prod stub guard; CSP adds `api.mapbox.com`, `events.mapbox.com` and `worker-src blob:`; the Stripe client is pinned to the SDK's API version |
| `src/server/schedules.ts`, `src/server/job-handlers.ts`, `src/db/schema.ts`, `package.json` | Appended lines; `package.json` adds the `stripe` and `disposable-email-domains` dependencies and the scripts `stripe:seed` and `ops:founding-codes` |

## 4. Data model

Every table lives in `app`, has RLS enabled with no policies, uses UUIDv7 `id` (unless noted), and has `created_at`/`updated_at` with `app.set_updated_at()`. Money is integer cents with `currency text not null default 'USD'`. Enumerations are CHECK constraints.

| Migration · table | Columns | Constraints and indexes |
|---|---|---|
| `1000_orgs` · `organizations` (alter) | `status text default 'active'` (`active`,`suspended`,`banned`), `website_url text`, `require_recruiter_approval bool default false`, `primary_location_id uuid` (FK in 1100), `verification_status text default 'unverified'` (the `VerificationStatus` values), `verified_at` | `website_url ~ '^https://'` |
| `org_memberships` (alter) | `recruiter_scope text not null default 'all'` (`all`,`assigned`), `invited_by uuid → users` | — |
| `member_assignments` | `membership_id → org_memberships on delete cascade`, `listing_id uuid` (FK in 1200), `location_id uuid` (FK in 1100) | `num_nonnulls(listing_id, location_id) = 1`; unique `(membership_id, listing_id)` and `(membership_id, location_id)` |
| `org_invitations` | `org_id`, `email text` (lowercased), `role` (`admin`,`recruiter`,`billing`), `recruiter_scope`, `assign_listing_ids uuid[]`, `assign_location_ids uuid[]`, `token_hash text unique` (sha256 of 32 random bytes), `status` (`pending`,`accepted`,`revoked`), `expires_at`, `invited_by`, `accepted_user_id` | unique `(org_id, email)` where `status = 'pending'`. "Expired" means pending with `expires_at < now()`, computed at read time. |
| `org_slugs` | `slug text pk`, `org_id`, `retired_at` | Every slug ever used; retired slugs 301-redirect and are never reissued |
| `1100_locations` · `locations` | `org_id`, `name` (1–80), `kind` (`business_site`,`port`,`headquarters`,`area`), `address_line1`, `city`, `state`, `postal_code`, `point geography(Point,4326) not null` (private), `public_point geography not null`, `public_precision` (`exact`,`city`; default `city`), `timezone text` (IANA), `nws_forecast_url`, `archived_at`, `created_by` | `state ~ '^[A-Z]{2}$'` (50 states, DC, PR, VI, GU, AS, MP, validated in code); gist on `public_point`; `(org_id)` where `archived_at is null` |
| `location_weather` | `location_id pk → locations on delete cascade`, `temperature_f int`, `condition` (`WeatherCondition`), `short_forecast`, `period_start`, `fetched_at`, `failures int default 0`, `last_error` | — |
| `destinations` | `slug text pk`, `name`, `kind` (`national_park`,`resort_area`,`region`,`other`), `states text[]`, `point geography`, `active bool` | Seeded by `1110_destinations_seed` (the 63 national parks plus resort areas) |
| `1200_listings` · `occupations` | `code text pk` (`^[a-z0-9_]+$`), `label`, `soc_code` (O*NET-SOC 2019), `categories text[]`, `active bool` | Seeded by `1210_occupations_seed` (at least 120 entries covering every genre) |
| `listings` | `org_id`, `state` (the `ListingState` values; default `draft`), `review_stage` (`team_approval`,`verification`,`screening`,`moderation`), `provenance` (`host_created`,`imported`,`sourced`), `copied_from_id`, `reposted_from_id`, `draft jsonb default '{}'`, `draft_version int default 0`, `section_versions jsonb default '{}'`, `ai_filled_fields text[]`, `title` and `location_id` (kept in sync from the draft or live revision, for lists and scopes), `published_revision_id`, `pending_revision_id`, `first_published_at`, `published_at`, `confirmed_active_at`, `next_reminder_at`, `reminders_sent int default 0`, `auto_close_at`, `closed_at`, `close_reason` (`host`,`end_date`,`downgrade`,`lapsed`,`org_suspended`), `removed_at`, `repost_reminded_year int`, `created_by`, `last_edited_by` | `review_stage is not null` iff `state = 'in_review'` or `pending_revision_id is not null`; indexes `(org_id, state)`, `(next_reminder_at) where state = 'active'`, `(auto_close_at) where state = 'active'`, `(first_published_at)` |
| `listing_revisions` | `listing_id`, `org_id`, `revision_number`, `status` (`screening`,`in_review`,`approved`,`rejected`,`superseded`), `schema_version int default 1`, `content jsonb` (`ListingContent`), plus typed copies for queries: `title`, `primary_category`, `secondary_category`, `genre`, `occupation_code`, `employment_type`, `schedule`, `openings`, `location_id`, `public_point geography`, `state_code`, `remote_scope`, `remote_states text[]`, `date_mode` (`fixed`,`season`,`ongoing`), `start_date date`, `end_date date`, `season`, `season_year`, `weekly_hours numeric(4,1)`, `pay_kind`, `pay_min_cents`, `pay_max_cents`, `pay_unit`, `crew_min_cents`, `crew_max_cents`, `crew_per`, `housing_provided bool`, `housing_free bool`, `housing_cost_cents`, `housing_cost_period`, `meals_provided bool`, `meals_free bool`, `meals_cost_cents`, `meals_cost_period`, `visa_sponsorship`, `min_age`, `cover_media_id`, `deadline date`, `timezone`, `checks jsonb`, `acknowledged_warnings text[]`, `trust_check_ids uuid[]`, `submitted_by`, `submitted_at`, `decided_at` | unique `(listing_id, revision_number)`; `pay_min_cents > 0 and pay_max_cents >= pay_min_cents`; housing never unknown: `(housing_provided and housing_free is not null) or (not housing_provided and housing_free is null and housing_cost_cents is null)`; `housing_free or not housing_provided or housing_cost_cents > 0` (same rules for meals); `date_mode <> 'fixed' or end_date >= start_date`; `pay_unit <> 'crew_share' or crew_min_cents is not null`; `min_age >= 18`. Trigger `app.listing_revision_immutable()` rejects content changes once `status = 'approved'`; only `approved → superseded` is allowed. Index `(listing_id, status)`. |
| `photo_slot_checks` | `media_id`, `slot` (`bedroom`,`bathroom`,`kitchen`,`exterior`,`meal_example`,`dining_area`,`other`), `result` (`pending`,`match`,`mismatch`,`error`), `check_id` | pk `(media_id, slot)` |
| `link_domains` | `domain text pk`, `status` (`allowed`,`blocked`,`unknown`), `source` (`web_risk`,`operator`,`rule`), `threat_types text[]`, `checked_at` | Rechecked when `checked_at` is older than 30 days |
| `1300_hostpages` · `host_pages` | `org_id pk → organizations`, `content jsonb` (`HostPageContent`), `pending_content jsonb`, `pending_check_id`, `first_public_at`, `updated_by` | — |
| `host_follows` | `user_id → users`, `org_id → organizations`, `created_at` | pk `(user_id, org_id)`; index `(org_id, created_at)` |
| `1400_verification` · `business_verifications` | `org_id`, `trigger_listing_id`, `status` (`running`,`verified`,`needs_review`,`needs_info`,`failed`), `signals jsonb`, `check_id`, `review_item_id`, `info_request`, `info_response`, `decided_by` (`auto`,`operator`), `decided_at` | index `(org_id, created_at desc)` |
| `1500_billing` · `billing_accounts` | `org_id pk`, `stripe_customer_id text unique`, `host_since timestamptz`, `founding_status` (`none`,`active`,`lapsed`,`forfeited`), `founding_code_id`, `founding_lapsed_at`, `open_checkout_session_id`, `open_checkout_expires_at` | — |
| `subscriptions` | `org_id`, `stripe_subscription_id text unique`, `status` (the Stripe values in `SubscriptionState`), `plan` (`PlanCode`), `interval` (`month`,`year`), `extra_slots int default 0`, `current_period_start`, `current_period_end`, `trial_end`, `cancel_at_period_end bool`, `ended_at`, `coupon_id`, `last_synced_at` | unique `(org_id)` where `status in ('incomplete','trialing','active','past_due','unpaid','paused')`; `extra_slots between 0 and 50` |
| `billing_changes` | `org_id`, `to_plan`, `to_interval`, `to_extra_slots`, `keep_listing_ids uuid[]`, `status` (`pending`,`applied`,`failed`), `requested_by`, `error` | unique `(org_id)` where `status = 'pending'` |
| `founding_codes` | `code_hash text unique` (sha256 of the normalized code), `last4`, `status` (`available`,`held`,`redeemed`,`revoked`), `held_by_org_id`, `held_until`, `redeemed_org_id uuid unique`, `redeemed_at`, `note`, `created_by` | — |
| `1600_entitlements` · `entitlement_grants` | `org_id`, `kind` (`EntitlementKind`), `quantity int`, `source` (`GrantSource`), `source_ref`, `valid_from`, `valid_until` (null means open-ended), `idempotency_key text unique`, `reason`, `created_by` | `quantity > 0`; index `(org_id, kind, valid_from)`. Append-only, except `valid_until` can be set once (an `endGrant`). |
| `entitlement_consumptions` | `org_id`, `grant_id → entitlement_grants`, `kind`, `quantity int`, `subject_type`, `subject_id`, `idempotency_key text unique`, `reversed_at`, `reversal_reason`, `created_by` | `quantity > 0`; index `(grant_id) where reversed_at is null` |

**`HostPageContent`** (zod): `{ logoMediaId, coverMediaId, about: { story ≤5,000, perks ≤20, social ≤6 of { kind: 'instagram'|'facebook'|'tiktok'|'youtube'|'linkedin'|'x', url } }, photos ≤24 of { mediaId, caption ≤140 | null }, team ≤12 of { name ≤60, title ≤60, mediaId | null, bio ≤300 | null }, teamConsent: boolean, faq ≤15 of { q ≤200, a ≤1,000 } }`.

Media kinds are reused, with no new kinds: `logo`, `cover`, `listing_photo` (host page photos too), `housing_photo`, `meal_photo`, `avatar` (team photos). **Usage counters:** `listing_slot` = listings with `state in ('in_review','active')` (registered by `listings`); `seat` = memberships plus unexpired pending invitations (registered by `orgs`).

## 5. API (`/api/v1`, all through `apiRoute`)

Auth notation: `host:<roles>` is `requireHost({ roles })`, where O = Owner, A = Admin, R = Recruiter (scope-checked with `canAccessListing`) and B = Billing. "reverify" means Clerk `has({ reverification: 'strict' })`; when it fails, the response is 403 `forbidden` with `details.reason = 'reverification_required'`. Errors use the Foundation envelope; `details.reason` carries the machine reason named below. Inputs are zod; `[id]` is a UUID.

| Method · path | Auth | Input → output |
|---|---|---|
| GET `/host/team` | host:OARB | → `{ members: Member[], invitations?: Invitation[]` (O/A only)`, seats: { used, limit } }` |
| POST `/host/team/invitations` · DELETE `/host/team/invitations/[id]` | host:OA · POST limited to 30/h per org | `{ email, role: 'admin'\|'recruiter'\|'billing', scope?: RecruiterScope }` → `{ invitation }`. 409 `seat_limit` or `already_member`. · DELETE → `{ ok: true }` |
| GET `/team/invitations/[token]` | none | → `{ orgName, logoUrl, role, expiresAt, emailHint }` (masked, e.g. `ma***@kettle.com`) |
| POST `/team/invitations/accept` | user | `{ token }` → `{ redirectTo: '/host' }`. 403 `email_mismatch`; 409 `seeker_account`, `expired` or `seat_limit`. |
| PATCH `/host/team/members/[id]` | host:OA | `{ role?, scope? }` → `Member`. Admins can't change the Owner or grant owner. |
| DELETE `/host/team/members/[id]` | host:OA, or self to leave | → `{ ok: true }`. 409 `owner_must_transfer`. |
| POST `/host/team/transfer-ownership` | host:O + reverify | `{ membershipId }` (the target must be an Admin) → `{ ok: true }` |
| GET `/host/team/activity` | host:OA | `{ before? }` → `{ items: { at, actorLabel, action, summary }[], nextBefore }` |
| PATCH `/host/org` | host:OA | `{ name?, websiteUrl?, requireRecruiterApproval?, primaryLocationId? }` → `Org` |
| DELETE `/host/org` | host:O + reverify | `{ confirmName }` → `{ redirectTo: '/onboarding' }` |
| GET `/host/locations` | host:OAR | → `Location[]` (Recruiters with assigned scope see only their locations) |
| POST `/host/locations/geocode` | host:OA · 30/min | `{ line1, city, state, postalCode? }` → `{ candidates: { lat, lng, matched }[] }` |
| POST `/host/locations` · PATCH `/host/locations/[id]` | host:OA | `{ name, kind, address?, point?: { lat, lng }, publicPrecision, timezone? }` → `Location` |
| DELETE `/host/locations/[id]` | host:OA | Archives it. 409 `location_in_use` while an active listing uses it. |
| GET `/host/page` · PUT `/host/page` | host:OA | → `{ content, pending, status }` · `HostPageContent` → `{ status: 'live'\|'checking'\|'in_review' }` |
| PUT `/host/page/slug` | host:OA | `{ slug }` → `{ slug }`. 409 `slug_taken`; 400 `slug_reserved`. |
| GET `/hosts/[slug]` | none | → `HostPagePublic` (identity, stats, pinned announcements, jobs grouped by location with weather, tabs). 301 for a retired slug; 404 when not public. |
| PUT · DELETE `/hosts/[slug]/follow` | seeker · 60/h | → `{ following: boolean }` |
| GET `/me/follows` | seeker | → `{ items: HostIdentity[] }` |
| GET `/host/listings` | host:OAR | `{ tab: 'active'\|'drafts'\|'library', q?, locationId?, before? }` → `{ items: ListingRow[], nextBefore, slots: { used, limit } }` (with stats and row badges from providers) |
| POST `/host/listings` | host:OAR · paste 20/h per org | `{ start: 'blank' } \| { start: 'copy', listingId } \| { start: 'paste', text (50–20,000) }` → `{ id, openSection }` |
| GET `/host/listings/[id]` | host:OAR | → `{ listing, draft, draftVersion, sectionVersions, live, pending, checklist, aiFilledFields }` |
| PATCH `/host/listings/[id]/draft` | host:OAR | `{ section, baseVersion, data }` → `{ draftVersion, sectionVersions, checklist }`. 409 `section_conflict` returns the server's copy of that section. |
| POST `/host/listings/[id]/ai/description` | host:OAR · 30/h per org | `{ bullets: string[] (1–20) }` → `{ description }` |
| POST `/host/listings/[id]/checks` | host:OAR | → `{ errors: Issue[], warnings: Issue[], slot: { used, limit } }` where `Issue = { code, section, field, message }` |
| POST `/host/listings/[id]/publish` | host:OAR | `{ acknowledgedWarnings: string[] }` → `{ state, reviewStage }`. 400 with `details.issues`; 409 `listing_slot_limit`, `not_entitled`, `past_due`, `org_suspended` or `verification_failed`. |
| POST `/host/listings/[id]/approval` | host:OA | `{ decision: 'approve'\|'return', note? }` → `{ state, reviewStage }` |
| POST `/host/listings/[id]/close` · `/confirm-active` | host:OAR | → `{ state: 'closed' }` · → `{ confirmedActiveAt }` (the "Still hiring?" Yes) |
| POST `/host/listings/[id]/repost` | host:OAR | → `{ id, openSection: 'review' }`. 409 for a `removed` listing. |
| POST `/host/listings/[id]/request-review` | host:OAR | `{ note (≤1,000) }` → `{ ok: true }`. Opens a `moderation` item, or an `appeals` item via `trust.openAppeal` if an operator removed the listing. |
| DELETE `/host/listings/[id]` | host:OAR | Only for listings never published → `{ ok: true }` |
| GET `/host/verification` · POST `/host/verification/info` | host:OA | → `{ status, infoRequest }` · `{ text (≤2,000), websiteUrl? }` → `{ status: 'needs_review' }` |
| GET `/host/billing` | host:OAB | → `{ subscription: SubscriptionState, prices, usage, founding }` (Billing members get no listing data) |
| POST `/host/billing/checkout` | host:OA · 10/h | `{ plan, interval, extraSlots (0–50), foundingCode? }` → `{ url }`. 409 `has_subscription` or `founding_unavailable`; 400 `code_invalid` or `code_required` (before launch). |
| GET `/host/billing/complete` | host:OAB | `{ session_id }` → `{ status }`. Fetches the session from Stripe and runs `syncSubscription`. |
| POST `/host/billing/preview` | host:OA | `{ plan, interval, extraSlots }` → `{ dueNowCents, nextInvoiceCents, nextInvoiceAt, newLimits, mustChooseListings: number }` |
| POST `/host/billing/change` | host:OA | `{ plan, interval, extraSlots, keepListingIds? }` → `{ status: 'applied'\|'failed', subscription }`. 400 `keep_list_required`; 409 `seat_limit`. |
| POST `/host/billing/portal` | host:OAB | → `{ url }` (O/A get the full portal configuration; B gets invoices and payment method only) |
| GET `/host/entitlements` | host:OARB | → `{ listingSlots: { used, limit }, seats: { used, limit }, inviteCredits: { balance, resetsAt } }` |
| POST `/api/webhooks/stripe` | Stripe signature | Raw body → 200 `{ received: true }` |

## 6. Jobs, notifications, trust and audit

**Outbox topics and schedules.** Each topic's handler sits in its module's `jobHandlers`. Schedules are appended to `src/server/schedules.ts` and run in UTC.

| Topic | Trigger · cron | Does |
|---|---|---|
| `listings.screen` | on publish (dedupe `screen:<revisionId>`) | Runs the section 8.3 pipeline. Waits for pending media by re-enqueueing at +30 s, up to 20 times. |
| `listings.photo_slot_check` | a housing or meal photo is set (dedupe `slot:<mediaId>:<slot>`) | `runCheck({ kind: 'photo_slot', reviewQueue: null })` on the 640 px variant |
| `listings.resume_screening` · `listings.enforce_slot_limit` · `listings.close_for_org` | event subscribers | Continue after verification; close over-limit listings (section 8.6); close every listing on suspension or ban |
| `listings.still_hiring_sweep` | `0 * * * *` | Active listings with `next_reminder_at <= now` get `listings.still_hiring`, then the next milestone is set |
| `listings.auto_close` | `5 * * * *` | Closes active listings with `auto_close_at <= now` |
| `listings.repost_reminders` | `0 15 * * *` | The "Repost reminder" rule in section 8.2 |
| `locations.resolve_nws_grid` | `location.updated` | NWS points lookup: stores `nws_forecast_url` and suggests a timezone |
| `locations.refresh_weather` | `*/30 * * * *` | Locations of entitled orgs; concurrency 5; 5 s timeout each |
| `hostpages.check_content` | on save | `runCheck({ kind: 'text_safety' })` on the changed text; applies or holds `pending_content` |
| `hostpages.notify_followers` | `listing.published` with `first` | Pages through followers 500 at a time; `notify(..., 'hosts.new_job')` |
| `verification.run` | `startVerification` | Section 8.4 |
| `billing.sync_subscription` | webhook (dedupe `stripe:<eventId>`) | `syncSubscription` |
| `billing.grant_monthly_credits` | `10 0 * * *` | Idempotent monthly invite-credit grants |
| `billing.apply_launch_date` | `20 * * * *` | Sets founding `trial_end` (section 8.7) |
| `billing.reconcile` | `0 7 * * *` | Re-syncs every non-ended subscription, plus Stripe subscriptions created in the last 2 days that are missing here; drift calls `raiseAlert` (warning) |

**Notification types** (`defineType`). Recipient groups: **listing team** = the listing's creator plus its `notifyMemberIds`, among members who can access the listing; **owner/admins**; **billing contacts** = Owner, Admins and Billing members.

| Type | Category | Channels | Batching | Recipients |
|---|---|---|---|---|
| `listings.live` | jobs | in-app, email | none | listing team |
| `listings.in_review` ("We're taking a closer look") | jobs | in-app | none | listing team |
| `listings.returned` (rejected, ask for info, or approval returned) | account | in-app, email, push | none | listing team |
| `listings.removed` | account (mandatory) | in-app, email | none | listing team, owner/admins |
| `listings.approval_requested` · `listings.approval_decided` | jobs | in-app, email, push | none | owner/admins · the requesting Recruiter |
| `listings.still_hiring` ("Still hiring?" Yes / Edit / Close) | jobs | in-app, email, push | none | listing team |
| `listings.auto_closed` · `listings.repost_reminder` | jobs | in-app, email | none | listing team · owner/admins |
| `orgs.invitation` (via `sendEmailTo`, `TeamInvite` template) | account | email | none | the invitee's address |
| `orgs.member_joined` · `orgs.member_changed` | account | in-app · in-app, email | none | owner/admins · the member |
| `orgs.ownership_transferred` | security (mandatory) | in-app, email | none | the old and new Owner |
| `verification.needs_info` (mandatory) · `verification.decided` | account | in-app, email | none | owner/admins |
| `billing.subscription_started` · `billing.plan_changed` · `billing.trial_ending` · `billing.subscription_ended` | billing (mandatory) | in-app, email | none | billing contacts |
| `billing.payment_failed` | billing (mandatory) | in-app, email, push | none | billing contacts |
| `hostpages.content_held` | account | in-app, email | none | owner/admins |
| `hosts.new_job` | jobs | in-app, push, email | email key `host_follow`, 60 minutes | followers |

Email templates: `HostNotice` (heading, lines, one button), `TeamInvite` and `BillingNotice`. Email buttons open app pages; a GET never changes state.

**Trust check kinds and queues** (thresholds live in `trust.thresholds`; a `classifier_error` always becomes `needs_review`):

| Kind | Input | Approve below · reject at or above | Queue on `needs_review` |
|---|---|---|---|
| `listing_moderation` | Every text field, the screening questions and the Additional step note | 0.2 · 0.9 | `moderation` |
| `listing_fraud` | The same text, plus pay vs. occupation and org signals | 0.2 · 0.95 | `fraud` |
| `business_verification` | The section 8.4 signal summary and website text | 0.3 · 1.01 (never auto-rejected) | `fraud` |
| `photo_slot` | The 640 px image and its slot label; score = probability of a mismatch | 0.5 · 0.5 (no review band) | none (`reviewQueue: null`) |
| `text_safety` (Foundation) | Host page text | Foundation defaults | `moderation` |

**Subject handlers** (`registerSubjectHandlers`):

| Subject | approve | remove | ask_info | suspend / ban |
|---|---|---|---|---|
| `listing_revision` | Publishes the revision once no other open items remain on it | Rejects the revision; the listing returns to draft if it was never live, otherwise the old revision stays live | Rejects with the operator's note | Org `suspended` / `banned` |
| `listing` (SP4 reports) | Dismisses the report | State `removed` and the slot is freed | Notifies the listing team | Same as above |
| `organization` | Verification `verified`; emits `verification.decided` | Verification `failed`; pending listings return to draft | `needs_info` with the note | Same as above; a ban also cancels the Stripe subscription immediately, without proration |
| `host_page` | Applies `pending_content` | Discards it | Notifies | Same as above |

**Audit actions** (`audit.record`, inside the same transaction): `orgs.member_invited`, `orgs.invitation_revoked`, `orgs.invitation_accepted`, `orgs.member_changed`, `orgs.member_removed`, `orgs.ownership_transferred`, `orgs.updated`, `orgs.deleted`, `orgs.status_changed`, `orgs.slug_changed` · `locations.created`, `locations.updated`, `locations.archived` · `hostpages.updated`, `hostpages.followed` · `listings.created`, `listings.imported`, `listings.publish_requested`, `listings.approval_decided`, `listings.published`, `listings.revision_rejected`, `listings.closed`, `listings.removed`, `listings.reposted`, `listings.confirmed_active`, `listings.deleted` · `verification.started`, `verification.decided` · `billing.checkout_started`, `billing.subscription_synced`, `billing.plan_changed`, `billing.founding_redeemed`, `billing.founding_codes_created` · `entitlements.granted`, `entitlements.grant_ended`, `entitlements.consumed`, `entitlements.reversed`.

The team activity log shows the `orgs.`, `locations.`, `hostpages.`, `listings.` and `billing.plan_changed` actions for the org. Operator actors display as "Explore&Earn" and system actors as "Explore&Earn (automatic)".

## 7. Screens

Screen work starts only after the Foundation design gate. New patterns are added to `src/ui/patterns` with gallery entries: `BuilderRail`, `RequiredChecklist`, `PhotoSlotGrid`, `ListingDetailView` (presentational and props-only; SP3 reuses it for the public detail route), `HostHeader`, `WeatherLine`, `PlanCard`, and `LocationPicker` (loads Mapbox GL only when opened).

Every list screen has an `EmptyState`, a `Skeleton` while loading, and an `ErrorState` with a retry. Every host route uses the Foundation host shell (`Sidebar` with `OrgSwitcher` on desktop, `BottomNav` on mobile).

| Route | Design system components | States and notes | Mobile / desktop |
|---|---|---|---|
| `/host` Home (data only) | None: SP5 owns the screen and renders this data | `listings.getHomeSummary` supplies reminders (the latest unanswered "Still hiring?", Recruiter listings awaiting approval, verification `needs_info`, `past_due` payment, repost reminders), quota (slots, seats, credits) and setup steps (location, plan, first listing). Reminders follow the caller's recruiter scope; Billing members get quota and payment only. Until SP5 ships, Foundation's placeholder Home stays. | — |
| `/host/listings` | `Tabs` (Active / Drafts / Library), rows with `Pill` state, `Badge` "Unpublished changes", provider row badge `Pill` (links to its `href`), `Input` search, `Select` location | Empty: "No listings yet" with Create. Library stats show "—" until providers register; no badge renders without a provider. | List / table |
| `/host/listings/new` | 3 `Card` options (Blank, Copy a past listing, Paste a job post), `Textarea` | Paste shows `Skeleton` while AI parses; on failure: `ErrorState` "We couldn't read that post. Start blank instead." | Same |
| `/host/listings/[id]/edit/[section]` | `BuilderRail`, `RequiredChecklist`, `Input`, `Textarea`, `Select`, `Combobox` (occupation, destination), `SegmentedControl`, `Switch`, `Checkbox`, `Radio`, `Slider` (weekly hours), `PhotoSlotGrid`, live `JobCard` with `Chip` → `Sheet` pop-ups, `Toast` "Saved" | AI-filled fields carry a "Check this" `Badge` until edited or confirmed. Offline: "Not saved yet · Retrying". A `section_conflict` offers "Use theirs / Keep mine". | One section per screen with Back/Next and a Preview `Sheet` / left rail, form, and live preview on the right |
| `.../edit/review` | `JobCard`, the three pop-ups, `ListingDetailView`, issue list, "Uses 1 of your N listing slots", warning acknowledgement `Checkbox`, Publish `Button` | After Publish: "Checking your listing…" (polls every 2 s), then Live, "We're taking a closer look", or the returned reasons | Same |
| `/host/listings/[id]` | Status `Card`, "Still hiring?" Yes / Edit / Close, "Confirmed active N days ago", Close and Repost `Button`s | Removed: the reason plus "Ask for a review" | Same |
| `/host/host-page` | `Tabs` (Header, About, Photos, Team, FAQ, Preview), `HostHeader` preview, `PhotoSlotGrid` (24), slug `Input` | `pending`: "Checking your changes"; `in_review`: "In review. Your current page stays live." | Same |
| `/host/team`, `/host/team/activity` | Member rows with `Avatar` and role `Select`, invite `Dialog` with scope picker, seats `StatTile`, activity list | Seat limit reached: the invite button is disabled with "All N seats are used · Upgrade" | List / table |
| `/host/billing`, `/host/billing/plans`, `/host/billing/complete` | `PlanCard` ×3, monthly/annual `SegmentedControl`, extra-slot stepper, proration summary, "Choose listings to keep" `Checkbox` list (at most N), portal `Button` | `past_due` banner (icon plus text); trial end date; "Founding host · 30% off for life"; complete page polls until synced | Stacked cards / three columns |
| `/host/settings`, `/host/settings/locations`, `/host/settings/verification` | `Input`, `Switch` (Recruiter approval), `LocationPicker`, `WeatherLine`, verification status `Card` with an info form | Geocoder miss: "Drop a pin on the map instead" | Same |
| `/join/[token]` | `OrgLogo`, role text, Accept `Button` | Expired, mismatched email or seeker account each get their own `ErrorState` | Centered card |
| `/hosts/[slug]` (public, SSR, `s-maxage=60`) | `HostHeader` (cover, `OrgLogo`, badge `Tooltip`, **Hiring now** `Pill`, `CategoryBadge` icons, Follow / Share / Website), stats, `Tabs` (Jobs · About · Photos · Locations · Team · FAQ · As described), `JobCard` grouped by location with `WeatherLine`, a pinned-announcement stack above the tabs (from the `pinned_announcement` provider) | "Not hiring right now · Usually hires Feb–Apr" with Follow. Optional tabs and the announcement stack are hidden when empty. A guest pressing Follow is asked to sign in and the follow completes afterwards. Before `launch.public_at`: `noindex`. | Tabs scroll horizontally / sticky tab bar |
| `/pricing` (public) | `PlanCard` ×3, interval `SegmentedControl`, headline "Hire people who want to be there." | Prices come from Stripe, cached for 1 h; if Stripe fails, the values from `PLANS` are shown | Stacked / three columns |

## 8. Business rules

### 8.1 Plans, entitlements and team

| Rule | Value | Source |
|---|---|---|
| Starter · Professional · Enterprise | $99 · $299 · $599 monthly; $990 · $2,990 · $5,990 annual (10× monthly); 2 · 10 · 30 active listing slots; 1 · 5 · 15 seats; 10 · 50 · 150 invite credits per month | Product §16 |
| Extra listing slot | $39 · $29 · $19 per month by tier | Product §16 |
| Extra slot on annual plans | 10× monthly: $390 · $290 · $190 per year (one Stripe subscription can't mix intervals) | Engineering decision |
| Stripe lookup keys | `{starter,professional,enterprise}_{month,year}` and `slot_{tier}_{month,year}`; coupon `founding_30_forever` (30%, forever); created by `pnpm stripe:seed`, which is idempotent | Engineering decision |
| Entitled · can publish | Entitled: `trialing`, `active`, `past_due`. Can publish new listings: `trialing`, `active`. `past_due` keeps live listings and blocks new publishes. | Engineering decision |
| Payment failure | Stripe Smart Retries for up to 2 weeks, then the subscription is canceled (Stripe Dashboard setting in the runbook), which is a lapse | Engineering decision |
| Without a subscription | 0 listing slots, 1 seat (the Owner, always counted), 0 credits. Drafts and the page editor still work. | Engineering decision |
| Slot use | `in_review` and `active` each hold 1. Drafts don't use a slot. Closing frees it immediately. Edits to an active listing use no extra slot. | Product §7.3 + Engineering decision |
| Seats | Every member uses a seat; unexpired pending invitations count too. Invitations expire after 7 days. Existing members are never removed automatically; plan changes below the member count are refused with `seat_limit`. | Product §2 + Engineering decision |
| Invite credits | Granted per calendar month (UTC) with `validUntil` = the 1st of the next month, so unused credits don't roll over. Activation grants the full month; a mid-month upgrade tops up the difference; a downgrade never claws back. Consumed oldest-expiring first. | Product §11.3 + Engineering decision |
| Roles | Section 10 matrix. The Owner can't leave without transferring. Admins can't change the Owner or create an Owner. Transfer goes only to an existing Admin and needs reverification. | Product §2 |
| Recruiter approval rule | Off by default. When on, a Recruiter's publish (including edits) enters `in_review` at stage `team_approval` and holds a slot until an Owner or Admin decides. | Product §2 |
| Recruiter scope | `all`, or `assigned` to listings and/or locations. Listings created by an assigned Recruiter are auto-assigned to them, and they can only pick their assigned locations. | Product §2 + Engineering decision |
| Member leaves | Emits `org.member_removed`; `reassignToUserId` is the acting Owner or Admin, or the Owner when someone leaves on their own | Product §2 + Engineering decision |
| Inviting a seeker's email | Accepting returns 409 `seeker_account`: "This email belongs to a seeker account. Ask for an invitation to a different email." (one account, one role) | Product §2 |
| Org deletion | Owner, reverification, typing the org name. Cancels the subscription immediately without proration, closes every listing, soft-deletes the org (`deleted_at`) and deletes the Clerk org. The host page returns 404. | Engineering decision |

### 8.2 Listings and checks

| Rule | Value | Source |
|---|---|---|
| States | `draft` → `in_review` → `active` → `closed`; `removed` comes from moderation. Stages within `in_review`: `team_approval`, `verification`, `screening`, `moderation`. | Product §7.3 |
| Field limits | Title 5–80 characters. Description 50–10,000. Up to 20 responsibilities, 15 of each qualification type, 30 skills and 15 certifications, each item ≤ 200. Typical day ≤ 2,000. Pop-up notes ≤ 80. Fine print ≤ 1,000. Openings 1–999. Weekly hours 1–120. Minimum age 18–99 (default 18). | Product §7.1 (age) + Engineering decision |
| Photos | Cover required; gallery up to 8. Housing: 4 required photos (Bedroom, Bathroom, Kitchen, Exterior). Meals: 4 required photos (Kitchen, Meal example, Dining area, Other). Each must be an approved `getMediaInfo` record owned by the org. | Product §7.1 |
| Screening | Up to 10 questions (short answer, yes/no, multiple choice with 2–10 choices); prompt ≤ 200. Question IDs stay stable across edits and reposts. | Product §7.1 + Engineering decision |
| Blocking checks | **Vague pay:** min = 0, range max > 2.5 × min, or crew share without an estimate. **Missing housing or meals cost.** **Prohibited wording:** case-insensitive matches against `listings.prohibited_phrases` (defaults: "US citizens only", "U.S. citizens only", "citizens only", "American citizens only", "no foreigners", "native English speaker"). **Unsafe Additional step domain** (section 8.3). | Product §7.1 + Engineering decision (thresholds) |
| Warnings | **Pay below minimum wage** (warning only, acknowledged with `pay_below_min_wage`): units hour, week, month and year are converted to hourly using weekly hours, then compared with `listings.min_wage_cents_by_state` for the location state, or the federal rate (725) for remote; day, season and crew share are skipped. **Photo slot mismatch:** "This doesn't look like a bathroom." Replace it, or keep it, which sends the listing to moderation. | Product §7.1 + Engineering decision |
| Auto-close time | Only a fixed end date closes a listing: `auto_close_at` = 00:00 local time (listing `timezone`) on the day after the end date, with `close_reason = 'end_date'`. Ongoing and season-mode listings (including `year_round`) are null and never close on their own; closing season listings at season end waits for the founder (section 13). A fixed end date before today blocks publishing. | Product §7.3 |
| Application deadline | Doesn't close the listing. From 00:00 local time on the day after `applying.deadline` (`applicationsCloseAt`), `canAcceptApplications` returns `deadline_passed`; the listing stays `active`, holds its slot and gets its reminders until the host closes it. A deadline before today blocks publishing. | Product §7.1, §7.3 + Engineering decision |
| Reminders | `next_reminder_at` = publish + 30, 60 and 90 days, then every 90 days, by the count of reminders sent; this is not reset by Yes. Yes sets `confirmed_active_at`, which shows "Confirmed active N days ago" and **doesn't move the listing up in Newest**. Unanswered reminders change nothing. | Product §7.3 |
| Edit while active | Creates a pending revision through the same checks and screening; the live revision stays until it's approved, then the pointer swaps and `listing.changed` is emitted, so every approved change has a new `revisionId` | Engineering decision |
| Library · Drafts · Active tabs | Library: every listing ever published, in any state, with its stats. Drafts: never published. Active: `active` plus `in_review`. | Product §7.4 + Engineering decision |
| Repost | Copies into a new draft (`reposted_from_id`) with photos and screening questions kept. Every date, the season year and the deadline move forward 1 year, repeating until the end date (or start date) is in the future; Feb 29 becomes Feb 28. It opens at Review. A removed listing can't be reposted. | Product §7.4 |
| Copy a past listing | Same as repost, but dates are cleared and it opens at Basics | Engineering decision |
| Repost reminder | Daily: a listing that isn't active, whose `first_published_at` anniversary falls 8 weeks (56 days) from today, and with no listing reposted from it in the last 12 months; at most once per year via `repost_reminded_year` | Product §7.4 |
| AI paste import | `extract` with Sonnet 5.5 into `DeepPartial<ListingContent>`, with `provenance = 'imported'` and `ai_filled_fields` listing every filled path. Housing and meals are never set to provided without explicit text. The host reviews each field. | Product §7.1, §18 |
| AI description | `write` with Sonnet 5.5 from bullets; ≤ 10,000 characters; the prompt forbids inventing pay, housing, meals or dates | Product §7.1 |
| Draft autosave | Debounced at 800 ms, on blur and on section change. A whole section is replaced per PATCH; a stale `baseVersion` conflicts only if that same section changed since. | Engineering decision |

### 8.3 Publish and screening (inside `listings.screen`)

1. **Request** (synchronous, one transaction). `requireHost`, the scope check, org `active` and `canPublish`; the deterministic checks (blocking issues return 400; the link must be HTTPS with no userinfo, IP literal or port, and its domain not in `links.shortener_domains` or `links.blocked_domains`). Then, inside `withCapacity(tx, orgId, 'listing_slot', alreadyActive ? 0 : 1)`: insert the revision (`screening`), set the listing `in_review` (or `pending_revision_id` for an edit), enqueue `listings.screen` and record audit. A Recruiter under the approval rule gets stage `team_approval` and no enqueue until an Owner or Admin approves.
2. **Verification.** If the org is `unverified`: `startVerification`, stage `verification`, and the job stops until `verification.decided` resumes it. If the org is `failed`: the revision is rejected with `verification_failed`.
3. **Media.** Every referenced media must be `approved`. `uploaded` or `scanning` re-enqueues at +30 s, at most 20 times, then goes to `moderation` with reason `media_timeout`. `in_review` waits for its operator. `rejected` or `blocked` rejects the revision.
4. **Additional step link.** The domain uses the `link_domains` cache, or else Web Risk `uris.search` (MALWARE, SOCIAL_ENGINEERING, UNWANTED_SOFTWARE). Flagged → rejected. Web Risk unreachable → `unknown` → `moderation`; never auto-allowed.
5. **AI.** `listing_moderation` and `listing_fraud` run in parallel. A `listing_fraud` rejection also opens a `fraud` item on the org (subject `organization`, priority 100).
6. **Decision.**
   - **All approved and no kept photo mismatch:** in one transaction the revision becomes `approved` (the previous one `superseded`) and the listing `active`. It sets `published_at`, `first_published_at` if empty, `auto_close_at` and `next_reminder_at`; emits `listing.published` (with `first`) or `listing.changed`; and notifies `listings.live`.
   - **Any `needs_review` or kept mismatch:** stage `moderation` and `listings.in_review`.
   - **Any rejection:** the revision is `rejected`; the listing returns to `draft`, or keeps its live revision for an edit; the slot is released; `listings.returned` carries the reasons and an "Ask for a review" link.
   - Typically under 10 s; the test bound is 30 s.

### 8.4 Business verification

- **Signals** (stored in `signals`):
  - the owner's email domain, whether it's a free provider, and whether it's disposable (`disposable-email-domains`)
  - whether `website_url` is reachable over HTTPS, and whether the email domain equals the website domain
  - domain age from RDAP (`https://rdap.org/domain/<d>`, the registration event)
  - the Stripe default card's `cvc_check` and `address_postal_code_check`
  - whether the location geocodes in the US
  - whether the domain is in `verification.blocked_domains`
- **The website fetch is SSRF-safe:** DNS is resolved and private, loopback and link-local addresses are refused; HTTPS on port 443 only; 5 s timeout; 1 MB cap; at most 3 redirects, each re-checked. The text is cut to 5,000 characters.
- **The check:** `runCheck({ kind: 'business_verification', reviewQueue: 'fraud' })` gets the signals, website text, org name, location and listing title.
- **Hard flags** (a blocklisted domain, a disposable email, a failed CVC check) force `needs_review` at priority 100.
- **Auto-verify** when the score is below 0.3, there are no hard flags and a card is on file.
- **Everything else goes to the `fraud` queue** (4-hour time limit), and the host sees "We're verifying your business. This usually takes a few hours."
- **Never auto-rejected** (Engineering decision: a false rejection costs a real host more than a 4-hour review). `failed` comes only from an operator `remove`; "Ask for a review" then opens an `appeals` item via `trust.openAppeal`.
- **Changing the org name or website** re-runs verification in the background; live listings stay up unless an operator acts.

### 8.5 Host page and follows

| Rule | Value | Source |
|---|---|---|
| Public when | The org is `active`, not deleted, and has been entitled at least once. A host that never subscribed has no public page. | Engineering decision |
| Subscriber badge | Shown while entitled. Tooltip "Active Explore&Earn host since [date]", where `host_since` is the start of the current continuous entitled period; a lapse clears it. | Product §8, §16 + Engineering decision |
| Hiring now | Shown while any listing is `active`; `HostIdentity.hiringNow` also feeds map previews | Product §8 |
| Usually hires | When not hiring and with ≥ 2 past listings: the circular window of 1–3 consecutive months with the most `first_published_at` dates, trimming empty end months, e.g. "Not hiring right now · Usually hires Feb–Apr". Otherwise "Not hiring right now". | Product §8 + Engineering decision |
| Thresholds | Followers count shown once it passes 25 (≥ 26). "Usually replies within a day" shown after 10+ conversations (SP5 provider). As described tab at 5+ responses (SP5 provider). Photos up to 24; Team up to 12, with `teamConsent` required. | Product §8 |
| Categories and home location | Icons for the primary categories of active listings (all listings when none are active); home = the primary location's city and state | Product §8 |
| Location privacy | `city` precision rounds `public_point` to 0.01° and shows only city and state. `exact` shows the street address. | Engineering decision |
| Weather | NWS `forecastHourly` first period: "54°F · Partly sunny" with "Weather: National Weather Service". Refreshed every 30 minutes; hidden when missing, failing or older than 2 hours. | Product §8 + Engineering decision (timings) |
| Content changes | Saving runs `text_safety`. Approved changes go live; `needs_review` holds `pending_content` while the current page stays live; rejected changes return the reason. Images use the Foundation media scan. | Engineering decision |
| Slug | 3–60 characters matching `^[a-z0-9]+(-[a-z0-9]+)*$`, excluding reserved words (`admin`,`api`,`host`,`hosts`,`jobs`,`new`,`pricing`,`settings`,`join`). Old slugs redirect forever. | Engineering decision |
| Follow | Seekers only. A new listing (`first`) notifies followers; edits and closes don't. Reposts count as new. | Product §8 |

### 8.6 Downgrade, lapse and suspension

- **Plan change** (Owner or Admin):
  1. Preview the cost with `invoices.createPreview`.
  2. If active plus in-review listings exceed the new limit, `keepListingIds` (at most the new limit) is required.
  3. Insert a `billing_changes` row with status `pending`.
  4. Call `subscriptions.update` (idempotency key `change:<id>`), swapping the tier and slot price items and keeping the extra-slot quantity. Upgrades use `proration_behavior: 'always_invoice'`; downgrades use `'create_prorations'` (a credit on the next invoice).
  5. Run `syncSubscription`, then `enforceSlotLimit`.
  6. If the card is declined, the change is `failed` and nothing closes.
- **`enforceSlotLimit`** runs under the org lock. Listings not on the keep list close with reason `downgrade` (in-review ones return to `draft`) and move to the library. Without a valid keep list, the listings with the earliest `first_published_at` are kept (ties broken by `id`), and `billing.plan_changed` names the listings that closed.
- **Lapse** (`canceled`, `unpaid`, `incomplete_expired` or `paused`): plan grants end; every active or in-review listing closes with reason `lapsed` (applicants and threads remain); `host_since` is cleared; founding status becomes `lapsed` with `founding_lapsed_at` set; `billing.subscription_ended` reports how many listings closed.
- **Suspended or banned org:** every active listing closes with `org_suspended`, publishing is blocked, and the host page returns 404. Restoring the org republishes nothing.

### 8.7 Founding hosts and coupons

| Rule | Value | Source |
|---|---|---|
| Offer | The first 100 hosts get 90 days free, then 30% off for life; the free period starts at public launch; codes are used during private pre-launch | Product §16 |
| Code format | `EE-XXXX-XXXX` in Crockford base32. Matched case-insensitively and ignoring hyphens. Stored as a hash; shown once by `pnpm ops:founding-codes --count N --note "…"`. | Engineering decision |
| Hold and redeem | At checkout, under `pg_advisory_xact_lock('founding')`, a code is held only if redeemed + held < `founding.max_hosts` (100); the hold lasts until the session expires (30 minutes). It's redeemed when the subscription syncs. Redeemed spots are never reissued. | Engineering decision |
| Pre-launch gate | While `launch.public_at` is null or in the future, checkout requires a founding code (`code_required`) | Product §16 |
| Trial end | `trial_end` = max(`launch.public_at`, sign-up) + 90 days. If `launch.public_at` isn't set yet, it's now + 729 days (Stripe's limit is 730). `billing.apply_launch_date` corrects every founding subscription with `subscriptions.update({ trial_end, proration_behavior: 'none' })`. | Engineering decision |
| Discount | `founding_30_forever` on the subscription, so it applies to the tier and extra slots and survives plan changes | Engineering decision |
| Return | Resubscribing within 6 months of `founding_lapsed_at` reapplies the coupon (and the trial, if still before launch + 90 days) with no code. After 6 months the status is `forfeited`. | Product §16 |
| Other coupons | Non-founding checkouts set `allow_promotion_codes: true`; promotion codes are created in Stripe (SP8 operates them). Promotions don't stack with founding pricing. | Engineering decision |
| Checkout | Hosted Checkout, `mode: 'subscription'`, `payment_method_collection: 'always'`, `client_reference_id` and metadata `orgId` (and `foundingCodeId`). One open session per org is reused when its parameters match; otherwise it's expired and replaced. A checkout while a current subscription exists returns 409 `has_subscription`. | Engineering decision |

### 8.8 Webhooks and sync

- **The webhook route** verifies with `stripe.webhooks.constructEvent` (300 s tolerance) and inserts `webhook_events(id, 'stripe')`; a duplicate returns 200. `checkout.session.completed` and `customer.subscription.*` enqueue `billing.sync_subscription`. `invoice.paid`, `invoice.payment_failed` and `customer.subscription.trial_will_end` also notify. Every other event is emitted as `billing.stripe_event`.
- **`syncSubscription` reads the subscription from Stripe** (with prices and discounts expanded), so event order doesn't matter. Under the org lock it: upserts the row; swaps plan grants (`endGrant` the old one, `grant` the new one, keyed `plan:<subId>:<kind>:<qty>`); grants the month's credits; redeems founding; sets `host_since`; applies any lapse; emits `subscription.changed`; and records audit.
- **An unknown lookup key, or a second current subscription for one org,** grants nothing, opens a `billing` review item and calls `raiseAlert` (critical).
- **The browser success URL never grants anything itself.** `/host/billing/complete` only triggers a sync from Stripe's own data.

**Settings keys added** (`getSetting`/`setSetting`, edited in the Foundation settings screen), shown as key = default: `launch.public_at` = `null` · `founding.max_hosts` = `100` · `founding.free_days` = `90` · `founding.return_window_months` = `6` · `team.invitation_ttl_days` = `7` · `listings.prohibited_phrases` = the section 8.2 list · `listings.vague_pay_range_ratio` = `2.5` · `listings.min_wage_cents_by_state` = the DOL table · `listings.genres` = the product §3 genres as `{ code, label, category, active }` (deactivated genres stay valid on existing listings) · `links.blocked_domains`, `links.shortener_domains`, `verification.blocked_domains` = lists · `trust.thresholds` = adds the four kinds in section 6. The product display thresholds (25 followers, 10 conversations, 5 responses) are constants in code.

## 9. Integrations and environment variables

Secrets live in Doppler project `explore-and-earn`: config `dev` (APP_ENV=dev), `stg` (preview) and `prd` (prod), synced to Vercel and GitHub Actions. `src/lib/env.ts` validates them. With `APP_ENV=prod`, a `stub` value throws `Stub provider not allowed in prod: <name>`.

| Variable | Values | Required when |
|---|---|---|
| `BILLING_PROVIDER` | `stripe` \| `stub` | always |
| `STRIPE_SECRET_KEY` | `sk_test_…` in dev and stg; `sk_live_…` in prd once SP8 (or the section 13 decision) switches it | `BILLING_PROVIDER=stripe` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (in dev, from `stripe listen`) | same |
| `STRIPE_PORTAL_CONFIG_FULL`, `STRIPE_PORTAL_CONFIG_BILLING` | `bpc_…`, printed by `pnpm stripe:seed` | same |
| `GEOCODER_PROVIDER` | `census` \| `stub` (US Census Geocoder, free, no key, results may be stored) | always |
| `WEATHER_PROVIDER`, `NWS_USER_AGENT` | `nws` \| `stub`; e.g. `Explore&Earn (support@exploreandearn.com)` (NWS requires a contact) | always; the agent when `nws` |
| `LINK_SAFETY_PROVIDER`, `WEB_RISK_API_KEY` | `webrisk` \| `stub`; a Google Cloud Web Risk key (the Safe Browsing API is non-commercial only) | always; the key when `webrisk` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | A public `pk.` token restricted to the app URLs | stg, prd |
| Reused from Foundation | `AI_PROVIDER`, `ANTHROPIC_API_KEY` (Haiku 5.5 checks, Sonnet 5.5 import and writing), `CLERK_SECRET_KEY`, `EMAIL_PROVIDER`/`RESEND_API_KEY`/`EMAIL_FROM`, `APP_URL`, `JOBS_SECRET`, `DATABASE_URL` | as in Foundation |

**Integrations:**

| Service | Calls | Failure behavior |
|---|---|---|
| Stripe | Checkout, Billing Portal, `subscriptions.update`, `invoices.createPreview` and webhooks, with stable idempotency keys | Checkout, change and portal return 500 `internal` "Billing is temporarily unavailable. Try again in a few minutes."; existing state is unchanged |
| US Census Geocoder | `/geocoder/locations/address?benchmark=Public_AR_Current&format=json` | Pin drop instead |
| NWS | `/points/{lat},{lon}` (4 decimals), then `forecastHourly` | Weather hidden; the timezone falls back to the state default |
| Google Web Risk, RDAP | Link checks; domain age | Link → `unknown` → moderation; a missing domain age becomes a neutral signal |
| Anthropic | Haiku 5.5 via `runCheck`; Sonnet 5.5 via `extract` and `write` | Checks become `needs_review` (`classifier_error`); paste-import and description show an `ErrorState`, and the builder keeps working |
| Clerk | Membership add, remove and role changes; org delete; reverification | Invitation accept is compensated (membership row removed, invitation back to `pending`) |

## 10. Security and privacy

| Capability | Owner | Admin | Recruiter | Billing |
|---|---|---|---|---|
| Listings: create, edit, publish, close, repost | ✓ | ✓ | ✓ (within scope) | — |
| Approve Recruiter listings, host page, locations, org settings | ✓ | ✓ | — (reads scoped locations) | — |
| Team: invite, change, remove; activity log | ✓ | ✓ (not the Owner) | — (sees the member list) | — (sees the member list) |
| Transfer ownership, delete org | ✓ (reverify) | — | — | — |
| Change plan, buy add-ons, choose kept listings | ✓ | ✓ | — | — |
| Invoices and payment method (portal) | ✓ | ✓ | — | ✓ |
| Entitlement counts | ✓ | ✓ | ✓ | ✓ (counts only, no listing titles) |

- **Authorization.** The org always comes from the Clerk session (`HostContext.orgId`), never from input; every listing, location and member ID is checked against it, and a cross-org ID returns 404. Owners and Admins need strong authentication (the Foundation guard). Permission changes apply on the next request.
- **PII.**
  - Invitation tokens are stored only as hashes, and the public invitation preview masks the email.
  - Private location points and street addresses never leave host APIs unless `exact` precision is chosen.
  - Follow lists are private; the follower count is public only past 25.
  - Verification signals, website text and card-check results are visible to operators only.
  - No card data is stored, and analytics events carry IDs only (Foundation `track` rules).
- **Untrusted input.** Stripe signatures are verified on the raw body. The website fetch is SSRF-guarded (section 8.4). AI prompts treat host text as data, and zod validates every AI output. Rate limits are as listed in section 5.
- **Privacy hooks.** Each SP2 module exports `privacyHandlers: { export(db, userId), erase(db, userId) }` for SP8 to register. For a user, follows and memberships are erased and `created_by` is set to null. Org data is retained under the SP8 retention rules, because listings are tied to applications.

## 11. Testing

**Key tests** (unit tests on PGlite; `*.int.test.ts` on Postgres in CI; Stripe tests skipped unless `STRIPE_SECRET_KEY` starts with `sk_test_`):

| Area | Tests |
|---|---|
| Entitlements | `consume` twice with the same key consumes once; `insufficient` leaves the balance unchanged; expired grants aren't counted; `reverse` restores the balance; concurrent `withCapacity` on the last slot lets exactly one through (integration) |
| Listings | `ListingContentSchema` rejects `housing.provided` without a cost, and a 3-photo housing set; each blocking check with its exact `Issue.code`; min wage: weekly $500 at 40 h in WA warns; auto-close in `Pacific/Honolulu`, `America/Anchorage` and `America/New_York`; a season-mode listing gets no `auto_close_at`; a passed deadline returns `deadline_passed` and leaves the listing `active`; reminders at 30/60/90/180/270; repost of a 2-year-old listing and of Feb 29; `section_conflict` only for the same section; the immutable-revision trigger |
| Screening | Stub `__flag__` → stage `moderation`, `__block__` → returned; a fraud rejection opens an org `fraud` item; `scanning` media → retried, then publishes; Web Risk down → moderation; with two open items, both must be approved before publishing |
| Orgs | `can` for 13 capabilities × 4 roles; the scope filter; seat limit counts pending invitations; accepting with a mismatched email or a seeker account; transfer leaves exactly one Owner; Admins can't remove the Owner |
| Billing | Webhook replay; `updated` arriving before `created`; a late `updated` after `deleted` doesn't resurrect anything; founding hold race (101 concurrent holds → 100); `apply_launch_date` updates `trial_end`; return at `founding_lapsed_at` + 6 months − 1 day vs. + 1 day; test-clock invoice amounts (section 1, row 4) |
| Host pages | "Usually hires": Feb/Mar/Apr → "Feb–Apr", and Nov/Dec/Jan wraps; follower count hidden at 25, shown at 26; weather older than 2 h is hidden; `pending_content` is held while the live content stays |

**Five failure modes most likely to hurt real users:**

| # | Failure | Guard | Pinned by |
|---|---|---|---|
| 1 | **A host pays but can't publish, or a lapsed host stays live,** because webhooks are missed, duplicated or out of order | Sync from Stripe's own data, `webhook_events` dedupe, the success-page sync, the daily reconcile with alerts | `billing.sync.test.ts`: duplicate, reversed and missing events all end at Stripe's state |
| 2 | **Listings close that shouldn't:** a transient card failure, a downgrade ignoring the keep list, or an auto-close a day early in another timezone | `past_due` keeps listings live; the keep list is stored before the Stripe call; `auto_close_at` is computed in the listing's timezone | `billing.change.test.ts`, `listings.lifecycle.test.ts` (Hawaii case) |
| 3 | **Founding hosts charged wrongly:** full price, a charge during the free period, or a lost discount after a plan change | A subscription-level forever coupon, the hourly `apply_launch_date` correction, test-clock invoice assertions | `billing.stripe.int.test.ts` |
| 4 | **A real host's first listing is stuck or rejected** by a verification false positive or an AI outage | Verification is never auto-rejected; `classifier_error` → `needs_review` in `fraud` with a 4-hour time limit; host status copy; "Ask for a review" | `verification.test.ts`: classifier throws → fraud item, listing `in_review`, never `removed` |
| 5 | **Builder work is lost** to two tabs, a flaky connection or a stale tab overwriting another editor | Per-section versions with conflict resolution, a retry queue in the client, server-side merge only within a section | `listings.draft.test.ts` and an e2e test that goes offline mid-edit |

## 12. Parallel workstreams

| Phase | Workstreams (migration range) | Depends on |
|---|---|---|
| **A** (one agent) | **W0** contracts: module skeletons with typed stubs for every section 3 interface; all touchpoints; `1000_orgs.sql` (1000–1049); the `ListingContentSchema` and `HostPageContent` zod schemas; taxonomy code lists | Foundation merged and design gate approved (for later screen work) |
| **B1** (in parallel) | **W1** entitlements (1600–1699) · **W2** billing: Stripe seed, checkout, webhooks, sync, change, portal, founding, credits, reconcile (1500–1599) · **W3** team and orgs: invitations, roles, scopes, transfer, delete, activity (1050–1099) · **W4** locations, geocoder, weather, destinations seed (1100–1199) · **W5** listings core: schema, checks, drafts, publish, screening, lifecycle, repost, AI import, `getHomeSummary`, occupations seed (1200–1299) · **W6** verification and trust kinds, prompts, subject handlers (1400–1499) · **W7** host pages and follows, the public read model, providers (1300–1399) | W0. They code against each other's W0 stubs: W5 uses the W1, W4 and W6 stubs; W6 the W2 stub; W7 the W5 stub. |
| **B2** (in parallel) | **W8** builder and listing screens, plus the `BuilderRail`, `RequiredChecklist`, `PhotoSlotGrid` and `ListingDetailView` patterns · **W9** team, billing, settings, `/join`, `/pricing`, and the public `/hosts/[slug]` with `HostHeader`, `WeatherLine`, `PlanCard` and `LocationPicker` | W8: W5, W6. W9: W1–W4, W7. |
| **C** | **W10** integration: the section 1 e2e tests, the Stripe test-clock suite, the runbook (`docs/runbooks/sp2-billing-setup.md`: Stripe seed, webhook endpoint, retry and cancel settings, portal configs, Doppler keys); fixes in 1900–1999 | everything above |

Ownership rule (as in Foundation): each workstream owns its module folder and migration range, and touches shared files only through W0's touchpoints and the append-only lists.

## 13. Open items

| Item | Owner | Decide before |
|---|---|---|
| Stripe live-mode activation (or an explicit choice to run private pre-launch on test mode). Real founding hosts can't enter real cards in test mode. | Founder | Start of private pre-launch (SP2 exit) |
| Confirm the annual extra-slot price (Engineering decision: 10× monthly) and that the founding 30% applies to extra slots | Founder | Stripe live mode |
| Sales tax: Stripe Tax and registrations (off in SP2, so test amounts are exact) | Founder and counsel | Stripe live mode |
| Set `launch.public_at` (it drives founding `trial_end`) | Founder | Public launch (SP8 gate) |
| Whether season-mode listings (Spring–Winter, not `year_round`) also auto-close at season end. Product §7.3 names only fixed end dates, so SP2 doesn't close them. If approved: 00:00 local on the day after the season ends (Spring Mar–May, Summer Jun–Aug, Fall Sep–Nov, Winter Dec–Feb of the following year), adding `season_end` to `close_reason`. | Founder | SP2 W5 |
| Review the seeded occupation list (≥ 120) and the destination list | Founder | SP3 filters and landing pages |
| The minimum wage table, `listings.min_wage_cents_by_state`, seeded from the US DOL table at build time | Engineering, then an operator each January 1 | SP2 W5, then yearly |
| A Google Cloud project with Web Risk enabled, and the support address for `NWS_USER_AGENT` | Founder | SP2 deploy to `stg` |
| Default `listings.prohibited_phrases` wording | Founder and counsel | Launch (legal review gate) |
