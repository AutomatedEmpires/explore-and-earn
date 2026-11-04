# Paid Add-ons (Sub-project 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host Owner or Admin buys every paid add-on (boosts, announcement packs, extra invite packs and extra seats), Explore&Earn delivers it only after Stripe confirms payment, with honest labels and fixed placement caps, and the host sees what it did.

**Architecture:** Four new modules under `src/modules/` with a one-way import graph, `promote → boosts, announcements → addons`. `addons` owns the catalog, one-time Stripe Checkout, refunds, invite packs and seats, and hands fulfillment to `boosts` and `announcements` through outbox topics. `boosts` implements SP3's `BoostPlacementHook` as a pure placement function whose state rides in SP3's cursor; `announcements` owns credits, moderation, the host page pin and card data; `promote` composes reads for SP7 and SP8. Phase A makes the Foundation, SP2 and SP3 touchpoints and lands every SP6 contract as typed stubs with fakes, so four domain workstreams build in parallel worktrees; one screens workstream and an integration phase follow.

**Tech Stack:** The Foundation stack (Next.js 16.4, React 19, TypeScript 6.0, Drizzle 0.45 on postgres.js and PGlite, zod 4, Vitest 5, Playwright 1.64, Clerk 7, Resend with React Email) plus SP2's `stripe` client (`getStripe()` in `@/lib/stripe`). No new dependencies. External: Stripe Checkout (payment mode), Refunds, Prices and Events.

**Spec:** `docs/superpowers/specs/2026-11-03-sp6-paid-add-ons-design.md` (the "spec" below; "spec 8.2" means its section 8.2). Its parents are `2026-11-03-explore-earn-product-design.md` (sections 5.4, 8, 13, 16, 17 and 25) and `2026-11-03-foundation-design.md`, and it uses names from `docs/superpowers/plans/2026-11-03-foundation.md`. Read the spec before your task; the plan cites spec sections instead of copying their tables.

**Code wins.** Foundation code is on branch `feat/foundation`. Where it differs from the Foundation plan, follow the code. Known differences:

- `createTestDb()` lives in `tests/helpers/db.ts`; raw SQL goes through `queryRows(db, sql)`, which returns timestamps as text (cast counts with `::int`).
- `OrgRole` and `CurrentUser` come from `@/modules/identity`; `HostContext` and `OperatorContext` come from `src/server/guards.ts`.
- `apiRoute({ auth: 'host' })` calls `requireHost()` with no roles, so routes check roles with SP2's `requireCapability` (Plan decision 11). Owners and Admins still need strong sign-in, which `requireHost` enforces for those roles.
- The audit export is `record` (the spec's `audit.record`). `setSetting(db, key, value, { operatorId })`. `notify(db, userId, type, data)`. `getMediaUrl(db, storage, viewer, mediaId, variant?)` with `getStorage()`.
- Email templates receive `{ title, body, url, footer }` from `templateElement` in `src/modules/notifications/email/send.ts`.
- Foundation's `JobCard` already renders the `boosted` cover `Badge` ("Boosted", `tone="surface"`, `Sparkles`), and `src/app/host/promote/page.tsx` is a Foundation placeholder.

SP2, SP3, SP4 and SP5 come before SP6 in the build order, so their code is merged when SP6 starts. Their plans (and the SP5 spec) are the contract for names. Where merged code names something differently, use the code's name and keep this plan's behavior.

## Before you start

- **Foundation** is merged through its Phase C, and the founder has approved the design gate (Phase B2 needs it).
- **SP2–SP5 are merged** on the base branch. Phase A edits SP2 code (`billing`, `entitlements`, `orgs`, `hostpages`, `src/server/sp2-wiring.ts`) and SP3 code (`src/server/placement-hook.ts`, `src/modules/discovery/hooks.test.ts`); Phase B2 edits SP3's `MapPin` and `MapCanvas` and SP2's host page.
- **Upstream names used here** (binding):
  - SP2: `getStripe`, `billingGateway`, `makeFakeBillingGateway`, `BillingGateway`, `ensureStripeCustomer`, `getSubscriptionState`, `syncSubscription`, `handleStripeWebhook`, `changePlan`, `previewChange`, `PLANS`, `grant`, `endGrant`, `getBalance`, `getCapacity`, `listOpenGrants`, `lockOrg`, `listMembers`, `requireCapability`, `can`, `HostCapability`, `getListingSummaries`, `getPublishedListing`, `registerListingRowBadgeProvider`, `getHostIdentities`, `registerHostPageProvider`, `resolveHostPage`, `HostPagePublic`, `emit`, `readEnvelope`, `eventSubscribers`, and the test helpers `seedHostOrg`, `seedMember`, `seedSeeker`, `seedMedia`, `FIXED_NOW`, `entitleHost`, `drainJobs`, `dbRows`.
  - SP3: `BoostPlacementHook`, `PlacementInput`, `PlacementOutput`, `noopHook`, `getPlacementHook`, `setPlacementHookForTests`, `placeWithTimeout`, `matchListingIds`, `getListingEventCounts` (with `'apply'`, `sources` and `source`, its Plan decision 6), `DiscoveryQuery`, `DiscoverySource`, `searchListings`, `mapPins`, `getJobCards`, `recordListingEvent`, `hmacKey` (`src/server/viewer.ts`), `DEFAULT_TZ`, `insertProjectionRows`, `seedSynthetic`, and the e2e fixtures `seedHost`, `publishListing`, `closeListingAs`, `signInAsSeeker`, `signInAsHost`.
  - SP4: `profiles.getPreferenceTargets`, `safety.getBlockSet`, `safety.registerReportSubject`, `safety.report`, `applications.submitApplication`.
  - SP5: `analytics.registerBoostWindowsSource`, `BoostWindowsSource`, `BoostWindow`, `getHostAnalytics`.
  - SP8: `PrivacyHandler`, `RetentionRule`, `PrivacySubject`, `ExportPart`, `EraseResult`, `HoldScope` from `@/modules/privacy`. If that module is absent, W0 creates it with SP8 section 3's types only (the same rule SP3 and SP4 follow).
- **Environment:** Windows with no Docker. Unit tests run on PGlite. `*.int.test.ts` files run only in CI's `integration` job; locally, run `pnpm typecheck` on them. E2E runs on `pnpm db:local` with `pnpm dev`, wrapped in `doppler run --config dev --` for the Clerk dev keys.

## Global Constraints

- **Platform:** pnpm on Windows with no Docker; `strict` and `noUncheckedIndexedAccess`; no `any`. Unit tests: `pnpm test <path>`. Stripe test-mode tests are skipped unless `STRIPE_SECRET_KEY` starts with `sk_test_`.
- **Secrets:** they live in Doppler project `explore-and-earn` (configs `dev`, `stg` = preview, `prd`), synced to Vercel and GitHub Actions. Run anything that needs a real key as `doppler run --config dev -- <command>`. Never write a secret into a file or a commit. SP6 adds **no new environment variables**; it reads `APP_URL`, `BILLING_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `JOBS_SECRET`, `DATABASE_URL` and `NEXT_PUBLIC_POSTHOG_KEY`.
- **Domain:** `exploreandearn.com`; Resend sends from `send.exploreandearn.com`. Seekers are 18+.
- **Tables:** schema `app`, RLS enabled with no policies, UUIDv7 `id` from `newId()`, `created_at`/`updated_at` with the `app.set_updated_at()` trigger, money in integer cents with `currency text not null default 'USD'`, enums as `text` + CHECK. `listing_id` columns have no foreign key to SP2's listing table (spec 4).
- **Migrations:** `drizzle/NNNN_<name>.sql`. W0 writes `5000_addons.sql`, `5001_billing_addons.sql`, `5100_boosts.sql` and `5200_announcements.sql`, so each worktree migrates on its own. Follow-up ranges: W1 5010–5099, W2 5101–5199, W3 5201–5299, W4 5300–5399 (no tables), W6 5900–5999.
- **Imports:** `promote` → `boosts`, `announcements` → `addons`; `addons` imports no SP6 module and hands fulfillment over through outbox topics. SP6 modules may import SP2–SP5 modules through their indexes. `src/modules/hiring/**` and `src/modules/discovery/**` may not import `@/modules/{addons,boosts,announcements,promote}` (the ESLint rule from Task 1); discovery reaches the hook only through `src/server/placement-hook.ts`. Foundation's rules hold: modules only through `@/modules/<name>`; `src/ui/**` imports no module, types included; `drizzle-orm` only in modules and tests; no raw colors or arbitrary Tailwind values outside `src/ui/**`.
- **Ownership:** each workstream owns its module folder, its migration range, its route folders and its pages (File Structure). Shared files change only in W0: `src/server/{schedules,event-subscribers,job-handlers,placement-hook,sp2-wiring,sp6-wiring,module-registrations}.ts`, `src/db/schema.ts`, the notification `EmailTemplateName` union and `templateElement`, `SettingValues`, `eslint.config.mjs`, `package.json`, the four module `index.ts` files and their `notification-types.ts` files. B1 and B2 workstreams never edit them.
- **Authorization:** the org always comes from `HostContext.orgId`, never from input. Every host query filters by it, and an ID from another org returns 404 `not_found`. Buying, seats, announcements and Promote pages need `promote.manage` (Owner, Admin); listing add-on charges needs `promote.charges` (Owner, Admin, Billing). Operators act only through trust queues (`moderation`, `reports`, `billing`).
- **Errors:** the Foundation envelope `{ error: { code, message, details?, requestId } }`, with the machine reason in `details.reason` (for example 409 `conflict` with `details.reason = 'listing_not_active'`). A Stripe failure in checkout returns 500 `internal` with "Payments are temporarily unavailable. Try again in a few minutes." and leaves no pending purchase.
- **Prices (verbatim, product 16):** Boost **$49 / 7 days, $79 / 14 days, $99 / 28 days**. Announcements **1, 3 or 5 per month for $49, $99 or $149**, each runs for **7 days** and pins to the host page while it runs. Invite packs and extra seats: prices **open**; SKUs appear only when the founder creates the Stripe price with lookup key `ee_<sku>` (invite packs also need metadata `ee_credits`). Stripe prices are authoritative for charging.
- **Placement caps (verbatim, product 5.4):** "Boosts are paid. They are always labeled "Boosted", only appear when the job matches the seeker's filters, and never affect the fit score." Seek: first page only, never position 1, k = 5. Swipe: deck position 1 when a match exists, k = 4 across batches. Map: the spark pin, no cap. Feed: candidates only; SP7 enforces 1 in 5. The placement hook's budget is 120 ms (SP3 wraps it); p95 added latency ≤ 30 ms at 50,000 listings and 500 active boosts.
- **Announcement content:** title 1–80 and body 1–500 characters, plain text; no URLs, email addresses or phone numbers; one button to the host page or an Active listing; an optional approved org photo with required alt text ≤ 200 characters.
- **Rate limits:** `addons:checkout:<orgId>` 20 per hour (all three checkout routes share it); `announcements:submit:<orgId>` 20 per day; `ann:open:<ipHash>` and `ann:served:<ipHash>` 120 per minute, where `ipHash = hmacKey(<client IP>)` and the client IP is the first `x-forwarded-for` value, else `x-real-ip`, else `unknown` (SP3's rule).
- **Time:** crons run in UTC. Boost and run windows are exact hours (Plan decision 8). Server-side date labels format in `America/Chicago` (Plan decision 21).
- **Copy:** the name is written exactly **Explore&Earn**. No emoji and no exclamation marks. Voice is plain and warm, addressing the reader as "you". Strings in quotes in the spec and in this plan are exact. Labels: "Boosted" on every card of a listing with a live boost, on every discovery surface; "Paid announcement" on the `community` variant; "Announcement" on the `host_page` variant.
- **Privacy:** SP6 stores no seeker data. Serve and click counts are per-day aggregates; `viewerKey` is used in memory for the rotation hash and never written; analytics never shows who viewed, saved or clicked. Card data stays in Stripe Checkout; SP6 stores Stripe IDs and amounts only. The click route redirects only to an internal path computed from the stored target.
- **Analytics:** only `promote_checkout_started { sku }`, `promote_purchase_paid { sku }` and `boost_served { surface }` (sampled 1%), through Foundation's `track`, IDs only.
- **Accessibility and screens:** text contrast ≥ 4.5:1, UI elements ≥ 3:1, touch targets ≥ 44 px, visible focus, `prefers-reduced-motion`, real `<button>` and `<a>` elements, an `aria-label` on every icon-only control. Screens use only `src/ui` components: `Skeleton` while loading, `ErrorState` (icon and text) with Retry, an `EmptyState` on every list, and Chart/Table `SegmentedControl` beside charts. New patterns go through the gallery before a screen uses them.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Contact details written to slip past a plain pattern** in an announcement: full-width digits (`５５５-１２３-４５６７`), a full-width dot (`kettle．com`), `www.kettle.co`, `+1 (907) 555-0100`, `907 555 0100`, `bit.ly/abc`, `maya@kettle.com`. Expected: each is caught at submit with the field error, because text is NFKC-folded before matching; while ordinary job text such as `$18-$22/hr`, `Season runs 2026-2027`, `Shifts 7 a.m. to 3 p.m.`, `Join us in St. Louis` and `40 hours a week` passes. Pinned in Task 2.
2. **A window that crosses a daylight-saving change or a short month.** Expected: a 7-day boost starting 2027-03-10T15:00Z ends 2027-03-17T15:00Z even in a database session whose `TimeZone` is `America/New_York` (exactly 168 hours), and a pack paid 2027-01-31T12:00Z must be used by 2027-02-28T12:00Z. Pinned in Tasks 6 and 17.
3. **Stripe events out of order or about someone else's object:** `checkout.session.expired` delivered after the purchase is already paid (through reconcile), a `charge.refunded` for a subscription invoice, a subscription-mode Checkout Session. Expected: a paid purchase stays paid, and foreign objects change nothing. Pinned in Task 10.
4. **A placement `state` that is garbage, tampered or huge** (random base64, `{"v":1,"g":-5}`, 5,000 shown IDs), or a cursor from another surface. Expected: `place` treats an unparseable or out-of-range state as a fresh session, and clamps a valid gap from another surface to that surface's `k − 1`. It keeps at most the newest 200 shown IDs, never throws, and the caps still hold. Pinned in Task 15.
5. **Two operators refund the same purchase at nearly the same time**, or a refund larger than what is left. Expected: pending and succeeded refunds count against the charged amount, so the second refund that would exceed it gets 400 `bad_request` with `details.reason = 'exceeds_refundable'`, and the purchase is never refunded beyond its total. Pinned in Task 11 (one after the other in `refunds.test.ts`, at the same time in `refunds.int.test.ts`).

## Plan decisions

The spec leaves these choices open, or the upstream plans force them. Each task applies the decision; reviewers check it here.

1. **Payments gateway.** Every Stripe call in `addons` goes through `AddonsGateway` (Task 9), following SP2's `BillingGateway`: the real gateway uses `getStripe()`, `makeFakeAddonsGateway()` serves tests, and `BILLING_PROVIDER=stub` returns one shared fake per process in auto-complete mode (Checkout returns the success URL at once and the session reads `complete` and `paid`), so local e2e runs without Stripe.
2. **Checkout sessions expire 31 minutes after creation**, not 30, for the reason in SP2 plan decision 16 (Stripe's 30-minute minimum).
3. **Extra seats fold into the plan `seat` grant.** SP2's sync grants `seat` = plan seats + extra-seat quantity under SP2's sequenced key `plan:<subId>:seat:<qty>:<seq>` (SP2 plan decision 14). The spec's separate `plan:<subId>:seat_extra:<qty>` key would collide when a quantity repeats, which is why SP2 added the sequence.
4. **Seat decreases are applied by a scheduled job.** `setSubscriptionAddon` stores `pending_extra_seats` on SP2's `app.subscriptions` (migration 5001) and enqueues `billing.apply_addon_change` for `current_period_end − 1 hour`; that job updates Stripe with `proration_behavior: 'none'`, so the renewal invoice uses the new quantity. An increase, or a set to the current quantity, clears a pending decrease.
5. **Handlers learn their attempt number.** Foundation's `Handler` context gains `attempt` (the claim count, 1 on the first run). Refund and fulfillment handlers use `attempt >= MAX_ATTEMPTS` to mark the row `failed` or open the `billing` review item on the last try and then resolve, instead of letting the event die silently (spec 8.5, "after 8 failed attempts").
6. **The purchase records the fulfillment outcome.** `addon_purchases.fulfillment` (`fulfilled` or `voided`) is set by `addons.markFulfilled`, and `PurchaseView` adds `fulfillment: 'pending' | 'fulfilled' | 'voided'`, so the return page can show the voided message before Stripe's `charge.refunded` arrives.
7. **`refunded_cents` only grows, and both writers use a running total.** When Stripe returns `succeeded`, the refund handler sets `refunded_cents = greatest(refunded_cents, <the sum of the purchase's succeeded addon_refunds, this one included>)`. `charge.refunded` sets `greatest(refunded_cents, <the charge's amount_refunded>)`, which Stripe also reports as a running total. After 2,000 and then 1,000, both give 3,000. Either write recomputes `status`. Whichever write raises `refunded_cents` sends `addons.refunded` for the amount it added. Stripe can return a refund as `pending` or `requires_action`, which means the money isn't back yet. The row then stays `pending` with its `stripe_refund_id`, still counts against what's refundable, and becomes `succeeded` when `charge.refunded` lists it. A returned `failed` or `canceled` is final, because a retry with the same idempotency key gets the same answer: the row is marked `failed` and the `billing` item opens at once (Task 11). Stub mode (no charge events) and live mode then end in the same state with one notification per refund.
8. **Windows are exact hours.** Boost windows use `make_interval(hours => duration_days * 24)` and runs use `interval '168 hours'`, so a session `TimeZone` other than UTC can't turn a DST week into 167 or 169 hours. A pack's month is computed in UTC.
9. **Serving is decided by the time window.** A boost is live when `status in ('scheduled','active') and starts_at <= now and ends_at > now`; an announcement is live when `status in ('scheduled','running') and starts_at <= now and ends_at > now`. Ticks only move statuses and send notifications, so serving never waits for a cron (E6, E8).
10. **Listing closures end boosts at once.** Besides `boosts.tick`, the new topic `boosts.end_for_listing` subscribes to SP2's `listing.closed` and `listing.removed`, so `ended_early` lands in the next worker run, well inside E8's 60 seconds.
11. **Capabilities.** SP2's role matrix gains `promote.manage` (Owner, Admin) and `promote.charges` (Owner, Admin, Billing), and every SP6 host route calls `requireCapability(host, <cap>)`.
12. **Registrations load through `src/server/sp6-wiring.ts`.** It holds only side-effect imports of the four SP6 modules. Both `src/server/sp2-wiring.ts` and SP4's `src/server/module-registrations.ts` import it. `sp2-wiring` covers every entrypoint that renders SP2's provider slots (host page, listing rows, API routes, jobs). `module-registrations` covers pages that load only it, such as SP5's server-rendered `/host/analytics`, whose boost chart reads the windows source that `@/modules/boosts` registers (E7). `sp2-wiring` imports `module-registrations`, but not the other way round, so `sp2-wiring` alone would miss those pages on a cold server. W0 registers stubs that return empty results instead of throwing, so nothing breaks before B1 lands; the placement hook's W0 stub behaves exactly like `noopHook`.
13. **Host page serves are counted by a beacon.** SP2 serves `/hosts/[slug]` with `s-maxage=60`, so a render-time count would miss cached views and count crawlers. SP6's stack sends `POST /api/v1/announcements/served { orgId }` once per page view; the route skips `isLikelyBot` user agents and calls `listPinnedForHostPage(db, orgId, { countServe: true })`. SP2's provider calls it with `countServe: false`.
14. **`pinned_announcement` carries the image alt and the button label.** SP2's provider item and `HostPagePublic.announcements` add `imageAlt: string | null` (alt text is required with an image) and `ctaLabel: 'View jobs' | 'View job'` (the label falls back when a target listing closes, spec 8.3).
15. **Additions SP7 asked for** (SP7 spec section 13; additive): `AnnouncementCardData.startsAt`; `listRunningAnnouncements` orders by `starts_at desc, id desc`, and its `before`/`nextBefore` strings are `encodeAnnouncementCursor({ startsAt, id })` = `<ISO instant>|<uuid>`; `getPaidFeedItems` accepts `excludeOrgIds?: string[]`. **The `ctaHref` contract:** `AnnouncementCardData.ctaHref` is the bare click route `/api/v1/announcements/<id>/open`. Followed as-is, it redirects (302) to the target and counts no click, because the route's `surface` is optional and only a given surface counts (Task 19). A surface that counts clicks links to `announcementOpenHref(id, surface)` instead, as SP7's `PaidItem` and SP6's host page pins do. Host previews use the bare `ctaHref`, so a host's own clicks aren't counted.
16. **Small signature widenings:** `feedBoostCandidates` also returns `orgId` (so `promote` drops blocked and muted hosts without another lookup), `refundPurchase` accepts `DbOrTx` (it runs inside trust's `decide` transaction and only writes rows and enqueues), and `BoostEligibility` adds `listingEndsAt: Date | null`, the listing's `autoCloseAt`. No other API returns `autoCloseAt` to the client, and the boost sheet needs it to show "Your listing ends Nov 13" on the options it disables.
17. **Contact-detail rules are client-safe.** `findContactDetails` lives in `src/lib/promote/` so the composer shows live the same field errors that submit enforces. Drafts accept any text within the length limits; submit rejects (spec 8.3, "rejected at submit").
18. **Operator subject actions.** `addon_purchase` registers `refund` plus a no-op `approve` (to close a dispute or failure item). For `announcement`, `remove` rejects one still `in_review` (credit kept, the host can edit) and removes one that is scheduled or running (no credit back). A decision on a `moderation` item opened for an older revision changes nothing (Task 18). This extends spec 8.3's "stale results for an old revision are ignored" to operator decisions. `updateAnnouncement` clears `check_id` when it bumps the revision, and the handler compares the item's `checkId` with the announcement's current `check_id`. Task 1 adds `checkId` to `listOpenReviewItems`.
19. **`org_stopped` sends no per-item notifications.** SP8 tells the org about its suspension; refunds still notify through `addons.refunded`.
20. **No dependency for the property test.** It uses a seeded PRNG (`tests/helpers/prng.ts`, mulberry32) and prints the seed and the failing case.
21. **Server-side date labels** ("Boosted until Nov 10", notification and email copy) format with `formatPromoteDate` in `America/Chicago` (SP3's `DEFAULT_TZ`). Host screens format in the browser's zone.
22. **Retention.** SP6 keeps no per-viewer delivery record, so `promote` registers SP8's rule `promote.raw_delivery_identifiers` with a description saying only daily totals are kept and a `run` that deletes nothing. The other three modules register `[]`.
23. **One reminder per pack.** `announcements.credit_reminders` sets `announcement_packs.reminded_at`, which gives the spec's `remind:<packId>` dedupe.
24. **Test fakes.** Until Phase C, B1 tests replace SP2–SP5 modules and sibling SP6 modules with W0's fakes in `tests/fakes/sp6/` (`vi.mock('@/modules/<m>', ...)`). Foundation modules (jobs, trust, notifications, audit, settings, media) are real. Phase C proves the exit criteria against the real modules.
25. **Org deletion stops promotions through erasure.** SP8 calls `stopPromotionsForOrg` only from its org-suspension path. For a deleted org, SP8 runs each module's `privacyHandler.erase` for the `org` subject (SP8 Plan decision 10). So promote's `erase` for an `org` subject runs the same stop inside SP8's erase transaction with `reason: 'org_deleted'` (Task 21), and that is the `org_deleted` caller. Live boosts end, scheduled ones are voided and refunded, and the refund outbox rows commit with the erase step. Announcements' own `org` erase deletes the org's announcements, so the outcome is the same whichever of the two handlers runs first.

**Requests SP2's plan leaves to SP6** (SP2 plan, "Requests from sibling specs"), made in W0: `previewSubscriptionAddon`, `setSubscriptionAddon`, `taxEnabled`, the `ee_extra_seat_*` lookup keys and their seat grants, routing payment-mode Checkout events to `billing.stripe_event` (SP2's spec routes every `checkout.session.completed` to `billing.sync_subscription`), and `hostpages.listApprovedOrgPhotos` (Tasks 3–5). SP6 also adds `entitlements.listGrantBalances` and `billing.getSubscriptionAddon`, which the credits page needs, and `checkId` on the rows of SP2's trust touchpoint `listOpenReviewItems` (Task 1, for Plan decision 18). SP3's plan already provides the `getListingEventCounts` additions and the `placement-hook.ts` touchpoint; SP4 provides `getPreferenceTargets`, `getBlockSet` and `registerReportSubject`; SP5 provides `registerBoostWindowsSource`.

## File Structure

```
src/lib/promote/            client-safe (no database, no modules)
  types.ts contact-details.ts rotation.ts format.ts bots.ts index.ts                W0
src/modules/addons/
  index.ts schema.ts notification-types.ts                                           W0
  gateway.ts gateway-fake.ts catalog.ts prices.ts seed.ts                            W1 (Task 9)
  checkout.ts purchases.ts stripe-events.ts notify.ts                                W1 (Task 10)
  refunds.ts subjects.ts                                                             W1 (Task 11)
  invite-packs.ts seats.ts credits.ts revenue.ts privacy.ts jobs.ts                  W1 (Task 12)
src/modules/boosts/
  index.ts schema.ts notification-types.ts                                           W0
  eligibility.ts checkout.ts                                                         W2 (Task 13)
  fulfill.ts lifecycle.ts                                                            W2 (Task 14)
  active.ts placement.ts hook.ts stats.ts                                            W2 (Task 15)
  report.ts windows.ts badges.ts feed.ts privacy.ts jobs.ts                          W2 (Task 16)
src/modules/announcements/
  index.ts schema.ts notification-types.ts                                           W0
  packs.ts input.ts crud.ts                                                          W3 (Task 17)
  moderation.ts subjects.ts lifecycle.ts                                             W3 (Task 18)
  cards.ts stats.ts clicks.ts privacy.ts jobs.ts                                     W3 (Task 19)
src/modules/promote/
  index.ts                                                                           W0
  feed.ts serves.ts                                                                  W4 (Task 20)
  stop.ts summary.ts privacy.ts                                                      W4 (Task 21)
src/ui/patterns/AnnouncementCard.tsx AnnouncementStack.tsx                           W5
src/app/host/promote/**                                                              W5
```

W0 creates every module file above as a stub so each `index.ts` compiles; the owning workstream replaces the stub file's contents.

| Workstream | Creates (owns) | Modifies (touchpoints) |
|---|---|---|
| **W0** contracts | `src/lib/promote/*`, the four module folders as stubs, `drizzle/{5000_addons,5001_billing_addons,5100_boosts,5200_announcements}.sql`, `src/server/sp6-wiring.ts`, `src/modules/notifications/email/templates/{PromoteReceipt,PromoteNotice,BoostReport}.tsx`, `src/modules/billing/addons.ts`, `src/modules/hostpages/photos.ts`, `tests/fakes/sp6/*`, `tests/helpers/{sp6,prng}.ts`, `tests/e2e/helpers/sp6.ts`, `tests/sp6/{registry,migrations}.test.ts`, `tests/lint/fixtures/imports-promote.ts` | `src/modules/jobs/worker.ts`, `src/modules/notifications/{types.ts,email/send.ts}`, `src/modules/settings/registry.ts`, the trust file that defines SP2's `listOpenReviewItems`, `eslint.config.mjs`, `tests/lint/boundaries.test.ts`, `src/modules/billing/{webhook,sync,change,plans,schema,jobs,index}.ts`, `src/modules/entitlements/{ledger,index}.ts`, `src/modules/orgs/{roles,roles.test}.ts`, `src/modules/hostpages/{providers,public,index}.ts`, `src/server/{event-subscribers,schedules,job-handlers,placement-hook,sp2-wiring,module-registrations}.ts`, `src/db/schema.ts`, `src/modules/discovery/hooks.test.ts`, `package.json` |
| **W1** addons | `src/modules/addons/*` (all but W0's files), `drizzle/5010–5099`, `scripts/stripe-seed-addons.ts`, `src/app/api/v1/promote/{catalog,invite-packs,credits,seats,purchases}/**` | — |
| **W2** boosts | `src/modules/boosts/*` (all but W0's files), `drizzle/5101–5199`, `src/app/api/v1/promote/boosts/**` | — |
| **W3** announcements | `src/modules/announcements/*` (all but W0's files), `drizzle/5201–5299`, `src/app/api/v1/promote/{announcement-packs,announcements,host-media}/**`, `src/app/api/v1/announcements/**` | — |
| **W4** promote | `src/modules/promote/*` (all but `index.ts`), `src/app/api/v1/promote/summary/route.ts` | — |
| **W5** screens | `src/ui/patterns/{AnnouncementCard,AnnouncementStack}.tsx` and `announcement.test.tsx`, `src/app/design-system/patterns/announcement-card/page.tsx`, `src/app/host/promote/**` (replacing the placeholder), `tests/e2e/sp6-screens.spec.ts` | `src/ui/patterns/{MapPin,MapCanvas}.tsx` and `map.test.tsx` (SP3), `src/ui/components/JobCard.test.tsx`, the file under `src/app/hosts/[slug]/_components/` that renders `page.announcements` (SP2) |
| **W6** integration | `tests/sp6/{exit-criteria,surfaces,host-analytics,wiring}.test.ts`, `tests/sp6/stripe-test-mode.int.test.ts`, `tests/perf/sp6-placement.int.test.ts`, `tests/e2e/{sp6-promote,sp6-stripe}.spec.ts`, `docs/runbooks/sp6-addons-setup.md`, fixes in `drizzle/59xx` | any file, for integration fixes only |

## Phases

| Phase | Tasks | Runs | Depends on |
|---|---|---|---|
| **A: Contracts and touchpoints** (W0) | 1–8 | One agent, in order | Foundation merged and the design gate approved; SP2–SP5 merged |
| **B1: Domain workstreams** | W1: 9–12 · W2: 13–16 · W3: 17–19 · W4: 20–21 | Four worktrees in parallel; tasks within a workstream run in order | Phase A |
| **B2: Screens** (W5) | 22–26 | One worktree | B1 merged |
| **C: Integration** (W6) | 27–29 | One agent | Everything above |

---

## Phase A: Contracts and touchpoints (W0, one agent, sequential)

### Task 1 (W0): Foundation touchpoints

**Files:**
- Create: `src/modules/notifications/email/templates/{PromoteReceipt,PromoteNotice,BoostReport}.tsx`, `tests/lint/fixtures/imports-promote.ts`
- Modify: `src/modules/jobs/worker.ts`, `src/modules/jobs/worker.test.ts`, `src/modules/notifications/types.ts`, `src/modules/notifications/email/send.ts`, `src/modules/notifications/email/email.test.ts`, `src/modules/settings/registry.ts`, `src/modules/settings/settings.test.ts`, the trust file that defines SP2's `listOpenReviewItems` and its test, `eslint.config.mjs`, `tests/lint/boundaries.test.ts`

**Interfaces:**
- Produces:
  - `Handler = (payload: unknown, ctx: { db: Db; now: Date; attempt: number }) => Promise<void>`: `attempt` is the outbox row's `attempts` after the claim (1 on the first run). Existing handlers compile unchanged.
  - `EmailTemplateName` adds `'PromoteReceipt' | 'PromoteNotice' | 'BoostReport'`. Each takes Foundation's `{ title, body, url, footer }`. `PromoteReceipt` also renders `data.lines: { label: string; value: string }[]` as a two-column table; `BoostReport` renders `data.stats: { label: string; value: string }[]` the same way. `templateElement` gets the three cases.
  - `SettingValues['promote.paid_delivery_enabled']: boolean`, default `true`, schema `z.boolean()`.
  - `listOpenReviewItems` (SP2's trust touchpoint) rows add `checkId: string | null`, the item's `check_id`. The change is additive, and SP2's callers ignore the field. Task 18 uses it to drop operator decisions on an older revision's item (Plan decision 18).
  - **Import rule** in `eslint.config.mjs`: `promoteImport = { regex: '^(@/modules/|(\\.\\.?/)+(.+/)?)(addons|boosts|announcements|promote)(/|$)', message: 'Hiring and discovery must not import paid add-on modules: boosts never change fit or organic ranking (SP6 spec 3).' }`, in a block for `files: ['src/modules/hiring/**', 'src/modules/discovery/**']` with `restrict(deepModuleImport, promoteImport)`. ESLint replaces a rule's options per matching block, so if SP3 or SP5 already added a later block for these paths, merge its patterns into this one.

- [ ] **Step 1: Write the failing tests.**
  - **Worker:** a handler that records `ctx.attempt` sees `1` on its first run; after it throws once and the retry runs, it sees `2`.
  - **Email:** a test type defined with `email: { template: 'PromoteReceipt' }` and `data.lines = [{ label: 'Item', value: 'Boost, 7 days' }]` puts one stub-outbox message whose subject equals the title and whose HTML contains `Boost, 7 days`. `PromoteNotice` and `BoostReport` (with `data.stats = [{ label: 'Shown in boosted spots', value: '42' }]`) each render their title and lines.
  - **Settings:** `getSetting(db, 'promote.paid_delivery_enabled')` → `true`; `setSetting(db, 'promote.paid_delivery_enabled', 'yes' as never, { operatorId })` → `bad_request`.
  - **Trust:** an item opened by `runCheck` with `'__flag__'` is listed by `listOpenReviewItems` with that check's ID as `checkId`; one opened by `openReviewItem` without a check has `checkId: null`.
  - **Lint** (`boundaries.test.ts`): the fixture `import { placementHook } from '@/modules/boosts';` linted as `src/modules/discovery/x.ts` and as `src/modules/hiring/x.ts` → at least one `no-restricted-imports` error each; as `src/modules/applications/x.ts` → none. `import x from '../promote';` linted as `src/modules/discovery/y.ts` → an error. A deep import from `src/modules/discovery/x.ts` still errors.
- [ ] **Step 2:** Run `pnpm test src/modules/jobs src/modules/notifications src/modules/settings src/modules/trust tests/lint`. Expected: FAIL.
- [ ] **Step 3:** Implement. The templates reuse Foundation's `Layout`.
- [ ] **Step 4:** Run the same tests, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(foundation): SP6 touchpoints for handler attempts, promote emails, kill switch, review item check IDs and import rule`.

### Task 2 (W0): Client-safe promote library

**Files:**
- Create: `src/lib/promote/{types.ts,contact-details.ts,rotation.ts,format.ts,bots.ts,index.ts}`, `src/lib/promote/promote-lib.test.ts`

**Interfaces:**
- Produces (`@/lib/promote`):
  - **Spec section 3 types, verbatim:** `AddonSku`, `SeatSku`, `PurchaseStatus`, `CatalogEntry`, `PurchaseView` (plus `fulfillment: 'pending' | 'fulfilled' | 'voided'`, Plan decision 6), `RefundReason`, `BoostDuration`, `BoostStatus`, `BoostEligibility` (plus `listingEndsAt: Date | null`, Plan decision 16), `BoostReport`, `AnnouncementStatus`, `AnnouncementInput`, `AnnouncementCardData` (plus `startsAt: string`, Plan decision 15), `PaidFeedItem`, `PromoteSummary`.
  - **API types:**
    - `AnnouncementSummary = { id: string; title: string; status: AnnouncementStatus; live: boolean; targetType: 'host_page' | 'listing'; startsAt: string | null; endsAt: string | null; submittedAt: string | null; rejectionReason: string | null; holdsCredit: boolean }`
    - `AnnouncementDetail = AnnouncementInput & { id: string; status: AnnouncementStatus; live: boolean; revision: number; rejectionReason: string | null; startsAt: string | null; endsAt: string | null; packId: string | null }`
    - `CreditsView = { invites: { monthlyRemaining: number; monthlyResetsAt: string | null; packs: { purchaseId: string; remaining: number; validUntil: string | null }[] }; seats: { included: number; extra: number; used: number; pendingExtra: number | null; pendingEffectiveAt: string | null } }`
    - `PromoteSurface = 'feed' | 'announcements_tab' | 'host_page'`
  - **Constants:** `ADDON_SKUS` and `SEAT_SKUS` (spec order); `BOOST_DURATIONS = [7, 14, 28] as const`; `PACK_SIZES = [1, 3, 5] as const`; `FIXED_PRICES`: `boost_7d` 4900, `boost_14d` 7900, `boost_28d` 9900 (credits null), `announcement_pack_1` 4900, `announcement_pack_3` 9900, `announcement_pack_5` 14900 (credits 1, 3, 5); `boostSku(d: BoostDuration): AddonSku`; `packSku(size: 1 | 3 | 5): AddonSku`; `isBoostSku`, `isPackSku`, `isInvitePackSku`.
  - `findContactDetails(text: string): ('url' | 'email' | 'phone')[]`: NFKC-folds, then returns the distinct kinds found, in the order url, email, phone.
    - email: `/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i`
    - url: `https?://` or `www.` followed by a non-space, or a bare domain `label(.label)*.<tld>` (optionally followed by a path) where `tld` is in a fixed list: `com net org io co us info biz app dev jobs ly me ai gg tv xyz site online link page ca uk`
    - phone: `/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/` not preceded by a digit
  - `CONTACT_DETAILS_MESSAGE = "Links, emails and phone numbers aren't allowed. Seekers use the button."`
  - `fnv1a32(s: string): number` (FNV-1a over the UTF-8 bytes, offset basis 2166136261, prime 16777619, unsigned 32-bit) and `rotationOrder<T>(items: T[], key: (t: T) => string, viewerKey: string, now: Date): T[]`, sorted by `fnv1a32(key + '|' + viewerKey + '|' + now.toISOString().slice(0, 13))` ascending, ties by key.
  - `formatCents(cents: number): string` (`$49`, `$49.50`, `$2,990`); `formatPromoteDate(d: Date | string, tz = 'America/Chicago'): string` (`en-US`, `{ month: 'short', day: 'numeric' }`, so "Nov 10"); `skuLabel(sku: AddonSku | SeatSku, credits?: number | null): string` ("Boost, 7 days", "Boost, 14 days", "Boost, 28 days", "1 announcement", "3 announcements", "5 announcements", "Invite pack (25 credits)", "Extra seat").
  - `isLikelyBot(userAgent: string | null): boolean`: true for null, empty, or a match of `/bot|crawl|spider|slurp|preview/i`.
  - `announcementOpenHref(id: string, surface: PromoteSurface): string` → `/api/v1/announcements/<id>/open?surface=<surface>`

- [ ] **Step 1: Write the failing tests** (`promote-lib.test.ts`).
  - **(Review Focus 1)** `findContactDetails` returns a non-empty result for each of: `'Call 555-123-4567'` (`['phone']`), `'see example.com'` (`['url']`), `'www.kettle.co'`, `'https://x.io'`, `'bit.ly/abc'`, `'maya@kettle.com'` (`['email']`), `'(907) 555-0100'`, `'+1 (907) 555-0100'`, `'+1 907 555 0100'`, `'907 555 0100'`, `'kettle．com'`, `'５５５-１２３-４５６７'`. It returns `[]` for `'Pay is $18-$22/hr'`, `'Season runs 2026-2027'`, `'Shifts 7 a.m. to 3 p.m.'`, `'Join us in St. Louis'`, `'U.S. work authorization helpful'` and `'40 hours a week'`.
  - `fnv1a32('')` → `2166136261`, `fnv1a32('a')` → `0xe40c292c`, `fnv1a32('foobar')` → `0xbf9cf968`. `rotationOrder` with the same inputs twice returns the same order, and that order equals sorting by the explicit hash.
  - `formatCents(4900)` → `'$49'`, `4950` → `'$49.50'`, `14900` → `'$149'`, `299000` → `'$2,990'`. `formatPromoteDate('2026-11-10T03:00:00Z')` → `'Nov 9'`, and with `'UTC'` → `'Nov 10'`.
  - `isLikelyBot`: `'Mozilla/5.0 (compatible; Googlebot/2.1)'`, `'Twitterbot/1.0'`, `null` and `''` → true; `'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36'` → false.
  - `FIXED_PRICES.announcement_pack_5` → `{ amountCents: 14900, credits: 5 }`; `boostSku(14)` → `'boost_14d'`.
  - A static scan of `src/lib/promote/` finds no non-type import of `@/lib/db`, `drizzle-orm`, `server-only` or `@/modules/`.
- [ ] **Step 2:** Run `pnpm test src/lib/promote`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(promote): client-safe types, contact-detail rules, rotation hash and formatting`.

### Task 3 (W0): SP2 billing: payment-mode events, the tax flag and seat lookup keys

**Files:**
- Create: `drizzle/5001_billing_addons.sql`, `src/modules/billing/sp6-touchpoints.test.ts`
- Modify: `src/modules/billing/{webhook.ts,sync.ts,change.ts,plans.ts,schema.ts,index.ts}`

**Interfaces:**
- Consumes: SP2's `handleStripeWebhook`, `syncSubscription`, `changePlan`, `previewChange`, `PLANS`, `makeFakeBillingGateway`, `emit`
- Produces:
  - `ADDON_LOOKUP_KEYS = { extra_seat: { month: 'ee_extra_seat_month', year: 'ee_extra_seat_year' } } as const`; `isAddonLookupKey(key: string): boolean`
  - `taxEnabled(): boolean` → `false`, with a comment pointing at SP2 section 13 (Stripe Tax stays off until that open item is decided)
  - **`5001_billing_addons.sql`:** `app.subscriptions` adds `extra_seats int not null default 0 check (extra_seats between 0 and 50)`, `pending_extra_seats int null check (pending_extra_seats between 0 and 50)`, `pending_extra_seats_at timestamptz null`, and `check ((pending_extra_seats is null) = (pending_extra_seats_at is null))`
  - **Webhook routing:** `checkout.session.completed` and `checkout.session.expired` whose object has `mode = 'payment'` or a `metadata.ee_purchase_id` are emitted as `billing.stripe_event` `{ eventId, type, objectId }` and never enqueue `billing.sync_subscription`. Subscription-mode sessions keep SP2's behavior.
  - **Sync:** items with an addon lookup key are known (no `unknown_price` item). The row stores `extra_seats`. The plan `seat` grant quantity is `PLANS[plan].seats + extraSeats` under SP2's sequenced key (Plan decision 3). A change in extra seats re-issues the plan grants and emits `subscription.changed`.
  - **Plan change:** `previewChange` and `changePlan` carry the extra-seat item across plan and interval changes (`ee_extra_seat_<new interval>` at the current quantity). The seat check and `newLimits.seats` use plan seats + extra seats.

- [ ] **Step 1: Write the failing tests** (`sp6-touchpoints.test.ts`, with SP2's fake gateway, SP2's entitlements fake and `@/server/event-subscribers` mocked to `{ 'billing.stripe_event': ['test.stripe_event'] }`).
  - A `checkout.session.completed` webhook with `mode: 'payment'` and `metadata.ee_purchase_id: 'p1'` → one `test.stripe_event` outbox row with dedupe `<eventId>:test.stripe_event` and no `billing.sync_subscription` row. A payment-mode `checkout.session.expired` → the same. A subscription-mode `checkout.session.completed` still enqueues `billing.sync_subscription`.
  - Sync of Professional monthly with `ee_extra_seat_month` × 3 → `getCapacity(seat).limit` 8 from grant `plan:<sub>:seat:8:1`, `subscriptions.extra_seats = 3`, and no `billing` review item. Then × 1 → `plan:<sub>:seat:6:2`, limit 6. Then × 3 → `plan:<sub>:seat:8:3`, limit 8.
  - An item with lookup key `ee_mystery` still opens a `billing` item with reason `unknown_price`.
  - `changePlan` from Professional monthly with 3 extra seats to Enterprise annual → the fake's `updateSubscription` items contain `{ lookupKey: 'ee_extra_seat_year', quantity: 3 }` and no `ee_extra_seat_month`. With 8 members, Professional + 3 extra seats → Starter → `conflict` `seat_limit` (1 + 3 = 4 < 8).
  - `taxEnabled()` → `false`.
  - After migrating, setting `pending_extra_seats = 2` with `pending_extra_seats_at` null violates the pair check.
- [ ] **Step 2:** Run `pnpm test src/modules/billing`. Expected: FAIL.
- [ ] **Step 3:** Implement. SP2's existing billing tests must still pass.
- [ ] **Step 4:** Run `pnpm test src/modules/billing`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(billing): route payment-mode Checkout events to SP6, extra-seat lookup keys, tax flag`.

### Task 4 (W0): SP2 billing: add-on quantities on the plan subscription

**Files:**
- Create: `src/modules/billing/{addons.ts,addons.test.ts}`
- Modify: `src/modules/billing/{index.ts,jobs.ts}`, `src/modules/billing/gateway-fake.ts` (only if its `previewInvoice` ignores item quantities)

**Interfaces:**
- Consumes: Task 3's columns and lookup keys; SP2's `BillingGateway.previewInvoice` and `updateSubscription`, `syncSubscription`, `enqueue`, `record`
- Produces:
  - `type SubscriptionAddon = 'extra_seat'`
  - `getSubscriptionAddon(db: DbOrTx, orgId: string, addon: SubscriptionAddon): Promise<{ quantity: number; interval: BillingInterval | null; pending: { quantity: number; effectiveAt: Date } | null }>`, from the org's current subscription row (`quantity: 0, interval: null, pending: null` without one)
  - `previewSubscriptionAddon(db: Db, i: { orgId: string; addon: SubscriptionAddon; quantity: number }, gw?: BillingGateway): Promise<{ amountDueNowCents: number; nextRenewalCents: number; effectiveAt: Date }>`:
    - No `active` or `trialing` subscription → 409 `conflict` with `details.reason = 'subscription_inactive'`.
    - Increase: `previewInvoice` with the add-on item at `quantity` and `always_invoice` → `amountDueNowCents = dueNowCents`, `nextRenewalCents = nextInvoiceCents`, `effectiveAt = now`.
    - Decrease: `amountDueNowCents = 0`, `nextRenewalCents` from a preview with `prorationBehavior: 'none'`, `effectiveAt = current_period_end`. Equal: the same with `effectiveAt = now`.
  - `setSubscriptionAddon(db: Db, i: { orgId: string; addon: SubscriptionAddon; quantity: number; actorUserId: string }, gw?: BillingGateway): Promise<{ effectiveAt: Date }>`:
    - `quantity` must be an integer 0–50, else `bad_request`; the same `subscription_inactive` rule.
    - **Increase:** `updateSubscription(subId, { items: <current items with the add-on at quantity>, prorationBehavior: 'always_invoice', paymentBehavior: 'error_if_incomplete' }, 'addon:<subId>:extra_seat:<quantity>:<periodEndUnix>')`, then `syncSubscription`, then clear any pending decrease. A card decline → 409 `conflict` with `details.reason = 'payment_failed'` and the message "Your card was declined. Update your payment method in Billing, then try again.", and nothing changes.
    - **Decrease:** set `pending_extra_seats = quantity` and `pending_extra_seats_at = current_period_end`, and enqueue `billing.apply_addon_change` `{ orgId, subscriptionId, quantity }` with `availableAt = current_period_end − 1 hour` and dedupe `addon:<subId>:extra_seat:<quantity>:<periodEndUnix>`. Returns `effectiveAt = current_period_end`.
    - **Equal:** clear the pending decrease; `effectiveAt = now`.
    - Records `billing.addon_changed` `{ addon, from, to, effectiveAt }` with `orgId`.
  - **The `billing.apply_addon_change` handler** (added to billing's `jobHandlers`): does nothing unless the row still has `pending_extra_seats = payload.quantity` on the same subscription. Otherwise it calls `updateSubscription` with `prorationBehavior: 'none'` and key `addon-apply:<subId>:<quantity>:<periodEndUnix>`, clears the pending columns, then calls `syncSubscription`.

- [ ] **Step 1: Write the failing tests** (`addons.test.ts`, fake gateway, Professional monthly with 2 extra seats, `current_period_end` 2026-12-03T17:00Z).
  - `previewSubscriptionAddon` to 4 → the fake preview's due-now amount and `effectiveAt = FIXED_NOW`. To 1 → `amountDueNowCents: 0`, `effectiveAt` 2026-12-03T17:00Z.
  - `setSubscriptionAddon` to 4 → the fake records `always_invoice`, `error_if_incomplete` and key `addon:<sub>:extra_seat:4:<unix>`; `getCapacity(seat).limit` becomes 9; `billing.addon_changed` is recorded with `{ from: 2, to: 4 }`.
  - `declineNextUpdate()` then set to 4 → `conflict` `payment_failed` with the exact message, and the quantity stays 2.
  - Set to 1 → `effectiveAt` 2026-12-03T17:00Z, the pending columns are set, one outbox row with `available_at` 2026-12-03T16:00Z, no gateway update yet, and the seat limit still 7. Running the handler → an update with `prorationBehavior: 'none'`, the seat limit 6, and the pending columns cleared.
  - Set to 1, then to 3 → the pending columns are cleared; the later handler run for 1 calls no gateway method.
  - A `past_due` subscription → `subscription_inactive`; quantity 51 → `bad_request`.
- [ ] **Step 2:** Run `pnpm test src/modules/billing/addons.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and export the three functions and `SubscriptionAddon` from `@/modules/billing`.
- [ ] **Step 4:** Run `pnpm test src/modules/billing`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(billing): extra-seat quantities with prorated increases and renewal-time decreases`.

### Task 5 (W0): SP2 entitlements, roles and host page touchpoints

**Files:**
- Create: `src/modules/hostpages/{photos.ts,photos.test.ts}`, `src/modules/entitlements/grant-balances.test.ts`
- Modify: `src/modules/entitlements/{ledger.ts,index.ts}`, `src/modules/orgs/{roles.ts,roles.test.ts}`, `src/modules/hostpages/{providers.ts,public.ts,public.test.ts,index.ts}`

**Interfaces:**
- Consumes: SP2's ledger tables, role matrix and provider registry; `app.media`
- Produces:
  - `listGrantBalances(db: DbOrTx, orgId: string, i: { kind: CreditKind; source?: GrantSource }, now?: Date): Promise<{ grantId: string; source: GrantSource; sourceRef: string; quantity: number; remaining: number; validUntil: Date | null }[]>`: grants valid at `now`, `remaining` = quantity − the unreversed consumption rows drawn from that grant, ordered by `validUntil` ascending with nulls last
  - `HostCapability` adds `'promote.manage' | 'promote.charges'`: `promote.manage` for Owner and Admin, `promote.charges` for Owner, Admin and Billing
  - `listApprovedOrgPhotos(db: DbOrTx, orgId: string, o?: { limit?: number }): Promise<{ mediaId: string; altText: string | null; width: number | null; height: number | null }[]>`: `app.media` rows with `owner_org_id = orgId`, `status = 'approved'`, `bucket = 'media-public'` and kind in `cover`, `listing_photo`, `housing_photo`, `meal_photo`, newest first, default limit 60, at most 200
  - The `pinned_announcement` provider's item type adds `imageAlt: string | null` and `ctaLabel: 'View jobs' | 'View job'`, and `HostPagePublic.announcements` items carry both (Plan decision 14)

- [ ] **Step 1: Write the failing tests.**
  - **Grant balances:** a plan grant of 50 (valid until the 1st of next month) and a pack grant of 30 (valid 365 days), then a consumption of 52 → plan `remaining: 0`, pack `remaining: 28`. With `source: 'pack'` only the pack row returns. A grant ended before `now` is omitted.
  - **Roles:** the table-driven matrix grows to 15 capabilities × 4 roles (60 assertions); `can({ role: 'recruiter' }, 'promote.manage')` and `can({ role: 'billing' }, 'promote.manage')` → false; `can({ role: 'billing' }, 'promote.charges')` → true.
  - **Photos:** an approved `listing_photo` of the org is listed; one `in_review`, another org's, and a `logo` are not; `limit: 1` returns one.
  - **Provider:** a registered `pinned_announcement` returning `imageAlt: 'Crew on the dock'` and `ctaLabel: 'View job'` → `resolveHostPage` gives `page.announcements[0]` with that `imageAlt` and `ctaLabel`.
- [ ] **Step 2:** Run the four test files. Expected: FAIL.
- [ ] **Step 3:** Implement and export `listGrantBalances` and `listApprovedOrgPhotos` from their module indexes.
- [ ] **Step 4:** Run `pnpm test src/modules/entitlements src/modules/orgs src/modules/hostpages`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp2): per-grant credit balances, promote capabilities, approved org photos, announcement alt text`.

### Task 6 (W0): Migrations and Drizzle schemas

**Files:**
- Create: `drizzle/5000_addons.sql`, `drizzle/5100_boosts.sql`, `drizzle/5200_announcements.sql`, `src/modules/{addons,boosts,announcements}/schema.ts`, `tests/sp6/migrations.test.ts`
- Modify: `src/db/schema.ts` (re-exports the three schemas)

**Interfaces:**
- Produces:
  - **Tables:** exactly the spec section 4 rows, columns, CHECKs and indexes, with these changes:
    - `addon_purchases.fulfillment text null check (fulfillment in ('fulfilled','voided'))` (Plan decision 6)
    - `announcement_packs.reminded_at timestamptz null` (Plan decision 23)
    - `boosts` CHECK `ends_at = starts_at + make_interval(hours => duration_days * 24)`; `announcements` CHECK `ends_at is null or ends_at = starts_at + interval '168 hours'` and `(starts_at is null) = (ends_at is null)` (Plan decision 8)
  - **Drizzle tables:** `addonPrices`, `addonPurchases`, `addonRefunds`, `boosts`, `boostDailyStats`, `announcementPacks`, `announcements`, `announcementDailyStats`

- [ ] **Step 1: Write the failing tests** (`migrations.test.ts`).
  - All 8 tables exist and have `relrowsecurity = true`.
  - `addon_purchases`: a `boost_7d` row without `target_listing_id`, and an `announcement_pack_1` row with one, each violate the CHECK. A second `pending` row for the same listing violates the unique index, as does a second `pending` `(org, announcement_pack_1)`. A `paid` and a `pending` row for one listing coexist.
  - **(Review Focus 2)** In a session after `set time zone 'America/New_York'`, a boost with `duration_days = 7`, `starts_at` 2027-03-10T15:00Z and `ends_at` 2027-03-17T15:00Z inserts; `ends_at` 2027-03-17T14:00Z violates the CHECK. An announcement with `starts_at` 2027-03-10T15:00Z and `ends_at` 2027-03-17T15:00Z inserts there too.
  - `duration_days = 10` violates; `boost_daily_stats` with surface `map` violates.
  - `announcements`: title `''`, an 81-character title, a 501-character body, and an image without alt each violate. `announcement_packs` with `size = 3` and `credits_used = 4` violates.
- [ ] **Step 2:** Run `pnpm test tests/sp6/migrations.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the migrations and schemas.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp6): add-on, boost and announcement tables`.

### Task 7 (W0): Module skeletons, registrations and registries

**Files:**
- Create: the four module folders' files listed in File Structure (stubs, plus the final `index.ts` and `notification-types.ts` files), `src/server/sp6-wiring.ts`, `tests/sp6/registry.test.ts`
- Modify: `src/server/{job-handlers,schedules,event-subscribers,placement-hook,sp2-wiring,module-registrations}.ts`, `src/modules/discovery/hooks.test.ts`, `package.json`, `src/modules/privacy/index.ts` (only if absent)

**Interfaces:**
- Produces:
  - **Exports:** every spec section 3 export and every name under **Produces** in Tasks 9–21, from its module's `index.ts`, with the Task 2 types re-exported by the module that owns them and `isLikelyBot` re-exported by `@/modules/promote`. Stubs throw `new Error('not implemented: <name> (W<n>)')`, except these, which return empty results so nothing breaks before B1:
    - `placementHook.place` returns the organic list unchanged (exactly `noopHook`'s output) and `boostedAmong` returns an empty `Map`
    - the listing row badge provider returns an empty `Map`; `boostWindowsSource` returns `[]`; `listPinnedForHostPage` returns `[]`
    - each `privacyHandler.exportData` returns `{ records: {}, files: [] }` and `erase` returns `{ erased: 0, retained: [] }`
    - each module's `jobHandlers` has a no-op for every topic it owns
  - **Topics:** addons `addons.stripe_event`, `addons.fulfill_invite_pack`, `addons.refund`, `addons.reconcile_pending`, `addons.sync_prices`; boosts `boosts.fulfill`, `boosts.tick`, `boosts.end_for_listing`; announcements `announcements.fulfill_pack`, `announcements.moderate`, `announcements.tick`, `announcements.credit_reminders`.
  - **Module-load registrations** (from files each `index.ts` imports):
    - addons: `registerSubjectHandlers('addon_purchase', { refund, approve })`
    - boosts: `registerListingRowBadgeProvider(rowBadges)`, `registerBoostWindowsSource(boostWindowsSource)`
    - announcements: `registerHostPageProvider({ kind: 'pinned_announcement', fn: hostPagePins })`, `registerSubjectHandlers('announcement', { approve, remove })`, `registerReportSubject('announcement', { trustSubjectType: 'announcement', exists })`
  - **Notification types**, defined for real here (final copy), with recipients chosen by `notifyOrg` (Task 10). Body lines are joined with `\n`.

    | Type | Category | Mandatory | Title | Body | URL | Email |
    |---|---|---|---|---|---|---|
    | `addons.purchase_confirmed` | billing | yes | "Payment received" | "{item} · {amount}. Your receipt is in Billing." | `/host/promote` | `PromoteReceipt` (lines Item, Amount, Date) |
    | `addons.refunded` | billing | yes | "Refund issued" | "We refunded {amount} for {item}. It can take 5–10 days to reach your card." | `/host/billing` | `PromoteReceipt` |
    | `boosts.started` | jobs | no | "Your boost has started" | "{listingTitle} is boosted until {endsLabel}." | `/host/promote/boosts/{boostId}` | none (push) |
    | `boosts.ended` | jobs | no | "Your boost has ended" | "{listingTitle} was shown in {served} boosted spots." / "Views per day: {before} before, {during} during." / "Applications from Boost: {applications}." | the same | `BoostReport` (stats) |
    | `boosts.ended_early` | jobs | no | "Your boost ended early" | voided: "We couldn't start your boost because the listing closed. We've refunded you." Otherwise: "{listingTitle} closed, so its boost stopped." | the same | `PromoteNotice` |
    | `announcements.approved` | jobs | no | "Your announcement is approved" | "Starts {startsLabel}." | `/host/promote/announcements/{id}` | `PromoteNotice` |
    | `announcements.rejected` | jobs | no | "Your announcement needs changes" | "{reason} Your credit is kept." | the same | `PromoteNotice` |
    | `announcements.ended` | jobs | no | "Your announcement has ended" | "{title} ran until {endsLabel}." | the same | none |
    | `announcements.removed` | account | yes | "We removed your announcement" | "{title} was removed after a review." | the same | `PromoteNotice` |
    | `announcements.credits_expiring` | jobs | no | "Your announcement credits expire soon" | "You have {left} left. Use them by {dateLabel}." | `/host/promote/announcements` | `PromoteNotice` |

    `boosts.started` uses `push: true`; `boosts.ended` passes `data.stats` (Shown in boosted spots, Views per day before, Views per day during, Applications from Boost).
  - **Registries:**
    - `job-handlers.ts` merges the four `jobHandlers` maps.
    - `schedules.ts` appends `addons.reconcile_pending` `*/10 * * * *`, `addons.sync_prices` `0 * * * *`, `boosts.tick` `* * * * *`, `announcements.tick` `* * * * *`, `announcements.credit_reminders` `0 16 * * *`.
    - `event-subscribers.ts` appends `addons.stripe_event` to `billing.stripe_event`, and `boosts.end_for_listing` to `listing.closed` and `listing.removed`.
    - `src/server/placement-hook.ts` becomes exactly `export { placementHook as boostPlacementHook } from '@/modules/boosts';`
    - `src/server/sp6-wiring.ts` holds side-effect imports of the four SP6 modules, with a comment that it exists for their module-load registrations; `src/server/sp2-wiring.ts` and `src/server/module-registrations.ts` each add `import './sp6-wiring';` (Plan decision 12).
    - `package.json` adds the script `"stripe:seed-addons": "tsx scripts/stripe-seed-addons.ts"` (W1 writes the script).
  - **Privacy registration** (SP8's shape; Tasks 12, 16, 19 and 21 fill the bodies): `privacyHandler` per module with `module` = the module name and `tables` = addons `['addon_prices', 'addon_purchases', 'addon_refunds']`, boosts `['boosts', 'boost_daily_stats']`, announcements `['announcement_packs', 'announcements', 'announcement_daily_stats']` with `mediaColumns: [{ table: 'announcements', column: 'image_media_id', array: false }]`, promote `[]`. `retentionRules` is `[]` except promote's final rule `promote.raw_delivery_identifiers` (description: "Boosted job and announcement deliveries: Explore&Earn keeps only daily totals, with no record of who saw or clicked them."; `run` returns `{ deleted: 0 }`).

- [ ] **Step 1: Write the failing tests** (`tests/sp6/registry.test.ts`).
  - Every topic in `schedules` and in every `eventSubscribers` list has a handler; every SP6 topic starts with its owning module's name; `handlers` builds without a duplicate-topic error.
  - `eventSubscribers['billing.stripe_event']` contains `'addons.stripe_event'`; `listing.closed` contains both `'discovery.sync_listing'` and `'boosts.end_for_listing'`.
  - The sources of `src/server/sp2-wiring.ts` and `src/server/module-registrations.ts` each import `./sp6-wiring`, which imports the four modules. Task 27's wiring test proves the behavior on a cold import.
  - `getPlacementHook()` resolves to the same object as `placementHook` from `@/modules/boosts`. Update SP3's `hooks.test.ts`, which expected `noopHook`, to assert that identity only (W2's real hook returns its own `state`, so SP3's test must not pin the state).
  - The W0 stub's `place(db, { organic: ['a', 'b'], state: 's', ... })` returns `items` `[{ listingId: 'a', boostId: null }, { listingId: 'b', boostId: null }]` and `organicConsumed: 2`.
  - Every name in Tasks 9–21's **Produces** is exported (`typeof` is `'function'`, or the constant is defined).
  - `getType('addons.purchase_confirmed')` is mandatory with category `billing`; `getType('announcements.removed')` is mandatory with category `account`; all 10 types are defined.
  - The four `privacyHandler.tables` lists equal the lists above, with no table in two of them; promote's `retentionRules` keys are `['promote.raw_delivery_identifiers']` and its `run` returns `{ deleted: 0 }`.
- [ ] **Step 2:** Run `pnpm test tests/sp6 src/modules/discovery/hooks.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp6): module contracts as stubs, registrations, schedules, subscribers and the placement hook line`.

### Task 8 (W0): Fakes and test helpers

**Files:**
- Create: `tests/fakes/sp6/{billing,entitlements,listings,orgs,hostpages,discovery,profiles,safety,analytics,addons,boosts,announcements}.ts`, `tests/fakes/sp6/fakes.test.ts`, `tests/helpers/sp6.ts`, `tests/helpers/prng.ts`, `tests/e2e/helpers/sp6.ts`

**Interfaces:**
- Produces:
  - **Fakes**, each typed `satisfies Partial<typeof import('@/modules/<m>')>`, used as `vi.mock('@/modules/<m>', async (orig) => ({ ...(await orig()), ...(await import('<path>')).<m>Fake }))`, each with a `calls` log and `reset()`:
    - `billingFake`: `setState(orgId, partial)` over a default `active` Professional monthly `SubscriptionState`; `getSubscriptionState`; `ensureStripeCustomer` → `cus_fake_<first 8 of orgId>`; `taxEnabled` → false; `getSubscriptionAddon`, `previewSubscriptionAddon` and `setSubscriptionAddon` over an in-memory quantity and pending decrease with Task 4's rules; `failNext(fn)`.
    - `entitlementsFake`: SP2's ledger semantics in memory for `grant` (idempotent by key), `endGrant`, `getBalance`, `listGrantBalances` and `consume`; `getCapacity` from `setCapacity(orgId, 'seat', { limit, used })`.
    - `listingsFake`: `putListing({ id, orgId, title, state, locationId, primaryCategory, autoCloseAt, firstPublishedAt })`, `setState(id, state)`, `getListingSummaries` (every state), `getPublishedListing` (active only); `registerListingRowBadgeProvider` captures the provider.
    - `orgsFake`: `setMembers(orgId, members)` and `listMembers`; `requireCapability` and `can` stay real.
    - `hostpagesFake`: `putHost(identity)`, `getHostIdentities`, `setPhotos(orgId, photos)`, `listApprovedOrgPhotos`; `registerHostPageProvider` captures.
    - `discoveryFake`: `putListingFacts(id, { category, state, orgId })` and `matchListingIds` (keeps IDs whose facts match `query.categories` and `query.states` when present); `addEvents(rows: { listingId; type; source; at: Date }[])` and `getListingEventCounts`, which aggregates them with SP3's rules (range `[from, to)` on UTC days, `bucket` `day`/`none`, grouping by `source` only when `sources` is given).
    - `profilesFake`: `setPreferences(userId, { categories, states })`, `getPreferenceTargets` (empty lists by default).
    - `safetyFake`: `setBlockSet(userId, set)`, `getBlockSet`; `registerReportSubject` captures.
    - `analyticsFake`: `registerBoostWindowsSource` captures.
    - `addonsFake`: `createCheckout` → `{ purchaseId: newId(), checkoutUrl: 'https://checkout.test/<id>' }`; `putPurchase(p)` and `getPurchaseForFulfillment`; `markFulfilled`, `refundPurchase` (→ `{ refundId: newId() }`), `notifyOrg` and `reportFulfillmentDead` record their calls; `getCatalog` returns `FIXED_PRICES` as available; `setInviteCredits(orgId, v)` and `getInviteCredits`; `setSeatSummary(orgId, v)` and `getSeatSummary`.
    - `boostsFake`: `setFeedCandidates(list)`, `feedBoostCandidates` (honors `exclude`), `recordBoostServes` (records), `stopBoostsForOrg` (records, returns a settable count), `setCounts(orgId, v)` and `countBoosts`.
    - `announcementsFake`: `setRunning(cards)`, `listRunningAnnouncements` (honors `hiddenOrgIds` and `limit`), `getAnnouncementCards`, `recordAnnouncementServes` (records), `stopAnnouncementsForOrg` (records, returns a settable count), `setCreditSummary(orgId, v)` and `getAnnouncementCreditSummary`.
  - **`tests/helpers/sp6.ts`:**
    - `seedPromoteOrg(db: Db): Promise<{ orgId: string; owner: SeededMember; admin: SeededMember; recruiter: SeededMember; billing: SeededMember }>` (SP2's `seedHostOrg` and `seedMember`, so notifications have real users)
    - `insertPurchase(db, o: { orgId: string; buyerUserId: string; sku: AddonSku } & Partial<{ status; targetListingId; amountTotalCents; paidAt; paymentIntentId; checkoutSessionId; createdAt }>): Promise<string>` (default `paid`, amounts from `FIXED_PRICES`)
    - `insertBoost(db, o)`, `insertPack(db, o)`, `insertAnnouncement(db, o)`: raw inserts with valid defaults; each returns the ID
    - `liveWindow(start: Date, days: number): { startsAt: Date; endsAt: Date }`
    - re-exports `FIXED_NOW` (2026-11-03T17:00:00Z)
  - **`tests/helpers/prng.ts`:** `mulberry32(seed: number): () => number`, `randInt(rand, min, max)`, `pick(rand, list)`, `shuffle(rand, list)`
  - **`tests/e2e/helpers/sp6.ts`:** `signInAsHostAdmin(page)` (a dev-instance test user seeded as Admin of the Kettle Ridge Lodge org through SP2's `seedMember`); `buyWithStub(page, path: string, body: unknown): Promise<{ purchaseId: string }>` (POSTs the checkout route from inside the page, opens the returned URL, then polls `GET /api/v1/promote/purchases/<id>` until `fulfillment !== 'pending'`); `publishSeasonal(db, host, title)` wrapping SP3's `publishListing`

- [ ] **Step 1: Write the failing tests** (`fakes.test.ts`).
  - No function the B1 tasks list under **Consumes (fake)** throws `not implemented`.
  - `discoveryFake.getListingEventCounts` over seeded views on 2026-11-01 and 2026-11-02 with `bucket: 'day'` returns one row per day; with `types: ['apply'], sources: ['boost'], bucket: 'none'` it counts only boost-source applies and sets `source: 'boost'`.
  - `discoveryFake.matchListingIds` with `query: { categories: ['farm'] }` drops a maritime listing.
  - `listingsFake.getPublishedListing` returns null after `setState(id, 'closed')`, and `getListingSummaries` reports `closed`.
  - `mulberry32(42)` gives the same first five numbers on two calls.
- [ ] **Step 2:** Run `pnpm test tests/fakes/sp6`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `test(sp6): upstream and sibling module fakes, seed helpers and PRNG`.

---

## Phase B1: Domain workstreams (in parallel; one worktree per workstream, based on Phase A)

Each workstream replaces its own stub files, keeps every signature from Tasks 2 and 7, and mocks upstream and sibling modules with `tests/fakes/sp6/*` (Plan decision 24). Every route is a thin `apiRoute`: `auth: 'host'` (or `'none'` where stated), `requireCapability(host, <cap>)`, the spec section 5 rate limit, one service call, and an `openapi` entry. The service functions carry the tests.

### Task 9 (W1): Gateway, price sync, seed script and catalog

**Files:**
- Create: `src/modules/addons/{gateway.ts,gateway-fake.ts,catalog.ts,prices.ts,seed.ts,catalog.test.ts}`, `scripts/stripe-seed-addons.ts`, `src/app/api/v1/promote/catalog/route.ts`

**Interfaces:**
- Consumes: `getStripe()`; `raiseAlert`; `getEnv().BILLING_PROVIDER`
- Produces:
  - `interface AddonsGateway`:
    - `createPaymentCheckout(p: { customerId: string; priceId: string; clientReferenceId: string; metadata: Record<string, string>; successUrl: string; cancelUrl: string; expiresAt: Date; automaticTax: boolean }, idempotencyKey: string): Promise<{ id: string; url: string; expiresAt: Date }>`
    - `retrieveCheckoutSession(id: string): Promise<{ id: string; mode: 'payment' | 'subscription' | 'setup'; status: 'open' | 'complete' | 'expired'; paymentStatus: 'paid' | 'unpaid' | 'no_payment_required'; paymentIntentId: string | null; amountTotalCents: number | null; metadata: Record<string, string> }>`
    - `expireCheckoutSession(id: string): Promise<'expired' | 'already_complete'>`
    - `retrieveEvent(id: string): Promise<{ id: string; type: string; object: Record<string, unknown> }>`
    - `createRefund(i: { paymentIntentId: string; amountCents: number; metadata: Record<string, string> }, idempotencyKey: string): Promise<{ id: string; status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'requires_action' }>`
    - `listPricesByLookupKeys(keys: string[]): Promise<{ lookupKey: string; priceId: string; unitAmountCents: number; currency: string; recurringInterval: 'month' | 'year' | null; active: boolean; metadata: Record<string, string> }[]>`
  - `addonsGateway(): AddonsGateway`, chosen by `BILLING_PROVIDER` (Plan decision 1)
  - `makeFakeAddonsGateway(o?: { autoComplete?: boolean; now?: () => Date })` with controls `setPrice(p)`, `removePrice(lookupKey)`, `completeSession(id, o?: { paid?: boolean })`, `expireSession(id)`, `putEvent(e)`, `setNextRefundStatus(status)` (the status the next `createRefund` returns; default `succeeded`), `failNext(method)` and `calls`. It starts with the six fixed prices. In auto-complete mode a created session is already `complete` and `paid` (payment intent `pi_fake_<n>`, amount from the price) and `url` is the `successUrl`.
  - `syncPrices(db: Db, gw?: AddonsGateway): Promise<{ upserted: number; deactivated: number; mismatched: AddonSku[] }>`: reads all 11 `ee_<sku>` keys; upserts `addon_prices` (credits from metadata `ee_credits`, kept only as a positive integer); sets `active = false` on rows Stripe no longer returns; when a fixed SKU's amount differs from `FIXED_PRICES`, raises one `warning` alert per run with `kind: 'addons.price_mismatch'` and `data.skus`. `addons.sync_prices` calls it.
  - `getCatalog(db: DbOrTx): Promise<CatalogEntry[]>`: 11 entries in `ADDON_SKUS` then `SEAT_SKUS` order. `available` = the row is active, and for invite packs `credits` is set, and for seat SKUs the recurring interval matches. `amountCents` = the row's amount, else the fixed price, else 0.
  - `getPrice(db: DbOrTx, sku: AddonSku | SeatSku): Promise<{ priceId: string; amountCents: number; credits: number | null } | null>` (available prices only)
  - `seedAddonCatalog(api: AddonCatalogApi): Promise<{ created: string[] }>` with `AddonCatalogApi = { findPriceByLookupKey(key: string): Promise<{ id: string } | null>; createProductWithPrice(i: { name: string; lookupKey: string; unitAmountCents: number; metadata: Record<string, string> }): Promise<{ priceId: string }> }`. It creates the six fixed prices (`ee_boost_7d` 4900 "Boost (7 days)", `ee_boost_14d` 7900 "Boost (14 days)", `ee_boost_28d` 9900 "Boost (28 days)", `ee_announcement_pack_1` 4900 "Announcements (1)", `_3` 9900 "Announcements (3)", `_5` 14900 "Announcements (5)", packs with metadata `ee_credits` 1, 3, 5), idempotent by lookup key. `scripts/stripe-seed-addons.ts` runs it over `getStripe()` and prints what it created.
  - `GET /api/v1/promote/catalog` (`promote.manage`) → `{ skus: CatalogEntry[] }`

- [ ] **Step 1: Write the failing tests** (`catalog.test.ts`).
  - After `syncPrices` with the default fake, `getCatalog` has the 6 fixed SKUs `available` at 4900, 7900, 9900, 4900, 9900 and 14900 (packs with credits 1, 3, 5), and the 3 invite packs and 2 seat SKUs `available: false` with `amountCents: 0`.
  - A `ee_invite_pack_s` price without metadata → still unavailable; with `ee_credits: '25'` → available with `credits: 25`. A `ee_extra_seat_month` price with `recurringInterval: 'month'` → `extra_seat_month` available with `interval: 'month'`.
  - `ee_boost_7d` at 5900 → `syncPrices` returns `mismatched: ['boost_7d']` and one `trust.alert` audit row whose data has `kind: 'addons.price_mismatch'` and alert data `skus: ['boost_7d']`; a run with no mismatch adds no alert.
  - `removePrice('ee_boost_28d')` then sync → `boost_28d` unavailable.
  - `seedAddonCatalog` on an in-memory api creates 6 prices with those amounts and metadata; a second run creates nothing.
  - The catalog route answers a Recruiter with 403.
- [ ] **Step 2:** Run `pnpm test src/modules/addons/catalog.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Use Context7 for stripe-node's Checkout Sessions, Prices (`lookup_keys`), Refunds and Events shapes.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(addons): payments gateway with fake, hourly price sync, catalog and seed script`.

### Task 10 (W1): Checkout, Stripe events and reconcile

**Files:**
- Create: `src/modules/addons/{checkout.ts,purchases.ts,stripe-events.ts,notify.ts,checkout.test.ts,stripe-events.test.ts,stripe-events.int.test.ts}`, `src/app/api/v1/promote/invite-packs/checkout/route.ts`, `src/app/api/v1/promote/purchases/route.ts`, `src/app/api/v1/promote/purchases/[id]/route.ts`

**Interfaces:**
- Consumes (fake): `billing.ensureStripeCustomer`, `getSubscriptionState`, `taxEnabled`; `orgs.listMembers`. Real: `getCatalog`, `getPrice` (Task 9); `enqueue`, `kickWorker`, `readEnvelope`, `record`, `notify`, `track`
- Produces:
  - `createCheckout(db: Db, i: { orgId: string; buyerUserId: string; sku: AddonSku; targetListingId?: string }, gw?: AddonsGateway): Promise<{ purchaseId: string; checkoutUrl: string }>`:
    1. No available price → 409 `conflict` "That add-on isn't on sale yet." with `details.reason = 'not_on_sale'`. Subscription status not `active` or `trialing` → 409 "Add-ons need an active plan." with `subscription_inactive`. A boost SKU needs `targetListingId`; other SKUs must not have one (`bad_request`).
    2. A `pending` purchase for the same listing (boosts) or the same `(org, sku)` (others): one whose `checkout_expires_at` has passed goes through `reconcilePurchase` first (expired in Stripe → `expired`). Then the same SKU returns its `checkoutUrl`, and a boost for the same listing with another duration calls `expireCheckout` on the old one first.
    3. Insert the `pending` row (`amount_cents` = the price, `checkout_expires_at` = now + 31 minutes) and record `addons.checkout_created`, then commit. A unique-index conflict from a concurrent request re-reads the pending row: its URL, or 409 `checkout_in_progress` while it has none.
    4. After commit, `createPaymentCheckout` with idempotency key `checkout:<purchaseId>`: `customerId` from `ensureStripeCustomer`, `automaticTax: taxEnabled()`, metadata `{ ee_purchase_id, ee_org_id, ee_sku }` (also on the payment intent and the invoice), `successUrl` `${APP_URL}/host/promote/checkout/return?purchase=<id>`, `cancelUrl` `${APP_URL}/host/promote/boosts`, `/announcements` or `/credits` by kind. The real gateway sends `mode: 'payment'`, `payment_method_types: ['card']`, one line item, `client_reference_id`, `invoice_creation.enabled: true` and `expires_at`, plus `customer_update: { address: 'auto' }` when tax is on.
    5. Store the session ID, URL and expiry; `track('promote_checkout_started', { sku })`. A gateway failure marks the row `expired` and throws `internal` "Payments are temporarily unavailable. Try again in a few minutes."
  - `expireCheckout(db: Db, purchaseId: string, gw?): Promise<void>`: `expireCheckoutSession`, then the row `expired`; `already_complete` runs `reconcilePurchase` instead
  - `reconcilePurchase(db: Db, purchaseId: string, gw?): Promise<PurchaseStatus>`: only for `pending`; `complete` with `paid` → `markPaid`; `expired` → `markExpired`; `open` → unchanged
  - Internal `markPaid(tx, purchaseId, s: { paymentIntentId; amountTotalCents; now })`: `update … set status = 'paid' … where id = $1 and status = 'pending' returning`. Only when a row returns: record `addons.purchase_paid`; enqueue `boosts.fulfill`, `announcements.fulfill_pack` or `addons.fulfill_invite_pack` by SKU with payload `{ purchaseId }` and dedupe `fulfill:<purchaseId>`; `notifyOrg` `addons.purchase_confirmed` with billing members; `track('promote_purchase_paid', { sku })`. `markExpired` (pending only) records `addons.purchase_expired`.
  - `getPurchase(db, orgId, purchaseId): Promise<PurchaseView>` (another org's → `not_found`); `listPurchases(db, orgId, f?)` newest first, page 20 (max 50), keyset `before` = `<created_at ISO>|<id>`
  - `markFulfilled(db: DbOrTx, purchaseId: string, f: { ref: string; outcome: 'fulfilled' | 'voided' }): Promise<boolean>` (only while `fulfilled_at` is null)
  - `getPurchaseForFulfillment(db: DbOrTx, purchaseId: string): Promise<{ id: string; orgId: string; buyerUserId: string; sku: AddonSku; status: PurchaseStatus; targetListingId: string | null; paidAt: Date | null; amountTotalCents: number | null; fulfilledAt: Date | null; fulfilledRef: string | null } | null>`
  - `notifyOrg(db: DbOrTx, i: { orgId: string; type: string; data: Record<string, unknown>; includeBilling?: boolean }): Promise<void>`: notifies the Owner and Admins from `orgs.listMembers`, plus Billing members when `includeBilling`
  - **The `addons.stripe_event` handler:** `readEnvelope(payload, 'billing.stripe_event')`, then `retrieveEvent(eventId)`:
    - `checkout.session.completed` whose object is `mode: 'payment'` with `metadata.ee_purchase_id` of a known purchase: `payment_status: 'paid'` → `markPaid`.
    - `checkout.session.expired` → `markExpired` (a paid purchase stays paid).
    - `charge.refunded` and `charge.dispute.created` whose `payment_intent` matches a purchase's `stripe_payment_intent_id` → `applyChargeRefunded` and `openDisputeItem` (Task 11).
    - Every other type or object → ignored.
  - **The `addons.reconcile_pending` handler:** `reconcilePurchase` for up to 100 `pending` purchases created more than 10 minutes ago; one failure is logged and the loop continues
  - **Routes:**
    - `POST /promote/invite-packs/checkout` (`promote.manage`; rate limit `addons:checkout:<orgId>` 20 per 3,600 s): `{ sku: 'invite_pack_s' | 'invite_pack_m' | 'invite_pack_l' }`
    - `GET /promote/purchases` (`promote.charges`): `{ before? }`
    - `GET /promote/purchases/:id` (`promote.manage`): calls `reconcilePurchase` first when the purchase is `pending` and older than 5 seconds, and `kickWorker()` when that marked it paid, so fulfillment runs at once

- [ ] **Step 1: Write the failing tests** (`checkout.test.ts`, `stripe-events.test.ts`, fake gateway and fakes).
  - **(E1)** The invite-pack checkout route: Owner and Admin → 200; Recruiter and Billing → 403.
  - `createCheckout` for `boost_7d` → the gateway call has the 7-day price ID, `customerId: 'cus_fake_…'`, `metadata.ee_purchase_id` = the purchase ID, `expiresAt` = `FIXED_NOW` + 31 minutes, key `checkout:<id>`, `automaticTax: false` and `successUrl` ending `/host/promote/checkout/return?purchase=<id>`. The row is `pending` with the session ID and URL.
  - The same request again → the same URL and one gateway create. Another duration for that listing → the old session expired in the fake, its row `expired`, and a new `pending` row.
  - `past_due` → `conflict` `subscription_inactive`; an unsynced invite pack → `not_on_sale`.
  - `failNext('createPaymentCheckout')` → `internal` with the exact message, the row `expired`, and a retry creates a new session.
  - **Events:** a payment-mode completed event with `payment_status: 'paid'` → `paid` once, with one `boosts.fulfill` outbox row (dedupe `fulfill:<id>`) and one `addons.purchase_paid` audit row. Handling the same envelope again → no new row. A subscription-mode session, an unknown `ee_purchase_id`, and a charge whose `payment_intent` matches nothing → no change. `payment_status: 'unpaid'` → still `pending`.
  - **(Review Focus 3)** A purchase paid through `reconcilePurchase`, then a `checkout.session.expired` event for it → still `paid`.
  - **Reconcile:** with no webhook and `completeSession` in the fake, `GET /promote/purchases/:id` 6 seconds after creation → `paid` with the fulfillment enqueued; at 3 seconds → no gateway call. The cron: an 11-minute-old pending complete session → `paid`; a 9-minute-old one is untouched.
  - `addons.purchase_confirmed` reaches the Owner, Admin and Billing member, not the Recruiter.
  - `listPurchases` with 21 purchases → 20 items and a `nextBefore`, then 1.
  - **Integration** (`stripe-events.int.test.ts`, CI only; spec failure mode 1): two workers handling the same completed event at once → exactly one `paid` transition and one fulfillment outbox row.
- [ ] **Step 2:** Run `pnpm test src/modules/addons`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the unit tests. Expected: PASS. Run `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(addons): one-time Checkout, exactly-once payment confirmation, reconcile`.

### Task 11 (W1): Refunds, disputes and the billing subject

**Files:**
- Create: `src/modules/addons/{refunds.ts,subjects.ts,refunds.test.ts,refunds.int.test.ts}`

**Interfaces:**
- Consumes: `openReviewItem`, `raiseAlert`, `decide`, `MAX_ATTEMPTS`; `entitlements.endGrant` and `getBalance` (fake)
- Produces:
  - `refundPurchase(db: DbOrTx, i: { purchaseId: string; amountCents: number; reason: RefundReason; actor: { type: 'system' | 'operator'; id: string | null } }): Promise<{ refundId: string }>`:
    - Locks the purchase row. It must be `paid` or `partially_refunded`.
    - `refundable` = `amount_total_cents` − the sum of its `pending` and `succeeded` refunds. An amount ≤ 0 or above `refundable` → `bad_request` "That's more than is left to refund." with `details.reason = 'exceeds_refundable'`.
    - Inserts the `pending` refund, records `addons.refund_requested`, and enqueues `addons.refund` `{ refundId }` with dedupe `refund:<refundId>`.
    - For an invite pack refunded by an operator: `endGrant(db, <fulfilled_ref>, now, actor)`, with the audit's `data.creditsRemoved` = `getBalance` before minus after.
  - **The `addons.refund` handler:** only for `pending` rows with no `stripe_refund_id`. It calls `createRefund({ paymentIntentId, amountCents, metadata: { ee_refund_id } }, 'refund:<refundId>')`, then acts on the status Stripe returns (Plan decision 7):
    - `succeeded`: mark the row `succeeded` with `stripe_refund_id`. Set `refunded_cents = greatest(refunded_cents, <sum of the purchase's succeeded refunds, this one included>)`, then status `refunded` once that reaches `amount_total_cents`, else `partially_refunded`. Record `addons.refund_succeeded`. If `refunded_cents` rose, send `addons.refunded` for the amount added (with billing members).
    - `pending` or `requires_action`: store `stripe_refund_id` and resolve. The row stays `pending`, still counted against `refundable`, until `charge.refunded` lists it. No notification yet, because the money isn't back.
    - `failed` or `canceled`: final at once, because a retry with the same key gets the same refund. Set `last_error = 'stripe_status_<status>'`, then take the final-attempt path below.
    - A thrown error: when `ctx.attempt >= MAX_ATTEMPTS`, take the final-attempt path: mark the row `failed` with `last_error`, open a `billing` item (`subjectType: 'addon_purchase'`, `subjectId` = the purchase, reason `refund_failed`), record `addons.refund_failed`, and resolve. Otherwise store `last_error` and rethrow.
  - `applyChargeRefunded(db: DbOrTx, charge: { paymentIntentId: string; amountRefundedCents: number; refundIds: string[] }): Promise<void>`: sets `refunded_cents = greatest(refunded_cents, amountRefundedCents)` (Stripe's running total), then status `refunded` once it reaches `amount_total_cents`, else `partially_refunded`. It marks refunds with those Stripe IDs `succeeded`. If `refunded_cents` rose, it sends `addons.refunded` for the amount added (with billing members); otherwise it sends nothing.
  - `openDisputeItem(db, purchaseId)`: a `billing` item with reason `dispute`; delivery continues
  - `reportFulfillmentDead(db: DbOrTx, purchaseId: string, error: string): Promise<void>`: a `billing` item with reason `fulfillment_dead` and a `critical` alert. Every fulfillment handler calls it on its final attempt, then resolves.
  - **Subject handlers** (`addon_purchase`): `refund(db, purchaseId, data)` → `refundPurchase` with `data.amountCents`, reason `operator`, actor `{ type: 'operator', id: null }`, and `data.reviewItemId` in the audit data; `approve` resolves the item and changes nothing (Plan decision 18)

- [ ] **Step 1: Write the failing tests** (`refunds.test.ts`).
  - A full 4,900 refund of a paid boost → a `pending` row and a `refund:<id>` outbox row. The handler → `createRefund` with key `refund:<id>` and 4,900; the purchase `refunded_cents` 4,900 and `refunded`; one `addons.refunded` per recipient. A later `charge.refunded` with 4,900 → no change and no second notification.
  - The other order (`charge.refunded` first, then the handler) → the same end state and one notification.
  - A 2,000 refund → `partially_refunded`. A second refund of 1,000, run through the handler → `refunded_cents` 3,000 (the succeeded total, not `greatest(2000, 1000)`), still `partially_refunded`, and a second `addons.refunded` per recipient for $10. A `charge.refunded` with 3,000 afterwards → no change and no notification.
  - **(Review Focus 5)** On a 4,900 purchase, refunds of 3,000 and then 3,000 → the second is `bad_request` `exceeds_refundable` while the first is still `pending`.
  - A failing `createRefund` on attempt 3 → rethrows, the row stays `pending` with `last_error`. On attempt 8 → the row `failed`, one `billing` item with subject `addon_purchase` and reason `refund_failed`, and the handler resolves.
  - `setNextRefundStatus('failed')` on attempt 1 → the row `failed` with `last_error = 'stripe_status_failed'`, one `billing` item `refund_failed`, the handler resolves, and the amount is refundable again. `'canceled'` → the same.
  - `setNextRefundStatus('pending')` → the row stays `pending` with its `stripe_refund_id`, `refunded_cents` unchanged and no notification. A `charge.refunded` listing that ID with 4,900 → the row `succeeded`, the purchase `refunded`, and one `addons.refunded` per recipient.
  - A dispute event → one `billing` item with reason `dispute`; the purchase is unchanged.
  - `decide` on a billing item with `refund` and `amountCents: 4900` → a refund row with reason `operator`. With `approve` → resolved and no refund.
  - An operator refund of an invite pack with 18 unused credits → `endGrant` called with its grant ID, and `data.creditsRemoved: 18`.
  - **Integration** (`refunds.int.test.ts`, CI only; Review Focus 5): two `refundPurchase` calls of 3,000 started at the same time on a 4,900 purchase → exactly one `pending` refund row and one `bad_request` `exceeds_refundable`, because the purchase row lock serializes them.
- [ ] **Step 2:** Run `pnpm test src/modules/addons/refunds.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/addons` and `pnpm typecheck` (the integration test runs in CI). Expected: PASS.
- [ ] **Step 5:** Commit: `feat(addons): idempotent refunds, disputes and the billing review subject`.

### Task 12 (W1): Invite packs, seats, credits, revenue and privacy

**Files:**
- Create: `src/modules/addons/{invite-packs.ts,seats.ts,credits.ts,revenue.ts,privacy.ts,packs-seats.test.ts}`, `src/app/api/v1/promote/credits/route.ts`, `src/app/api/v1/promote/seats/route.ts`, `src/app/api/v1/promote/seats/preview/route.ts`

**Interfaces:**
- Consumes (fake): `entitlements.grant`, `listGrantBalances`, `getCapacity`; `billing.previewSubscriptionAddon`, `setSubscriptionAddon`, `getSubscriptionAddon`, `getSubscriptionState`, `PLANS`. Real: `getPrice`, `markFulfilled`, `reportFulfillmentDead`
- Produces:
  - **The `addons.fulfill_invite_pack` handler:** `grant(db, { orgId, kind: 'invite_credit', quantity: <price credits>, source: 'pack', sourceRef: purchaseId, idempotencyKey: 'pack:' + purchaseId, validUntil: paid_at + 365 days, actor: { type: 'system', id: null } })`, then `markFulfilled(db, purchaseId, { ref: grantId, outcome: 'fulfilled' })` and `addons.invite_pack_granted`. On the final attempt, `reportFulfillmentDead`.
  - `previewExtraSeats(db, { orgId, extraSeats })` → `billing.previewSubscriptionAddon(db, { orgId, addon: 'extra_seat', quantity: extraSeats })`
  - `setExtraSeats(db, { orgId, actorUserId, extraSeats })`:
    - The seat SKU for the plan interval (`extra_seat_month` or `extra_seat_year`) must be on sale, else `not_on_sale`.
    - `minimum = max(0, used − PLANS[plan].seats)` with `used` from `getCapacity(db, orgId, 'seat')`; below it → 409 "You have <used> people on your team, including pending invitations. Remove someone first." with `details: { reason: 'seats_in_use', minimum }`.
    - Calls `billing.setSubscriptionAddon` and records `addons.seats_changed` `{ from, to, effectiveAt }`.
  - `getInviteCredits(db, orgId): Promise<CreditsView['invites']>`: `monthlyRemaining` = the `remaining` of non-`pack` grants, `monthlyResetsAt` = the earliest plan grant `validUntil`, `packs` = the `pack` grants mapped by `sourceRef` to `purchaseId`
  - `getSeatSummary(db, orgId): Promise<CreditsView['seats']>`: `included` = `PLANS[plan].seats` (0 without a plan), `extra` and the pending decrease from `getSubscriptionAddon`, `used` from `getCapacity`
  - `revenueSummary(db, { from, to })`: over purchases paid in `[from, to)`: `grossCents` = sum of `amount_total_cents`, `refundedCents` = sum of `refunded_cents`, `bySku` = gross per SKU
  - **`privacyHandler` (addons):** an `org` export gives `{ records: { purchases, refunds }, files: [] }` (IDs, SKU, amounts, statuses, dates); a `user` export gives the purchases that user bought. `erase` changes nothing and returns `retained: [{ table: 'addon_purchases', reason: 'legal_obligation', until: <latest paid_at + 7 years, ISO date> }]` when there are rows, else `[]` (spec 10, 7-year financial records)
  - **Routes:** `GET /promote/credits` (`promote.manage`) → `CreditsView`; `GET /promote/seats/preview` `{ extraSeats: int 0–50 }` → the preview; `PUT /promote/seats` `{ extraSeats: int 0–50 }` → `{ extraSeats, effectiveAt }`

- [ ] **Step 1: Write the failing tests** (`packs-seats.test.ts`).
  - A paid `invite_pack_s` whose price has `ee_credits` 25 → one grant with key `pack:<purchaseId>`, source `pack`, `sourceRef` = the purchase, `validUntil` = paid + 365 days; running the handler again creates no second grant; `fulfilled_ref` = the grant ID.
  - Credits: a plan grant of 50 (until 2026-12-01) plus that pack → `{ monthlyRemaining: 50, monthlyResetsAt: '2026-12-01T00:00:00.000Z', packs: [{ purchaseId, remaining: 25 }] }`.
  - Seats: Professional (5 seats) with 7 members and 1 pending invitation (`used` 8) → `setExtraSeats` with 2 → `conflict` `seats_in_use` with `minimum: 3`; with 3 → `billing.setSubscriptionAddon` called with quantity 3 and `addons.seats_changed` recorded. The route with 51 → 400. An unsynced seat price → `not_on_sale`.
  - `revenueSummary` over purchases of 4,900 and 9,900 (the first refunded) → `{ grossCents: 14800, refundedCents: 4900, bySku: { boost_7d: 4900, announcement_pack_3: 9900 } }`.
  - Privacy: erasing a user who bought one boost → `erased: 0` and one `legal_obligation` entry until paid + 7 years; a second run returns the same.
- [ ] **Step 2:** Run `pnpm test src/modules/addons/packs-seats.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/addons`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(addons): invite packs, extra seats, credits view, revenue summary and privacy`.

### Task 13 (W2): Eligibility and boost checkout

**Files:**
- Create: `src/modules/boosts/{eligibility.ts,checkout.ts,eligibility.test.ts}`, `src/app/api/v1/promote/boosts/eligibility/route.ts`, `src/app/api/v1/promote/boosts/checkout/route.ts`

**Interfaces:**
- Consumes (fake): `listings.getListingSummaries`, `getPublishedListing`; `billing.getSubscriptionState`; `addons.getCatalog`, `createCheckout`
- Produces:
  - `checkBoostEligibility(db, { orgId, listingId, now? })` (spec 8.1):
    - Another org's (or unknown) listing → `not_found`.
    - `reason`, checked in this order: `listing_not_active` (state not `active`); `subscription_inactive` (status not `active` or `trialing`); `boost_already_queued` (a `scheduled` boost exists); `listing_ends_too_soon` (no option fits `autoCloseAt`).
    - `startsAt` = max(now, the latest `ends_at` of its live boost).
    - `listingEndsAt` = the listing's `autoCloseAt`, or null when it has none (Plan decision 16).
    - `options`: one per duration, `endsAt = startsAt + days × 24 h`, `amountCents` from the catalog, `available` = the price is on sale and (`autoCloseAt` is null or `endsAt <= autoCloseAt`).
    - `eligible` = `reason === null`.
  - `startBoostCheckout(db, { orgId, buyerUserId, listingId, durationDays })`: an ineligible listing, or an unavailable option, → 409 `conflict` with that reason in `details.reason`; otherwise `addons.createCheckout({ orgId, buyerUserId, sku: boostSku(durationDays), targetListingId: listingId })`
  - Conflict messages: `listing_not_active` "Only Active listings can be boosted." · `subscription_inactive` "Boosts need an active plan." · `boost_already_queued` "This listing already has a boost waiting to start." · `listing_ends_too_soon` "Your listing ends before this boost would finish."
  - **Routes:** `GET /promote/boosts/eligibility` `{ listingId: uuid }` → `BoostEligibility`; `POST /promote/boosts/checkout` `{ listingId: uuid, durationDays: 7 | 14 | 28 }` (`promote.manage`, rate limit `addons:checkout:<orgId>` 20 per 3,600 s)

- [ ] **Step 1: Write the failing tests** (`eligibility.test.ts`).
  - An Active listing with no `autoCloseAt`, no boosts, an `active` subscription → `eligible: true`, `startsAt` = `FIXED_NOW`, `listingEndsAt: null`, options 4900, 7900 and 9900 with `endsAt` exactly 168, 336 and 672 hours later.
  - `autoCloseAt` = now + 10 days → 7 days available, 14 and 28 not, `reason: null`, and `listingEndsAt` = that `autoCloseAt`. `autoCloseAt` = now + 5 days → none available and `reason: 'listing_ends_too_soon'`.
  - A closed listing → `listing_not_active`; `past_due` → `subscription_inactive`; `trialing` → eligible.
  - A live boost ending `FIXED_NOW` + 3 days → `startsAt` = that end; with a scheduled boost too → `boost_already_queued`.
  - Another org's listing → `not_found`.
  - `startBoostCheckout` for 14 days with `autoCloseAt` + 10 days → 409 with `details.reason = 'listing_ends_too_soon'` and no `createCheckout` call; for 7 days → `createCheckout` with `sku: 'boost_7d'` and the listing as target.
  - The checkout route answers a Recruiter with 403 and a Billing member with 403.
- [ ] **Step 2:** Run `pnpm test src/modules/boosts/eligibility.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(boosts): eligibility with queued starts and auto-close fit, boost checkout`.

### Task 14 (W2): Fulfillment, lifecycle and stops

**Files:**
- Create: `src/modules/boosts/{fulfill.ts,lifecycle.ts,fulfill.test.ts,lifecycle.test.ts,fulfill.int.test.ts}`

**Interfaces:**
- Consumes (fake): `addons.getPurchaseForFulfillment`, `markFulfilled`, `refundPurchase`, `notifyOrg`, `reportFulfillmentDead`; `listings.getListingSummaries`, `getPublishedListing`. Real: `readEnvelope`, `record`; `getBoostReport` (Task 16, for the `boosts.ended` body; stubbed until then)
- Produces:
  - `fulfillBoost(db: Db, purchaseId: string, now: Date): Promise<{ boostId: string; status: BoostStatus } | null>` (the `boosts.fulfill` handler), in one transaction under `pg_advisory_xact_lock(hashtext('boost:' || listing_id))`:
    1. A boost already exists for the purchase → returns it (idempotent).
    2. `starts_at` = max(now, latest `ends_at` of the listing's `scheduled` or `active` boosts); `ends_at` = `starts_at` + duration × 24 h.
    3. **Re-check** (spec 8.1): the listing is Active, the window fits `autoCloseAt`, and at most one live boost and no scheduled boost exist.
    4. Pass → status `active` when `starts_at <= now`, else `scheduled`; `markFulfilled(tx, purchaseId, { ref: boostId, outcome: 'fulfilled' })`; record `boosts.created` (and `boosts.started` with a `boosts.started` notification when active).
    5. Fail → a `void` boost (`end_reason = 'listing_unavailable'`, `starts_at` = now, `ended_at` = now), `markFulfilled(tx, purchaseId, { ref: boostId, outcome: 'voided' })`, `refundPurchase` of the full `amount_total_cents` with reason `listing_unavailable` and the system actor, `boosts.voided`, and `boosts.ended_early` with `voided: true`.
    6. A final-attempt error → `reportFulfillmentDead`.
  - `tickBoosts(db: Db, now: Date): Promise<{ started: number; completed: number; endedEarly: number; voided: number }>` (the `boosts.tick` handler):
    - `scheduled` with `starts_at <= now`: Active listing → `active`, `boosts.started` audit and notification; otherwise void and refund in full.
    - `active` with `ends_at <= now` → `completed` with `ended_at = ends_at`, `boosts.completed`, and `boosts.ended` with the report numbers.
    - `active` whose listing is no longer Active → `ended_early` (`listing_closed` or `listing_removed` from the state), `ended_at = now`, `boosts.ended_early`; its `scheduled` boosts are voided and refunded.
  - `endBoostsForListing(db, listingId, reason: 'listing_closed' | 'listing_removed', now)` (the `boosts.end_for_listing` handler, reading a `listing.closed` or `listing.removed` envelope; Plan decision 10)
  - `stopBoostsForOrg(db: DbOrTx, i: { orgId: string; reason: 'org_stopped' }): Promise<number>`: live → `ended_early` (`org_stopped`); scheduled → voided and refunded; no per-item notifications (Plan decision 19); returns the count

- [ ] **Step 1: Write the failing tests** (`fulfill.test.ts`, `lifecycle.test.ts`; spec failure mode 2 and E8).
  - A paid 7-day purchase on an Active listing → an `active` boost from `FIXED_NOW` to exactly + 168 h, the purchase `fulfillment: 'fulfilled'`, `boosts.created` and `boosts.started` audit rows, and `boosts.started` to the Owner and Admin. Running it again → no second boost.
  - With a live boost ending + 3 days → the new one is `scheduled` from + 3 days.
  - **(E8)** The listing closed before fulfillment → a `void` boost with `listing_unavailable`, one full refund, `fulfillment: 'voided'`, and `boosts.ended_early` with `voided: true`. Running again → no second refund.
  - A live plus a scheduled boost already exist → void and refund. `autoCloseAt` moved to now + 3 days → void and refund.
  - **Tick:** a scheduled boost whose start came → `active` and notified; a live boost past `ends_at` → `completed` with `ended_at = ends_at` and `boosts.ended` whose body reads "… was shown in 12 boosted spots." from a stubbed report; a live boost whose listing closed → `ended_early` with `listing_closed` and `ended_at = now`; a scheduled boost on a closed listing → voided with one refund. A second tick → no new effects.
  - `endBoostsForListing` for `listing.removed` → `ended_early` with `listing_removed`, and its scheduled boost voided and refunded.
  - `stopBoostsForOrg` with one live and one scheduled boost → returns 2, `org_stopped` and one refund, with no `boosts.ended_early` notification.
  - A thrown error on attempt 8 → `reportFulfillmentDead` called once and the handler resolves.
  - **Integration** (`fulfill.int.test.ts`, CI only): two purchases on one listing with a live boost, fulfilled by two workers at once → exactly one `scheduled` boost and one `void` with one refund.
- [ ] **Step 2:** Run `pnpm test src/modules/boosts/fulfill.test.ts src/modules/boosts/lifecycle.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the unit tests and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(boosts): locked fulfillment with re-check and refund, lifecycle ticks and org stops`.

### Task 15 (W2): Placement engine

**Files:**
- Create: `src/modules/boosts/{active.ts,placement.ts,hook.ts,stats.ts,placement.test.ts,placement.property.test.ts,hook.test.ts}`

**Interfaces:**
- Consumes: `getSetting('promote.paid_delivery_enabled')`; `rotationOrder` (Task 2); `track`, `logger`; `after` from `next/server`; `mulberry32` and friends (Task 8)
- Produces:
  - `ActiveBoost = { boostId: string; listingId: string }`; `loadActiveBoosts(db: DbOrTx, now: Date): Promise<ActiveBoost[]>`: live boosts, cached in memory for 30 s per instance and filtered by `now` on each call; `resetActiveBoostCacheForTests(): void`
  - `boostedAmong(db: DbOrTx, listingIds: string[], now = new Date()): Promise<Map<string, string>>` (listing ID → boost ID, live only)
  - `PlacementState = { shown: string[]; gap: number }`; `encodePlacementState(s: PlacementState): string` (base64url JSON `{ v: 1, s, g }`); `decodePlacementState(raw: string | null, k: number): PlacementState`: anything that doesn't parse to `v: 1`, string `s` items and a non-negative integer `g` gives `{ shown: [], gap: k − 1 }`. A valid `g` above `k − 1` (for example, a state from the other surface) is clamped to `k − 1`, and `shown` is kept. A longer `shown` keeps the newest 200
  - `SURFACE_RULES = { seek: { k: 5, firstPageOnly: true, minPosition: 2 }, swipe: { k: 4, firstPageOnly: false, minPosition: 1 } } as const`
  - `placeItems(i: { surface: 'seek' | 'swipe'; pageIndex: number; pageSize: number; organic: string[]; boosted: Map<string, string>; candidates: ActiveBoost[]; state: PlacementState }): { items: { listingId: string; boostId: string | null }[]; organicConsumed: number; state: PlacementState; inserted: ActiveBoost[] }`. It is pure. `boosted` maps every live-boosted listing to its boost; `candidates` are matched, rotation-ordered and not in `shown`. The algorithm (spec 8.2 step 5, made exact):
    1. `remainder` = `organic` with its indexes; `emitted` = []; `k` and `minPosition` from the surface. `exhausted` = `organic.length < pageSize`.
    2. For output position `p = 1 .. pageSize`, while `remainder` has an item not in `shown`, or an insertion is possible:
       - **Try to insert** when the surface allows this page (`!firstPageOnly || pageIndex === 0`), `p >= minPosition`, and `gap >= k − 1`. Walk `candidates` in order and take the first `c` such that, with `c` removed from `remainder`, (a) the next `k − 1` remainder items not in `shown` contain no listing in `boosted`, and (b) at least `k − 1` such items remain, or `exhausted`. Insert it: remove it from `remainder` and `candidates`, push `{ listingId: c.listingId, boostId: c.boostId }`, add `c.listingId` to `shown`, set `gap = 0`.
       - **Otherwise emit organic:** drop leading `remainder` items in `shown` (they count as consumed), then emit the next item with `boostId: null`. If it's in `boosted`, add it to `shown` and set `gap = 0`; else `gap = min(gap + 1, k − 1)`. Insertion only needs `gap >= k − 1`, so the cap changes no placement. It keeps the state inside what `decodePlacementState` accepts. Without it, a page with no insertion near its end leaves `gap` above `k − 1`. Seek page 0 with 2 candidates would end at 13, and every later Seek page, or a Swipe batch with no candidate, would also end above `k − 1`.
    3. `organicConsumed` = 1 + the largest `organic` index emitted or dropped before it (0 when nothing was emitted). `state.shown` keeps the newest 200.
  - `placementHook: BoostPlacementHook`:
    - `place(db, i)`: the kill switch off → the organic items unchanged. Otherwise load live boosts, decode `i.state`, `candidates = rotationOrder(<live boosts whose listing is in await i.matchIds(<live listing IDs not in shown>)>, b => b.boostId, i.viewerKey, i.now)`, run `placeItems`, then `deferStats(() => recordBoostServes(db, inserted, i.surface, i.now))` and, with probability 0.01, `track('boost_served', { surface })`. Any error → the organic items unchanged (`organicConsumed = organic.length`, `state = i.state`) and `logger.warn('boosts.place_failed')`.
    - `boostedAmong(db, ids, now)` → the module's `boostedAmong`.
  - `recordBoostServes(db: DbOrTx, rows: ActiveBoost[], surface: 'seek' | 'swipe' | 'feed', now: Date): Promise<void>`: upserts `served += <count>` per `(boost_id, UTC day, surface)`
  - `deferStats(task: () => Promise<void>): void`: `after(task)` inside a request, else a tracked promise; `drainDeferredStatsForTests(): Promise<void>`

- [ ] **Step 1: Write the failing tests.**
  - **`placement.test.ts`** (pure `placeItems`):
    - Seek, page 0, size 20, 20 organic with none boosted, 5 candidates → insertions at positions 2, 7, 12 and 17, 20 items, `organicConsumed: 16`, no candidate twice.
    - Seek, page 0, size 20, 20 organic, 2 candidates → insertions at positions 2 and 7, and the returned `state.gap` is 4 (capped at k − 1, not 13). `decodePlacementState(encodePlacementState(state), 5)` returns the same `shown` and `gap`.
    - Seek, page 1 → no insertion, items = organic minus `shown`, and the returned `state.gap` is 4.
    - `decodePlacementState` of an encoded `{ v: 1, s: ['a'], g: 9 }` with k = 4 → `{ shown: ['a'], gap: 3 }`.
    - Seek with organic item 3 boosted (B2, also a candidate) and first candidate B1 → position 2 is B2 (B1 would sit within 4 of it).
    - Swipe, size 10, 3 candidates → positions 1, 5 and 9; the returned state has `gap: 1`; the next page with that state inserts first at position 3.
    - Swipe, a last batch of 6 organic (`exhausted`) → an insertion can land at position 6.
    - Organic items 2 and 3 both boosted → no insertion at position 1, and the organic order is unchanged.
    - An inserted listing lands in `state.shown` and is skipped when it appears in the next page's organic list.
  - **`hook.test.ts`** (PGlite boosts, fake `matchIds`):
    - The kill switch off → `items` equal the organic list, and no stats rows after draining.
    - `matchIds` rejecting → the organic list unchanged and one `boosts.place_failed` warning.
    - **(Review Focus 4)** `state` of `'garbage'`, of base64url `{"v":1,"s":"x","g":-5}`, and of a valid state with 5,000 shown IDs → no throw, caps hold on the page, and the returned state has at most 200 shown IDs.
    - **(E3) Paging through the encoded state:** a session of 3 Seek pages, then a session of 3 Swipe batches (sizes 7, 3 and 10). Each `place` call gets the previous call's returned `state` string, and the organic list advances by `organicConsumed`. Two live boosts are inserted early and also rank organically on later pages. Expected: no listing appears twice in either session, and every returned state decodes with its `shown` intact.
    - After `drainDeferredStatsForTests`, `boost_daily_stats` has `served` = the number of insertions per boost for surface `seek` on 2026-11-03.
    - `boostedAmong` omits a scheduled boost that starts later, an ended one and a void one. A boost inserted after the first load isn't seen until 30 s later on the fake clock, or after `resetActiveBoostCacheForTests`.
  - **`placement.property.test.ts`** (E3, E4): 10,000 cases from `mulberry32(seed)`, printing the seed and case on failure. Each case builds a universe of 0–60 listings with random categories, a query with a random category subset (or none), the organic session = the matching listings in random rank order (0–40 of them), a live-boosted set of 0–30 listings (some inside the organic session, some not), and a viewer key. It simulates SP3's paging: Seek pages of 20; Swipe batches of random size 1–20 from the cursor; each page calls `placeItems` with the previous page's state after a round trip through `encodePlacementState` and `decodePlacementState` (with that surface's k), as SP3's cursor carries it, and the cursor advances by `organicConsumed`. Over the concatenated session output it asserts:
    - Seek inserts only on page 0, never at position 1, and at most 4 times.
    - Seek: no inserted item has another boosted-labeled item (inserted, or organic and in `boosted`) within 4 positions; Swipe: within 3 positions, across batch boundaries.
    - Swipe, when the first batch has size ≥ 4: position 1 is boosted-labeled whenever the matching candidates are non-empty and at most one of the first 4 organic items is boosted.
    - **(E4)** Every inserted listing matches the query's categories.
    - No listing appears twice in the session, and the non-inserted items keep their organic order.
- [ ] **Step 2:** Run `pnpm test src/modules/boosts/placement.test.ts src/modules/boosts/placement.property.test.ts src/modules/boosts/hook.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS, with the property test under 20 s.
- [ ] **Step 5:** Commit: `feat(boosts): capped placement engine with rotation, fail-open hook and serve counts`.

### Task 16 (W2): Reports, windows, listing rows, feed candidates and privacy

**Files:**
- Create: `src/modules/boosts/{report.ts,windows.ts,badges.ts,feed.ts,privacy.ts,report.test.ts,windows.test.ts}`, `src/app/api/v1/promote/boosts/route.ts`, `src/app/api/v1/promote/boosts/[id]/route.ts`

**Interfaces:**
- Consumes (fake): `discovery.getListingEventCounts`, `matchListingIds`; `listings.getListingSummaries`, `getPublishedListing`; `profiles.getPreferenceTargets`. Real: `formatPromoteDate`
- Produces:
  - `getBoostReport(db, orgId, boostId): Promise<BoostReport>` (another org's → `not_found`), in whole UTC days, because SP3 counts events per UTC day:
    - `effectiveEnd` = min(now, `ended_at ?? ends_at`). The during window is every UTC day the boost touched: `[dStart, dEnd)`, with `dStart` = the UTC day of `starts_at` and `dEnd` = the UTC day after the one that holds `effectiveEnd − 1 ms`. `duringDays` = its length. A boost that starts partway through a day touches one more UTC day than it ran, so a completed 7-day boost from 17:00Z has `duringDays` 8.
    - `boostDays` = ceil((`effectiveEnd` − `starts_at`) ÷ 24 h), the days the boost actually ran: 7 for a completed 7-day boost, 3 after 2.5 days. The before window is the `boostDays` whole UTC days before `dStart`, cut at publication: `[max(dStart − boostDays, UTC day of firstPublishedAt), dStart)`. `beforeDays` = its length. This is spec 8.1's "the same number of days before `starts_at`".
    - Views: `getListingEventCounts({ orgId, listingIds: [listingId], from: <before start>, to: dEnd, types: ['view'], bucket: 'day' })`. `viewsPerDayBefore` = before views ÷ `beforeDays`, or null when `beforeDays` is 0. `viewsPerDayDuring` = during views ÷ `duringDays`. Both are rounded to one decimal.
    - When `effectiveEnd <= starts_at` (a scheduled or `void` boost), both windows are empty: `viewsPerDayDuring: 0`, `viewsPerDayBefore: null`, `daily: []`.
    - `savesFromBoost` and `applicationsFromBoost`: `types: ['save', 'apply'], sources: ['boost'], bucket: 'none'` over `[dStart, dEnd)`.
    - `servedBySurface` sums `boost_daily_stats`. `daily` has one `{ day, views, served }` entry for each day of the before and during windows (`beforeDays + duringDays` entries).
    - `firstPublishedAt` comes from `getPublishedListing`, else the boost's `starts_at` (no before window).
  - `listBoosts(db, orgId, f?)`: page 20, newest first, keyset `<created_at ISO>|<id>`, optional `status`
  - `boostWindowsSource: BoostWindowsSource`: the org's boosts (only `q.listingIds` when given) with status `active`, `completed` or `ended_early` whose `[starts_at, ended_at ?? ends_at)` overlaps `[q.from, q.to)`, as `{ listingId, startsAt, endsAt }`
  - `getBoostStatusForListings(db, orgId, ids)`: per listing its live boost, else its scheduled one, with that boost's `startsAt`, and `endsAt` = the latest `ends_at` of its live and scheduled boosts
  - `rowBadges(db, orgId, ids)` (the SP2 row badge provider): a listing with a live or scheduled boost → `{ label: 'Boosted until ' + formatPromoteDate(<latest ends_at>), href: '/host/promote/boosts/<boostId>' }`; another Active listing → `{ label: 'Boost', href: '/host/promote/boosts?listing=<id>' }`; anything else → none
  - `feedBoostCandidates(db, { viewerUserId, exclude, now }): Promise<{ boostId: string; listingId: string; orgId: string }[]>`: live boosts whose `boostId` isn't in `exclude`, kept when `matchListingIds(db, { listingIds, query, viewerUserId })` returns their listing, where `query` holds the seeker's preference `categories` and `states`, each omitted when empty (spec 8.2, "a seeker with no preferences matches every category")
  - `countBoosts(db, orgId): Promise<{ active: number; scheduled: number }>` (live, and scheduled to start later)
  - **`privacyHandler` (boosts):** an `org` export gives `{ records: { boosts, boost_daily_stats } }`; a `user` export gives `{}`; `erase` → `{ erased: 0, retained: [] }` (the rows hold no personal data)
  - **Routes:** `GET /promote/boosts` `{ status?, before? }` and `GET /promote/boosts/:id` (`promote.manage`; another org's ID → 404)

- [ ] **Step 1: Write the failing tests** (`report.test.ts`, `windows.test.ts`; the spec's reporting tests).
  - A 7-day boost from 2026-11-03T17:00Z to 2026-11-10T17:00Z, on a listing first published 2026-10-01, with `now` past its end. The before window is 2026-10-27 to 2026-11-02 (7 days), and the during window is 2026-11-03 to 2026-11-10 (8 UTC days, the first and last partial). 14 views before and 40 during → `viewsPerDayBefore: 2`, `viewsPerDayDuring: 5`. Saves with source `boost` 3 and applies with source `boost` 2 (plus `seek`-source events that don't count) → `savesFromBoost: 3`, `applicationsFromBoost: 2`. Seeded stats → `servedBySurface: { seek: 10, swipe: 4, feed: 1 }`. `daily` has 15 entries, 2026-10-27 to 2026-11-10.
  - Published at the boost's start → `viewsPerDayBefore: null`. Published 3 days before → a 3-day before window.
  - `now` = start + 2.5 days (2026-11-06T05:00Z) → 4 during days (2026-11-03 to 2026-11-06), a 3-day before window (2026-10-31 to 2026-11-02), and 7 `daily` entries.
  - A scheduled boost that starts later → `viewsPerDayDuring: 0`, `viewsPerDayBefore: null` and `daily: []`.
  - **Windows:** `active`, `completed` and `ended_early` boosts are returned, the last with `endsAt = ended_at`; `void` and `scheduled` never are; the `listingIds` filter applies; a boost ending exactly at `q.from` is excluded.
  - **Row badges:** a live boost ending 2026-11-10T17:00Z plus a scheduled one ending 2026-11-17T17:00Z → "Boosted until Nov 17" linking to the live boost; an unboosted Active listing → "Boost" with `href` `/host/promote/boosts?listing=<id>`; a closed listing → none.
  - **(E4)** `feedBoostCandidates` for a seeker with preferences `['maritime']` drops a Farm boost; with no preferences it keeps both; `exclude` drops the named boost; every item carries `orgId`.
  - `GET /promote/boosts/:id` with another org's boost → 404.
- [ ] **Step 2:** Run `pnpm test src/modules/boosts/report.test.ts src/modules/boosts/windows.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/boosts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(boosts): boost report, analytics windows, listing row badges, feed candidates`.

### Task 17 (W3): Packs and announcement CRUD

**Files:**
- Create: `src/modules/announcements/{packs.ts,input.ts,crud.ts,crud.test.ts,credits.int.test.ts}`, `src/app/api/v1/promote/announcement-packs/checkout/route.ts`, `src/app/api/v1/promote/announcements/route.ts`, `src/app/api/v1/promote/announcements/[id]/route.ts`, `src/app/api/v1/promote/announcements/[id]/{submit,cancel,end}/route.ts`

**Interfaces:**
- Consumes (fake): `addons.createCheckout`, `getPurchaseForFulfillment`, `markFulfilled`, `reportFulfillmentDead`; `listings.getListingSummaries`; `hostpages.listApprovedOrgPhotos`. Real: `findContactDetails`, `CONTACT_DETAILS_MESSAGE`, `formatPromoteDate`, `enqueue`, `record`
- Produces:
  - `fulfillPack(db, purchaseId)` (the `announcements.fulfill_pack` handler): one pack per purchase, `size` from the SKU, `valid_from = paid_at`, `valid_until = (paid_at at time zone 'UTC' + interval '1 month') at time zone 'UTC'`; `markFulfilled(tx, purchaseId, { ref: packId, outcome: 'fulfilled' })`; `reportFulfillmentDead` on the final attempt
  - `startPackCheckout(db, { orgId, buyerUserId, size: 1 | 3 | 5 })` → `addons.createCheckout({ sku: packSku(size) })`
  - `AnnouncementInputSchema` (zod): title and body trimmed, title 1–80 and body 1–500 characters, control characters other than `\n` rejected; `target`; `image: { mediaId: uuid; alt: 1–200 characters } | null`; `start`
  - `createAnnouncement(db, ctx, i)`: a listing target must be one of the org's listings (else `not_found`) and Active (else `bad_request` with field `target`); an image must be in `listApprovedOrgPhotos(db, ctx.orgId)` (else a field error on `image`); status `draft`; records `announcements.created`
  - `updateAnnouncement(db, ctx, id, i)`: when live, `ended`, `canceled` or `removed` → 409 `conflict` with `details.reason = 'not_editable'`. `in_review` or not-yet-live `scheduled` → `revision + 1`, `check_id = null` (so a decision on the old revision's review item is ignored, Task 18), status `in_review`, enqueue `announcements.moderate` `{ announcementId, revision }` with dedupe `moderate:<id>:<revision>`. `draft` or `rejected` → `revision + 1`, status unchanged.
  - `submitAnnouncement(db, ctx, id)` (status `draft` or `rejected`):
    1. `findContactDetails` on title, body and image alt → 400 `bad_request` "Fix the highlighted fields." with `details.fields.<title|body|imageAlt> = CONTACT_DETAILS_MESSAGE`. A listing target no longer Active → field `target`: "That listing isn't active anymore. Choose another button."
    2. When `pack_id` is null, reserve a credit: `update app.announcement_packs set credits_used = credits_used + 1 where id = (select id … where org_id = $1 and valid_until > now and credits_used < size order by valid_until, id limit 1 for update skip locked) returning id`. None → 409 `conflict` "No announcement credits left" with `details.reason = 'no_credits'`. A resubmit after rejection keeps its pack.
    3. `start.mode = 'at_time'` must be between now and the pack's `valid_until`, else field `start`: "Pick a date before your credits expire on <date>."
    4. Status `in_review`, `submitted_at`, `announcements.submitted`, and enqueue moderation for the current revision.
  - `cancelAnnouncement(db, ctx, id)`: before start (`draft`, `in_review`, `rejected`, or `scheduled` and not live) → `canceled`; the credit goes back (`credits_used − 1`) only when the pack is still valid; records `announcements.canceled`. Otherwise 409 `not_cancelable`.
  - `endAnnouncement(db, ctx, id)`: live only → `ended` with `end_reason = 'ended_by_host'` and `ended_at = now`, no credit back; records `announcements.ended`. Otherwise 409 `not_running`.
  - `getAnnouncementDetail(db, orgId, id): Promise<AnnouncementDetail>` and `listAnnouncements(db, orgId, f: { tab?: 'running' | 'scheduled' | 'in_review' | 'past'; before? }): Promise<{ packs: { id: string; size: number; creditsUsed: number; validUntil: string }[]; items: AnnouncementSummary[]; nextBefore: string | null }>`. Tabs: Running = live; Scheduled = `scheduled` and not live; In review = `draft`, `in_review`, `rejected`; Past = `ended`, `canceled`, `removed`. `packs` lists the valid packs.
  - **Routes** (`promote.manage`): `POST /promote/announcement-packs/checkout` `{ size }` (rate limit `addons:checkout:<orgId>` 20 per 3,600 s); `GET` and `POST /promote/announcements`; `GET /promote/announcements/:id` → `{ announcement, card, stats }` (`card` from `getAnnouncementCard` and `stats` from `getAnnouncementStats`, Task 19); `PATCH /promote/announcements/:id`; `POST …/submit` (rate limit `announcements:submit:<orgId>` 20 per 86,400 s), `…/cancel`, `…/end`

- [ ] **Step 1: Write the failing tests** (`crud.test.ts`).
  - Create: an 81-character title → 400; another org's photo → a field error on `image`; another org's listing → 404.
  - Submit with body "Call 555-123-4567" → 400 with `details.fields.body` = `CONTACT_DETAILS_MESSAGE`; title "see example.com" → `details.fields.title`; no credit is reserved.
  - A clean submit with a 3-pack → `credits_used: 1`, `pack_id` set, `in_review`, and an outbox row `moderate:<id>:1`.
  - Packs valid until 2026-12-01 and 2026-12-15 → the 2026-12-01 pack is used first; an expired pack is skipped.
  - No credits → 409 with message "No announcement credits left" and `details.reason = 'no_credits'`. A resubmit after rejection reserves nothing.
  - Update while `in_review` → revision 2, `check_id` null and `moderate:<id>:2`; update while live → 409 `not_editable`.
  - Cancel before start → `creditReturned: true` and `credits_used` back to 0; after the pack expired → `creditReturned: false`.
  - End while live → `ended`; end while scheduled and not live → 409 `not_running`.
  - `at_time` after the pack's `valid_until` → a field error on `start`.
  - **(Review Focus 2)** A pack paid 2027-01-31T12:00Z, fulfilled in a session after `set time zone 'America/New_York'` → `valid_until` 2027-02-28T12:00Z.
  - **Integration** (`credits.int.test.ts`, CI only; spec failure mode 5): two concurrent submits with 1 credit left → one `in_review` and one 409 `no_credits`.
- [ ] **Step 2:** Run `pnpm test src/modules/announcements/crud.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the unit tests and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(announcements): packs, composer rules, credit reservation, cancel and end`.

### Task 18 (W3): Moderation, reports and lifecycle

**Files:**
- Create: `src/modules/announcements/{moderation.ts,subjects.ts,lifecycle.ts,moderation.test.ts,lifecycle.test.ts}`

**Interfaces:**
- Consumes: `runCheck`, `decide`, `listOpenReviewItems` (with `checkId`, Task 1), `record`; (fake) `addons.notifyOrg`, `safety.registerReportSubject`
- Produces:
  - `moderateAnnouncement(db: Db, p: { announcementId: string; revision: number }, now: Date): Promise<void>` (the `announcements.moderate` handler):
    - A revision other than the stored one, or a status other than `in_review`, → returns (stale results are ignored).
    - The deterministic checks fail → `rejected` with `rejection_reason = CONTACT_DETAILS_MESSAGE`.
    - `runCheck(db, { kind: 'text_safety', subjectType: 'announcement', subjectId: id, text: title + '\n' + body + '\n' + (imageAlt ?? '') })`, storing `check_id`. `approved` → `approveAnnouncement`. `rejected` → `rejected` with "This announcement doesn't meet our community guidelines. Edit it and submit again." `needs_review` → stays `in_review` (`runCheck` opened the `moderation` item).
    - A rejection records `announcements.rejected` and sends `announcements.rejected` with that reason.
  - `approveAnnouncement(db, id, now)`: only `in_review`. `starts_at` = now for `on_approval`, else max(now, `requested_start_at`); `ends_at` = `starts_at` + 168 hours; status `scheduled`, `decided_at`; records `announcements.approved`; sends `announcements.approved` with `startsLabel = formatPromoteDate(starts_at)`
  - **Subject handlers** (`announcement`): `approve` → `approveAnnouncement`; `remove` → an `in_review` one becomes `rejected` with "Removed after review. Edit it and submit again." (recorded and notified as a rejection); a scheduled or running one becomes `removed` (`end_reason = 'removed'`, `ended_at = now`, no credit back, `announcements.removed` notified and recorded)
    - **Stale decisions** (Plan decision 18): each handler first reads its own item from `listOpenReviewItems(tx, 'announcement', id)` by `data.reviewItemId`. The item is still open while its handler runs. When that item has a `checkId` other than the announcement's current `check_id`, it was opened for an older revision: the host edited afterwards, and `updateAnnouncement` cleared `check_id`. Then `approve` and `remove` change nothing and record `announcements.stale_decision_ignored` `{ reviewItemId, revision }`. The item resolves, and the current revision's own moderation decides. An item without a `checkId` (a report) acts on the current announcement.
  - Report subject `exists(db, id)` → the announcement row exists
  - `tickAnnouncements(db, now): Promise<{ started: number; ended: number; canceled: number }>` (the `announcements.tick` handler): `scheduled` with `starts_at <= now` → `running`; `running` with `ends_at <= now` → `ended` (`completed`, `ended_at = ends_at`), notified `announcements.ended` and recorded; an unstarted credit holder (`in_review`, `rejected`, or `scheduled` not started) whose pack's `valid_until` is more than 14 days ago → `canceled` with no credit back, recorded
  - `remindExpiringCredits(db, now)` (the `announcements.credit_reminders` handler): packs with `reminded_at` null, `credits_used < size` and `valid_until` in `(now, now + 3 days]` → set `reminded_at`, send `announcements.credits_expiring` with `left` and `dateLabel`
  - `stopAnnouncementsForOrg(db: DbOrTx, i: { orgId: string; reason: 'org_stopped' }): Promise<number>`: live → `removed` with `end_reason = 'org_stopped'`; unstarted holders and drafts → `canceled` with no credit back; no notifications; returns the count

- [ ] **Step 1: Write the failing tests** (`moderation.test.ts`, `lifecycle.test.ts`; stub AI markers).
  - Clean text → `scheduled` from `FIXED_NOW` to exactly + 168 h, and `announcements.approved` with body "Starts Nov 3.".
  - `__block__` → `rejected` with the guidelines message, `announcements.rejected` whose body ends "Your credit is kept.", and the pack's `credits_used` unchanged.
  - `__flag__` → still `in_review`, with one `moderation` review item whose subject is `announcement`.
  - A moderation payload for revision 1 after an update to revision 2 → ignored.
  - **Stale decision:** `__flag__` on revision 1 opens item A, then an update makes revision 2 (`check_id` null, `moderate:<id>:2` enqueued). `decide(A, 'approve')` → still `in_review` with no `starts_at`, A resolved, and `announcements.stale_decision_ignored` recorded. The same setup with `decide(A, 'remove')` → still `in_review`, not `rejected`. Revision 2's moderation with clean text then schedules it. With revision 2 flagged too (item B), approving A changes nothing, and approving B schedules it.
  - `decide(…, 'approve')` on the item → `scheduled`. `remove` while `in_review` → `rejected` with "Removed after review. Edit it and submit again."; `remove` while running → `removed`, no longer live, `announcements.removed` sent, and the credit not returned.
  - The registered report subject's `exists` → true for a seeded ID, false for a random UUID.
  - `at_time` 2 days ahead, approved now → starts then; approved after the requested time → starts at approval.
  - **Tick:** due `scheduled` → `running`; `running` past its end → `ended` with `completed` and `ended_at = ends_at`, notified; an `in_review` holder 15 days past its pack's `valid_until` → `canceled`, 13 days → untouched. A second tick → no new effects.
  - **(Failure mode 5)** A pack expiring while its announcement is in review → approval still schedules the run.
  - **Reminders:** a pack expiring in 2 days with 1 credit left → one `announcements.credits_expiring` per Owner and Admin with "You have 1 left."; a second run → none; a fully used pack → none.
  - `stopAnnouncementsForOrg` with one running and one `in_review` → returns 2: `removed` (`org_stopped`) and `canceled`.
- [ ] **Step 2:** Run `pnpm test src/modules/announcements/moderation.test.ts src/modules/announcements/lifecycle.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(announcements): moderation with stale-revision guard, review actions, ticks and reminders`.

### Task 19 (W3): Cards, host page pin, Feed reads, clicks and stats

**Files:**
- Create: `src/modules/announcements/{cards.ts,stats.ts,clicks.ts,privacy.ts,cards.test.ts,clicks.test.ts}`, `src/app/api/v1/promote/host-media/route.ts`, `src/app/api/v1/announcements/[id]/open/route.ts`, `src/app/api/v1/announcements/served/route.ts`

**Interfaces:**
- Consumes (fake): `hostpages.getHostIdentities`, `listApprovedOrgPhotos`; `listings.getListingSummaries`. Real: `getMediaUrl`, `getStorage`, `getSetting`, `isLikelyBot`, `hmacKey`, `announcementOpenHref`
- Produces:
  - `getAnnouncementCards(db, ids, now = new Date()): Promise<AnnouncementCardData[]>`: live announcements only, in input order. `orgName`, `orgSlug` and `orgLogoUrl` from `getHostIdentities` (the logo's 320 px public URL); `imageUrl` = the image's 640 px public URL; `label: 'Paid announcement'`; `startsAt`, `endsAt`. **Target:** a listing target that is still Active → `ctaLabel: 'View job'`; a host page target, or a listing no longer Active → `ctaLabel: 'View jobs'` (spec 8.3). `ctaHref` = `/api/v1/announcements/<id>/open`, the bare click route. Followed as-is, it redirects and counts no click (Plan decision 15). A surface that counts clicks links to `announcementOpenHref(id, surface)` instead. The kill switch off → `[]`.
  - `listPinnedForHostPage(db, orgId, o: { now?: Date; countServe: boolean })`: the org's live announcements, newest first (`starts_at desc, id desc`), as cards; with `countServe`, each card's `host_page` `served` + 1; the kill switch off → `[]`
  - `getAnnouncementCard(db, orgId, id): Promise<AnnouncementCardData>`: the card for the host's detail page, in any status (another org's → `not_found`); an announcement not yet approved gets the window it would have if it started now (`now` to `now + 168 h`)
  - `hostPagePins(db, orgId)` (the SP2 provider): `listPinnedForHostPage(db, orgId, { countServe: false })` mapped to `{ id, title, body, mediaId, imageAlt, ctaLabel, endsAt: Date, ctaHref: announcementOpenHref(id, 'host_page') }`
  - `listRunningAnnouncements(db, i: { hiddenOrgIds: string[]; before?: string; limit: number; now?: Date })`: live announcements outside `hiddenOrgIds`, ordered `starts_at desc, id desc`, keyset `before`; `encodeAnnouncementCursor({ startsAt: Date; id: string }): string` = `<ISO>|<uuid>`; `decodeAnnouncementCursor(s: string): { startsAt: Date; id: string } | null`
  - `recordAnnouncementServes(db: DbOrTx, ids: string[], surface: PromoteSurface, now: Date)` and `recordAnnouncementClick(db: DbOrTx, id: string, surface: PromoteSurface, now: Date)`: upserts per `(announcement_id, UTC day, surface)`
  - `getAnnouncementStats(db, orgId, id): Promise<{ surface: PromoteSurface; served: number; clicks: number }[]>`
  - `resolveOpen(db, i: { id: string; surface: PromoteSurface | null; userAgent: string | null; now: Date }): Promise<{ location: string }>`: unknown → `not_found`; the location is always `new URL(<path>, APP_URL)` with path `/jobs/view/<listingId>` (an Active listing target) or `/hosts/<slug>`; a click is counted only when `surface` is given, the announcement is live and the user agent isn't `isLikelyBot`
  - `getAnnouncementCreditSummary(db, orgId): Promise<{ available: number; nextExpiry: string | null; running: number }>`: credits left in valid packs, the earliest `valid_until` among packs with credits left, and the live count
  - **`privacyHandler` (announcements):** an `org` export gives `{ records: { packs, announcements, announcement_daily_stats } }`; `erase` for an `org` hard-deletes its announcements and their daily stats (returns that count; packs stay, as they hold no personal data); for a `user` it erases 0 (spec 10)
  - **Routes:**
    - `GET /promote/host-media` (`promote.manage`) → `{ items: { mediaId, url, alt }[] }` (320 px URLs)
    - `GET /announcements/:id/open` (`auth: 'none'`, `{ surface?: 'feed' | 'announcements_tab' | 'host_page' }`, rate limit `ann:open:<ipHash>` 120 per 60 s) → `new Response(null, { status: 302, headers: { location } })`. A missing `surface` still redirects and counts nothing; any other value is 400.
    - `POST /announcements/served` (`auth: 'none'`, `{ orgId: uuid }`, rate limit `ann:served:<ipHash>` 120 per 60 s) → 204; a bot user agent counts nothing; otherwise `listPinnedForHostPage(db, orgId, { countServe: true })` (Plan decision 13)

- [ ] **Step 1: Write the failing tests** (`cards.test.ts`, `clicks.test.ts`).
  - **(E6)** An announcement approved to start at S = `FIXED_NOW` + 1 h: `listPinnedForHostPage`, `getAnnouncementCards` and `listRunningAnnouncements` return nothing at S − 1 ms, the card at S and at S + 168 h − 1 ms, and nothing at S + 168 h.
  - A card's `orgName` and `orgSlug` come from the host identity, `label` is `'Paid announcement'`, `ctaLabel` is `'View job'` for an Active listing target, then `'View jobs'` after `listingsFake.setState(id, 'closed')`. `imageAlt` is the stored alt.
  - Two running announcements → newest first. `hiddenOrgIds` drops an org. `limit: 1` plus the returned `nextBefore` pages to the second; `decodeAnnouncementCursor(encodeAnnouncementCursor(x))` round-trips.
  - `countServe: true` → `host_page` served + 1 per card; `false` → no row.
  - The kill switch off → `[]` from all three reads.
  - **Open:** a live listing-target announcement with surface `feed` → 302 with `location` = `<APP_URL>/jobs/view/<listingId>` and `feed` clicks 1; a `Googlebot/2.1` user agent → the same redirect and no click; an ended one → 302 to `/hosts/<slug>` and no click; an unknown ID → 404; `surface=email` → 400. Following a card's `ctaHref` exactly as `getAnnouncementCards` returns it (no `surface`) → 302 to the same `location` and no click row. Every `location` starts with `APP_URL`.
  - **Served:** a Googlebot POST → 204 and no row; a Chrome POST → 204 and `host_page` served + 1.
  - `GET /promote/host-media` answers a Recruiter with 403.
- [ ] **Step 2:** Run `pnpm test src/modules/announcements/cards.test.ts src/modules/announcements/clicks.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/announcements`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(announcements): cards, host page pin, running list, click redirect and serve counts`.

### Task 20 (W4): Feed hook and serve counts

**Files:**
- Create: `src/modules/promote/{feed.ts,serves.ts,feed.test.ts}`

**Interfaces:**
- Consumes (fake): `boosts.feedBoostCandidates`, `recordBoostServes`; `announcements.listRunningAnnouncements`, `recordAnnouncementServes`; `safety.getBlockSet`. Real: `rotationOrder`, `getSetting`
- Produces:
  - `getPaidFeedItems(db, i: { viewerUserId: string; limit: number; state: string | null; now?: Date; excludeOrgIds?: string[] }): Promise<{ items: PaidFeedItem[]; state: string }>`:
    - The kill switch off → `{ items: [], state: i.state ?? '' }`.
    - `state` decodes from base64url JSON `{ v: 1, s: string[], n: 'b' | 'a' }` (shown keys and the next kind); anything else is a fresh `{ s: [], n: 'b' }`.
    - `hidden` = the block set's `orgIds` ∪ `mutedOrgIds` ∪ `excludeOrgIds`.
    - Boosted jobs: `feedBoostCandidates({ viewerUserId, exclude: s, now })` without hidden orgs, in `rotationOrder` by `boostId`. Announcements: `listRunningAnnouncements({ hiddenOrgIds: hidden, limit: 50, now })` without shown IDs, in `rotationOrder` by `id`.
    - Alternate the kinds, starting with `n`, up to `limit`, taking the other kind when one runs out. Items are `{ kind: 'boosted_job', listingId, boostId, label: 'Boosted' }` and `{ kind: 'announcement', announcementId, label: 'Paid announcement' }`.
    - The new state adds the returned keys (keeping the newest 200) and sets `n` to the kind after the last item.
  - `recordPaidServes(db, i: { items: PaidFeedItem[]; surface: 'feed' | 'announcements_tab' })`: boosted jobs → `recordBoostServes(…, 'feed')` (ignored for `announcements_tab`); announcements → `recordAnnouncementServes` for that surface

- [ ] **Step 1: Write the failing tests** (`feed.test.ts`).
  - 2 boosts and 2 announcements, `limit: 4` → kinds `['boosted_job', 'announcement', 'boosted_job', 'announcement']` with the exact labels; the next call with the returned state → `[]`.
  - `limit: 1` → one boosted job, and the decoded state has `n: 'a'`.
  - Block-set `orgIds`, `mutedOrgIds` and `excludeOrgIds` each drop that host's boosted job and announcement.
  - **(E4)** With the boosts fake built from `feedBoostCandidates`'s rules, a seeker whose preferences are `['maritime']` gets no Farm boost.
  - The kill switch off → no items and the state unchanged. A garbage state → a fresh session.
  - The order for one viewer within one UTC hour is stable and equals the explicit FNV-1a order.
  - `recordPaidServes` with surface `feed` → one boost serve and one announcement serve on `feed`; with `announcements_tab` → the announcement only.
- [ ] **Step 2:** Run `pnpm test src/modules/promote/feed.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(promote): Feed paid-item candidates with rotation, block filtering and serve counts`.

### Task 21 (W4): Stops, summary and privacy

**Files:**
- Create: `src/modules/promote/{stop.ts,summary.ts,privacy.ts,stop.test.ts,summary.test.ts}`, `src/app/api/v1/promote/summary/route.ts`

**Interfaces:**
- Consumes (fake): `boosts.stopBoostsForOrg`, `countBoosts`; `announcements.stopAnnouncementsForOrg`, `getAnnouncementCreditSummary`; `addons.getInviteCredits`, `getSeatSummary`. Real: `withTx`, `record`, `kickWorker`
- Produces:
  - `stopPromotionsInTx(tx: Tx, i: { orgId; reason: 'org_suspended' | 'org_deleted'; actor })` (internal): calls `stopBoostsForOrg` and `stopAnnouncementsForOrg` with `tx` and `reason: 'org_stopped'`, and records `promote.org_stopped` `{ reason, boosts, announcements }` with `orgId`
  - `stopPromotionsForOrg(db: Db, i: { orgId; reason: 'org_suspended' | 'org_deleted'; actor })` (SP8's suspension path): `stopPromotionsInTx` in one transaction, then `kickWorker()`
  - `getPromoteSummary(db, orgId): Promise<PromoteSummary>`: `activeBoosts` and `scheduledBoosts` from `countBoosts`; `runningAnnouncements` and `announcementCredits` from `getAnnouncementCreditSummary`; `inviteCredits.monthlyRemaining` and `packRemaining` (sum of pack `remaining`) from `getInviteCredits`; `seats` from `getSeatSummary`
  - **`privacyHandler` (promote):** `tables: []`; exports nothing. For an `org` subject, `erase` runs `stopPromotionsInTx(tx, { orgId, reason: 'org_deleted', actor: { type: 'system', id: null } })` in SP8's erase transaction (Plan decision 25) and returns `{ erased: 0, retained: [] }`, because it changes statuses and deletes nothing. For a `user` subject it does nothing. `retentionRules` as in Task 7
  - **Route:** `GET /promote/summary` (`promote.manage`) → `PromoteSummary`

- [ ] **Step 1: Write the failing tests** (`stop.test.ts`, `summary.test.ts`).
  - `stopPromotionsForOrg` calls both stop functions with the same transaction object and records `promote.org_stopped` with the org's ID and `{ reason: 'org_suspended', boosts: 2, announcements: 1 }`; a second run with counts 0 records `{ boosts: 0, announcements: 0 }`.
  - **(Org deletion)** `privacyHandler.erase(tx, { kind: 'org', orgId }, ctx)` calls both stop functions with that `tx`, records `promote.org_stopped` with `reason: 'org_deleted'`, and returns `{ erased: 0, retained: [] }`. A second run returns the same result. A `user` subject calls neither stop function.
  - With fakes set up so → `{ activeBoosts: 1, scheduledBoosts: 1, runningAnnouncements: 2, announcementCredits: { available: 3, nextExpiry: '2026-12-03T17:00:00.000Z' }, inviteCredits: { monthlyRemaining: 50, packRemaining: 25 }, seats: { included: 5, extra: 2, used: 6 } }`.
  - The route answers a Billing member with 403.
- [ ] **Step 2:** Run `pnpm test src/modules/promote`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(promote): stop promotions for an org, the Promote summary, privacy registration`.

---

## Phase B2: Screens (W5; based on B1 merged)

Pages are server components that call the module services through `getDb()` for the first render and the B1 routes for every change. Each page imports `@/server/sp6-wiring` (through `sp2-wiring`). Recruiters and Billing members who open a Promote page see `EmptyState` "Only Owners and Admins can manage promotions." instead of the page.

### Task 22 (W5): AnnouncementCard, AnnouncementStack and the boosted map pin

**Files:**
- Create: `src/ui/patterns/{AnnouncementCard.tsx,AnnouncementStack.tsx,announcement.test.tsx}`, `src/app/design-system/patterns/announcement-card/page.tsx`
- Modify: `src/ui/patterns/{MapPin.tsx,MapCanvas.tsx,map.test.tsx}`, `src/ui/components/JobCard.test.tsx`

**Interfaces:**
- Produces:
  - `AnnouncementCardProps = { variant: 'community' | 'host_page'; org: { name: string; logoSrc: string | null; href: string }; title: string; body: string; image: { src: string; alt: string } | null; cta: { label: string; href: string }; endsLabel: string; headingAs?: 'h2' | 'h3' }`. It renders an `OrgLogo`, the org name, a `Badge` ("Paid announcement" for `community`, "Announcement" for `host_page`), the title as a heading, the body as plain text with line breaks kept, the optional `Img` with its alt, a link-styled `Button` for the CTA, and "Until {endsLabel}". SP7 adds a `platform` variant later; keep the variant switch in one place.
  - `AnnouncementStack({ items: AnnouncementCardProps[] })`: renders nothing for `[]`; shows the first card, then a `<button>` "Show N more announcements" ("Show 1 more announcement" for one) that reveals the rest
  - `MapPin` with `boosted`: 1.25× size, the category color and icon kept, a `Sparkles` badge, and an accessible name that ends ", boosted". `MapCanvas`: the pin symbol layer's `icon-size` is `['case', ['get', 'boosted'], 1.25, 1]`, and a `boosted-badge` symbol layer filtered on `['==', ['get', 'boosted'], true]` draws the sparkle image.
  - The gallery page shows both variants with and without an image, a stack of 3, and boosted and normal pins, in light and dark.

- [ ] **Step 1: Write the failing tests.**
  - `announcement.test.tsx` (jsdom): `variant="community"` shows "Paid announcement", `host_page` shows "Announcement" and not "Paid announcement"; the CTA is an `<a>` with the given `href`; "Until Nov 10" is shown; the image has its alt; the body keeps a line break. The stack with 3 items shows 1 card and "Show 2 more announcements", and pressing it shows 3; with 2 it reads "Show 1 more announcement"; with 0 it renders nothing.
  - `map.test.tsx` (mocked `mapbox-gl`): the pin layer's `icon-size` equals the `case` expression above, and a `boosted-badge` layer exists with that filter. `MapPin` with `boosted` has an accessible name ending ", boosted" and a 1.25 scale class.
  - `JobCard.test.tsx`: the boosted badge reads "Boosted" and uses `tone="surface"` (neutral), not the amber tone.
  - E2E (`tests/e2e/sp6-screens.spec.ts`, first case): `/design-system/patterns/announcement-card` has 0 serious or critical axe violations in light and dark at 390 px and 1280 px.
- [ ] **Step 2:** Run `pnpm test src/ui/patterns src/ui/components/JobCard.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement with `src/ui` components and tokens only.
- [ ] **Step 4:** Run the tests, `pnpm check:tokens` and the e2e case. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): AnnouncementCard and stack, boosted map pin`.

### Task 23 (W5): Promote shell, overview and boost screens

**Files:**
- Create: `src/app/host/promote/layout.tsx`, `src/app/host/promote/boosts/page.tsx`, `src/app/host/promote/boosts/[id]/page.tsx`, `src/app/host/promote/_components/{promote-tabs,summary-tiles,boost-sheet,boost-report}.tsx`, `src/app/host/promote/_components/boost-sheet.test.tsx`
- Modify: `src/app/host/promote/page.tsx` (replaces the Foundation placeholder)

**Interfaces:**
- Consumes: `getPromoteSummary`, `listBoosts`, `getBoostReport`, `checkBoostEligibility`; the routes `GET /promote/boosts/eligibility`, `POST /promote/boosts/checkout`; SP2's `listOrgListings` (tab `active`, for the listing `Select`); SP3's `getJobCards` and `toJobCardProps` (the preview card); `formatCents`, `formatPromoteDate`
- Produces (spec section 7 rows):
  - **Layout:** heading "Promote", a `StatTile` row from the summary (desktop in a row, mobile a 2-column grid), and `Tabs` Boosts · Announcements · Credits and seats whose value follows the route and whose change calls `router.push`.
  - **`/host/promote`:** with no boosts, no packs and no announcements, `EmptyState` "Promote your jobs with a boost, or tell seekers what's new with an announcement." with Buttons "Boost a listing" (`/host/promote/boosts?new=1`) and "Buy announcements" (`/host/promote/announcements?buy=1`); otherwise a redirect to `/host/promote/boosts`.
  - **`/host/promote/boosts`:** `Card` rows (listing title, status `Pill`, dates, served); `EmptyState` "No boosts yet."; Button "Boost a listing" opening a `Sheet` (a bottom sheet under 768 px, a side panel above); `?listing=<id>` or `?new=1` opens it on load.
  - **Boost sheet:** `Select` of Active listings; a `JobCard` preview with `boosted`; a `SegmentedControl` labeled "7 days $49", "14 days $79", "28 days $99" from the eligibility options, unavailable ones disabled with "Your listing ends [date]" (the date from `listingEndsAt`); the summary "Starts now · Ends Nov 10" or "Starts Nov 10 · Ends Nov 17"; fine print "Boosts can't be refunded once they start. A boost ends if the listing closes."; Button "Continue to payment", which navigates to the returned `checkoutUrl`. A 409 shows an inline `ErrorState` with the conflict message.
  - **`/host/promote/boosts/[id]`:** `StatTile` × 4 "Shown in boosted spots", "Views per day before → during", "Saves from Boost", "Applications from Boost"; a `BarChart` of views per day (before and during series) with the Chart/Table `SegmentedControl`; "No comparison yet: the boost started when the listing was published" when `viewsPerDayBefore` is null; charts full width on mobile.

- [ ] **Step 1: Write the failing tests.**
  - `boost-sheet.test.tsx` (jsdom, fetch mocked): eligibility with 14 and 28 days unavailable and `listingEndsAt` 2026-11-13T17:00:00Z → those segments are disabled with "Your listing ends Nov 13"; choosing 7 days shows "Starts now · Ends Nov 10"; a 409 `listing_ends_too_soon` on Continue shows "Your listing ends before this boost would finish." in an `ErrorState`.
  - E2E (`sp6-screens.spec.ts`, stub billing, `signInAsHostAdmin`): a new host's `/host/promote` shows the empty state with both buttons; "Boost a listing" → choose a listing and 7 days → "Continue to payment" lands on the return page and then the boost row reads Active; the report page shows the four tiles and "No comparison yet: the boost started when the listing was published" for a listing published just before. A Recruiter on `/host/promote` sees "Only Owners and Admins can manage promotions." Axe passes at 390 px and 1280 px.
- [ ] **Step 2:** Run `pnpm test src/app/host/promote` and `pnpm e2e tests/e2e/sp6-screens.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): Promote overview, boost purchase sheet, boost list and report`.

### Task 24 (W5): Announcement screens

**Files:**
- Create: `src/app/host/promote/announcements/page.tsx`, `src/app/host/promote/announcements/new/page.tsx`, `src/app/host/promote/announcements/[id]/page.tsx`, `src/app/host/promote/_components/{pack-sheet,announcement-form,announcement-preview}.tsx`, `src/app/host/promote/_components/announcement-form.test.tsx`

**Interfaces:**
- Consumes: `listAnnouncements`, `getAnnouncementDetail`, `getAnnouncementCard`; SP2's `listOrgListings` (tab `active`, for the button target) and `getHostIdentities` (preview org name and logo); the announcement, pack-checkout and host-media routes; `findContactDetails`, `CONTACT_DETAILS_MESSAGE`; `AnnouncementCard`
- Produces (spec section 7 rows):
  - **`/host/promote/announcements`:** a pack `Card` per valid pack ("2 of 3 left · use by Dec 3"); Button "Buy announcements" opening a `Sheet` with a `SegmentedControl` "1 · $49", "3 · $99", "5 · $149" and the line "Each runs for 7 days and pins to your host page while it runs."; `Tabs` Running / Scheduled / In review / Past with status `Pill`s ("Draft", "In review", "Needs changes", "Scheduled", "Running", "Ended", "Canceled", "Removed"); `EmptyState` "No announcements yet. Hosts get no free announcements; buy a pack to post one."; `?buy=1` opens the sheet.
  - **Composer** (`new` and `[id]`): `Input` title with a counter to 80; `Textarea` body with a counter to 500; `Select` button target ("Host page" and each Active listing title); an image grid from `GET /promote/host-media` with an alt `Input` (required when an image is chosen, up to 200); `RadioGroup` start "As soon as approved" / "On a date" with a date `Input`; a live preview `Tabs` Community / Host page with `AnnouncementCard`; Button "Submit for review · uses 1 credit" ("Submit for review" when the announcement already holds a credit). Field errors are inline with icon and text, shown live from `findContactDetails` and from the submit response's `details.fields`. Desktop: form left, preview right; mobile: preview below. A running announcement shows read-only with Button "End now"; one not started shows "Cancel".

- [ ] **Step 1: Write the failing tests.**
  - `announcement-form.test.tsx` (jsdom): typing "Call 555-123-4567" in the body shows "Links, emails and phone numbers aren't allowed. Seekers use the button." under the body; the title counter reads "12/80" for 12 characters; choosing an image without alt shows an alt error on submit; the Community preview shows "Paid announcement" and the Host page preview shows "Announcement"; the submit label reads "Submit for review · uses 1 credit" for a draft without a pack.
  - E2E: buy a 3-pack with stub billing → the pack card reads "3 of 3 left · use by <date>"; write and submit an announcement → "2 of 3 left"; after `drainJobs` it shows under Running (stub AI approves clean text); "End now" moves it to Past. Axe passes.
- [ ] **Step 2:** Run `pnpm test src/app/host/promote` and the e2e cases. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): announcement packs, list tabs and the composer with live preview`.

### Task 25 (W5): Credits, seats and the checkout return page

**Files:**
- Create: `src/app/host/promote/credits/page.tsx`, `src/app/host/promote/checkout/return/page.tsx`, `src/app/host/promote/_components/{seats-block,invite-sheet,return-status}.tsx`, `src/app/host/promote/_components/return-status.test.tsx`

**Interfaces:**
- Consumes: `getInviteCredits`, `getSeatSummary`, `getCatalog`; `GET /promote/credits`, `GET /promote/seats/preview`, `PUT /promote/seats`, `POST /promote/invite-packs/checkout`, `GET /promote/purchases/:id`
- Produces (spec section 7 rows):
  - **`/host/promote/credits`:** an invite credits `StatTile` ("50 monthly credits left", "Resets Dec 1"); a packs table (purchase date, remaining, use by); Button "Buy invite credits" opening a `Sheet` of the available invite packs ("Invite pack (25 credits) · $X"); a Seats block with Included, Extra and In use, a stepper `Input` with `IconButton`s labeled "Remove a seat" and "Add a seat" (0–50), a preview line ("You'll pay $X now, then $Y at renewal." for an increase, "Your renewal on Dec 3 will be $Y." for a decrease), and Button "Confirm". When a block's prices aren't in the catalog, it shows `EmptyState` "Not on sale yet". A pending decrease shows "Goes down to N seats on Dec 3".
  - **`/host/promote/checkout/return?purchase=`:** `Skeleton` and "Confirming your payment" while polling `GET /promote/purchases/:id` every 2 s for up to 60 s. Then: `fulfillment: 'fulfilled'` → a success `Card`: a boost "Your boost is set." with Button "View boost" (`/host/promote/boosts/<fulfilledRef>`), a pack "Your announcement credits are ready." with Button "Write an announcement", an invite pack "Your invite credits are ready." with Button "Back to credits"; `voided` → "We couldn't start your boost because the listing closed. We've refunded you."; `expired` → "This checkout expired. Nothing was charged." with Button "Try again"; still pending after 60 s → "Still confirming. We'll notify you when it's done."

- [ ] **Step 1: Write the failing tests.**
  - `return-status.test.tsx` (jsdom, fake timers, fetch mocked): `pending` then `fulfilled` for a boost → "Your boost is set." and a link to the boost; `voided` → the exact refund sentence; `pending` for 60 s → "Still confirming. We'll notify you when it's done." and polling stops (30 fetches at most).
  - E2E: with no invite-pack or seat prices synced, the credits page shows "Not on sale yet" in both blocks. After `setPrice` for `ee_extra_seat_month` through the stub gateway and a price sync, raising seats from 0 to 1 shows the preview line, and Confirm updates Extra to 1. Axe passes.
- [ ] **Step 2:** Run `pnpm test src/app/host/promote` and the e2e cases. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): invite credits, extra seats and the checkout return page`.

### Task 26 (W5): SP2 touchpoints: the host page stack and listing rows

**Files:**
- Create: `src/app/hosts/[slug]/_components/serve-beacon.tsx`
- Modify: the file under `src/app/hosts/[slug]/_components/` that renders `page.announcements` (SP2 Task 41)

**Interfaces:**
- Consumes: `HostPagePublic.announcements` (with `imageAlt`, Task 5) and `identity`; `AnnouncementStack`; `getMediaUrl`; `formatPromoteDate`
- Produces:
  - SP2's announcement markup is replaced by `AnnouncementStack` items with `variant: 'host_page'`, `org` from `page.identity`, `image` from the 640 px URL and `imageAlt`, `cta` = `{ label: item.ctaLabel, href: item.ctaHref }`, and `endsLabel`. Nothing renders when the list is empty (spec 7).
  - `ServeBeacon({ orgId })`: a client component that, once per mount, sends `navigator.sendBeacon('/api/v1/announcements/served', <JSON { orgId }>)` (falling back to `fetch` with `keepalive`); rendered only when the stack has items.
  - SP2's listing rows need no change: the row badge provider (Task 16) fills them.

- [ ] **Step 1: Write the failing tests.**
  - E2E: with a running announcement for Kettle Ridge Lodge, `/hosts/kettle-ridge-lodge` shows "Announcement", its title and "Until <date>" above the tabs, and with two running it shows "Show 1 more announcement"; after the page loads, the `host_page` served count for that announcement is 1 (`dbRows`). With none running, no stack renders. On `/host/listings`, a boosted Active listing's row shows a `Pill` "Boosted until <date>", and another Active listing shows "Boost" linking to `/host/promote/boosts?listing=<id>`. Axe passes.
- [ ] **Step 2:** Run the e2e cases. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(public): host page announcement stack with serve beacon`.

---

## Phase C: Integration (W6)

### Task 27 (W6): Exit criteria across real modules

**Files:**
- Create: `tests/sp6/exit-criteria.test.ts`, `tests/sp6/surfaces.test.ts`, `tests/sp6/host-analytics.test.ts`, `tests/sp6/wiring.test.ts`

**Interfaces:**
- Consumes: the real SP2–SP6 modules on PGlite with SP2's and SP6's fake Stripe gateways (`makeFakeBillingGateway`, `makeFakeAddonsGateway`); SP3's `insertProjectionRows`, `searchListings` and `mapPins`; SP2's `seedHostOrg`, `seedMember` and the SP3 e2e `publishListing` shape for real listings where a test needs SP2 state; `runWorker`

- [ ] **Step 1: Write the failing tests.**
  - **E1** (`exit-criteria.test.ts`): on six Active listings, the Owner and the Admin each buy a 7-, 14- and 28-day boost, a 1-, 3- and 5-announcement pack, an invite pack and an extra seat (prices set in the fake). Nothing is fulfilled until the fake completes the session; then one `addons.stripe_event` per purchase fulfills it; delivering each event twice leaves one boost, one pack and one grant per purchase. The Recruiter and the Billing member get 403 on every checkout route and on `PUT /promote/seats`. This proves E1's ordering, idempotency and roles against the fake gateways. Task 28 runs each SKU kind against Stripe test mode.
  - **E5** (`surfaces.test.ts`): with the real hook installed through `getPlacementHook`, a hook whose `place` throws, and one wrapped to sleep 200 ms (`setPlacementHookForTests`), each make `searchListings` for Seek and Swipe return the same items as with `noopHook`, within 150 ms of the organic query.
  - **E2:** for a live boost on a matching listing, every card for it from Seek, Swipe (`searchListings`) and the Map list (`surface: 'map_list'`) has `boosted` set, and `mapPins` marks its location `boosted: true`; a non-matching filter returns it nowhere.
  - **E3 and E4 against SP3:** Seek page 0 with 6 live boosts over 40 matching listings inserts at positions 2, 7, 12 and 17 only; with `cat=maritime`, a Farm boost is never inserted; `getPaidFeedItems` for a seeker whose preferences exclude Farm never returns the Farm boost.
  - **E6:** an announcement runs exactly 168 hours from approval, is on `resolveHostPage(...).announcements` and in `getPaidFeedItems` only inside the window, and a rejected one keeps its credit.
  - **E8:** a boost purchase whose listing closes (SP2 `closeListing`) before the session completes → a `void` boost, one full refund and both notifications after the worker runs; a listing closed during a live boost → not in `searchListings` at once, and `ended_early` after one worker run (`boosts.end_for_listing`) and in any case by the next `boosts.tick`.
  - **`stopPromotionsForOrg`:** one live and one scheduled boost, one running and one in-review announcement → `ended_early`, `void` with one refund, `removed` and `canceled`.
  - **Org deletion** (Plan decision 25): the same set in two orgs, erased the way SP8 erases a deleted org, by running the four SP6 `privacyHandler.erase` calls for the `org` subject, one org in registry order and the other in reverse. Expected for each: the live boost `ended_early`, the scheduled one `void` with one refund after the worker runs, no announcement rows left, and one `promote.org_stopped` with `reason: 'org_deleted'` and `boosts: 2`.
  - **Wiring** (`wiring.test.ts`, Plan decision 12): the file imports only `@/server/module-registrations`, plus `getBoostWindows` from `@/modules/analytics`, and inserts a live boost with raw SQL. `getBoostWindows(db, { orgId, from, to })` returns that boost's window. This proves that a page that loads only `module-registrations`, such as SP5's `/host/analytics`, has SP6's source registered on a cold import.
  - **E7** (`host-analytics.test.ts`): with seeded `listing_events`, `getBoostReport` matches Task 16's numbers through real SP3 counts; `getHostAnalytics(db, { orgId, range: '30d', listingIds: 'all', tz: 'America/Chicago' })` has a `boost` entry for the listing whose `before` and `during` match the window SP6 registered; an application submitted through `submitApplication` with `source: 'boost'` appears in the `sources` slice keyed `boost` with value 1; an `ended_early` boost's window ends at `ended_at`.
- [ ] **Step 2:** Run `pnpm test tests/sp6`. Expected: FAIL until the fixes land.
- [ ] **Step 3:** Fix what the tests expose, in the owning module, with any migration in `drizzle/59xx`.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `test(sp6): exit criteria E1-E8 across real modules`.

### Task 28 (W6): End-to-end, Stripe test mode and the runbook

**Files:**
- Create: `tests/e2e/sp6-promote.spec.ts`, `tests/e2e/sp6-stripe.spec.ts`, `tests/sp6/stripe-test-mode.int.test.ts`, `docs/runbooks/sp6-addons-setup.md`

**Interfaces:**
- Consumes: Task 8's e2e helpers; SP3's `seedHost`, `publishListing`, `signInAsSeeker`; SP2's `entitleHost`, `drainJobs`, `dbRows`

- [ ] **Step 1: Write the failing tests.**
  - **`sp6-promote.spec.ts`** (stub billing, local): publish "Boost test lift operator", then two newer Seasonal listings; as the Admin, boost the oldest for 7 days through the screens; then, as a seeker, `/?cat=seasonal` shows it second with "Boosted", and `/?cat=farm` doesn't show it. A purchase for a listing closed before the return page loads shows "We couldn't start your boost because the listing closed. We've refunded you."
  - **`sp6-stripe.spec.ts`** (CI preview, skipped unless `STRIPE_SECRET_KEY` starts with `sk_test_`): the Admin boosts a listing for 7 days, pays on Stripe's hosted Checkout with card 4242 4242 4242 4242, any future expiry and CVC, lands on the return page, which confirms (by webhook or by `reconcilePurchase`) within 60 s; the listing then appears second in Seek with "Boosted" for a matching seeker and is absent for a non-matching filter. Then the Admin buys a 3-announcement pack, and the Owner buys an invite pack. Before that, the spec makes sure the test-mode price `ee_invite_pack_s` exists with metadata `ee_credits: '25'`, and runs a price sync. Each purchase is paid with 4242 → the return page shows "Your announcement credits are ready." and then "Your invite credits are ready.", and the credits page lists a 25-credit pack.
  - **`stripe-test-mode.int.test.ts`** (E1; the CI integration job with Postgres and the real gateways; skipped unless `STRIPE_SECRET_KEY` starts with `sk_test_`). It covers what the hosted-Checkout e2e can't:
    - **Pack checkout:** the real `addonsGateway` creates a payment-mode session for `announcement_pack_1`. The retrieved session has the purchase metadata, `invoice_creation.enabled` and `expires_at` = creation + 31 minutes. `expireCheckout` then marks the purchase `expired`.
    - **Extra seats:** a test customer with `pm_card_visa` on a Professional monthly test subscription. `setSubscriptionAddon` to 2 → Stripe's `ee_extra_seat_month` item has quantity 2, and a paid proration invoice exists (`always_invoice` with `error_if_incomplete`). Then to 1 → no Stripe change until the `billing.apply_addon_change` handler runs, then quantity 1 with no new proration invoice. With `pm_card_chargeCustomerFail` as the default payment method, an increase → `conflict` `payment_failed`, and Stripe's quantity is unchanged.
    - **Refund through the webhook path:** a confirmed 4,900 test PaymentIntent (`pm_card_visa`) is recorded as a paid `boost_7d` purchase. `refundPurchase` and the `addons.refund` handler → a Stripe refund `succeeded`. The `charge.refunded` event for it, read with `stripe.events.list`, is handed to `addons.stripe_event` as a `billing.stripe_event` envelope → the purchase is `refunded` with `refunded_cents` 4,900 and one `addons.refunded` per recipient.
    - Test-mode fixtures (the `ee_extra_seat_month` and `ee_invite_pack_s` prices) are created when absent and reused across runs.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/sp6-promote.spec.ts`. Expected: FAIL until the fixes land.
- [ ] **Step 3:** Write the runbook: run `pnpm stripe:seed-addons` per Stripe mode (test now, live at the SP8 cutover); enable `checkout.session.completed`, `checkout.session.expired`, `charge.refunded` and `charge.dispute.created` on the SP2 webhook endpoint; create invite-pack and seat prices with lookup keys `ee_invite_pack_s|m|l` (metadata `ee_credits`) and `ee_extra_seat_month|year` once the founder sets prices (open item O1); the kill switch `promote.paid_delivery_enabled`; how to refund from the `billing` queue; the test-mode fixture prices the CI tests create. Fix what the e2e tests expose.
- [ ] **Step 4:** Run the stub e2e locally. The Stripe e2e runs in the CI preview job, and the test-mode integration test runs in the CI integration job (locally, `pnpm typecheck` only). Expected: PASS.
- [ ] **Step 5:** Commit: `test(sp6): boost purchase end to end in stub and Stripe test mode, setup runbook`.

### Task 29 (W6): Placement latency at 50,000 listings and 500 boosts

**Files:**
- Create: `tests/perf/sp6-placement.int.test.ts`

**Interfaces:**
- Consumes: SP3's `seedSynthetic`, `searchListings`, `noopHook`, `setPlacementHookForTests`; SP6's `placementHook`; `insertBoost`

- [ ] **Step 1: Write the failing test** (CI integration job, Postgres): seed 50,000 synthetic listings and 500 live boosts on random ones; run 200 Seek and 200 Swipe searches with random SP3 filters twice, once with `noopHook` and once with `placementHook` (warm cache); the p95 of the per-query difference is ≤ 30 ms (spec failure mode 4), and every boosted search returns `pageSize` items.
- [ ] **Step 2:** Run it in CI (`pnpm test:integration tests/perf/sp6-placement.int.test.ts`). Expected: FAIL if the budget is missed.
- [ ] **Step 3:** If it fails, profile `matchIds` and the active-boost load first (index use on `(starts_at, ends_at) where status in ('scheduled','active')`), and fix in `src/modules/boosts` or a `drizzle/59xx` index.
- [ ] **Step 4:** Re-run in CI. Expected: PASS.
- [ ] **Step 5:** Commit: `test(sp6): placement latency budget at 50,000 listings and 500 boosts`.
