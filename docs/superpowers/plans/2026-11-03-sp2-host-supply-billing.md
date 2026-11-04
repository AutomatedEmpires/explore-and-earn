# Host Supply and Billing (Sub-project 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host forms a team, adds locations, builds a public host page, publishes listings through automatic checks, business verification and screening, and pays through Stripe, on an entitlements ledger that later sub-projects reuse.

**Architecture:** Seven new or extended modules inside the Foundation modular monolith (`orgs`, `locations`, `listings`, `hostpages`, `verification`, `billing`, `entitlements`), wired by a one-way import graph. Reverse flows go through domain events that `emit()` fans out into the outbox. Phase A lands every cross-module contract as a typed stub, plus test fakes, so seven domain workstreams build in parallel worktrees. Two screen workstreams follow, then an integration phase proves the section 1 exit criteria across real modules.

**Tech Stack:** The Foundation stack (Next.js 16.4, React 19, TypeScript 6.0, Drizzle 0.45 on postgres.js and PGlite with PostGIS, zod 4, Vitest 5, Playwright 1.64, Clerk 7, Resend, `@anthropic-ai/sdk`), plus `stripe` (stripe-node, API version pinned), `disposable-email-domains` and `mapbox-gl`. External services: Stripe Checkout, Billing Portal and webhooks; the US Census Geocoder; the National Weather Service API; Google Cloud Web Risk; RDAP.

**Spec:** `docs/superpowers/specs/2026-11-03-sp2-host-supply-billing-design.md` (the "spec" below). Its parents are `2026-11-03-explore-earn-product-design.md` and `2026-11-03-foundation-design.md`, and it uses names from `docs/superpowers/plans/2026-11-03-foundation.md`. Read the spec before your task; the plan cites spec sections rather than copying their tables.

**Code wins.** Foundation code is on branch `feat/foundation`. Where it differs from the Foundation plan, follow the code. Known differences: `createTestDb()` lives in `tests/helpers/db.ts`; raw SQL goes through `queryRows(db, sql)`; integration tests open Postgres with `createDb(url)`; `OrgRole` and `CurrentUser` come from `@/modules/identity`; `HostContext` and `OperatorContext` come from `src/server/guards.ts`; `apiRoute({ auth: 'host' })` calls `requireHost()` with no roles, so routes check roles with `requireCapability` (Task 7). Foundation phase B2 (trust, notifications, media) is being built against the Foundation plan's Task 14–21 interfaces. If its merged code names something differently, use the code's name and keep this plan's behavior.

## Global Constraints

- **Package manager and platform:** pnpm on Windows with no Docker. Unit tests run on PGlite (`pnpm test <path>`). `*.int.test.ts` files run only in CI's `integration` job against `postgis/postgis:17-3.5`; locally, run `pnpm typecheck` on them. E2E tests run on `pnpm db:local` with stub AI, media, weather, geocoder and link-safety providers; the billing rows run in Stripe **test mode** with test clocks. Stripe tests are skipped unless `STRIPE_SECRET_KEY` starts with `sk_test_`.
- **Secrets:** they live in Doppler project `explore-and-earn`, with configs `dev` (APP_ENV=dev), `stg` (preview) and `prd` (prod), synced to Vercel and GitHub Actions. Run anything that needs a real key as `doppler run --config dev -- <command>`. Never write a secret into a file or a commit.
- **Domain:** `exploreandearn.com`. Resend is verified for `send.exploreandearn.com`. The NWS contact is `Explore&Earn (support@exploreandearn.com)`.
- **Tables:** every table lives in `app`, has RLS enabled with no policies, uses a UUIDv7 `id` from `newId()` (unless the spec notes otherwise), and has `created_at`/`updated_at` with the `app.set_updated_at()` trigger. Money is integer cents with `currency text not null default 'USD'`. Enumerations are CHECK constraints.
- **Migrations:** files are `drizzle/NNNN_<module>.sql` (the migrator accepts `^\d{4}_[a-z0-9_]+\.sql$`). The ranges are W0 1000–1049, W3 1050–1099, W4 1100–1199, W5 1200–1299, W7 1300–1399, W6 1400–1499, W2 1500–1599, W1 1600–1699 and W10 1900–1999. A B1 migration may reference Foundation tables and W0's 1000 tables only, never another B1 workstream's table, because each worktree must migrate on its own.
- **Imports:** A → B means A imports B, with no cycles: `orgs` → `entitlements` · `billing` → `entitlements`, `orgs` · `verification` → `billing`, `locations`, `orgs` · `listings` → `orgs`, `locations`, `billing`, `entitlements`, `verification` · `hostpages` → `orgs`, `locations`, `billing`, `listings`. `locations` and `entitlements` import no SP2 module. Reverse flows go through domain events, never imports. Work that needs a forbidden import runs in a route handler or a `src/server/*` orchestrator, which may import any module. Foundation's rules still hold: import a module only through `@/modules/<name>`; `src/ui/**` imports no module (types included); `drizzle-orm` only inside `src/modules/**`, `src/lib/db.ts`, `src/lib/migrate.ts` and `tests/**`; no raw colors or arbitrary Tailwind values outside `src/ui/**`.
- **Ownership:** each workstream owns its module folder, its migration range, its route folders and its pages. It touches shared files only through W0's touchpoints. W0 already registers every SP2 module's `jobHandlers` import, schema re-export, schedule line and event subscriber, so B1 and B2 workstreams never edit `src/server/job-handlers.ts`, `src/server/schedules.ts`, `src/server/event-subscribers.ts`, `src/server/sp2-wiring.ts`, `src/db/schema.ts` or `package.json`.
- **Authorization:** the org always comes from the Clerk session (`HostContext.orgId`), never from input. Every listing, location, member and invitation ID is checked against it, and a cross-org ID returns 404 `not_found`. "reverify" means Clerk `has({ reverification: 'strict' })`; a failure is 403 `forbidden` with `details.reason = 'reverification_required'`.
- **Errors:** the Foundation envelope `{ error: { code, message, details?, requestId } }`, with the machine reason in `details.reason` (for example 409 `conflict` with `details.reason = 'listing_slot_limit'`). Stripe failures in checkout, change and portal return 500 `internal` with the message "Billing is temporarily unavailable. Try again in a few minutes." and change nothing.
- **AI:** `claude-haiku-5-5` through `runCheck` for checks; `claude-sonnet-5-5` through `extract` and `write` for paste-import and description drafting. Prompts treat host text as data, and zod validates every AI output. Implementers who touch `src/lib/ai.ts` or a prompt load the `claude-api` skill first.
- **Stub providers:** `BILLING_PROVIDER`, `GEOCODER_PROVIDER`, `WEATHER_PROVIDER` and `LINK_SAFETY_PROVIDER` accept `stub`, as do Foundation's. With `APP_ENV=prod`, a stub makes startup throw `Stub provider not allowed in prod: <name>`.
- **Domain events:** `emit(db, event, payload, eventId)` runs inside the caller's transaction, and the caller calls `kickWorker()` after commit. Handlers read the payload with `readEnvelope` (Task 3).
- **Registrations at module load:** usage counters, subject handlers, `defineType` calls, providers and the weather org filter are registered by files that the module's own `index.ts` imports, so importing a module runs its registrations. Because a route or job may import only one module (billing never imports listings, yet its `getCapacity(db, orgId, 'listing_slot')` needs the counter listings registers), `src/server/sp2-wiring.ts` (Task 7) imports every SP2 module for its registrations. `src/server/api.ts` and the jobs route import it, and so does every page that calls an SP2 module (Phase B2). This holds on a cold server and in a per-route Vercel function.
- **Audit `orgId`:** every SP2 `audit.record` call passes `orgId` whenever the subject belongs to an org. Foundation's `record` treats `orgId` as optional, and the team activity log (Task 19) filters on it.
- **Schedules:** cron expressions run in UTC.
- **Copy:** the name is written exactly **Explore&Earn**. No emoji in the interface. Voice is plain and warm, addressing the reader as "you". Copy never implies that every job includes housing. Strings in quotes in the spec and in this plan are exact.
- **Accessibility:** text contrast ≥ 4.5:1, UI elements and large text ≥ 3:1, touch targets ≥ 44 px, `prefers-reduced-motion` respected, real `<button>` and `<a>` elements, an `aria-label` on every icon-only control. Every list screen has an `EmptyState`, a `Skeleton` while loading, and an `ErrorState` with a retry.
- **Screens:** screen work (Phase B2) starts only after Foundation phase B3 (host shell, design gallery) is merged and the founder has approved the Foundation design gate.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **An invitee's email differs from their sign-in email only in letter case** (`maya@kettle.com` invited, `Maya@Kettle.COM` signs in). Expected: accepted, because emails compare case-insensitively. A plus-address (`maya+1@kettle.com`) is a different address and gets `email_mismatch`. Pinned in Task 18.
2. **Prohibited wording written with different spacing, case, punctuation or Unicode** (`US  citizens only` with a double or non-breaking space, `U.S. CITIZENS ONLY`, full-width `ＵＳ citizens only`). Expected: each is flagged `prohibited_wording`, because text and phrases are matched after NFKC folding, lowercasing, removing periods and collapsing whitespace. Pinned in Task 24.
3. **An Additional step URL that disguises a blocked or shortener domain** (`https://BIT.LY/x`, `https://bit.ly./x` with a trailing dot, `https://go.bit.ly/x`, an IDN such as `https://bücher.example/` when `xn--bcher-kva.example` is blocked). Expected: `link_unsafe`, because hostnames are lowercased, stripped of a trailing dot, converted to punycode by `URL`, and matched against list entries exactly or as a parent domain. Pinned in Task 24.
4. **A fixed end date next to a daylight-saving change.** Expected: the listing closes at local midnight using the offset in force at that midnight. In `America/New_York`, end 2027-03-13 closes at 2027-03-14T05:00:00Z and end 2027-11-06 closes at 2027-11-07T04:00:00Z. Pinned in Task 27.
5. **`billing.apply_launch_date` meets a founding subscription that is no longer trialing, or whose computed trial end is already past** (for example `launch.public_at` set late). Expected: that subscription is skipped with no Stripe call and no error, and the others are still corrected, so the hourly job never fails in a loop. Pinned in Task 16.

## Plan decisions

The spec leaves these choices open, or two sibling specs disagree on them. Each task applies the decision; reviewers check it here.

1. **Billing gateway.** Stripe calls go through `BillingGateway` (Task 11), following Foundation's `ClerkAdmin` pattern: the real gateway uses `getStripe()`, and `makeFakeBillingGateway()` serves unit tests. With `BILLING_PROVIDER=stub` the fake runs in "auto-complete" mode, so Checkout returns the success URL at once and the e2e rows that only need an entitled host can run without Stripe.
2. **Keep-list lifecycle.** A `billing_changes` row stays `pending` until `listings.enforce_slot_limit` (the `subscription.changed` subscriber) has enforced it and called `billing.settlePendingChange`. So the keep list survives a crash between the Stripe call and enforcement. A second change while one is pending returns 409 `change_in_progress`.
3. **Lapse and downgrade closures** happen in `listings.enforceSlotLimit`, never in billing, because billing can't import listings. That function also sends `billing.plan_changed` when it closes listings, naming them. `syncSubscription` sends `billing.plan_changed` only when nothing will close.
4. **Bans cancel Stripe outside the transaction:** `billing.sanctionOrg(db, orgId, 'ban', actor)` sets the status and enqueues `billing.cancel_subscription` (a new internal topic).
5. **New internal subscribers:** `hostpages.mark_public` on `subscription.changed` stamps `host_pages.first_public_at` the first time an org is entitled ("entitled at least once", spec 8.5). The weather refresh learns which orgs are entitled through `locations.registerWeatherOrgFilter`, which hostpages registers using `billing.getSubscriberBadges`.
6. **Foundation touchpoints beyond the spec's list**, each needed by a spec behavior: `apiRoute` accepts `PUT` (the spec's PUT routes); trust adds `listOpenReviewItems` and passes `reviewItemId` to subject handlers ("both items must be approved"; SP8 plans the same change); media adds `readMediaVariant` (the `photo_slot` check needs the 640 px bytes); `ClerkAdmin` adds `updateOrganization` (so a renamed org isn't overwritten by Clerk's next snapshot); `freeSlug` skips slugs in `org_slugs` (retired slugs are never reissued); notifications adds `sendEmailNow`, and its dev stub provider writes messages to `.data/emails/` (invitation tokens stay out of the outbox, and e2e can read the link); `api.ts` and the jobs route import `src/server/sp2-wiring.ts` (registrations on a cold server); W8 adds `year` to `JobCard`'s `PayPeriod` (listings pay by the year); W9 adds one retired-slug branch to `src/proxy.ts` (the spec's 301).
7. **Exports beyond spec section 3** are listed in each module's Interfaces. They are consumed only inside SP2, or by a route.
8. **Issue codes** for automatic checks are fixed in Task 24.
9. **Direct emails** (`sendEmailTo` and `sendEmailNow`) honor `email_suppressions` and carry no List-Unsubscribe header, because they're one-off transactional messages to people without an account. Team invitations use `sendEmailNow` from the `orgs.send_invitation` job, which creates the token and sends it in the same step. So the raw token never reaches `app.outbox`, whose finished rows Foundation keeps for dedupe, and spec section 10 ("invitation tokens are stored only as hashes") holds.
10. **Portal configurations:** `FULL` (Owner and Admin) allows payment method, invoices and cancel at period end, but not plan switching. Plan changes always go through `/host/billing/change`, so the keep-list flow can't be skipped. `BILLING` allows payment method and invoices only.
11. **Verification review items use subject `organization`** with the spec's handler table. SP8 expects a separate `business_verification` subject; that conflict is SP8's to reconcile (see Risks in the handoff). `organization` is used only for verification and fraud items. Billing review items (`unknown_price`, `duplicate_subscription`) use their own subject, `billing_account` (Task 14), because approving an `organization` item verifies the business and removing one fails it.
12. **Test fakes.** Until Phase C, B1 tests replace sibling SP2 modules with W0's fakes in `tests/fakes/sp2/` (`vi.mock('@/modules/<m>', ...)`). The spec's cross-module proof files (`billing.sync.test.ts`, `billing.change.test.ts`, `listings.slots.int.test.ts`, `billing.stripe.int.test.ts`) are written in Phase C against the real modules. B1's own unit tests use other names (`sync.test.ts`, `change.test.ts`).
13. **`mapbox-gl`** is added by SP2 (for `LocationPicker`), which answers SP3's open question.
14. **Plan grant keys carry a sequence.** Spec 8.8 keys plan grants `plan:<subId>:<kind>:<qty>`. That key repeats when a subscription goes back to a quantity it held before (Professional → Starter → Professional), and the ledger's idempotency then returns the grant that was already ended, leaving 0 slots. Task 14 keys them `plan:<subId>:<kind>:<qty>:<seq>`, where `seq` is a per-subscription counter (`subscriptions.plan_grant_seq`) that rises each time the plan grants are re-issued.
15. **Retired-slug redirects are 301.** Next.js `permanentRedirect` answers 308 and Node's `Response.redirect` rejects a relative URL. So `src/proxy.ts` sends the page's 301 (Task 41), and the API route returns `new Response(null, { status: 301, headers: { location } })` with an absolute URL (Task 32).
16. **Checkout sessions expire 31 minutes after creation** (spec 8.7 says 30). Stripe requires `expires_at` to be at least 30 minutes after the session is created, so a value of exactly now + 30 minutes arrives under the minimum once request latency counts. The founding hold lasts until the same instant.
17. **E2E entitlement.** `launch.public_at` defaults to null (pre-launch), so a stub checkout without a founding code fails with `code_required`. Every e2e test that needs an entitled host calls `entitleHost` (Task 8), which redeems a fresh founding code, instead of changing the shared launch date that tests running in parallel also read.

**Requests from sibling specs that aren't in this spec** (they stay out of SP2, and the owning sub-project's Phase A adds them): SP5 `getHiringInfoMany`, `listForOrg`, `hostpages.countFollowersAt` and ownership of the `/host` Home route; SP6 `previewSubscriptionAddon`, `setSubscriptionAddon`, `taxEnabled`, the `ee_extra_seat_*` lookup keys, routing of payment-mode Checkout events, `listApprovedOrgPhotos`; SP8 operator billing services (`refund`, `extendTrial`, `grantFreeAccount` and others), the names `suspendOrganization`/`restoreOrganization`/`closeOrganization`/`removeMember`, and `privacyHandler` plus `retentionRules` instead of this spec's `privacyHandlers`.

## File Structure

| Workstream | Creates (owns) | Modifies (touchpoints) |
|---|---|---|
| **W0** contracts | `src/lib/stripe.ts`, `src/lib/us-states.ts`, `src/lib/taxonomy.ts`, `src/lib/min-wage.ts`, `src/server/event-subscribers.ts`, `src/server/reverify.ts`, `src/server/sp2-wiring.ts`, `src/modules/jobs/events.ts`, `src/modules/{entitlements,billing,locations,listings,hostpages,verification}/{index.ts,schema.ts}`, `src/modules/orgs/roles.ts`, `src/modules/listings/{content.ts,skills.ts}`, `src/modules/hostpages/content.ts`, `src/modules/trust/prompts/{listing_moderation,listing_fraud,business_verification,photo_slot}.ts` (placeholders), `src/modules/notifications/email/templates/{HostNotice,TeamInvite,BillingNotice}.tsx`, `src/modules/notifications/email/direct.ts`, `drizzle/1000_orgs.sql`, `tests/helpers/sp2.ts`, `tests/fakes/sp2/*.ts`, `tests/e2e/helpers/sp2.ts`, `tests/sp2/registry.test.ts` | `src/lib/{env.ts,ai.ts,security-headers.ts}`, `.env.local.example`, `.gitignore`, `src/server/{api.ts,schedules.ts,job-handlers.ts,host-routing.ts}`, `src/app/api/jobs/run/route.ts` (one import line), `src/db/schema.ts`, `package.json`, `src/modules/{jobs,trust,settings,notifications,media,audit,identity,orgs}/*` as listed in Tasks 3–7 |
| **W1** entitlements | `src/modules/entitlements/*`, `drizzle/16xx`, `src/app/api/v1/host/entitlements/route.ts` | — |
| **W2** billing | `src/modules/billing/*`, `drizzle/15xx`, `scripts/{stripe-seed.ts,ops-founding-codes.ts}`, `src/app/api/v1/host/billing/**`, `src/app/api/webhooks/stripe/route.ts` | — |
| **W3** team and orgs | `src/modules/orgs/{members,scope,status,org-settings,invitations,member-admin,slugs,activity,deletion,notifications,privacy}.ts` and tests, `src/server/org-deletion.ts`, `drizzle/105x` (if needed), `src/app/api/v1/host/team/**`, `src/app/api/v1/team/**`, `src/app/api/v1/host/org/route.ts`, `src/app/api/v1/host/page/slug/route.ts` | `src/modules/orgs/{index.ts,sync.ts}` |
| **W4** locations | `src/modules/locations/*`, `drizzle/1100_locations.sql`, `drizzle/1110_destinations_seed.sql`, `src/app/api/v1/host/locations/**` | — |
| **W5** listings core | `src/modules/listings/*` except `content.ts`, `skills.ts` and `detail-view.ts`, `drizzle/1200_listings.sql`, `drizzle/1210_occupations_seed.sql`, `src/app/api/v1/host/listings/**` | — |
| **W6** verification | `src/modules/verification/*`, `drizzle/14xx`, `src/app/api/v1/host/verification/**`, the four trust prompt files (real content) | — |
| **W7** host pages | `src/modules/hostpages/*` except `content.ts`, `drizzle/13xx`, `src/app/api/v1/host/page/route.ts`, `src/app/api/v1/hosts/**`, `src/app/api/v1/me/follows/route.ts` | — |
| **W8** builder screens | `src/ui/patterns/{BuilderRail,RequiredChecklist,PhotoSlotGrid,ListingDetailView}.tsx` and tests, `src/modules/listings/detail-view.ts`, `src/app/host/listings/**`, `src/app/design-system/patterns/{builder-rail,required-checklist,photo-slot-grid,listing-detail-view}/page.tsx`, `tests/e2e/sp2-builder.spec.ts`, `tests/e2e/sp2-listings.spec.ts` | `src/modules/listings/index.ts` (one export line), `src/ui/components/JobCard.tsx` and its test (`PayPeriod` adds `year`) |
| **W9** host screens | `src/ui/patterns/{HostHeader,WeatherLine,PlanCard,LocationPicker}.tsx` and tests, `src/app/host/{team,billing,settings,host-page}/**`, `src/app/join/[token]/page.tsx`, `src/app/pricing/page.tsx`, `src/app/hosts/[slug]/page.tsx`, `src/server/host-slug-redirect.ts` and its test, gallery pages, `tests/e2e/sp2-host-screens.spec.ts` | `src/proxy.ts` (one branch: the retired-slug 301, Task 41) |
| **W10** integration | `src/modules/billing/{billing.sync.test.ts,billing.change.test.ts,billing.stripe.int.test.ts}`, `src/modules/listings/listings.slots.int.test.ts`, `tests/sp2/{cross-module,wiring}.test.ts`, `tests/e2e/{sp2-founding,sp2-hostpage,sp2-publish}.spec.ts`, `docs/runbooks/sp2-billing-setup.md`, fixes in `drizzle/19xx` | any file, for integration fixes only |

## Phases

| Phase | Tasks | Runs | Depends on |
|---|---|---|---|
| **A: Contracts and touchpoints** (W0) | 1–8 | One agent, in order | Foundation B2 merged (trust, notifications and media touchpoints edit its code) |
| **B1: Domain workstreams** | W1: 9–10 · W2: 11–16 · W3: 17–19 · W4: 20–21 · W5: 22–28 · W6: 29–30 · W7: 31–33 | Seven worktrees in parallel; tasks within a workstream run in order | Phase A |
| **B2: Screens** | W8: 34–36 · W9: 37–41 | Two worktrees in parallel | B1 merged; Foundation B3 merged and design gate approved |
| **C: Integration** (W10) | 42–44 | One agent | Everything above |

---

## Phase A: Contracts and touchpoints (W0, one agent, sequential)

### Task 1 (W0): Environment, Stripe client, CSP, dependencies and PUT routes

**Files:**
- Create: `src/lib/stripe.ts`, `src/lib/stripe.test.ts`
- Modify: `src/lib/env.ts`, `src/lib/env.test.ts`, `.env.local.example`, `src/lib/security-headers.ts`, `src/lib/security-headers.test.ts`, `src/server/api.ts` (`HttpMethod`), `src/server/openapi.ts` (only if it enumerates methods), `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces:
  - `Env` keys: `BILLING_PROVIDER: 'stripe'|'stub'`; `STRIPE_SECRET_KEY?` (`^sk_(test|live)_`); `STRIPE_WEBHOOK_SECRET?` (`^whsec_`); `STRIPE_PORTAL_CONFIG_FULL?` and `STRIPE_PORTAL_CONFIG_BILLING?` (`^bpc_`); `GEOCODER_PROVIDER: 'census'|'stub'`; `WEATHER_PROVIDER: 'nws'|'stub'`; `NWS_USER_AGENT?`; `LINK_SAFETY_PROVIDER: 'webrisk'|'stub'`; `WEB_RISK_API_KEY?`; `NEXT_PUBLIC_MAPBOX_TOKEN?` (`^pk\.`)
  - `getStripe(): Stripe` (cached), `STRIPE_API_VERSION` (the literal the installed SDK declares as its latest version)
  - `HttpMethod = 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'`
  - `package.json` dependencies `stripe`, `disposable-email-domains`, `mapbox-gl` (exact versions, at least two weeks old); scripts `"stripe:seed": "tsx scripts/stripe-seed.ts"` and `"ops:founding-codes": "tsx scripts/ops-founding-codes.ts"` (W2 writes the scripts)

- [ ] **Step 1: Write the failing tests.**
  - With `APP_ENV: 'prod'`, each of `BILLING_PROVIDER`, `GEOCODER_PROVIDER`, `WEATHER_PROVIDER` and `LINK_SAFETY_PROVIDER` set to `stub` throws `Stub provider not allowed in prod: <name>`.
  - `BILLING_PROVIDER: 'stripe'` without `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIG_FULL` or `STRIPE_PORTAL_CONFIG_BILLING` throws, naming the missing key.
  - `STRIPE_SECRET_KEY: 'sk_live_x'` with `APP_ENV: 'dev'` or `'preview'` throws `STRIPE_SECRET_KEY must be a test key outside prod`.
  - `WEATHER_PROVIDER: 'nws'` without `NWS_USER_AGENT` throws; `LINK_SAFETY_PROVIDER: 'webrisk'` without `WEB_RISK_API_KEY` throws.
  - `APP_ENV: 'preview'` without `NEXT_PUBLIC_MAPBOX_TOKEN` throws; `APP_ENV: 'dev'` without it parses.
  - `.env.local.example` parses, with the four new providers set to `stub`.
  - The CSP's `connect-src` contains `https://api.mapbox.com` and `https://events.mapbox.com`, and `worker-src` contains `blob:`.
  - `getStripe()` with `BILLING_PROVIDER=stub` throws `Stripe is not configured (BILLING_PROVIDER=stub)`; with `stripe` and a test key it returns the same instance on two calls.
- [ ] **Step 2:** Run `pnpm test src/lib/env.test.ts src/lib/security-headers.test.ts src/lib/stripe.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - **Install:** `pnpm add stripe disposable-email-domains mapbox-gl`, then pin the exact versions.
  - **Stripe client:** `new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, appInfo: { name: 'Explore&Earn' } })`. Look up the SDK's version literal with Context7.
  - **Example file:** `.env.local.example` lists every new key. Dev values: providers `stub`, and `NWS_USER_AGENT=Explore&Earn (support@exploreandearn.com)`.
- [ ] **Step 4:** Run the same tests. Expected: PASS. Then run `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp2): env keys, Stripe client, Mapbox CSP, PUT routes and dependencies`.

### Task 2 (W0): AI extract and write

**Files:**
- Modify: `src/lib/ai.ts`, `src/lib/ai.test.ts`

**Interfaces:**
- Consumes: Foundation's `classify` and its provider switch (`AI_PROVIDER`)
- Produces:
  - `extract<T>(o: { model: 'claude-sonnet-5-5'; system: string; text: string; schema: z.ZodType<T>; promptVersion: string; timeoutMs?: number }): Promise<T>` (default timeout 60,000 ms)
  - `write(o: { model: 'claude-sonnet-5-5'; system: string; prompt: string; maxChars: number; timeoutMs?: number }): Promise<string>`
  - `class AiError extends Error { kind: 'timeout'|'refusal'|'schema'|'provider' }` (reuse Foundation's error type if `classify` already has one)
  - **Stub behavior:**
    - `extract`: text containing `__fail__` throws `AiError('provider')`. A line `STUB_JSON: {...}` is parsed and validated by `schema`; a ZodError becomes `AiError('schema')`. Any other text returns `schema.parse({})`.
    - `write`: a prompt containing `__fail__` throws; otherwise it returns `Stub draft: <prompt>`, cut to `maxChars`.

- [ ] **Step 1: Write the failing tests.**
  - Stub `extract` with `STUB_JSON: {"basics":{"title":"Deckhand"}}` and a matching schema returns `{ basics: { title: 'Deckhand' } }`. `__fail__` rejects with `kind: 'provider'`. Invalid stub JSON for the schema rejects with `kind: 'schema'`.
  - Stub `write` with `maxChars: 10` returns at most 10 characters.
  - The real provider path, with `@anthropic-ai/sdk` mocked: the request uses model `claude-sonnet-5-5`, and the host text is sent inside `<host_text>…</host_text>` in the user turn. A structured result that fails the schema rejects with `kind: 'schema'`.
- [ ] **Step 2:** Run `pnpm test src/lib/ai.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with Anthropic structured output, using a JSON schema from `z.toJSONSchema(schema)` (load the `claude-api` skill). `write` trims its output and cuts it at the last word boundary before `maxChars`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ai): Sonnet extract and write with stubs`.

### Task 3 (W0): Domain events

**Files:**
- Create: `src/server/event-subscribers.ts`, `src/modules/jobs/events.ts`, `src/modules/jobs/events.test.ts`
- Modify: `src/modules/jobs/index.ts`

**Interfaces:**
- Produces:
  - **The payload map** in `src/server/event-subscribers.ts`: `export interface EventPayloads`, with one entry per event in spec section 3. The payloads are exactly the spec's, with string unions inlined:

    ```ts
    'listing.published': { listingId: string; revisionId: string; orgId: string; first: boolean };
    'listing.changed': { listingId: string; revisionId: string; orgId: string };
    'listing.closed': { listingId: string; orgId: string; revisionId?: string; reason: 'host'|'end_date'|'downgrade'|'lapsed'|'org_suspended' };
    'listing.removed': { listingId: string; orgId: string; reason?: string };
    'org.status_changed': { orgId: string; status: 'active'|'suspended'|'banned' };
    'org.member_removed': { orgId: string; userId: string; reassignToUserId: string };
    'location.updated': { locationId: string; orgId: string };
    'hostpage.updated': { orgId: string };
    'subscription.changed': { orgId: string; status: string; plan: 'starter'|'professional'|'enterprise'|null };
    'verification.decided': { orgId: string; status: 'unverified'|'running'|'verified'|'needs_review'|'needs_info'|'failed' };
    'billing.stripe_event': { eventId: string; type: string; objectId: string | null };
    ```
  - **The subscriber map**, `export const eventSubscribers: Record<keyof EventPayloads, string[]>`:
    - `listing.published` → `['hostpages.notify_followers']`
    - `org.status_changed` → `['listings.close_for_org']`
    - `location.updated` → `['locations.resolve_nws_grid']`
    - `subscription.changed` → `['listings.enforce_slot_limit', 'hostpages.mark_public']`
    - `verification.decided` → `['listings.resume_screening']`
    - every other event → `[]`
  - `type EventEnvelope<E extends keyof EventPayloads> = { event: E; eventId: string; data: EventPayloads[E] }`
  - `emit<E extends keyof EventPayloads>(db: DbOrTx, event: E, payload: EventPayloads[E], eventId: string, subscribers?: Record<string, string[]>): Promise<void>`: one `enqueue` per topic, with payload `EventEnvelope` and dedupe key `<eventId>:<topic>`. Emitters use `newId()` as the event ID unless a task says otherwise.
  - `readEnvelope<E extends keyof EventPayloads>(payload: unknown, event: E): EventEnvelope<E>`: throws `Error('Expected event <E>')` on a mismatch

- [ ] **Step 1: Write the failing tests.**
  - With subscribers `{ 'x.happened': ['a.one', 'a.two'] }`, `emit(db, 'x.happened', { n: 1 }, 'e1', map)` creates two outbox rows with dedupe keys `e1:a.one` and `e1:a.two`, and payload `{ event: 'x.happened', eventId: 'e1', data: { n: 1 } }`.
  - Emitting `e1` again adds no rows.
  - An event with `[]` subscribers writes nothing.
  - `emit` inside a transaction that rolls back leaves no rows.
  - `readEnvelope` of a `listing.closed` envelope as `'listing.published'` throws.
- [ ] **Step 2:** Run `pnpm test src/modules/jobs/events.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement, and export `emit`, `readEnvelope` and `EventEnvelope` from `@/modules/jobs`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(jobs): domain events fanned out through the outbox`.

### Task 4 (W0): Trust touchpoints

**Files:**
- Create: `src/modules/trust/prompts/{listing_moderation,listing_fraud,business_verification,photo_slot}.ts` (placeholder prompts at version `<kind>@0`; W6 writes the real ones)
- Modify: `src/modules/trust/index.ts`, the checks, actions and alerts files Foundation B2 created (`checks.ts`, `actions.ts`, `alerts.ts` in the Foundation plan) and their tests

**Interfaces:**
- Produces:
  - `RunCheckInput.kind: 'image_safety'|'text_safety'|'listing_moderation'|'listing_fraud'|'business_verification'|'photo_slot'`
  - `RunCheckInput.reviewQueue?: Queue | null`: the default is `'moderation'`; `null` opens no item on `needs_review`
  - `raiseAlert` exported from `@/modules/trust`
  - `listOpenReviewItems(db: DbOrTx, subjectType: string, subjectId: string): Promise<{ id: string; queue: Queue; reason: string }[]>` (status `open`, `assigned` or `escalated`)
  - Subject handlers receive `data = { ...decideData, reviewItemId }`
  - Each new kind reads its own thresholds from `trust.thresholds[kind]` (Task 5 adds them)

- [ ] **Step 1: Write the failing tests.**
  - `runCheck({ kind: 'listing_moderation', text: '__flag__' })` → `needs_review` and one `moderation` item.
  - The same call with `reviewQueue: 'fraud'` puts the item in `fraud`; with `reviewQueue: null` it returns `needs_review` and creates no item.
  - `listing_fraud` with `'__block__'` (score 0.95) → `rejected`. `business_verification` with `'__block__'` → `needs_review`, because it never rejects below 1.01.
  - A `business_verification` call whose classifier throws → `needs_review`, reason `classifier_error`, and an item in the `reviewQueue` given.
  - `listOpenReviewItems` returns open, assigned and escalated items for the subject, and omits resolved ones.
  - `decide(db, itemId, op, 'approve')` calls the registered handler with `data.reviewItemId === itemId`.
- [ ] **Step 2:** Run the trust tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Each placeholder prompt exports `{ version: '<kind>@0', system }` with a one-line system prompt; they share the Foundation output schema (`score`, `labels`, `reason`).
- [ ] **Step 4:** Run the trust tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(trust): SP2 check kinds, optional review queue, open-item lookup`.

### Task 5 (W0): Settings, taxonomy and US states

**Files:**
- Create: `src/lib/us-states.ts`, `src/lib/taxonomy.ts`, `src/lib/min-wage.ts`, `src/lib/taxonomy.test.ts`
- Modify: `src/modules/settings/registry.ts`, `src/modules/settings/settings.test.ts`

**Interfaces:**
- Produces:
  - **US states:** `US_STATE_CODES` (the 50 states plus DC, PR, VI, GU, AS and MP; 56 codes), `type USStateCode`, and `STATE_DEFAULT_TIMEZONE: Record<USStateCode, string>`. Multi-zone states use their most populous zone, for example `AK: 'America/Anchorage'`, `TX: 'America/Chicago'`, `IN: 'America/Indiana/Indianapolis'`; `GU: 'Pacific/Guam'`, `AS: 'Pacific/Pago_Pago'`, `MP: 'Pacific/Saipan'`, `VI: 'America/St_Thomas'`, `PR: 'America/Puerto_Rico'`.
  - **Taxonomy:**
    - `CATEGORIES = ['maritime','seasonal','farm','remote'] as const`, `type Category`
    - `GENRES: readonly { code: string; label: string; category: Category }[]`: the product spec section 3 genres with snake_case codes (`commercial_fishing` "Commercial fishing" … `teaching` "Teaching"); 25 entries
    - `PERKS: readonly { code: string; label: string }[]`: `ski_pass`, `park_pass`, `employee_discounts`, `shuttle`, `laundry`, `wifi`, `gym`, `end_of_season_bonus`, `travel_reimbursement`, `relocation_help`, `health_insurance`, `paid_time_off`, `retirement_plan`, `equipment_provided`, `uniform_provided`, `training_provided`
  - **Minimum wage:** `MIN_WAGE_CENTS_2026: Record<USStateCode, number>`, the US DOL state minimum wage table as of 2026-01-01, with 725 wherever no higher state rate applies; and `FEDERAL_MIN_WAGE_CENTS = 725`
  - **Settings keys:** each is added to `SettingValues`, `SETTING_DEFAULTS` and `SETTING_SCHEMAS`:

    | Key | Type and default | Validation |
    |---|---|---|
    | `launch.public_at` | `string \| null` = `null` | ISO instant or null |
    | `founding.max_hosts` | `100` | int 0–1000 |
    | `founding.free_days` | `90` | int 1–365 |
    | `founding.return_window_months` | `6` | int 0–24 |
    | `team.invitation_ttl_days` | `7` | int 1–30 |
    | `listings.prohibited_phrases` | the six spec 8.2 phrases, in order | 1–200 items of 2–100 chars |
    | `listings.vague_pay_range_ratio` | `2.5` | 1–10 |
    | `listings.min_wage_cents_by_state` | `MIN_WAGE_CENTS_2026` | every key in `US_STATE_CODES`, int ≥ 0 |
    | `listings.genres` | `GENRES` with `active: true` | unique codes `^[a-z0-9_]+$` |
    | `links.blocked_domains`, `verification.blocked_domains` | `[]` | lowercase hostnames |
    | `links.shortener_domains` | `bit.ly`, `tinyurl.com`, `t.co`, `goo.gl`, `ow.ly`, `is.gd`, `buff.ly`, `rebrand.ly`, `cutt.ly`, `shorturl.at`, `tiny.cc`, `rb.gy`, `lnkd.in`, `s.id`, `t.ly` | lowercase hostnames |
    | `trust.thresholds` | adds `listing_moderation {0.2, 0.9}`, `listing_fraud {0.2, 0.95}`, `business_verification {0.3, 1.01}`, `photo_slot {0.5, 0.5}` | `rejectAtOrAbove` may be up to 1.01 |

- [ ] **Step 1: Write the failing tests.**
  - `US_STATE_CODES.length === 56`, and every value in `STATE_DEFAULT_TIMEZONE` is accepted by `new Intl.DateTimeFormat('en-US', { timeZone })`.
  - `GENRES` has 6 Maritime, 6 Seasonal, 6 Farm and 7 Remote entries, with labels exactly as in product section 3.
  - `getSetting(db, 'founding.max_hosts')` → `100`, and `'listings.prohibited_phrases'` → `['US citizens only', 'U.S. citizens only', 'citizens only', 'American citizens only', 'no foreigners', 'native English speaker']`.
  - `trust.thresholds.business_verification` → `{ approveBelow: 0.3, rejectAtOrAbove: 1.01 }`. Setting `rejectAtOrAbove: 1.02` → `bad_request`.
  - `launch.public_at` accepts `'2027-01-15T00:00:00.000Z'` and rejects `'soon'`.
- [ ] **Step 2:** Run `pnpm test src/lib/taxonomy.test.ts src/modules/settings`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(settings): SP2 settings keys, taxonomy, states and minimum wages`.

### Task 6 (W0): Notifications, media, audit and identity touchpoints

**Files:**
- Create: `src/modules/notifications/email/templates/{HostNotice,TeamInvite,BillingNotice}.tsx`, `src/modules/notifications/email/direct.ts`, `src/modules/notifications/email/direct.test.ts`
- Modify:
  - `src/modules/notifications/index.ts` and its `types.ts`, and the stub `EmailProvider` (the one that collects `stubOutbox`) with its test
  - `.gitignore` (adds `.data/`)
  - `src/modules/media/index.ts`, plus a media test
  - `src/modules/audit/search.ts`, `src/modules/audit/audit.test.ts`
  - `src/modules/identity/clerk-admin.ts`, `src/modules/identity/index.ts`
  - `src/server/host-routing.ts`, `src/server/host-routing.test.ts`

**Interfaces:**
- Produces:
  - `EmailTemplateName` adds `'HostNotice'|'TeamInvite'|'BillingNotice'`, with these props:
    - HostNotice and BillingNotice: `{ heading: string; lines: string[]; button: { label: string; href: string } }`. The email job maps a notification's title, body (split on `\n`) and `data.href` into them, the same way Foundation's templates are fed.
    - TeamInvite: `{ orgName: string; inviterName: string; role: string; acceptUrl: string; expiresAt: string }`, subject `Join <orgName> on Explore&Earn`.
  - `sendEmailTo(db: DbOrTx, i: { to: string; template: EmailTemplateName; data: Record<string, unknown>; category: Category; dedupeKey?: string }): Promise<void>`: skips suppressed addresses and enqueues `notifications.email_direct`. That handler renders and sends with no List-Unsubscribe header (Plan decision 9). The payload stays in `app.outbox` after sending, so `data` must never hold a secret.
  - `sendEmailNow(db: DbOrTx, i: { to: string; template: EmailTemplateName; data: Record<string, unknown>; category: Category }): Promise<'sent'|'suppressed'>`: renders and sends at once through the email provider, with no List-Unsubscribe header, and stores nothing (no outbox row, no notification row, and `data` is never logged). It is meant to be called from a job handler; a provider failure throws so the job retries. Team invitations use it (Task 18).
  - **Stub email messages on disk:** with `EMAIL_PROVIDER=stub` and `APP_ENV=dev`, outside Vitest (`process.env.VITEST` unset), the stub provider also writes each message to `<dir>/<id>.json` as `{ to, subject, html, text, sentAt }`. `dir` is a stub constructor option that defaults to `.data/emails`. The e2e tests read invitation links from there (Task 8), because `stubOutbox` lives in the dev server's memory.
  - `getMediaInfo(db: DbOrTx, ids: string[]): Promise<Map<string, { ownerOrgId: string | null; kind: MediaKind; status: MediaStatus; altText: string | null; width: number | null; height: number | null }>>`
  - `readMediaVariant(db: DbOrTx, storage: Storage, mediaId: string, width: 320|640|1280): Promise<{ mime: string; bytes: Uint8Array } | null>`: null unless the media is approved and the variant exists
  - `searchAudit` filters `orgId?: string` and `actionPrefixes?: string[]`, matched with `starts_with(action, p)` and OR'd together
  - `ClerkAdmin` adds `addMembership(clerkOrgId: string, clerkUserId: string, clerkRole: 'org:admin'|'org:recruiter'|'org:billing')`, `removeMembership(clerkOrgId, clerkUserId)`, `updateMembershipRole(clerkOrgId, clerkUserId, clerkRole)`, `deleteOrganization(clerkOrgId)` and `updateOrganization(clerkOrgId, { name: string })`. The fake records each call and supports `failNext`.
  - `ONBOARDING_EXEMPT` includes `join`

- [ ] **Step 1: Write the failing tests.**
  - `sendEmailNow` with `TeamInvite` puts one message in the stub outbox at once and writes no `app.outbox` or notification row. Its subject is `Join Kettle Ridge Lodge on Explore&Earn`, its HTML contains the accept URL, and it has no List-Unsubscribe header. A suppressed address returns `'suppressed'` and sends nothing.
  - `sendEmailTo` with `HostNotice` plus a worker run puts one message in the stub outbox. A suppressed address produces no job.
  - The stub provider writes no file under Vitest. With `VITEST` unset and `APP_ENV=dev`, a send writes one `<dir>/<id>.json` holding `to` and `subject` (the test passes a temp folder as `dir`).
  - `getMediaInfo` returns owner, kind and status for two seeded media rows, and omits unknown IDs.
  - `readMediaVariant` returns null for a media row that is still `scanning`.
  - `searchAudit({ orgId, actionPrefixes: ['orgs.', 'billing.plan_changed'] })` returns `orgs.updated` and `billing.plan_changed` for that org only, not `billing.checkout_started` or another org's events.
  - The fake ClerkAdmin records `addMembership('org_1', 'user_1', 'org:recruiter')`.
  - `shouldRedirectToOnboarding({ pathname: '/join/abc', signedIn: true, state: 'needed', isAdminHost: false })` → `false`.
- [ ] **Step 2:** Run the touched tests. Expected: FAIL.
- [ ] **Step 3:** Implement. The real ClerkAdmin uses `organizations.createOrganizationMembership`, `deleteOrganizationMembership`, `updateOrganizationMembership`, `deleteOrganization` and `updateOrganization`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(foundation): SP2 touchpoints in notifications, media, audit, identity and routing`.

### Task 7 (W0): Orgs migration, module skeletons, registries and the role matrix

**Files:**
- Create:
  - `drizzle/1000_orgs.sql`
  - `src/modules/orgs/roles.ts`, `src/modules/orgs/roles.test.ts`
  - `src/modules/{entitlements,billing,locations,listings,hostpages,verification}/{index.ts,schema.ts}`
  - `src/server/reverify.ts`, `src/server/sp2-wiring.ts`
  - `tests/sp2/registry.test.ts`, `tests/sp2/orgs-migration.test.ts`
- Modify: `src/modules/orgs/{schema.ts,index.ts,sync.ts}`, `src/db/schema.ts`, `src/server/job-handlers.ts`, `src/server/schedules.ts`, `src/server/api.ts` and `src/app/api/jobs/run/route.ts` (each imports `@/server/sp2-wiring`)

**Interfaces:**
- Produces:
  - **`1000_orgs.sql`:** exactly the spec section 4 rows for `organizations` (alter), `org_memberships` (alter), `member_assignments`, `org_invitations` and `org_slugs`. In addition:
    - a backfill of `org_slugs` from the existing organizations
    - trigger `app.org_slugs_track()`, after insert or update of `slug` on `app.organizations`, which inserts the new slug and sets `retired_at = now()` on the old one. The insert is `on conflict (slug) do update set retired_at = null where app.org_slugs.org_id = excluded.org_id`, so an org reclaiming its own retired slug makes it current again; a conflict with another org's slug changes nothing.
    - **Retired** always means the slug differs from the org's current `organizations.slug`. `retired_at` records when it stopped being current and is never read to decide a redirect.
  - **`freeSlug` in `orgs/sync.ts`** also treats every slug in `app.org_slugs` as taken.
  - **Module skeletons:** every spec section 3 signature, plus each module's additions below, exported as typed stubs that throw `new Error('not implemented: <name> (W<n>)')`.
    - Registration functions (`registerUsageCounter`, `registerListingStatsProvider`, `registerListingRowBadgeProvider`, `registerHostPageProvider`, `registerWeatherOrgFilter`) store into module-level maps for real.
    - Each module exports `jobHandlers` with a no-op handler for every topic it owns (spec section 6, plus `billing.cancel_subscription`, `hostpages.mark_public` and `orgs.send_invitation`), and `privacyHandlers: { export(db, userId): Promise<Record<string, unknown>>; erase(db, userId): Promise<void> }`.
  - **Additions per module:**

    | Module | Additions |
    |---|---|
    | entitlements | `lockOrg(tx: Tx, orgId: string): Promise<void>`, `listOpenGrants(db, orgId, i: { source?: GrantSource; kind?: EntitlementKind }, now?): Promise<{ id: string; kind: EntitlementKind; quantity: number; sourceRef: string; validUntil: Date \| null }[]>` |
    | billing | `settlePendingChange(db, orgId)`, `sanctionOrg(db, orgId, action: 'suspend'\|'ban', actor: Actor)`, `cancelSubscriptionNow(db, orgId, gw?)`, `getCardChecks(db, orgId): Promise<{ hasCard: boolean; cvcCheck: string \| null; postalCheck: string \| null }>` |
    | orgs | `requireCapability(ctx, cap): void`, `getMember(db, orgId, userId): Promise<Member \| null>`, `getOrgSummaries(db, ids): Promise<Map<string, OrgSummary>>`, `setOrgStatus(db, orgId, status, actor, reason?)`, `setVerificationStatus(db, orgId, status, at?)`, `assignListing(db, orgId, userId, listingId)`, `resolveSlug(db, slug): Promise<{ orgId: string; currentSlug: string; retired: boolean } \| null>` |
    | locations | `registerWeatherOrgFilter(fn: (db: DbOrTx, orgIds: string[]) => Promise<string[]>)`; `Location` adds `publicAddressLine1: string \| null` (set only for `exact` precision) |
    | listings | `countActiveByLocation(db, locationIds): Promise<Map<string, number>>`, `getOrgListingStats(db, orgIds): Promise<Map<string, { active: number }>>`, `getOrgListingFacts(db, orgId): Promise<{ active: PublishedListing[]; history: { firstPublishedAt: Date; primaryCategory: Category }[] }>`, `closeAllForOrg(db, orgId, reason: 'org_suspended'\|'host')`, `enforceSlotLimit(db, orgId)` |
    | verification | `requestReverification(db, orgId)`, `openVerificationAppeal(db, orgId, note)` |

  - **Types:**
    - `OrgSummary = { id; clerkOrgId; name; slug; status: 'active'|'suspended'|'banned'; deleted: boolean; websiteUrl: string | null; requireRecruiterApproval: boolean; primaryLocationId: string | null; verificationStatus: <the VerificationStatus union>; ownerUserId: string | null; createdAt: Date }`
    - `Actor` (spec section 3) is defined in entitlements and re-exported by billing and orgs.
  - **The role matrix, implemented for real here** (pure, and needed by every route): `HostCapability`, `RecruiterScope`, `Member`, `can(ctx, cap)` per spec section 10, and `requireCapability`, which throws `forbidden('Your role in this organization does not allow this', { reason: 'role_not_allowed' })`.

    | Capability | Owner | Admin | Recruiter | Billing |
    |---|---|---|---|---|
    | `listings.manage`, `applicants.access`, `messages.access`, `invites.send` | ✓ | ✓ | ✓ | — |
    | `listings.approve`, `hostpage.edit`, `locations.manage`, `team.manage`, `activity.read`, `billing.plan` | ✓ | ✓ | — | — |
    | `org.transfer`, `org.delete` | ✓ | — | — | — |
    | `billing.portal` | ✓ | ✓ | — | ✓ |

  - `requireReverification(): Promise<void>` in `src/server/reverify.ts`: throws `forbidden('Confirm it is you to continue', { reason: 'reverification_required', reverification: 'strict' })` unless `(await auth()).has({ reverification: 'strict' })`
  - **Registries:**
    - `src/server/sp2-wiring.ts` holds only side-effect imports of the seven SP2 modules (`orgs`, `entitlements`, `billing`, `locations`, `listings`, `hostpages`, `verification`), with a comment that it exists for their module-load registrations (Global Constraints). `src/server/api.ts` and `src/app/api/jobs/run/route.ts` import it. No module imports it.
    - `src/db/schema.ts` re-exports the six new schema files.
    - `job-handlers.ts` merges the six new `jobHandlers` maps.
    - `schedules.ts` appends the seven SP2 schedules from spec section 6: `listings.still_hiring_sweep` `0 * * * *`, `listings.auto_close` `5 * * * *`, `listings.repost_reminders` `0 15 * * *`, `locations.refresh_weather` `*/30 * * * *`, `billing.grant_monthly_credits` `10 0 * * *`, `billing.apply_launch_date` `20 * * * *`, `billing.reconcile` `0 7 * * *`.

- [ ] **Step 1: Write the failing tests.**
  - **Migration** (`tests/sp2/orgs-migration.test.ts`):
    - After migrating, inserting an organization with `website_url = 'http://x.com'` violates its check.
    - A new organization's slug appears in `app.org_slugs`.
    - Renaming the slug sets `retired_at` on the old row and inserts the new one.
    - Renaming it back to the old slug sets that row's `retired_at` to null and retires the other one.
    - After org A's slug `kettle-ridge-lodge` is retired, Foundation's `createOrganization` for the name "Kettle Ridge Lodge" gets `kettle-ridge-lodge-2`.
    - `member_assignments` with both `listing_id` and `location_id` set violates `num_nonnulls`.
  - **Roles** (`roles.test.ts`): `can` returns exactly the matrix above for all 13 capabilities × 4 roles (52 assertions, table-driven). `requireCapability({ role: 'billing' }, 'listings.manage')` throws `forbidden` with `details.reason === 'role_not_allowed'`.
  - **Registry** (`tests/sp2/registry.test.ts`): every topic in `schedules` and in every `eventSubscribers` list has a handler in `handlers`; every SP2 topic is prefixed by its owning module's name; `handlers` builds without a duplicate-topic error. The source of `src/server/sp2-wiring.ts` imports each of the seven SP2 modules, and the sources of `src/server/api.ts` and the jobs route import `@/server/sp2-wiring`. (The behavior is proven in Task 42.)
- [ ] **Step 2:** Run `pnpm test tests/sp2 src/modules/orgs/roles.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. The Drizzle tables for the 1000 migration go in `src/modules/orgs/schema.ts`.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp2): orgs migration, module contracts as stubs, registries and role matrix`.

### Task 8 (W0): Content schemas, skills, test helpers and fakes

**Files:**
- Create:
  - `src/modules/listings/content.ts`, `src/modules/listings/content.test.ts`, `src/modules/listings/skills.ts`
  - `src/modules/hostpages/content.ts`, `src/modules/hostpages/content.test.ts`
  - `tests/helpers/sp2.ts`
  - `tests/fakes/sp2/{entitlements,billing,orgs,locations,verification,listings,hostpages}.ts`, `tests/fakes/sp2/fakes.test.ts`
  - `tests/e2e/helpers/sp2.ts` (first used by the Phase B2 e2e tests)
- Modify: `src/modules/listings/index.ts` (re-exports `ListingContentSchema`, `ListingDraftSchema`, the content types, `normalizeSkill`, and `GENRES`, `PERKS` and `Category` from `@/lib/taxonomy`), `src/modules/hostpages/index.ts` (re-exports `HostPageContentSchema` and `HostPageContent`)

**Interfaces:**
- Produces:
  - **`ListingContentSchema`** (zod, schema version 1): exactly the spec section 3 `ListingContent` type, with the spec 8.2 field limits (title 5–80; description 50–10,000; responsibilities ≤ 20; each qualification type ≤ 15; skills ≤ 30; certifications ≤ 15; each list item ≤ 200; typical day ≤ 2,000; pop-up notes ≤ 80; fine print ≤ 1,000; openings 1–999; weekly hours 1–120; minimum age 18–99, default 18). Additional rules:
    - Housing photos need all 4 keys, and meal photos all 4 keys.
    - Gallery ≤ 8 photos; screening ≤ 10 questions; multiple choice has 2–10 choices; a prompt is ≤ 200 characters.
    - A question `id` matches `^[A-Za-z0-9_-]{1,40}$`.
    - `pay.minCents` is an int ≥ 0 (a check catches 0).
    - `kind: 'fixed'` requires `maxCents === minCents`; `maxCents >= minCents` always.
    - `genreDetails.category === basics.primaryCategory`.
    - `when.dates.end >= start`; dates are real `YYYY-MM-DD` dates.
    - Remote `states` ⊆ `US_STATE_CODES`, and non-empty when `scope = 'states'`.
    - `perks` ⊆ `PERKS` codes; `genre` matches `^[a-z0-9_]+$` (Task 24 checks it against the settings list).
    - Strings are trimmed, and control characters other than `\n` and `\t` are rejected.
  - **`ListingDraftSchema`:** every section optional; each section's object partial, and its nested unions accept their partial members. It validates types only, not completeness.
  - **Types:** `ListingContent`, `ListingDraft`, `ScreeningQuestion`, `Cost`, `HousingSlot = 'bedroom'|'bathroom'|'kitchen'|'exterior'`, `MealSlot = 'kitchen'|'meal_example'|'dining_area'|'other'`.
  - `BuilderSection = 'basics'|'where_when'|'pay'|'housing'|'meals'|'genre_details'|'job'|'photos'|'applying'`, with `SECTION_CONTENT_KEYS: Record<BuilderSection, (keyof ListingContent)[]>` (`where_when` → `['where','when']`, `genre_details` → `['genreDetails']`, the others map to their own key)
  - `normalizeSkill(label): { key: string; label: string }`: NFKC, trim, collapse whitespace for `label`; `key` = lowercase, `&` → `and`, every run of non-`[a-z0-9+#]` characters → `-`, trimmed of `-`
  - `HostPageContentSchema` and `type HostPageContent`: exactly the spec section 4 shape. Social URLs are https; captions ≤ 140.
  - **`tests/helpers/sp2.ts`:**
    - `seedHostOrg(db, o?: { name?: string; ownerEmail?: string; status?: 'active'|'suspended'|'banned' }): Promise<SeededOrg>`, where `SeededOrg = { orgId: string; clerkOrgId: string; owner: SeededMember }` and `SeededMember = { userId: string; clerkUserId: string; membershipId: string; email: string; ctx: HostContext }`
    - `seedMember(db, orgId, role: OrgRole, o?: { email?: string; scope?: 'all'|'assigned' }): Promise<SeededMember>`
    - `seedSeeker(db, o?: { email?: string }): Promise<{ userId: string; user: CurrentUser }>`
    - `seedMedia(db, orgId, kind: MediaKind, status?: MediaStatus): Promise<string>` (default `approved`)
    - `buildListingContent(i: { locationId: string; coverMediaId: string; housingPhotos: Record<HousingSlot, string> }, edit?: (c: ListingContent) => void): ListingContent`: a complete Seasonal listing. Title "Lift Operator", genre `ski_resorts`, occupation `lift_operator`, pay range 1900–2200 per hour, fixed dates 2027-06-01 to 2027-08-31, 40 weekly hours, housing `shared_room` costing `{ free: false, cents: 15000, period: 'week', paidBy: 'deducted' }`, meals not provided, minimum age 18.
    - `FIXED_NOW = new Date('2026-11-03T17:00:00Z')`
  - **Fakes**, one per SP2 module. Each is typed `satisfies Partial<typeof import('@/modules/<m>')>` and used as `vi.mock('@/modules/<m>', async (orig) => ({ ...(await orig()), ...(await import('<path>')).<m>Fake }))`:
    - `entitlementsFake`: an in-memory ledger with the real semantics. `grant` honors `idempotencyKey` exactly as Task 9 does (the same key returns `created: false` and the original `grantId`, even after that grant ended); `endGrant` sets `validUntil`; `listOpenGrants` filters by source and kind; `consume` and `reverse` move a per-grant balance; `getBalance` returns `{ balance, resetsAt }` by the Task 9 rules. `getCapacity`'s `limit` is the `setLimit(orgId, kind, n)` value when set, else the sum of valid fake grants of that kind once the org has ever been granted that kind (ended grants count as granted), else the default (`listing_slot` 10, `seat` 5). `used` comes from the registered counter when one exists, otherwise from state. `withCapacity` throws the real `conflict` shape. `lockOrg` is a no-op, and every call is recorded.
    - `billingFake`: `setState(orgId, partial)` over a default entitled Professional monthly state (`hostSince` `2026-11-03`). `getSubscriptionState` returns that state, and `getSubscriberBadges(db, orgIds)` derives from it: the entitled orgs among `orgIds`, mapped to `{ hostSince }`. It records calls to `sanctionOrg`, `cancelSubscriptionNow` and `settlePendingChange`, has a settable keep list, and returns `getCardChecks` → `{ hasCard: true, cvcCheck: 'pass', postalCheck: 'pass' }`.
    - `orgsFake`: SQL-backed `listMembers`, `getMember`, `getOrgStatus`, `getOrgSummaries`, `setOrgStatus` and `setVerificationStatus` over the Foundation and 1000 tables. Also SQL-backed, with the Task 17 and 19 rules:
      - `assignListing` inserts a `member_assignments` row.
      - `getListingAccess` and `canAccessListing` read the member's role, `recruiter_scope` and `member_assignments` (Owner, Admin and scope `all` → all; `assigned` → the assigned IDs; Billing → none).
      - `resolveSlug` reads `org_slugs` and `organizations`: null for an unknown slug or a deleted org, and `retired` = the slug differs from the org's current slug.
    - `locationsFake`, `verificationFake`, `listingsFake`, `hostpagesFake`: in-memory maps with setters, plus a `calls` log.
    - No B1 test may rely on a fake function falling through to its W0 stub, which throws. `tests/fakes/sp2/fakes.test.ts` calls every function the B1 tasks list under **Consumes (fake)** and expects none to throw `not implemented`.
  - **`tests/e2e/helpers/sp2.ts`** (Playwright; used from Phase B2 on):
    - `drainJobs(request)`: POSTs `/api/jobs/run` with `x-jobs-secret` until `processed === 0`
    - `runFoundingCodes(count)`: runs `pnpm ops:founding-codes --count <n> --note e2e` and parses `EE-XXXX-XXXX`
    - `setLaunchAt(iso)` and `setSettingValue(key, value)`: call `setSetting` through `createDb(DATABASE_URL)`
    - `dbRows(sql)`
    - `entitleHost(page, o?: { plan?: PlanCode; interval?: 'month'|'year' })` (default Professional monthly), for a signed-in Owner with `BILLING_PROVIDER=stub`. It raises `founding.max_hosts` to 1000 (so repeated runs on one local database never run out of spots), takes a code from `runFoundingCodes(1)`, POSTs `/api/v1/host/billing/checkout` with `{ plan, interval, extraSlots: 0, foundingCode }` from inside the page (`page.evaluate` with `fetch`, so the origin check passes), reads `session_id` from the returned success URL, calls `GET /api/v1/host/billing/complete?session_id=<id>` the same way, then calls `drainJobs`. It uses only B1 routes, never a screen, so W8's tests can use it before W9's billing pages exist. It never changes `launch.public_at` (Plan decision 17).
    - `readEmail(to, o?: { subject?: RegExp })`: the newest `.data/emails/*.json` message to that address (Task 6), polling for up to 10 s; `readJoinLink(to)` returns the `/join/<token>` path from its HTML

- [ ] **Step 1: Write the failing tests.**
  - `ListingContentSchema` rejects `housing: { provided: true, ... }` without `cost`, and rejects a housing photo set with 3 keys.
  - `buildListingContent(...)` parses. Its `job.minAge` defaults to 18 when omitted.
  - Maritime `genreDetails` under a Seasonal primary category fails at path `genreDetails.category`.
  - `ListingDraftSchema` accepts `{}` and `{ housing: { provided: true } }`, and rejects `{ basics: { title: 5 } }`.
  - `normalizeSkill('  Customer   Service ')` → `{ key: 'customer-service', label: 'Customer Service' }`, and `normalizeSkill('C++')` gives key `c++`.
  - `HostPageContentSchema` rejects 25 photos, 13 team members, 16 FAQ entries and an `http://` social URL.
  - **Fakes** (`fakes.test.ts`): no consumed fake function throws `not implemented`. `entitlementsFake`: a `listing_slot` grant of 12, its `endGrant`, then `grant` with the same key → `created: false`, and `getCapacity` reports limit 0; `getBalance` after granting 50 and consuming 1 → 49. `orgsFake`: after `assignListing` for an assigned Recruiter, `getListingAccess` lists the listing; `resolveSlug` of a retired slug → `retired: true`, and of the current slug → `retired: false`. `billingFake`: `getSubscriberBadges` omits an org set to `entitled: false`.
- [ ] **Step 2:** Run `pnpm test src/modules/listings/content.test.ts src/modules/hostpages/content.test.ts tests/fakes/sp2`. Expected: FAIL.
- [ ] **Step 3:** Implement the schemas, helpers and fakes.
- [ ] **Step 4:** Run `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp2): listing and host page content schemas, test helpers and module fakes`.

---

## Phase B1: Domain workstreams (in parallel; one worktree per workstream, based on Phase A)

Each workstream replaces its own stubs in its module's `index.ts`, keeps every signature from Tasks 7–8, and mocks sibling SP2 modules with `tests/fakes/sp2/*` (Plan decision 12). Foundation modules (trust, notifications, media, audit, settings, jobs) are real in tests. Every route is a thin `apiRoute`: it sets `auth`, calls `requireCapability`, the rate limit named in spec section 5, and one service call. The service functions carry the tests.

### Task 9 (W1): Entitlement ledger

**Files:**
- Create: `drizzle/1600_entitlements.sql`, `src/modules/entitlements/{schema.ts,ledger.ts,ledger.test.ts,privacy.ts}`
- Modify: `src/modules/entitlements/index.ts`

**Interfaces:**
- Produces: `grant`, `endGrant`, `consume`, `reverse` and `getBalance` exactly as in spec section 3, plus `lockOrg(tx, orgId)` and `listOpenGrants` (Task 7: grants valid at `now`, filtered by `source` and `kind`). The lock is `select pg_advisory_xact_lock(hashtextextended('org:' || $orgId, 0))`; `consume`, `withCapacity`, billing sync and slot enforcement all use it.
- **Rules:**
  - **Tables:** exactly the spec's `1600_entitlements` rows. Trigger `app.entitlement_grants_guard()` rejects DELETE and any UPDATE except shortening `valid_until`. Trigger `app.entitlement_consumptions_guard()` allows only setting `reversed_at` and `reversal_reason` once.
  - **A grant is valid at `now`** when `valid_from <= now < coalesce(valid_until, 'infinity')`.
  - **`consume`** runs in its own savepoint (`db.transaction`) under `lockOrg`. It draws from grants ordered by `valid_until` ascending with nulls last, then `valid_from`, splitting across grants. The rows are keyed `<key>`, `<key>#2`, …, and it returns the first row's ID. The same key again returns the original result.
  - **`reverse`** reverses every row of that consumption's base key.
  - **`getBalance`:** `balance` = valid grants − unreversed consumptions on them; `resetsAt` = the earliest `valid_until` among valid grants with something left, else null.
  - **Audit:** `entitlements.granted`, `entitlements.grant_ended`, `entitlements.consumed`, `entitlements.reversed`.
  - **Privacy:** `erase` sets `created_by` to null.

- [ ] **Step 1: Write the failing tests** (`ledger.test.ts`).
  - `consume` twice with the same key consumes once, and both calls return the same `consumptionId`.
  - Balance 1, consume quantity 2 → `{ ok: false, reason: 'insufficient', remaining: 1 }`, and no rows are written.
  - A grant whose `validUntil` is 1 ms before `now` isn't counted.
  - `reverse` restores the balance from 9 to 10, and a second `reverse` changes nothing.
  - With grant A (`validUntil` 2026-12-01) and grant B (open-ended), a consumption draws from A first. Consuming 12 from 10 + 5 writes two rows.
  - `grant` twice with the same `idempotencyKey` → `created: true`, then `created: false` with the same `grantId`. The same holds after that grant was ended, and no new grant is written (which is why Task 14's plan keys carry a sequence).
  - `endGrant` excludes the grant after `at`. `listOpenGrants({ source: 'plan', kind: 'seat' })` returns open plan seat grants only, and omits ended ones. A raw SQL update that lengthens `valid_until`, or a delete, throws.
  - `quantity: 0` → `bad_request`.
  - Each operation records its audit action.
- [ ] **Step 2:** Run `pnpm test src/modules/entitlements/ledger.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(entitlements): append-only grants and consumptions ledger`.

### Task 10 (W1): Capacity and the org lock

**Files:**
- Create: `src/modules/entitlements/{capacity.ts,capacity.test.ts,capacity.int.test.ts}`, `src/app/api/v1/host/entitlements/route.ts`

**Interfaces:**
- Consumes: `getBalance` (Task 9)
- Produces:
  - `getCapacity(db, orgId, kind, now?)`: `limit` = the sum of valid grants of that kind (for `seat`, at least 1: the Owner is always counted); `used` = the registered counter.
  - `withCapacity(tx, orgId, kind, adding, fn)`: takes `lockOrg`, re-counts, and when `adding > 0 && used + adding > limit` throws `conflict('No free capacity', { reason: kind === 'listing_slot' ? 'listing_slot_limit' : 'seat_limit', limit, used })`; otherwise it returns `fn()`.
  - `registerUsageCounter(kind, count)`: a second registration for the same kind throws.
  - `GET /api/v1/host/entitlements` (any host role) → `{ listingSlots: { used, limit }, seats: { used, limit }, inviteCredits: { balance, resetsAt } }`

- [ ] **Step 1: Write the failing tests.**
  - With no grants: `listing_slot` limit 0, `seat` limit 1. A `seat` grant of 5 → limit 5.
  - `withCapacity` adding 1 with a counter at 2 and limit 2 throws details `{ reason: 'listing_slot_limit', limit: 2, used: 2 }`. With `adding: 0` it runs `fn` even when used exceeds the limit. Kind `seat` reports `seat_limit`.
  - `getCapacity` for a kind with no counter throws `No usage counter for listing_slot`.
  - **Integration test** (`capacity.int.test.ts`, CI only): create `app.int_capacity_items`, register a counter over it, and set limit = used + 1. Two concurrent `withTx(db, tx => withCapacity(tx, org, 'listing_slot', 1, insertRow))` calls → exactly one row inserted and one `conflict`.
- [ ] **Step 2:** Run `pnpm test src/modules/entitlements/capacity.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the unit tests. Expected: PASS. Run `pnpm typecheck`. Expected: PASS (the integration test runs in CI).
- [ ] **Step 5:** Commit: `feat(entitlements): capacity checks under an org advisory lock`.

### Task 11 (W2): Billing schema, plans, gateway and Stripe seed

**Files:**
- Create:
  - `drizzle/1500_billing.sql`
  - `src/modules/billing/{schema.ts,plans.ts,plans.test.ts,gateway.ts,gateway-fake.ts,catalog.ts,catalog.test.ts}`
  - `scripts/stripe-seed.ts`

**Interfaces:**
- Produces:
  - **Tables:** exactly the spec's `1500_billing` rows, plus `subscriptions.plan_grant_seq int not null default 0` (Plan decision 14; used by Task 14).
  - **`PLANS`:**
    - `starter`: `{ monthlyCents: 9900, annualCents: 99000, slots: 2, seats: 1, inviteCredits: 10, extraSlotMonthlyCents: 3900 }`
    - `professional`: `{ monthlyCents: 29900, annualCents: 299000, slots: 10, seats: 5, inviteCredits: 50, extraSlotMonthlyCents: 2900 }`
    - `enterprise`: `{ monthlyCents: 59900, annualCents: 599000, slots: 30, seats: 15, inviteCredits: 150, extraSlotMonthlyCents: 1900 }`
  - **Annual extra slot:** `EXTRA_SLOT_ANNUAL_MULTIPLIER = 10` ($390 · $290 · $190 per year).
  - **Lookup keys:**
    - `lookupKey('tier'|'slot', plan, interval): string` gives `professional_month` or `slot_starter_year`.
    - `parseLookupKey(key): { kind: 'tier'|'slot'; plan: PlanCode; interval: BillingInterval } | null`
  - `FOUNDING_COUPON_ID = 'founding_30_forever'`
  - `monthlyEquivalentCents(plan, interval, extraSlots): number` (annual ÷ 10)
  - **`interface BillingGateway`:**
    - `createCustomer(i: { orgId; name; email: string | null }, idempotencyKey): Promise<{ id }>`
    - `createCheckoutSession(p: CheckoutParams, idempotencyKey): Promise<{ id; url; expiresAt: Date }>`
    - `retrieveCheckoutSession(id): Promise<{ id; status: 'open'|'complete'|'expired'; subscriptionId: string | null; metadata: Record<string, string> }>`
    - `expireCheckoutSession(id)`
    - `retrieveSubscription(id): Promise<SubSnapshot>`
    - `listSubscriptionsCreatedSince(since: Date): Promise<SubSnapshot[]>`
    - `updateSubscription(id, u: { items?: { lookupKey; quantity }[]; trialEnd?: Date; prorationBehavior: 'always_invoice'|'create_prorations'|'none'; paymentBehavior?: 'error_if_incomplete' }, idempotencyKey): Promise<SubSnapshot>`
    - `cancelSubscription(id, idempotencyKey)` (immediately, without proration)
    - `previewInvoice(i: { customerId; subscriptionId; items; prorationBehavior }): Promise<{ dueNowCents; nextInvoiceCents; nextInvoiceAt: Date }>`
    - `createPortalSession(i: { customerId; configurationId; returnUrl }): Promise<{ url }>`
    - `listPrices(lookupKeys): Promise<{ lookupKey; unitAmountCents; interval: BillingInterval }[]>`
    - `getDefaultCardChecks(customerId): Promise<{ hasCard; cvcCheck: string | null; postalCheck: string | null }>`
    - `constructEvent(rawBody: string, signature: string): { id; type; objectId: string | null; object: Record<string, unknown> }` (300 s tolerance)
  - `SubSnapshot = { id; customerId; status; items: { lookupKey: string | null; quantity: number }[]; currentPeriodStart: Date; currentPeriodEnd: Date; trialEnd: Date | null; cancelAtPeriodEnd: boolean; endedAt: Date | null; startDate: Date; couponId: string | null; metadata: Record<string, string>; created: Date }`. The real gateway reads the period from the subscription items when the pinned API version moved it there.
  - `CheckoutParams = { customerId; items: { lookupKey; quantity }[]; trialEnd: Date | null; couponId: string | null; allowPromotionCodes: boolean; metadata: Record<string, string>; clientReferenceId; successUrl; cancelUrl; expiresAt: Date }`
  - `billingGateway(): BillingGateway`, chosen by `BILLING_PROVIDER`. With `stub` it returns one shared auto-complete fake per process, so a session created by the checkout route is found by the complete route.
  - `makeFakeBillingGateway(o?: { autoComplete?: boolean; now?: () => Date })`, with test controls `completeCheckout(sessionId)`, `setSubscription(snapshot)`, `setCardChecks(customerId, checks)`, `declineNextUpdate()`, `failNext(method)` and `calls`.
    - In auto-complete mode, Checkout creates the subscription and returns `successUrl` with the session ID filled in.
    - `getDefaultCardChecks(customerId)` returns `{ hasCard: true, cvcCheck: 'pass', postalCheck: 'pass' }` once a Checkout for that customer has completed (auto-complete or `completeCheckout`), and `{ hasCard: false, cvcCheck: null, postalCheck: null }` before. `setCardChecks` overrides it. So a stub-billing host auto-verifies (spec 8.4 needs a card on file), as exit row 3 requires.
  - **Stripe catalog seed:** `seedStripeCatalog(api: CatalogApi): Promise<{ created: string[]; portalConfigFull: string; portalConfigBilling: string }>`, idempotent by lookup key, coupon ID and portal metadata `ee_portal = full|billing`. It creates:
    - 3 products, 6 tier prices and 6 slot prices (monthly and annual)
    - coupon `founding_30_forever` (`percent_off: 30, duration: 'forever'`)
    - two portal configurations (Plan decision 10)

    `scripts/stripe-seed.ts` runs it with `getStripe()` and prints `STRIPE_PORTAL_CONFIG_FULL=…` and `STRIPE_PORTAL_CONFIG_BILLING=…`.

- [ ] **Step 1: Write the failing tests.**
  - `PLANS` equals the values above. `lookupKey` and `parseLookupKey` round-trip all 12 keys. `parseLookupKey('ee_extra_seat_month')` → `null`. `monthlyEquivalentCents('starter', 'year', 0)` → `9900`.
  - `seedStripeCatalog` on an in-memory `CatalogApi` creates prices with these unit amounts: `starter_month` 9900, `starter_year` 99000, `professional_month` 29900, `professional_year` 299000, `enterprise_month` 59900, `enterprise_year` 599000, `slot_starter_month` 3900, `slot_starter_year` 39000, `slot_professional_month` 2900, `slot_professional_year` 29000, `slot_enterprise_month` 1900, `slot_enterprise_year` 19000. It creates the coupon and two portal configs. A second run creates nothing and returns the same config IDs.
  - In auto-complete mode, the fake's Checkout returns a URL containing the session ID, and `retrieveCheckoutSession` reports `complete` with a subscription.
  - The fake's `getDefaultCardChecks` reports `hasCard: false` before a checkout and `{ hasCard: true, cvcCheck: 'pass', postalCheck: 'pass' }` after an auto-complete checkout; `setCardChecks(customerId, { hasCard: true, cvcCheck: 'fail', postalCheck: null })` changes it. With `BILLING_PROVIDER=stub`, two `billingGateway()` calls return the same instance.
- [ ] **Step 2:** Run `pnpm test src/modules/billing/plans.test.ts src/modules/billing/catalog.test.ts`. Expected: FAIL. (The gateway fake's cases live in `plans.test.ts`.)
- [ ] **Step 3:** Implement. Use Context7 for stripe-node's Checkout, Prices, Coupons and `billingPortal.configurations` shapes.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(billing): plans, Stripe gateway with fake, idempotent catalog seed`.

### Task 12 (W2): Founding codes

**Files:**
- Create: `src/modules/billing/{founding.ts,founding.test.ts,founding.int.test.ts}`, `scripts/ops-founding-codes.ts`

**Interfaces:**
- Produces:
  - `createFoundingCodes(db, { count, note, operatorId })` → plaintext codes (count 1–100). It records `billing.founding_codes_created` with the count and the last-4 values only.
  - `getFoundingCount(db)` → `{ redeemed, held, max }`, where `held` counts unexpired holds and `max` = `founding.max_hosts`.
  - `generateFoundingCode(rand?: (n: number) => Uint8Array): string`: `EE-XXXX-XXXX` in Crockford base32 (alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`).
  - `normalizeFoundingCode(input): string | null`: uppercase, drop hyphens and spaces, map `O`→`0` and `I`/`L`→`1`, and require `^EE[0-9A-HJKMNP-TV-Z]{8}$`. The stored hash is sha256 hex of the normalized string.
  - `holdFoundingCode(tx, { orgId, code, until }): Promise<{ codeId }>`: under `pg_advisory_xact_lock(hashtext('founding'))`. It throws `badRequest('That code isn't valid.', { reason: 'code_invalid' })` for an unknown, revoked, redeemed or other-org-held code. It throws `conflict('Founding spots are all taken.', { reason: 'founding_unavailable' })` when redeemed + held ≥ max. The same org re-holding its code extends the hold.
  - `redeemFoundingCode(tx, { codeId, orgId })`, `releaseHold(tx, orgId)`
  - `pnpm ops:founding-codes --count N --note "…"` prints one code per line, then `Shown once. Store them now.`

- [ ] **Step 1: Write the failing tests.**
  - Generated codes match `/^EE-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/`.
  - `normalizeFoundingCode('ee-ab12-cd34 ')` equals `normalizeFoundingCode('EEAB12CD34')`, and `'EE-AB12-CD3O'` (letter O) equals `'EE-AB12-CD30'`.
  - No column of `app.founding_codes` contains the plaintext code.
  - A code held by org A is `code_invalid` for org B. After `held_until` passes, B can hold it. A redeemed code is never available again, and it still counts.
  - With `founding.max_hosts` = 2 and 2 redeemed codes, a hold → `founding_unavailable`.
  - `createFoundingCodes` with count 0 or 101 → `bad_request`.
  - **Integration test** (`founding.int.test.ts`): 101 codes, max 100, and 101 orgs holding concurrently → exactly 100 holds and 1 `founding_unavailable`.
- [ ] **Step 2:** Run `pnpm test src/modules/billing/founding.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the unit tests. Expected: PASS. Run `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(billing): hashed founding codes with capped holds`.

### Task 13 (W2): Checkout and Stripe customers

**Files:**
- Create: `src/modules/billing/{customers.ts,checkout.ts,checkout.test.ts}`, `src/app/api/v1/host/billing/checkout/route.ts`

**Interfaces:**
- Consumes: Task 12 holds; `orgs.getOrgSummaries` and `orgs.listMembers` (fake); `getSetting`
- Produces:
  - `ensureStripeCustomer(db, orgId, gw?)`: upserts `billing_accounts`, creating the customer once with idempotency key `customer:<orgId>`
  - `computeFoundingTrialEnd(launchAt: Date | null, now: Date, freeDays: number): Date`: `max(launchAt, now) + freeDays` days, or `now + 729 days` when `launchAt` is null
  - `createCheckout(db, ctx: HostContext, i: { plan; interval; extraSlots: number; foundingCode?: string }, gw?): Promise<{ url }>`. It follows spec 8.7:
    1. A current subscription → 409 `has_subscription`.
    2. Choose founding pricing:
       - A returning founding host (`founding_status = 'lapsed'` and `founding_lapsed_at` + `founding.return_window_months` > now) gets the coupon with no code, plus the trial only while now < launch + 90 days.
       - Otherwise a code is validated and held until the session expires.
       - Otherwise, before launch (`launch.public_at` null or in the future), the request fails with `badRequest('Enter your founding host code to subscribe before launch.', { reason: 'code_required' })`.
    3. Founding sessions get `couponId = 'founding_30_forever'`, the trial end, `allowPromotionCodes: false` and `metadata.foundingCodeId`. Others get `allowPromotionCodes: true`, no coupon and no trial.
    4. The items are the tier price, plus the slot price × `extraSlots` when above 0.
    5. Always set `clientReferenceId` = `metadata.orgId` = orgId, `expiresAt` = now + 31 minutes (Plan decision 16; the founding hold's `held_until` is the same instant), `successUrl` = `${APP_URL}/host/billing/complete?session_id={CHECKOUT_SESSION_ID}` and `cancelUrl` = `${APP_URL}/host/billing/plans`.
    6. An open session whose parameters hash matches is reused. Otherwise the old one is expired and its hold released.
    7. The idempotency key is `checkout:<orgId>:<paramsHash>:<expiresAtUnix>`.
    8. It records `billing.checkout_started` with the plan, interval, extra slots and whether the session is founding.
  - **Route:** `POST /host/billing/checkout`, host O/A (`billing.plan`), 10 per hour per org

- [ ] **Step 1: Write the failing tests.**
  - `computeFoundingTrialEnd(null, FIXED_NOW, 90)` = `FIXED_NOW` + 729 days. With launch 2027-01-15T00:00Z and now 2026-11-03 → `2027-04-15T00:00:00Z`. With now 2027-02-01T00:00Z → `2027-05-02T00:00:00Z`.
  - Before launch with no code → `bad_request` `code_required` with the exact message. An invalid code → `code_invalid`. A valid code → a session with the coupon, the trial end and `metadata.foundingCodeId`, and a hold whose `held_until` equals `expiresAt`.
  - `expiresAt` is exactly `FIXED_NOW` + 31 minutes.
  - After launch with no code → `allowPromotionCodes: true`, no coupon and no trial.
  - A trialing subscription row → `conflict` `has_subscription`.
  - The same parameters twice → the same URL and one gateway call. Changed `extraSlots` → the old session is expired and a new one created.
  - A returning host lapsed 6 months − 1 day ago → the coupon with no code. Lapsed 6 months + 1 day ago → no coupon.
  - `{ plan: 'professional', interval: 'month', extraSlots: 2 }` → items `professional_month` × 1 and `slot_professional_month` × 2.
  - `ensureStripeCustomer` twice → one `createCustomer`, with key `customer:<orgId>`.
  - A gateway failure → `internal` "Billing is temporarily unavailable. Try again in a few minutes.", and no hold remains.
- [ ] **Step 2:** Run `pnpm test src/modules/billing/checkout.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. The founding hold and the `billing_accounts.open_checkout_*` update share one transaction. The gateway call happens after it commits, and a failure releases the hold.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(billing): hosted Checkout with founding codes, trials and session reuse`.

### Task 14 (W2): Webhooks, sync and subscription state

**Files:**
- Create:
  - `src/modules/billing/{sync.ts,state.ts,webhook.ts,notifications.ts,overview.ts,subjects.ts,sync.test.ts}`
  - `src/app/api/webhooks/stripe/route.ts`
  - `src/app/api/v1/host/billing/route.ts` (GET)
  - `src/app/api/v1/host/billing/complete/route.ts`

**Interfaces:**
- Consumes: entitlements `grant`, `endGrant`, `listOpenGrants`, `lockOrg` and `getCapacity` (fake); `trust.openReviewItem`, `registerSubjectHandlers` and `raiseAlert`; `emit`
- Produces:
  - `syncSubscription(db, stripeSubscriptionId, gw?)`, following spec 8.8. It reads the subscription from Stripe, then under `lockOrg`:
    1. Upserts the row and `last_synced_at`.
    2. **Plan grants** for `listing_slot` (plan slots + extra) and `seat` (plan seats), with `source: 'plan'` and `sourceRef` = the subscription ID (Plan decision 14):
       - When the org's open plan grants (`listOpenGrants({ source: 'plan' })`) are exactly one per kind for this subscription with those quantities, nothing changes. So a replayed sync writes nothing.
       - Otherwise the sync increments `plan_grant_seq` on the subscription row, ends every open plan grant of the org, and grants each kind with key `plan:<subId>:<kind>:<qty>:<seq>`. The sequence makes each key unique per episode, so going back to an earlier quantity (Professional → Starter → Professional, or extra slots 2 → 3 → 2) issues a fresh grant instead of colliding with the ended one's key.
    3. **This month's credits:** key `credits:<orgId>:<YYYY-MM>`, `validUntil` the 1st of next month UTC. After an upgrade, a top-up keyed `credits:<orgId>:<YYYY-MM>:topup:<plan>` covers the difference. A downgrade never claws back.
    4. **Founding:** redeems the code from `metadata.foundingCodeId` and sets `founding_status = 'active'`; a returning host's status goes back to `active`.
    5. **Host since:** `host_since` = `startDate` the first time the org becomes entitled.
    6. **Lapse** (`canceled`, `unpaid`, `incomplete_expired` or `paused`, when this was the org's current subscription and no other is current): plan grants end, `host_since` = null, `founding_status` goes from `active` to `lapsed` with `founding_lapsed_at`, and `billing.subscription_ended` is sent with `{ closingListings: <listing_slot used before the grants ended> }`.
    7. Emits `subscription.changed` only when status, plan, interval or extra slots changed.
    8. Records `billing.subscription_synced`.
    9. Sends `billing.subscription_started` on the first entitled sync, and `billing.plan_changed` when the plan changed and used ≤ the new limit.

    An unknown lookup key or a second current subscription grants nothing, opens a `billing` item (subject `billing_account`, subject ID = orgId, reason `unknown_price` or `duplicate_subscription`) and calls `raiseAlert` (critical). It never uses subject `organization`, whose handler decides business verification (Plan decision 11). A subscription whose org can't be resolved (no `metadata.orgId` and no billing account) calls `raiseAlert` (warning, kind `billing.unknown_customer`) and returns without throwing.
  - `getSubscriptionState`: the current subscription row, else the most recent, else status `none`. `entitled` covers `trialing`, `active` and `past_due`; `canPublish` covers `trialing` and `active`. `founding` reads `forfeited` once `lapsed` is older than the return window.
  - `getSubscriberBadges`: entitled orgs mapped to `{ hostSince }`
  - `handleStripeWebhook(db, rawBody, signature, gw?): Promise<'applied'|'duplicate'>`: in one transaction, insert `webhook_events (id, 'stripe')` (a duplicate returns `'duplicate'`), then:
    - `checkout.session.completed` (subscription mode) and `customer.subscription.*` → enqueue `billing.sync_subscription` `{ subscriptionId }` with dedupe `stripe:<eventId>`
    - `invoice.paid` → the same
    - `invoice.payment_failed` → the same, with `notify: 'payment_failed'`
    - `customer.subscription.trial_will_end` → the same, with `notify: 'trial_ending'`
    - every other event → `emit('billing.stripe_event', { eventId, type, objectId }, eventId)`

    The route verifies the signature on the raw body (400 on a bad signature), returns `{ received: true }` and calls `kickWorker()`.
  - The `billing.sync_subscription` handler: `syncSubscription`, then the requested notification to billing contacts
  - **Subject handler `billing_account`** (`subjects.ts`, registered at module load from `index.ts`): approve, remove and ask_info resolve the item and change nothing (the operator fixes the price or the subscription in Stripe, and the next sync or `billing.reconcile` applies it); suspend or ban → `sanctionOrg` (Task 15). It never touches verification status.
  - **Notification types** (`notifications.ts`): the five `billing.*` rows of spec section 6, mandatory, category `billing`, using the `BillingNotice` template. **Billing contacts** are Owner, Admin and Billing members.
  - `getBillingOverview(db, ctx)` → `{ subscription, prices, usage, founding }`. Billing members get counts only.
  - `getPublicPrices(gw?)`: Stripe prices cached in memory for 1 hour, falling back to `PLANS` on error
  - `GET /host/billing/complete?session_id`: retrieves the session; if it has a subscription, runs `syncSubscription`; returns `{ status }`.

- [ ] **Step 1: Write the failing tests** (`sync.test.ts`, with the fake gateway and fakes for entitlements and orgs).
  - The same webhook twice → `'applied'`, then `'duplicate'`, and one outbox row with dedupe `stripe:<eventId>`. A bad signature → the route returns 400.
  - `customer.subscription.updated` handled before `created` → one row whose state equals the fake's.
  - With the fake subscription canceled, replaying an older `updated` event leaves status `canceled` and creates no plan grants.
  - With no webhooks at all, `GET /host/billing/complete` alone leaves the org entitled.
  - Professional monthly with 2 extra slots → grants `plan:<sub>:listing_slot:12:1` and `plan:<sub>:seat:5:1`, plus 50 credits valid until the 1st of next month. Syncing again writes no grant. A later Starter sync ends both plan grants and grants `plan:<sub>:listing_slot:2:2` and `plan:<sub>:seat:1:2`.
  - **Back to an earlier quantity:** Professional + 2, then Starter, then Professional + 2 on one subscription → `getCapacity` gives `listing_slot` limit 12 and `seat` limit 5, from new grants `plan:<sub>:listing_slot:12:3` and `plan:<sub>:seat:5:3`. Extra slots 2 → 3 → 2 likewise ends at limit 12.
  - A founding subscription → its code is redeemed, `founding: 'active'`, and `billing.founding_redeemed` is recorded.
  - `host_since` is set once to `startDate`. Then a lapse → `hostSince: null`, `founding: 'lapsed'`, the org missing from `getSubscriberBadges`, and `billing.subscription_ended` sent.
  - `past_due` → `entitled: true, canPublish: false`; no row → status `none`.
  - Syncing twice with no change emits `subscription.changed` once.
  - An unknown lookup key → no grants, a `billing` item with subject `billing_account` and reason `unknown_price`, and a critical alert (an `operator.alert` notification row). Approving that item through `decide` leaves the org's `verification_status` unchanged and emits no `verification.decided`.
  - An unresolvable customer → a warning alert, and the handler resolves.
  - `invoice.payment_failed` → after the worker runs, Owner, Admin and Billing members (not Recruiters) have `billing.payment_failed` rows.
- [ ] **Step 2:** Run `pnpm test src/modules/billing/sync.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(billing): verified webhooks, order-independent sync, grants and founding redemption`.

### Task 15 (W2): Plan change, portal, cancellation and sanctions

**Files:**
- Create:
  - `src/modules/billing/{change.ts,change.test.ts,portal.ts,cancel.ts,cancel.test.ts}`
  - `src/app/api/v1/host/billing/{preview,change,portal}/route.ts`

**Interfaces:**
- Consumes: `syncSubscription` (Task 14); `getCapacity` (fake); `orgs.setOrgStatus` (fake)
- Produces:
  - `previewChange(db, orgId, i: { plan; interval; extraSlots }, gw?)` → `{ dueNowCents, nextInvoiceCents, nextInvoiceAt, newLimits: { listingSlots, seats, inviteCredits }, mustChooseListings: max(0, used − newSlotLimit) }`
  - `changePlan(db, i: { orgId; plan; interval; extraSlots; keepListingIds?: string[]; actorUserId }, gw?)` → `{ status: 'applied'|'failed', subscription }`. It follows spec 8.6:
    1. Seats used > new seats → 409 `seat_limit`.
    2. `mustChooseListings > 0` and a missing, too long or invalid keep list (IDs must be the org's slot holders) → 400 `keep_list_required`.
    3. A pending change exists → 409 `change_in_progress`.
    4. Insert the `pending` row, then call `updateSubscription` with key `change:<id>`, swapping the tier and slot items and keeping the slot quantity. An upgrade (higher `monthlyEquivalentCents`) uses `always_invoice` with `error_if_incomplete`; otherwise `create_prorations`.
    5. A card error → the row is `failed` with `error`, nothing else changes, and the result is `status: 'failed'`.
    6. Success → `syncSubscription` → `status: 'applied'`. The row stays `pending` (Plan decision 2).
    7. Both outcomes record `billing.plan_changed`, with `{ changeId, from, to, status }`.
  - `getPendingKeepList` (spec section 3), and `settlePendingChange(db, orgId)` (pending → applied)
  - `createPortalSession(db, ctx, gw?)` → `{ url }`: `STRIPE_PORTAL_CONFIG_FULL` for Owner and Admin, `STRIPE_PORTAL_CONFIG_BILLING` for Billing; return URL `${APP_URL}/host/billing`
  - `cancelSubscriptionNow(db, orgId, gw?)`: `cancelSubscription` with key `cancel:<subId>`, then `syncSubscription`; a no-op without a current subscription
  - `sanctionOrg(db, orgId, action, actor)`: `orgs.setOrgStatus(db, orgId, action === 'ban' ? 'banned' : 'suspended', actor)`. A ban also enqueues `billing.cancel_subscription` `{ orgId }` with dedupe `cancel:<orgId>:ban`, whose handler calls `cancelSubscriptionNow`.
  - `getCardChecks(db, orgId, gw?)`

- [ ] **Step 1: Write the failing tests** (`change.test.ts`, `cancel.test.ts`).
  - Professional → Starter with 3 slot holders → `mustChooseListings: 1`, `newLimits: { listingSlots: 2, seats: 1, inviteCredits: 10 }`.
  - `changePlan` with no keep list, with 3 IDs, or with an ID that isn't a holder → `bad_request` `keep_list_required`.
  - 3 members, Professional → Starter → `conflict` `seat_limit`, and no gateway call.
  - Inside the fake's `updateSubscription` hook, the `pending` row with the keep list already exists. The key is `change:<id>`. A downgrade uses `create_prorations`; Starter → Professional uses `always_invoice` and `error_if_incomplete`.
  - `declineNextUpdate()` → `status: 'failed'`, the row is `failed`, the plan is unchanged and no `subscription.changed` is emitted.
  - `getPendingKeepList` returns the IDs. After `settlePendingChange` it returns `null`. A second `changePlan` while pending → `conflict` `change_in_progress`.
  - 2 extra slots survive Professional → Enterprise as `slot_enterprise_month` × 2.
  - Portal: Owner → the FULL config, Billing → the BILLING config; the Recruiter route → `forbidden`.
  - `sanctionOrg('ban')` → the org is `banned`, and the outbox holds `cancel:<orgId>:ban`. Its handler cancels with key `cancel:<subId>` and the org lapses. `sanctionOrg('suspend')` → status only.
- [ ] **Step 2:** Run `pnpm test src/modules/billing/change.test.ts src/modules/billing/cancel.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(billing): plan changes with stored keep list, portal, immediate cancel, sanctions`.

### Task 16 (W2): Billing schedules, reconcile and privacy

**Files:**
- Create: `src/modules/billing/{jobs.ts,jobs.test.ts,privacy.ts}`

**Interfaces:**
- Produces:
  - `billing.grant_monthly_credits`: for every entitled org, this month's grant (same keys as Task 14), idempotent
  - `billing.apply_launch_date`:
    - When `launch.public_at` is set: for each founding subscription that is `trialing`, the target is `max(launch, subscription.created) + founding.free_days`.
    - Skip it when the target equals the stored `trial_end`, or the target ≤ now.
    - Otherwise call `updateSubscription(id, { trialEnd, prorationBehavior: 'none' }, 'trial:<subId>:<unix>')`.
    - A Stripe error on one subscription calls `raiseAlert` (warning) and the loop continues. The handler never throws for a single subscription.
  - `billing.reconcile`: re-syncs every subscription without `ended_at`, plus `listSubscriptionsCreatedSince(now − 2 days)` entries missing here. Any row whose (status, plan, interval, extra slots, trial end) changed calls `raiseAlert({ severity: 'warning', kind: 'billing.drift' })`.
  - `privacyHandlers.erase`: sets `billing_changes.requested_by` to null

- [ ] **Step 1: Write the failing tests.**
  - At 2026-12-01T00:10Z, an entitled Starter org gets 10 credits valid until 2027-01-01T00:00Z. A second run adds nothing. A non-entitled org gets nothing.
  - Starter (10 granted) → Professional mid-month → a top-up of 40, balance 50. Then a downgrade → the balance stays 50.
  - With launch 2027-01-15T00:00Z and a trialing founding subscription created 2026-11-03: `trialEnd` = 2027-04-15T00:00:00Z, behavior `none`, key `trial:<subId>:1807747200`. A second run makes no call. With launch null, no calls.
  - **(Review Focus 5)** An `active` founding subscription is skipped. A trialing one whose target ≤ now is skipped. When one update throws, the next subscription is still updated and the handler resolves.
  - Reconcile: a row stored as `trialing` that Stripe reports `active` → resynced and a `billing.drift` alert. A Stripe subscription created yesterday and missing here → synced. Unchanged rows → no alert.
- [ ] **Step 2:** Run `pnpm test src/modules/billing/jobs.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(billing): monthly credits, launch-date trial correction, daily reconcile`.

### Task 17 (W3): Members, scopes, org status and org settings

**Files:**
- Create:
  - `src/modules/orgs/{members.ts,scope.ts,status.ts,org-settings.ts,scope.test.ts,status.test.ts}`
  - `src/app/api/v1/host/team/route.ts` (GET)
  - `src/app/api/v1/host/org/route.ts` (PATCH)
- Modify: `src/modules/orgs/index.ts`

**Interfaces:**
- Consumes: the `ClerkAdmin` additions (Task 6); `emit`; `audit.record`
- Produces:
  - `listMembers`, `getListingAccess`, `canAccessListing` and `getOrgStatus` (spec section 3); `getMember`, `getOrgSummaries`, `assignListing`, `setOrgStatus` and `setVerificationStatus` (Task 7)
  - **Access rules:** Owner and Admin → `{ all: true }`. Recruiter with scope `all` → `{ all: true }`. Recruiter with `assigned` → the IDs from `member_assignments`. Billing → `{ all: false, listingIds: [], locationIds: [] }`.
  - `canAccessListing` is true when access is `all`, or the listing ID is assigned, or its `locationId` is.
  - `setOrgStatus` is a no-op when the status is unchanged. Otherwise it updates the row, emits `org.status_changed` and records `orgs.status_changed` (with `reason`).
  - `updateOrg(db, clerk, ctx, i: { name?; websiteUrl?; requireRecruiterApproval?; primaryLocationId? })` → `OrgSummary`: a name passes `organizationNameSchema`; a website must start with `https://`. A name change calls `clerk.updateOrganization`. It records `orgs.updated`.
  - `GET /host/team` (any host role) → `{ members, invitations?, seats }`. Invitations are for Owner and Admin only; `seats` comes from `entitlements.getCapacity`.
  - `PATCH /host/org` (`team.manage`): validates `primaryLocationId` with `locations.getLocations` (it must be the org's and not archived, else 404). After the update, if the name or website changed, it calls `verification.requestReverification`.

- [ ] **Step 1: Write the failing tests.**
  - A Recruiter assigned to location L1 → `getListingAccess` returns `{ all: false, listingIds: [], locationIds: [L1] }`. `canAccessListing({ id: X, locationId: L1 })` → true; with L2 → false.
  - A Recruiter with scope `all` → true; a Billing member → false for every listing.
  - `listMembers` omits removed memberships and returns role, scope and `joinedAt`.
  - `setOrgStatus('suspended')` emits one `org.status_changed` and records `orgs.status_changed`. Repeating it does nothing.
  - `updateOrg({ websiteUrl: 'http://kettle.com' })` → `bad_request`. A name change calls `updateOrganization` and records `orgs.updated`.
- [ ] **Step 2:** Run `pnpm test src/modules/orgs/scope.test.ts src/modules/orgs/status.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(orgs): members, recruiter scopes, org status and settings`.

### Task 18 (W3): Invitations and seats

**Files:**
- Create:
  - `src/modules/orgs/{invitations.ts,orgs.team.test.ts,notifications.ts}`
  - `src/app/api/v1/host/team/invitations/route.ts`, `src/app/api/v1/host/team/invitations/[id]/route.ts`
  - `src/app/api/v1/team/invitations/[token]/route.ts`, `src/app/api/v1/team/invitations/accept/route.ts`

**Interfaces:**
- Consumes: `entitlements.withCapacity`, `getCapacity` and `registerUsageCounter` (fake); `sendEmailNow` (Task 6); `identity.setAccountType` (inside `acceptInvitation`)
- Produces:
  - **Seat counter:** registers `seat` = live memberships + pending invitations with `expires_at > now()`, at module load from a file `orgs/index.ts` imports (Global Constraints).
  - `type Invitation = { id: string; email: string; role: 'admin'|'recruiter'|'billing'; scope: RecruiterScope | null; status: 'pending'|'accepted'|'revoked'; expired: boolean; expiresAt: Date; invitedBy: string; createdAt: Date }`
  - `createInvitation(db, ctx, i: { email; role: 'admin'|'recruiter'|'billing'; scope?: RecruiterScope }): Promise<Invitation>`:
    - The email is lowercased.
    - A live member with that email → 409 `already_member`.
    - An existing pending invitation for the email is revoked and replaced.
    - It runs inside `withCapacity(tx, orgId, 'seat', 1)`.
    - It inserts the row with `token_hash` null (the column is unique, not `not null`) and `expires_at` = now + `team.invitation_ttl_days`. No token exists yet.
    - Assigned IDs must belong to the org (else 404).
    - In the same transaction it enqueues `orgs.send_invitation` `{ invitationId }` with dedupe `invite:<invitationId>` and records `orgs.member_invited`. The route calls `kickWorker()` after commit.
  - **The `orgs.send_invitation` handler** creates the token and sends it in one step, so the raw token is never written to `app.outbox`, a log or any column (spec section 10; Plan decision 9):
    1. It loads the invitation and does nothing unless it is `pending` and unexpired.
    2. It generates the token (32 random bytes, base64url) and sets `token_hash` = its sha256 hex, replacing any earlier hash, then commits.
    3. It calls `sendEmailNow` with `TeamInvite` and `acceptUrl = ${APP_URL}/join/<token>`. A send failure throws, so the retry issues a fresh token; a token from a failed send was never delivered.
  - `revokeInvitation(db, ctx, id)`, recording `orgs.invitation_revoked`
  - `previewInvitation(db, token): Promise<{ orgId; orgName; role; expiresAt; emailHint } | null>`: null for an unknown, revoked or accepted token; an expired one is returned with its past `expiresAt`
  - `maskEmail(email)`: the first 2 characters of the local part (1 when it has fewer than 3), then `***@` and the domain. `maskEmail('maya@kettle.com')` → `'ma***@kettle.com'`, `maskEmail('jo@x.com')` → `'j***@x.com'`
  - `acceptInvitation(db, clerk, user: CurrentUser, token): Promise<{ redirectTo: '/host' }>`:
    1. `user.accountType === 'seeker'` → 409 `seeker_account`, with message "This email belongs to a seeker account. Ask for an invitation to a different email."
    2. An unknown, revoked or never-sent token → 404 `not_found`. The email compared case-insensitively doesn't match → 403 `email_mismatch`.
    3. Expired → 409 `expired`.
    4. Under `lockOrg`, used > limit → 409 `seat_limit`.
    5. Only after steps 1–4 pass: when `user.accountType` is null, `identity.setAccountType(db, clerk, user.id, { accountType: 'host' })`. Account type never changes later, so a failed check must leave it null and the person free to become a seeker.
    6. In one transaction: insert the membership (role, scope, `invited_by`) and its assignments, set the invitation `accepted`, and record `orgs.invitation_accepted`.
    7. Then `clerk.addMembership(clerkOrgId, user.clerkUserId, toClerkRole(role))`. On a Clerk failure, delete the membership, set the invitation back to `pending`, and throw `internal`.
    8. Notify `orgs.member_joined` to Owner and Admins.

    An already-accepted invitation for the same user returns the redirect.
  - `toClerkRole(role: 'admin'|'recruiter'|'billing'): 'org:admin'|'org:recruiter'|'org:billing'`
  - **Notification types:** `orgs.member_joined`, `orgs.member_changed` and `orgs.ownership_transferred`, per spec section 6
  - **Accept route** (`auth: 'user'`): calls `acceptInvitation` only. It never sets the account type itself.
  - **Preview route** (`auth: 'none'`): adds `logoUrl` from `hostpages.getHostIdentities` and media.

- [ ] **Step 1: Write the failing tests** (`orgs.team.test.ts`).
  - **(Row 9)** A Starter org (fake seat limit 1, the Owner only) → `createInvitation` → `conflict` `seat_limit`.
  - With limit 5, 3 members and 1 pending → one more invitation, then `seat_limit`. An expired pending invitation doesn't count.
  - **(Row 9)** A Recruiter invited with scope `{ kind: 'assigned', listingIds: [], locationIds: [L1] }` accepts → `getListingAccess` returns only L1.
  - `createInvitation` leaves `token_hash` null and enqueues one `invite:<id>` row whose payload is only `{ invitationId }`. After the worker runs, one `TeamInvite` message is in the stub outbox, the stored `token_hash` equals sha256 of the token in its accept URL, and no column of `app.org_invitations` or `app.outbox` (payloads, dedupe keys and `last_error` included) contains the token. `previewInvitation` of that token → `emailHint: 'ma***@kettle.com'`.
  - A send that fails once → the retry stores a new `token_hash`, and only the second token is accepted. A revoked invitation's job sends nothing.
  - Inviting an existing member's email → `already_member`. Re-inviting a pending email leaves one pending row.
  - **(Review Focus 1)** An invitation to `maya@kettle.com` accepted by a user with email `Maya@Kettle.COM` → accepted. `maya+1@kettle.com` → `forbidden` `email_mismatch`.
  - A seeker → `conflict` `seeker_account` with the exact message. Expired → `conflict` `expired`.
  - A user with `accountType` null who hits `email_mismatch`, `expired` or `seat_limit` still has `accountType` null afterwards. A successful accept sets it to `host`.
  - A successful accept → one membership with role `recruiter`, a recorded `addMembership(..., 'org:recruiter')`, the invitation `accepted`, and `orgs.member_joined` rows for the Owner.
  - The fake Clerk's `failNext('addMembership')` → no membership row, the invitation `pending`, and an `internal` error.
- [ ] **Step 2:** Run `pnpm test src/modules/orgs/orgs.team.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(orgs): hashed team invitations with seat limits and compensated accept`.

### Task 19 (W3): Member changes, ownership, deletion, slugs and activity

**Files:**
- Create:
  - `src/modules/orgs/{member-admin.ts,member-admin.test.ts,slugs.ts,slugs.test.ts,activity.ts,activity.test.ts,deletion.ts,privacy.ts}`
  - `src/server/org-deletion.ts`, `src/server/org-deletion.test.ts`
  - Routes: `src/app/api/v1/host/team/members/[id]/route.ts`, `src/app/api/v1/host/team/transfer-ownership/route.ts`, `src/app/api/v1/host/team/activity/route.ts`, `src/app/api/v1/host/page/slug/route.ts`
- Modify: `src/app/api/v1/host/org/route.ts` (adds DELETE)

**Interfaces:**
- Consumes: `billing.cancelSubscriptionNow` and `listings.closeAllForOrg` (fakes, in the orchestrator only); `requireReverification`
- Produces:
  - `changeMember(db, clerk, ctx, membershipId, i: { role?: 'admin'|'recruiter'|'billing'; scope?: RecruiterScope })`:
    - An Admin targeting the Owner → `forbidden`.
    - A role change calls `updateMembershipRole`.
    - It records `orgs.member_changed` and notifies the member.
  - `removeMember(db, clerk, ctx, membershipId)`:
    - Removing the Owner, or the Owner leaving → 409 `owner_must_transfer`.
    - An Admin may remove anyone but the Owner, and anyone may remove themselves.
    - It sets `deleted_at`, calls `removeMembership`, records `orgs.member_removed`, and emits `org.member_removed` with `reassignToUserId` = the actor, or the Owner on a self-leave.
  - `transferOwnership(db, ctx, membershipId)`: the target must be an Admin, else 409 `target_not_admin`. It updates `owner_user_id`; the old Owner becomes Admin; it records audit and notifies both. The route requires `requireReverification()`.
  - `changeSlug(db, ctx, slug)`:
    - 3–60 characters matching `^[a-z0-9]+(-[a-z0-9]+)*$`, else 400 `bad_request`.
    - A reserved word (`admin`, `api`, `host`, `hosts`, `jobs`, `new`, `pricing`, `settings`, `join`) → 400 `slug_reserved`.
    - Any `org_slugs` row of another org → 409 `slug_taken`. The org's own retired slug may be reclaimed.
    - It records `orgs.slug_changed` and emits `hostpage.updated`.

    This task also replaces Task 7's `resolveSlug` stub: it looks the slug up in `org_slugs`, and returns null for an unknown slug or a deleted org. `retired` is true exactly when the slug differs from the org's current `organizations.slug` (Task 7), never from `retired_at`, so a reclaimed slug can't redirect to itself.
  - `listActivity(db, ctx, before?)` → `{ items: { at, actorLabel, action, summary }[], nextBefore }`:
    - It uses `searchAudit({ orgId, actionPrefixes: ['orgs.', 'locations.', 'hostpages.', 'listings.', 'billing.plan_changed'], before, limit: 50 })`, which finds only rows recorded with `orgId` (Global Constraints).
    - `actorLabel` is the user's display name, "Explore&Earn" for operators, or "Explore&Earn (automatic)" for system actors.
    - `summary` comes from a per-action template map.
  - `deleteOrganization(db, clerk, ctx)`: sets `deleted_at`, calls `clerk.deleteOrganization`, records `orgs.deleted` and emits `hostpage.updated`
  - `deleteHostOrganization(db, clerk, ctx, confirmName): Promise<{ redirectTo: '/onboarding' }>` (in `src/server/org-deletion.ts`):
    1. A name mismatch (trimmed, case-insensitive) → 400 `confirm_name_mismatch`.
    2. `billing.cancelSubscriptionNow`; if it fails, nothing is deleted.
    3. `listings.closeAllForOrg(db, orgId, 'host')`.
    4. `orgs.deleteOrganization`.

    `DELETE /host/org` requires the Owner (`org.delete`) and `requireReverification()`.
  - `privacyHandlers.erase`: hard-deletes the user's memberships and nulls `invited_by` and `member_assignments` for them; `export` returns memberships and invitations sent

- [ ] **Step 1: Write the failing tests.**
  - An Admin changing or removing the Owner → `forbidden`. The Owner leaving → `conflict` `owner_must_transfer`.
  - Transfer to a Recruiter → `target_not_admin`. To an Admin → exactly one `owner` membership, the org's `owner_user_id` is the new Owner, the old Owner is `admin`, and `orgs.ownership_transferred` rows exist for both.
  - Removing a member → `deleted_at` set, `removeMembership` recorded, and `org.member_removed` with `reassignToUserId` = the acting Admin. A self-leave → the Owner's ID.
  - Slugs: `'ab'` → `bad_request`; `'Kettle'` → `bad_request`; `'pricing'` → `slug_reserved`; another org's retired slug → `slug_taken`. A change retires the old slug, `resolveSlug(old)` → `{ currentSlug: new, retired: true }`, and the org can reclaim its own retired slug. After reclaiming, `resolveSlug(old)` → `{ currentSlug: old, retired: false }`, and its `org_slugs.retired_at` is null.
  - Activity, seeded through real `orgs` service calls (`updateOrg`, `createInvitation`, `changeMember`, `changeSlug`), not direct inserts: each call's audit row carries `orgId`, and all four appear. It lists `orgs.updated` but not `billing.checkout_started` (seeded with `audit.record` and that org's `orgId`, since billing is a fake here). Task 42 repeats this across real modules. An operator actor → "Explore&Earn"; a system actor → "Explore&Earn (automatic)". 51 events → 50 items and a `nextBefore`.
  - Deletion: a wrong name → `confirm_name_mismatch`. The right name → cancel and close called (fakes), `deleted_at` set, `deleteOrganization` recorded, `orgs.deleted` recorded. A failing cancel → the org isn't deleted.
- [ ] **Step 2:** Run `pnpm test src/modules/orgs src/server/org-deletion.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(orgs): member admin, ownership transfer, org deletion, slugs and activity log`.

### Task 20 (W4): Locations and geocoding

**Files:**
- Create:
  - `drizzle/1100_locations.sql`
  - `src/modules/locations/{schema.ts,geocoder.ts,geocoder.test.ts,service.ts,service.test.ts,public-point.ts,privacy.ts}`
  - Routes: `src/app/api/v1/host/locations/route.ts`, `src/app/api/v1/host/locations/geocode/route.ts`, `src/app/api/v1/host/locations/[id]/route.ts`
- Modify: `src/modules/locations/index.ts`

**Interfaces:**
- Produces:
  - **Tables:** the spec's `locations` and `location_weather` rows. Also the foreign keys `member_assignments.location_id → locations` and `organizations.primary_location_id → locations`.
  - `interface Geocoder { geocode(a: { line1: string; city: string; state: string; postalCode?: string }): Promise<{ lat: number; lng: number; matched: string }[]> }`
    - `censusGeocoder()` calls `https://geocoding.geo.census.gov/geocoder/locations/address?street=&city=&state=&zip=&benchmark=Public_AR_Current&format=json` (5 s timeout) and maps `result.addressMatches[].coordinates {x: lng, y: lat}`. An HTTP error or timeout → `[]`.
    - `stubGeocoder()` returns `[{ lat: 60.1042, lng: -149.4422, matched: '<line1>, <city>, <state>' }]`, or `[]` when `line1` contains `__nomatch__`.
  - `toPublicPoint(p, precision)`: `city` rounds both coordinates to 0.01°; `exact` keeps them.
  - `createLocation(db, ctx, i: { name; kind; address: { line1?: string; city: string; state: string; postalCode?: string }; point?: { lat; lng }; publicPrecision; timezone? }, geocoder?)` and `updateLocation(db, ctx, id, i)`:
    - The state must be in `US_STATE_CODES`, else 400.
    - A timezone must be valid IANA; it defaults to `STATE_DEFAULT_TIMEZONE[state]`.
    - Without a point, the address is geocoded, and no candidate → 400 `geocode_failed` "Drop a pin on the map instead".
    - It emits `location.updated` and records `locations.created` or `locations.updated`.
    - **Home location:** in the same transaction, `createLocation` sets `organizations.primary_location_id` to the new location when the org has none (`update app.organizations set primary_location_id = $id where id = $orgId and primary_location_id is null`). It's one guarded raw-SQL update through `queryRows`, because locations can't import orgs; W4's 1100 migration owns that column's foreign key. So an org's first location becomes the host page's home location (Task 32) without a separate `PATCH /host/org`.
  - `archiveLocation(db, ctx, id)`: records `locations.archived`, and in the same transaction clears `organizations.primary_location_id` when it pointed at this location (`… set primary_location_id = null where id = $orgId and primary_location_id = $id`).
  - `getLocations`, `listOrgLocations` (spec section 3). `Location.publicAddressLine1` is set only for `exact` precision; the private point and street address never leave host APIs otherwise.
  - **Routes:**
    - `GET /host/locations` (O/A/R): Recruiters with an assigned scope see only their locations.
    - `POST /host/locations/geocode`: 30 per minute per org.
    - `DELETE /host/locations/[id]` → 409 `location_in_use` when `listings.countActiveByLocation` > 0, else archives.
  - `privacyHandlers.erase`: sets `created_by` to null.

- [ ] **Step 1: Write the failing tests.**
  - A recorded Census fixture parses to `{ lat, lng, matched }`. An empty `addressMatches`, or a 500, → `[]`.
  - Created with point (60.10423, -149.44217) and `city` precision → public point (60.10, -149.44) and `publicAddressLine1: null`. With `exact` → the same point and the line1.
  - State `'XX'` → `bad_request`; `'GU'` → OK with timezone `Pacific/Guam`. Timezone `'Mars/Base'` → `bad_request`.
  - No point and `__nomatch__` → `bad_request` `geocode_failed`.
  - Create and update each emit `location.updated` and record audit.
  - The org's first location becomes its `primary_location_id`; a second location leaves it unchanged. Archiving the primary location sets it to null; archiving another location leaves it.
  - `getLocations` for another org's ID returns nothing from a host API call (404 through the route).
- [ ] **Step 2:** Run `pnpm test src/modules/locations`. Expected: FAIL.
- [ ] **Step 3:** Implement. The geocoder is chosen by `GEOCODER_PROVIDER`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(locations): locations with Census geocoding and public-point privacy`.

### Task 21 (W4): Weather and destinations

**Files:**
- Create: `src/modules/locations/{weather.ts,weather.test.ts,jobs.ts,destinations.ts,destinations.test.ts}`, `drizzle/1110_destinations_seed.sql`

**Interfaces:**
- Produces:
  - `interface WeatherProvider { points(lat, lng): Promise<{ forecastHourlyUrl: string; timeZone: string } | null>; firstHourlyPeriod(url): Promise<{ temperatureF: number; shortForecast: string; startTime: Date }> }`
    - `nwsWeather(userAgent)` calls `https://api.weather.gov/points/{lat},{lng}` with 4-decimal coordinates and a `User-Agent` header, then reads `forecastHourly`. Each call has a 5 s timeout; a 404 returns null.
    - `stubWeather()` returns 54, `'Partly Sunny'`.
  - `mapCondition(shortForecast): WeatherCondition`, checked in order: thunder → `storm`; snow, sleet, flurries or ice → `snow`; rain, showers or drizzle → `rain`; fog, haze or smoke → `fog`; breezy, windy or blustery → `wind`; "partly" or "mostly sunny" → `partly_cloudy`; cloudy or overcast → `cloudy`; sunny or clear → `clear`; anything else → `cloudy`
  - `locations.resolve_nws_grid` (on `location.updated`): stores `nws_forecast_url`, and replaces the timezone only when it still equals the state default. When the location's org passes the weather org filter, it then fetches `firstHourlyPeriod` once and upserts `location_weather` the same way the refresh does, so a new location shows weather without waiting for the next `*/30` tick. A null point (no grid, as in some territories) increments `failures` and returns without throwing; a failing first fetch increments `failures` and sets `last_error`, and the handler still resolves.
  - `locations.refresh_weather`:
    - It covers non-archived locations of orgs that pass the registered weather org filter (all candidate orgs when none is registered).
    - At most 5 requests run at once.
    - Success upserts `location_weather` with `failures = 0`. A failure increments `failures` and sets `last_error`.
  - `getWeather(db, ids)` omits rows with `failures > 0` or `fetched_at` older than 2 hours.
  - `listDestinations(db)` returns active destinations.
  - **Seed** `1110_destinations_seed.sql`: the 63 US national parks (`kind = 'national_park'`, with states and point) and at least 15 resort areas (for example `lake-tahoe`, `jackson-hole`, `park-city`, `vail`, `outer-banks`, `florida-keys`). Slugs match `^[a-z0-9-]+$`.

- [ ] **Step 1: Write the failing tests.**
  - `mapCondition`: `'Partly Sunny'` → `partly_cloudy`, `'Mostly Cloudy'` → `cloudy`, `'Chance Rain Showers'` → `rain`, `'Slight Chance Thunderstorms'` → `storm`, `'Snow Likely'` → `snow`, `'Patchy Fog'` → `fog`, `'Breezy'` → `wind`, `'Sunny'` → `clear`.
  - NWS: the points request path is `/points/60.1042,-149.4422` with the configured `User-Agent`, and a fixture yields the forecast URL and `America/Anchorage`. The timezone is replaced when it equals the state default and kept when the host chose another. A points 404 → no URL, `failures = 1`, and the handler resolves.
  - Creating a location, then one worker drain with the stub → `getWeather` returns `{ temperatureF: 54, condition: 'partly_cloudy', shortForecast: 'Partly Sunny' }` for it, with no refresh run. With a weather filter that excludes the org, the grid is stored and no weather row is written.
  - Refresh with the stub → `{ temperatureF: 54, condition: 'partly_cloudy', shortForecast: 'Partly Sunny' }`. A failing provider → `failures = 1`, and `getWeather` omits it. Data fetched 2 h + 1 min ago is omitted.
  - With a filter returning only org A, org B's locations aren't fetched. With 12 locations, no more than 5 provider calls are in flight.
  - Destinations: 63 rows of kind `national_park`, unique slugs, and every row has at least one state.
- [ ] **Step 2:** Run `pnpm test src/modules/locations`. Expected: FAIL.
- [ ] **Step 3:** Implement. The provider is chosen by `WEATHER_PROVIDER`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(locations): NWS weather with staleness rules and destinations seed`.

### Task 22 (W5): Listing tables, revisions, typed copies and occupations

**Files:**
- Create:
  - `drizzle/1200_listings.sql`, `drizzle/1210_occupations_seed.sql`
  - `src/modules/listings/{schema.ts,schema.test.ts,revision-columns.ts,revision-columns.test.ts,occupations.ts}`
- Modify: `src/modules/listings/index.ts`

**Interfaces:**
- Produces:
  - **Tables:** exactly the spec's `occupations`, `listings`, `listing_revisions`, `photo_slot_checks` and `link_domains` rows, with their constraints, indexes and the trigger `app.listing_revision_immutable()`. Also the foreign key `member_assignments.listing_id → listings`. There is no foreign key to `locations` (Global Constraints).
  - `toRevisionColumns(content: ListingContent, ctx: { timezone: string; publicPoint: { lat; lng }; stateCode: string }): RevisionColumns`, the typed copies from the spec table:
    - `location_id` = `where.locationId`, or `hostLocationId` for remote listings.
    - `housing_free` and `meals_free` = `cost.free`, or null when not provided.
    - The cost columns are null when free.
    - `date_mode`, start and end, season and season year come from `when.dates`.
  - `listOccupations(db)` (spec section 3)
  - **Seed:** at least 120 occupations with O\*NET-SOC 2019 codes, covering every genre, including `lift_operator`, `deckhand` (53-5011.00), `seafood_processing_worker`, `farmworker_crop` (45-2092.00) and `customer_service_representative` (43-4051.00).

- [ ] **Step 1: Write the failing tests.**
  - Updating `content` on an `approved` revision throws. `approved` → `superseded` succeeds; `approved` → `rejected` throws.
  - Inserts violating each CHECK fail: housing provided with `housing_free` null; not provided with a cost; `housing_free = false` and cost 0; `min_age = 17`; crew share without `crew_min_cents`; end before start; `pay_min_cents = 0`.
  - A listing with `state = 'draft'`, `review_stage = 'screening'` and no pending revision violates the review-stage constraint.
  - `toRevisionColumns(buildListingContent(...))` → `housing_provided: true, housing_free: false, housing_cost_cents: 15000, housing_cost_period: 'week', meals_provided: false, meals_free: null, date_mode: 'fixed', start_date: '2027-06-01'`.
  - `listOccupations` returns at least 120 entries, each category has at least 20, and every `socCode` matches `^\d{2}-\d{4}\.\d{2}$`.
- [ ] **Step 2:** Run `pnpm test src/modules/listings/schema.test.ts src/modules/listings/revision-columns.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(listings): listing and immutable revision tables, typed copies, occupations seed`.

### Task 23 (W5): Drafts, paste import and AI description

**Files:**
- Create:
  - `src/modules/listings/{drafts.ts,checklist.ts,import.ts,describe.ts,listings.draft.test.ts}`
  - Routes: `src/app/api/v1/host/listings/route.ts` (POST), `src/app/api/v1/host/listings/[id]/route.ts` (GET, DELETE), `src/app/api/v1/host/listings/[id]/draft/route.ts`, `src/app/api/v1/host/listings/[id]/ai/description/route.ts`

**Interfaces:**
- Consumes: `extract`, `write` (Task 2); `orgs.getListingAccess`, `assignListing` and `getMember` (fake); `ListingDraftSchema`, `SECTION_CONTENT_KEYS`
- Produces:
  - `createListing(db, ctx, i: { start: 'blank' } | { start: 'copy'; listingId: string } | { start: 'paste'; text: string }): Promise<{ id: string; openSection: BuilderSection | 'review' }>`:
    - Blank opens `basics`.
    - Copy duplicates the source's latest content (its draft when it was never published), removes `when.dates`, sets `applying.deadline` to null, keeps photos and question IDs, sets `copied_from_id` and opens `basics`.
    - Paste (50–20,000 characters):
      - Calls `extract({ model: 'claude-sonnet-5-5', schema: ListingDraftSchema, promptVersion: 'listing_import@1' })`.
      - Drops `housing` unless the text matches `/\b(housing|lodging|room|dorm|cabin|accommodation|bunk|berth|rv)\b/i`, and drops `meals` unless it matches `/\b(meals?|food|board|breakfast|lunch|dinner)\b/i`. Both checks run on the pasted text with every line that starts with `STUB_JSON:` removed: that line is an instruction to the stub AI provider (Task 2), not the host's words, and its JSON keys (`"housing"`, `"meals"`) would otherwise match. Real posts never contain such a line, so production behavior is the same.
      - Sets `ai_filled_fields` to every filled leaf path and `provenance = 'imported'`, records `listings.imported` and opens `basics`.
      - A failure → `new AppError('internal', "We couldn't read that post. Start blank instead.", { reason: 'ai_unavailable' })`.
    - An assigned-scope Recruiter's new listing is assigned to them.
    - It records `listings.created`.
  - `getListingForEditor(db, ctx, id)` → `{ listing, draft, draftVersion, sectionVersions, live, pending, checklist, aiFilledFields }`
  - `patchDraft(db, ctx, id, i: { section: BuilderSection; baseVersion: number; data: unknown; confirmedFields?: string[] }): Promise<{ draftVersion; sectionVersions; checklist }>`:
    - Allowed for `draft` and `active` (editing a live listing); `removed` → 409.
    - When `sectionVersions[section] ?? 0` ≠ `baseVersion` → 409 `section_conflict` with `details: { section, version, data }`, where `data` is the server's copy of that section.
    - Otherwise it replaces that section's keys, bumps the section and draft versions, sets `last_edited_by`, syncs `title` and `location_id`, and removes edited and confirmed paths from `ai_filled_fields`.
    - A location outside an assigned Recruiter's scope → 403 `location_not_in_scope`.
    - Each newly set housing or meal photo enqueues `listings.photo_slot_check` `{ mediaId, slot, listingId }` with dedupe `slot:<mediaId>:<slot>`.
  - `checklist(draft): { section: BuilderSection; complete: boolean; missing: string[] }[]`, from `ListingContentSchema.safeParse` issues grouped by section
  - `deleteListing(db, ctx, id)`: only when never published and `state = 'draft'`, else 409. It records `listings.deleted`.
  - `generateDescription(db, ctx, id, bullets: string[] /* 1–20 */): Promise<{ description }>`: `write({ model: 'claude-sonnet-5-5', maxChars: 10000 })`, with a system prompt that forbids inventing pay, housing, meals or dates. A failure → the same `internal` error as paste.
  - Every function loads the listing by `(id, ctx.orgId)` (else 404) and checks `canAccessListing` (else 404).

- [ ] **Step 1: Write the failing tests** (`listings.draft.test.ts`, failure mode 5).
  - PATCH `basics` at base 0 → section version 1. Another PATCH `basics` at base 0 → `conflict` `section_conflict` with `details.data` equal to the saved basics. PATCH `pay` at base 0 then succeeds.
  - `draft_version` rises with every PATCH, and the `title` column follows `basics.title`.
  - An assigned Recruiter's new listing appears in their `getListingAccess().listingIds`. Choosing location L2 outside their scope → `forbidden` `location_not_in_scope`.
  - Copy clears every date and the deadline, keeps the question IDs and opens `basics`.
  - Paste of exactly this text (two lines): `Deckhand wanted for the summer salmon season in Kodiak. Good pay, long days on deck, and a crew that looks out for each other.` then `STUB_JSON: {"basics":{"title":"Deckhand"},"housing":{"provided":true}}` → no `housing` in the draft, because the first line has no housing word. `ai_filled_fields` contains `basics.title`. `provenance` is `imported`. The same post with "Bunk on the boat is free." added to the first line keeps `housing`.
  - Paste with `__fail__` → `internal` with the exact message. 49 characters → `bad_request`.
  - `confirmedFields: ['basics.title']` removes the path from `ai_filled_fields`.
  - Deleting a never-published draft removes it and records `listings.deleted`. A listing with `first_published_at` → `conflict`.
  - Setting `housing.photos.bathroom` enqueues `slot:<mediaId>:bathroom` once.
  - A cross-org listing ID → `not_found`.
- [ ] **Step 2:** Run `pnpm test src/modules/listings/listings.draft.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Paste is rate-limited at 20 per hour per org and the description at 30 per hour per org, both in the routes.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(listings): per-section draft autosave, paste import and description drafting`.

### Task 24 (W5): Automatic checks

**Files:**
- Create: `src/modules/listings/{checks.ts,checks.test.ts,links.ts,links.test.ts,min-wage.ts}`, `src/app/api/v1/host/listings/[id]/checks/route.ts`

**Interfaces:**
- Consumes: `getMediaInfo`; `locations.getLocations` (fake); `getSetting`
- Produces:
  - `type Issue = { code: IssueCode; section: BuilderSection; field: string; message: string }`
  - `runListingChecks(db, i: { orgId; listing: { id; firstPublishedAt: Date | null; sourceGenre: string | null }; draft: unknown; now: Date }): Promise<{ errors: Issue[]; warnings: Issue[]; parsed: ListingContent | null }>`
  - **Blocking codes and messages:**

    | Code | When | Message |
    |---|---|---|
    | `required_missing` | a schema issue (one per field) | "This is required." or the zod message |
    | `pay_vague` | `minCents === 0`; range with `maxCents > vague_pay_range_ratio × minCents`; `crew_share` without an estimate | "Give a clear amount, or a range where the top is at most 2.5 times the bottom." |
    | `housing_cost_missing` · `meals_cost_missing` | provided without a cost | "Say what housing costs, or mark it free." · "Say what meals cost, or mark them free." |
    | `prohibited_wording` | a phrase match in any text field, screening prompt or choice, or the Additional step note | `Remove "<phrase>". You can ask about visa sponsorship instead.` |
    | `link_unsafe` | `checkLinkSyntax` fails | "Use a secure https link to a site we can check. Link shorteners aren't allowed." |
    | `end_date_past` · `deadline_past` | a fixed end date, or the deadline, is before today in the listing's timezone | "The end date has passed." · "The application deadline has passed." |
    | `location_unavailable` | the location is missing, another org's, or archived | "Choose one of your current locations." |
    | `photo_unavailable` | media not owned by the org, the wrong kind, or `rejected`/`blocked` | "Choose another photo." |
    | `genre_invalid` | not in `listings.genres`, a different category, or inactive (unless the listing is published or its source had that genre) | "Choose a genre for this category." |

  - **Warning codes:**
    - `pay_below_min_wage`: `hourlyPayCents(pay, weeklyHours)` < `min_wage_cents_by_state[state]`, or `FEDERAL_MIN_WAGE_CENTS` for remote. Message: `This looks below the minimum wage in <state>. Check it before you publish.`
    - `photo_slot_mismatch`: a `photo_slot_checks` row with result `mismatch` for a referenced photo. Message: `This doesn't look like a <slot label in lowercase>.` (for example "This doesn't look like a bathroom.").
  - `ackKey(issue)`: `photo_slot_mismatch:<slot>` for photo mismatches, otherwise the code
  - `hourlyPayCents(pay, weeklyHours): number | null`: `hour` → min; `week` → min ÷ hours; `month` → min × 12 ÷ 52 ÷ hours; `year` → min ÷ 52 ÷ hours; `day`, `season` and `crew_share` → null
  - `normalizeForPhraseMatch(s)`: NFKC, lowercase, remove `.`, collapse every whitespace run (including non-breaking spaces) to one space, trim. A match requires word boundaries on both sides.
  - `checkLinkSyntax(url, lists: { blocked: string[]; shorteners: string[] }): { ok: true; host: string } | { ok: false }`:
    - `new URL` must succeed with protocol `https:`, no username or password, no port, and a hostname that isn't an IPv4 or IPv6 literal.
    - The host is lowercased and stripped of a trailing dot.
    - It fails when the host equals a list entry or ends with `.<entry>`.
  - `POST /host/listings/[id]/checks` → `{ errors, warnings, slot: getCapacity(orgId, 'listing_slot') }`

- [ ] **Step 1: Write the failing tests** (`checks.test.ts`, `links.test.ts`), each asserting the exact `code`, `section` and `field`.
  - `pay_vague` for min 0; for range 1000–2600 (2500 passes); and for crew share with a null estimate.
  - `housing_cost_missing`, `meals_cost_missing`.
  - `prohibited_wording` at `job.description` for "US citizens only." **(Review Focus 2)** It also fires for `"US  citizens only"` (two spaces), `"US citizens only"` (a non-breaking space, written as this JS escape in the test), `"U.S. CITIZENS ONLY"` and `"ＵＳ citizens only"`. `"focus on citizens' only needs"` doesn't match.
  - `link_unsafe` for `http://a.com`, `https://u:p@a.com`, `https://1.2.3.4/`, `https://[::1]/`, `https://a.com:8443/` and `https://bit.ly/x`. **(Review Focus 3)** It also fires for `https://BIT.LY/x`, `https://bit.ly./x` and `https://go.bit.ly/x`, and for `https://bücher.example/` when `links.blocked_domains` = `['xn--bcher-kva.example']`. `https://kettle.com/apply` passes.
  - `end_date_past` for an end date of yesterday; `deadline_past`.
  - `location_unavailable` for an archived location; `photo_unavailable` for another org's media and for a `rejected` one; `genre_invalid` for `commercial_fishing` under Seasonal.
  - `pay_below_min_wage` for a weekly pay of $500 at 40 h in WA. None in a state whose minimum is ≤ 1250. A remote listing compares with 725. A `day` unit is skipped.
  - A `photo_slot_checks` mismatch for the bathroom → a warning with message "This doesn't look like a bathroom." and `ackKey` `photo_slot_mismatch:bathroom`.
  - The complete fixture → no errors, no warnings, and `parsed` set.
- [ ] **Step 2:** Run `pnpm test src/modules/listings/checks.test.ts src/modules/listings/links.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(listings): blocking checks and warnings with exact issue codes`.

### Task 25 (W5): Publish, slots and team approval

**Files:**
- Create:
  - `src/modules/listings/{publish.ts,publish.test.ts,slots.ts,team.ts,notifications.ts}`
  - `src/app/api/v1/host/listings/[id]/publish/route.ts`, `src/app/api/v1/host/listings/[id]/approval/route.ts`

**Interfaces:**
- Consumes: `runListingChecks` (Task 24); entitlements `withCapacity` and `registerUsageCounter` (fake that uses the real counter); `billing.getSubscriptionState` (fake); `verification.getVerificationStatus` (fake); `orgs.getOrgSummaries` and `listMembers` (fake); `emit`; `notify`
- Produces:
  - **Slot counter:** registers `listing_slot` = listings with `state in ('in_review','active')`, at module load from a file `listings/index.ts` imports (Global Constraints).
  - `requestPublish(db, ctx, id, acknowledgedWarnings: string[]): Promise<{ state: ListingState; reviewStage: string | null }>`, following spec 8.3 step 1:
    1. Org not `active` → 409 `org_suspended`. Not entitled → `not_entitled`. `past_due` → `past_due`. Verification `failed` → `verification_failed`.
    2. Errors, or warnings whose `ackKey` isn't acknowledged → 400 `bad_request` with `details.issues`.
    3. State `in_review`, or a pending revision → 409 `already_in_review`. `closed` or `removed` → 409 `not_publishable`.
    4. Inside `withCapacity(tx, orgId, 'listing_slot', state === 'active' ? 0 : 1)`:
       - Insert the revision with `status = 'screening'`, `toRevisionColumns`, the timezone of the location (or the remote host location), `acknowledged_warnings`, `submitted_by` and `submitted_at`.
       - Set the draft to the parsed content.
       - A new listing becomes `in_review`; an edit gets `pending_revision_id`.
       - The stage is `team_approval` for a Recruiter when `requireRecruiterApproval` is on, else `screening`. Screening enqueues `listings.screen` `{ revisionId, attempt: 0 }` with dedupe `screen:<revisionId>`; team approval notifies `listings.approval_requested` to Owner and Admins.
       - Record `listings.publish_requested`, then call `kickWorker()` after commit.
  - `decideApproval(db, ctx, id, decision: 'approve'|'return', note?)`: approve → stage `screening` and enqueue the screen; return → `rejectRevision(..., ['returned_by_team'])` and notify `listings.approval_decided` to the submitter. It records `listings.approval_decided`.
  - `publishRevision(tx, revisionId, now)`, in one transaction:
    - The revision becomes `approved` (with `decided_at`), and the previous published revision `superseded`.
    - The listing becomes `active` with `published_revision_id`, no pending revision, no stage, and `published_at = now`. `first_published_at` is set only if empty. `auto_close_at` = `computeAutoCloseAt` (Task 27), and `next_reminder_at` = `nextReminderAt(first_published_at, reminders_sent)`.
    - It emits `listing.published { first }` on the first publish, else `listing.changed`, records `listings.published` and notifies `listings.live`.
  - `rejectRevision(db, revisionId, reasons: string[], now)`: the revision becomes `rejected`. A never-live listing returns to `draft` (freeing its slot); an edit clears the pending revision and keeps the live one. It records `listings.revision_rejected` and notifies `listings.returned` with `{ reasons, href: '/host/listings/<id>' }`.
  - `listingTeamUserIds(db, listing): Promise<string[]>`: the creator plus the `notifyMemberIds` (membership IDs), among live members who can access the listing
  - **Notification types** (`notifications.ts`): the nine `listings.*` rows of spec section 6, with their categories, channels and recipients. Email types use `HostNotice`. The `listings.in_review` title is "We're taking a closer look"; `listings.still_hiring` asks "Still hiring?" with buttons Yes, Edit and Close linking to `/host/listings/<id>`.

- [ ] **Step 1: Write the failing tests** (`publish.test.ts`).
  - Each of `org_suspended`, `not_entitled`, `past_due` and `verification_failed` is returned from the matching fake state.
  - A blocking issue → `bad_request` whose `details.issues[0].code` is that code. An unacknowledged `pay_below_min_wage` → `bad_request`; acknowledged → proceeds.
  - A new listing → `state: 'in_review'`, `reviewStage: 'screening'`, a revision in `screening`, an outbox row `screen:<rev>`, and `listings.publish_requested` recorded.
  - Editing an active listing → still `active`, a pending revision, and the capacity check called with `adding: 0`.
  - **(Row 5, unit)** Slot limit 2 with 2 slot holders → a third publish → `conflict` `listing_slot_limit`.
  - A Recruiter with approval on → `team_approval`, no screen job, and `listings.approval_requested` rows for Owner and Admins. Approve → `screening` and a screen job. Return → `draft`, the revision `rejected`, and `listings.approval_decided` for the Recruiter.
  - Publishing while pending → `conflict` `already_in_review`.
  - `publishRevision` on the first publish emits `listing.published` with `first: true`, sets `first_published_at`, and sets `next_reminder_at` = publish + 30 days. A second (edit) publish emits `listing.changed`, keeps `first_published_at`, and supersedes the first revision.
  - `rejectRevision` on a never-live listing → `draft`, and the slot counter drops by 1.
- [ ] **Step 2:** Run `pnpm test src/modules/listings/publish.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(listings): publish under slot capacity, team approval, revision decisions`.

### Task 26 (W5): Screening pipeline and subject handlers

**Files:**
- Create:
  - `src/modules/listings/{screening.ts,screening.test.ts,link-safety.ts,link-safety.test.ts,subjects.ts,subjects.test.ts,review-request.ts}`
  - `src/app/api/v1/host/listings/[id]/request-review/route.ts`

**Interfaces:**
- Consumes: `publishRevision` and `rejectRevision` (Task 25); `runCheck`, `openReviewItem`, `openAppeal`, `listOpenReviewItems` and `registerSubjectHandlers`; `getMediaInfo` and `readMediaVariant`; `verification.startVerification` and `openVerificationAppeal` (fake); `billing.sanctionOrg` (fake)
- Produces:
  - `interface LinkSafety { lookup(url: string): Promise<'safe'|'flagged'|'unreachable'> }`
    - `webRisk(key)` calls `GET https://webrisk.googleapis.com/v1/uris:search?threatTypes=MALWARE&threatTypes=SOCIAL_ENGINEERING&threatTypes=UNWANTED_SOFTWARE&uri=<url>&key=<key>`. A `threat` → `flagged`, `{}` → `safe`, and a network error or 5xx → `unreachable`.
    - `stubLinkSafety()`: a URL containing `__flag__` → `flagged`, `__down__` → `unreachable`, otherwise `safe`.
  - `domainStatus(db, host, url, ls): Promise<'allowed'|'blocked'|'unknown'>`: uses a `link_domains` row younger than 30 days, otherwise looks up and upserts (`flagged` → `blocked`, `unreachable` → `unknown`, `safe` → `allowed`)
  - The `listings.screen` handler, `{ revisionId, attempt, wait? }`, runs spec 8.3 steps 2–6. It is a no-op unless the revision is `screening`.
    - **Verification:** `unverified` → `startVerification` and stage `verification`. `running`, `needs_review` or `needs_info` → stage `verification` and stop. `failed` → reject `verification_failed`.
    - **Media:** `rejected` or `blocked` → reject `photo_rejected`. `uploaded` or `scanning` → re-enqueue `{ attempt + 1 }` at +30 s with dedupe `screen:<rev>:<attempt+1>`, up to attempt 20, then moderation with reason `media_timeout`. `in_review` media waits for its operator (spec 8.3 step 3) and never times out: the handler re-enqueues `{ attempt, wait: wait + 1 }` at +5 minutes with dedupe `screen:<rev>:<attempt>:w<wait+1>`, without counting toward the 20 tries and without opening a `media_timeout` item. Once the operator approves the media, the next run continues; a rejection returns the revision with `photo_rejected`.
    - **Link:** `blocked` → reject `link_unsafe`; `unknown` → moderation `link_unknown`.
    - **AI:** `listing_moderation` (queue `moderation`) and `listing_fraud` (queue `fraud`) run in parallel over `listingCheckText(content, org)`, with subject `listing_revision`. A fraud rejection also opens `{ queue: 'fraud', subjectType: 'organization', subjectId: orgId, priority: 100, reason: 'listing_fraud_rejected' }`.
    - **Decision:** all approved with no acknowledged photo mismatch → `publishRevision`. Any `needs_review` or kept mismatch (opening `{ queue: 'moderation', reason: 'photo_slot_mismatch_kept' }` when no item exists yet) → stage `moderation`, revision `in_review` and `listings.in_review`. Any rejection → `rejectRevision` with the labels. It stores `trust_check_ids` and a `checks` summary.
  - The `listings.photo_slot_check` handler, `{ mediaId, slot, listingId, attempt? }`: waits on media as above, then `runCheck({ kind: 'photo_slot', reviewQueue: null, subjectType: 'media', subjectId: mediaId, image: readMediaVariant(…, 640), text: <slot label> })`. It upserts `photo_slot_checks`: `rejected` → `mismatch`, `approved` → `match`, `classifier_error` → `error`.
  - The `listings.resume_screening` handler (`verification.decided`): for the org's revisions at stage `verification`, `verified` → enqueue the screen; `failed` → reject `verification_failed`.
  - **Subject handlers:**
    - `listing_revision`:
      - approve → when `listOpenReviewItems` has nothing besides `data.reviewItemId`, publish. A rejected revision is re-checked under `withCapacity` (no slot → it stays rejected and `listings.returned` carries `listing_slot_limit`).
      - remove → reject `moderation`.
      - ask_info → reject with `data.note`.
      - suspend or ban → `billing.sanctionOrg`.
    - `listing`:
      - approve → no-op.
      - remove → `removed` with `removed_at`, freeing the slot, emitting `listing.removed`, recording `listings.removed` (with `reviewItemId`), and notifying `listings.removed` to the listing team plus Owner and Admins.
      - ask_info → `listings.returned` with the note.
      - suspend or ban → `sanctionOrg`.
  - `requestReview(db, ctx, id, note /* ≤ 1,000 */)`:
    - A removed listing → `openAppeal({ originalItemId: <reviewItemId from the listings.removed audit event>, reason: note })`.
    - A latest revision rejected for `verification_failed` → `verification.openVerificationAppeal`.
    - Otherwise → `openReviewItem({ queue: 'moderation', subjectType: 'listing_revision', subjectId: <latest rejected revision>, reason: 'host_requested_review' })`.

    The route is rate-limited at 5 per hour per org.

- [ ] **Step 1: Write the failing tests.**
  - `__flag__` in the description → stage `moderation`, revision `in_review`, and a `listings.in_review` row. `__block__` → `draft`, and `listings.returned` with the reasons.
  - A fraud rejection opens an org item in `fraud` with priority 100.
  - Media `scanning` → re-enqueued with dedupe `screen:<rev>:1`, available at +30 s. Once the media is set `approved`, the next run publishes. Still scanning at attempt 20 → `moderation` with an item reason `media_timeout`. Rejected media → returned `photo_rejected`.
  - Media `in_review` at attempt 20 → re-enqueued with dedupe `screen:<rev>:20:w1` at +5 minutes, the revision still `screening`, and no `media_timeout` item. After the media is set `approved`, the next run publishes.
  - Link with `__down__` → `link_domains` status `unknown` and `moderation`. `__flag__` → returned `link_unsafe`. An `allowed` row 10 days old → no lookup; 31 days old → looked up again.
  - Verification `unverified` → `startVerification` called and stage `verification`. `resume_screening` with `verified` → a screen job; with `failed` → `draft` and reason `verification_failed`.
  - Two open items (moderation and fraud both `__flag__`): approving the first leaves `in_review`; approving the second → `active`.
  - An acknowledged `photo_slot_mismatch:bathroom` with clean checks → `moderation` and reason `photo_slot_mismatch_kept`.
  - `photo_slot_check` with a mocked `runCheck` returning `rejected` → a `mismatch` row. A classifier error → `error`.
  - Subject `listing` remove → `removed`, the slot counter down by 1, `listing.removed` in the outbox (when subscribers exist), and `listings.removed` rows for the team and the Owner. Ban → `sanctionOrg` called with `'ban'`.
  - `requestReview`: a returned revision → a moderation item; a removed listing → an appeals item whose `original_item_id` is the removing item; `verification_failed` → `openVerificationAppeal` called.
  - Web Risk with mocked fetch: a `threat` body → `flagged`, `{}` → `safe`, a thrown error → `unreachable`.
- [ ] **Step 2:** Run `pnpm test src/modules/listings/screening.test.ts src/modules/listings/subjects.test.ts src/modules/listings/link-safety.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Link safety is chosen by `LINK_SAFETY_PROVIDER`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(listings): screening pipeline with verification, media wait, link safety and AI checks`.

### Task 27 (W5): Lifecycle: reminders, auto-close, deadlines and repost

**Files:**
- Create:
  - `src/modules/listings/{time.ts,time.test.ts,lifecycle.ts,repost.ts,listings.lifecycle.test.ts}`
  - Routes: `src/app/api/v1/host/listings/[id]/close/route.ts`, `src/app/api/v1/host/listings/[id]/confirm-active/route.ts`, `src/app/api/v1/host/listings/[id]/repost/route.ts`

**Interfaces:**
- Produces:
  - `zonedMidnightAfter(date: string /* YYYY-MM-DD */, timeZone: string): Date`: the UTC instant of 00:00 local time on the day after `date`. Algorithm: `guess = Date.UTC(y, m, d + 1)`; `offset1 = tzOffsetMs(guess, tz)`; `t = guess − offset1`; `offset2 = tzOffsetMs(t, tz)`; return `offset2 === offset1 ? t : guess − offset2`. Here `tzOffsetMs` comes from `Intl.DateTimeFormat(..., { timeZone, hourCycle: 'h23', ...numeric parts })`.
  - `computeAutoCloseAt(when, tz)`: `fixed` → `zonedMidnightAfter(end, tz)`; `season` and `ongoing` → null
  - `computeApplicationsCloseAt(deadline, tz)`: `zonedMidnightAfter(deadline, tz)`, or null
  - `nextReminderAt(firstPublishedAt, remindersSent)`: + 30, 60 and 90 days for 0, 1 and 2 reminders sent, then + 90 × (n − 1) days (n = 3 → 180, n = 4 → 270)
  - `shiftListingDates(content: ListingDraft, today: string): ListingDraft`:
    - It finds the smallest k ≥ 1 such that the shifted end date (fixed), start date (ongoing with a start), or season end is after `today`. The season end is May 31, Aug 31, Nov 30, the last day of Feb of the next year (winter), or Dec 31 (`year_round`).
    - It shifts every date, the season year and the deadline by k years; Feb 29 becomes Feb 28 in a non-leap year.
  - `closeListing(db, ctx, id)` (active only): `closed` with `close_reason = 'host'`, any pending revision rejected, `listing.closed` emitted and `listings.closed` recorded
  - `confirmActive(db, ctx, id)`: sets `confirmed_active_at` and records `listings.confirmed_active`
  - `repostListing(db, ctx, id, now)`: `removed` → 409 `conflict`. It copies the latest approved content forward into a new draft with `reposted_from_id`, keeping photos and question IDs, records `listings.reposted` and returns `{ id, openSection: 'review' }`.
  - `canAcceptApplications(db, id, now?)` (spec section 3): not `active` → `not_active`; org not active or deleted → `org_inactive`; `now >= applicationsCloseAt` → `deadline_passed`
  - **Schedule handlers:**
    - `listings.still_hiring_sweep`: for each active listing with `next_reminder_at <= now`, a guarded `update … where reminders_sent = $n` increments `reminders_sent`, notifies `listings.still_hiring` and sets the next `nextReminderAt`.
    - `listings.auto_close`: active listings with `auto_close_at <= now` become `closed` with `end_date`, emit `listing.closed` and notify `listings.auto_closed`.
    - `listings.repost_reminders`: non-active, non-removed listings with `first_published_at`, whose month and day equal today + 56 days (Feb 29 → Feb 28), with no listing reposted from them in the last 12 months and `repost_reminded_year` ≠ this year. They notify `listings.repost_reminder` to Owner and Admins and set `repost_reminded_year`.

- [ ] **Step 1: Write the failing tests** (`time.test.ts`, `listings.lifecycle.test.ts`, row 8).
  - `zonedMidnightAfter('2027-08-31', 'Pacific/Honolulu')` → `2027-09-01T10:00:00Z`; `'America/Anchorage'` → `2027-09-01T08:00:00Z`; `'America/New_York'` → `2027-09-01T04:00:00Z`. **(Review Focus 4)** `('2027-03-13', 'America/New_York')` → `2027-03-14T05:00:00Z`, and `('2027-11-06', 'America/New_York')` → `2027-11-07T04:00:00Z`.
  - Season `summer` 2027 and `year_round` → `computeAutoCloseAt` null.
  - With a listing first published at `FIXED_NOW`, sweeps run at days 29, 30, 30 again, 60, 90, 179, 180 and 270 send exactly 5 `listings.still_hiring` notifications, at 30, 60, 90, 180 and 270. Calling `confirmActive` at day 31 doesn't change `next_reminder_at`.
  - The Honolulu listing is still `active` after a sweep at `2027-09-01T09:59:00Z`, and `closed` with `end_date` after `10:00:00Z`.
  - A deadline of `2027-05-01` (Honolulu): at `2027-05-02T10:00:00Z`, `canAcceptApplications` → `deadline_passed`, the listing is still `active` and still counted by the slot counter. A closed listing → `not_active`; a suspended org → `org_inactive`.
  - `shiftListingDates` with fixed 2025-06-01 to 2025-09-01 and today 2027-02-01 → 2027-06-01 to 2027-09-01. Start 2024-02-29 with k = 1 → 2025-02-28. A season `summer` 2026 with today 2026-10-01 → 2027. The deadline moves by the same k.
  - Repost keeps question IDs and photo IDs and returns `openSection: 'review'`. Reposting a `removed` listing → `conflict`.
  - Repost reminder: first published 2026-03-01 and closed → a notification on 2027-01-04. The same day again → none. With a repost created 2026-12-01 → none.
  - `closeListing` drops the slot counter by 1 and emits `listing.closed` with reason `host`.
- [ ] **Step 2:** Run `pnpm test src/modules/listings/time.test.ts src/modules/listings/listings.lifecycle.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(listings): reminders, timezone-correct auto-close, deadlines and repost`.

### Task 28 (W5): Reads, slot enforcement, list API, providers and the Home summary

**Files:**
- Create:
  - `src/modules/listings/{read.ts,read.test.ts,enforce.ts,enforce.test.ts,providers.ts,list.ts,list.test.ts,home.ts,home.test.ts,privacy.ts}`
- Modify: `src/app/api/v1/host/listings/route.ts` (adds GET)

**Interfaces:**
- Consumes: `billing.getSubscriptionState`, `getPendingKeepList` and `settlePendingChange` (fake); `entitlements.getCapacity`, `getBalance` and `lockOrg` (fake); `verification.getVerificationStatus` (fake)
- Produces:
  - **Reads (spec section 3):** `getPublishedListing`, `getRevision`, `listActiveListings` (keyset by `id`), `getListingSummaries` (returns every state, `closed` and `removed` included). (`listOccupations` is from Task 22 and `normalizeSkill` from Task 8.) **Additions (Task 7):** `countActiveByLocation`, `getOrgListingStats` and `getOrgListingFacts`.
  - `enforceSlotLimit(db, orgId)` under `lockOrg`:
    - **Not entitled:** every active listing closes with `lapsed`; in-review listings that were never live return to `draft`; pending edits are rejected.
    - **Entitled with holders > limit:** keep the valid `getPendingKeepList` IDs (at most the limit). Otherwise keep the earliest `first_published_at` (nulls last; ties by `id`). The rest close with `downgrade`, and never-live ones return to `draft`. When at least one closed, notify billing contacts with `billing.plan_changed` `{ closed: [titles] }`.
    - Always call `settlePendingChange` last.
    - **Every listing it closes** gets, in the same transaction, `closed_at`, `close_reason`, an emitted `listing.closed { listingId, orgId, revisionId: <published_revision_id>, reason }` (`lapsed` or `downgrade`) and a recorded `listings.closed` (with `orgId` and the reason). SP3 projects search from that event, so a lapsed host's listings leave search when the job runs, not at the next daily drift check (spec failure mode 1). Listings that return to `draft` were never live and emit nothing.

    The `listings.enforce_slot_limit` handler calls it.
  - `closeAllForOrg(db, orgId, reason)`: closes every active listing with that reason, and for each one emits `listing.closed { listingId, orgId, revisionId, reason }` and records `listings.closed`, in the same transaction, exactly as `enforceSlotLimit` does. The `listings.close_for_org` handler calls it for `suspended` or `banned` with `org_suspended`, and does nothing for `active`; org deletion (Task 19) calls it with `host`.
  - `registerListingStatsProvider` and `registerListingRowBadgeProvider` (spec section 3): stats from every provider are merged per ID, and `stats` is null when no provider is registered
  - `listOrgListings(db, ctx, i: { tab: 'active'|'drafts'|'library'; q?: string; locationId?: string; before?: string }): Promise<{ items: ListingRow[]; nextBefore: string | null; slots: { used; limit } }>`:
    - Page size 25, newest first.
    - Active = `active` + `in_review`; Drafts = never published and `draft`; Library = everything with `first_published_at`.
    - The Recruiter scope filters rows; `q` is a case-insensitive title match.
  - `ListingRow = { id; title; state; reviewStage; locationId; firstPublishedAt; publishedAt; closedAt; closeReason; confirmedActiveAt; hasUnpublishedChanges: boolean; stats: ListingStats | null; badge: { label; href } | null }`, where `hasUnpublishedChanges` = published and `draft <> live content`
  - `getHomeSummary(db, ctx)` (spec section 3 and the section 7 Home row), with these reminders:

    | Kind | When | Title | Link |
    |---|---|---|---|
    | `still_hiring` | the latest reminder unanswered (`confirmed_active_at` before it) | `Still hiring for <title>?` | `/host/listings/<id>` |
    | `approval` | O/A only; listings at `team_approval` | `<title> is waiting for your approval` | the listing |
    | `verification` | O/A only; status `needs_info` | "We need a little more information to verify your business" | `/host/settings/verification` |
    | `payment` | O/A/B; `past_due` | "Your last payment didn't go through" | `/host/billing` |
    | `repost` | O/A; `repost_reminded_year` = this year and not reposted since | `Time to repost <title>?` | the listing |

    Recruiters see only listings in their scope. Billing members get only the quota and payment reminders. `setup` = `{ location: listOrgLocations non-empty, plan: entitled, firstListing: any first_published_at }`.
  - `privacyHandlers.erase`: sets `created_by`, `last_edited_by` and `submitted_by` to null; `export` returns the listings the user created

- [ ] **Step 1: Write the failing tests.**
  - Enforce: 3 holders A, B and C (by `first_published_at`), limit 2, keep list [B, C] → A `closed` with `downgrade`, and `settlePendingChange` called. With no keep list → C closes; with equal timestamps, the higher `id` closes. An over-limit never-live in-review listing → `draft`.
  - The downgrade closure writes exactly one `listing.closed` envelope for A, with `reason: 'downgrade'` and A's `published_revision_id`, and one `listings.closed` audit row with `orgId`; the listing returned to `draft` writes neither. (SP2 lists no subscriber for `listing.closed`, so the test mocks `@/server/event-subscribers` with one test topic for it and counts that topic's outbox rows.)
  - Not entitled → all `closed` with `lapsed`, each with its `listing.closed` (`lapsed`) and `listings.closed`. `past_due` and entitled → nothing closes.
  - `close_for_org` with `suspended` → every active listing `closed` with `org_suspended`, each with its `listing.closed` (`org_suspended`) and `listings.closed`; with `active` → no change and no event.
  - Tabs: Active includes `in_review`; Drafts excludes ever-published listings; Library includes closed and removed listings. An assigned Recruiter sees only scoped rows; `q: 'lift'` matches "Lift Operator".
  - Two stats providers returning `{ views }` and `{ applications }` merge. A badge provider attaches `{ label, href }`. With no providers, `stats` and `badge` are null.
  - `getListingSummaries` returns `closed` and `removed`. `listActiveListings({ limit: 2 })` over 3 listings → 2 items and a `next`, then 1.
  - Home: the Owner gets `still_hiring`, `approval` and `payment`; a scoped Recruiter gets only their `still_hiring`; Billing gets only `payment` and the quota. `setup.firstListing` flips after the first publish.
- [ ] **Step 2:** Run `pnpm test src/modules/listings/{read,enforce,list,home}.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/listings`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(listings): read APIs, slot enforcement, listing tabs, providers and Home summary`.

### Task 29 (W6): SSRF-safe fetch and verification signals

**Files:**
- Create: `drizzle/1400_verification.sql`, `src/modules/verification/{schema.ts,safe-fetch.ts,safe-fetch.test.ts,signals.ts,signals.test.ts}`

**Interfaces:**
- Consumes: `billing.getCardChecks` (fake); `orgs.getOrgSummaries` and `listMembers` (fake); `locations.listOrgLocations` (fake); `getSetting`
- Produces:
  - **Table:** the spec's `business_verifications` row, with `trigger_listing_id` nullable for re-runs.
  - `isPublicAddress(ip: string): boolean`: false for loopback, private (10/8, 172.16/12, 192.168/16), link-local (169.254/16, fe80::/10), CGNAT (100.64/10), unique-local (fc00::/7), multicast, unspecified, and IPv4-mapped forms of any of these
  - `type Transport = (address: string, url: URL, timeoutMs: number) => Promise<{ status: number; headers: Record<string, string>; body: AsyncIterable<Uint8Array> }>`. The default connects to `address` with node `https.request` and SNI set to `url.hostname`.
  - `safeFetchText(url, deps?: { resolve?: (host: string) => Promise<string[]>; transport?: Transport; timeoutMs?: 5000; maxBytes?: 1_000_000; maxRedirects?: 3 }): Promise<{ status: number; finalUrl: string; text: string }>`:
    - HTTPS on port 443 only. Every resolved address must be public.
    - The connection uses the vetted address (node `https.request` with a custom `lookup`), so DNS rebinding can't swap it.
    - It follows at most 3 redirects, re-checking each one.
    - It stops reading at 1 MB and has a 5 s total timeout.
    - The text has `script` and `style` removed, tags stripped, whitespace collapsed, and is cut to 5,000 characters.
  - `type SignalDeps = { fetchText: typeof safeFetchText; rdapRegisteredAt: (domain: string) => Promise<Date | null>; now: Date }`. The defaults are `safeFetchText` and an RDAP client with a 5 s timeout.
  - `collectSignals(db, orgId, deps: SignalDeps): Promise<VerificationSignals>`, with `VerificationSignals = { emailDomain: string | null; freeEmail: boolean; disposableEmail: boolean; websiteReachable: boolean | null; domainMatch: boolean | null; domainAgeDays: number | null; cvcCheck: string | null; postalCheck: string | null; hasCard: boolean; locationInUs: boolean; blockedDomain: boolean; websiteText: string | null }`:
    - `freeEmail` uses `FREE_EMAIL_DOMAINS` (gmail.com, yahoo.com, outlook.com, hotmail.com, live.com, msn.com, icloud.com, me.com, aol.com, proton.me, protonmail.com, gmx.com, mail.com, yandex.com).
    - `disposableEmail` uses `disposable-email-domains`.
    - `domainMatch` compares the email domain with the website host minus `www.`.
    - `domainAgeDays` comes from the `registration` event of `https://rdap.org/domain/<d>`; any failure → null.
  - `hardFlags(s): ('blocked_domain'|'disposable_email'|'cvc_failed')[]`

- [ ] **Step 1: Write the failing tests.**
  - `isPublicAddress` is false for `127.0.0.1`, `10.1.2.3`, `172.16.0.1`, `192.168.1.1`, `169.254.169.254`, `100.64.0.1`, `0.0.0.0`, `224.0.0.1`, `::1`, `fc00::1`, `fe80::1` and `::ffff:127.0.0.1`. It is true for `93.184.216.34` and `2606:4700::1111`.
  - With a fake transport: `http://a.com` is refused; `https://a.com:8443` is refused; a host resolving to `10.0.0.5` is refused; a redirect to `http://` or to a private-resolving host is refused; a 4th redirect is refused; a 2 MB body yields text from at most 1,000,000 bytes; a transport that never answers rejects after 5 s (fake timers). The extracted text excludes `<script>` content and is ≤ 5,000 characters.
  - Signals: owner `maya@gmail.com` → `freeEmail: true`. `x@mailinator.com` → `disposableEmail: true`. `maya@kettle.com` with website `https://www.kettle.com` → `domainMatch: true`. An RDAP fixture registered 2019-05-01 gives `domainAgeDays` measured from `FIXED_NOW`; an RDAP 500 → null. `verification.blocked_domains = ['kettle.com']` → `blockedDomain: true`.
  - `hardFlags` with a blocked domain, a disposable email and `cvcCheck: 'fail'` → all three codes.
- [ ] **Step 2:** Run `pnpm test src/modules/verification`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(verification): SSRF-safe website fetch and business signals`.

### Task 30 (W6): Verification run, decisions, prompts and handlers

**Files:**
- Create:
  - `src/modules/verification/{run.ts,decide.ts,subjects.ts,notifications.ts,verification.test.ts,privacy.ts}`
  - `src/app/api/v1/host/verification/route.ts`, `src/app/api/v1/host/verification/info/route.ts`
- Modify: `src/modules/trust/prompts/{listing_moderation,listing_fraud,business_verification,photo_slot}.ts` (real prompts at version `<kind>@1`)

**Interfaces:**
- Consumes: `collectSignals` and `hardFlags` (Task 29); `runCheck`, `openReviewItem`, `openAppeal` and `registerSubjectHandlers`; `orgs.setVerificationStatus` (fake); `billing.sanctionOrg` (fake); `emit`
- Produces:
  - `startVerification(db, orgId, triggerListingId)`: a no-op if a `running`, `needs_review` or `needs_info` verification exists. Otherwise it inserts a `running` row, sets the org status to `running`, enqueues `verification.run` `{ verificationId }` with dedupe `verify:<id>`, and records `verification.started`.
  - The `verification.run` handler, following spec 8.4:
    - **With hard flags:** `runCheck({ kind: 'business_verification', reviewQueue: null, subjectType: 'organization', subjectId: orgId, text })`, then its own `openReviewItem({ queue: 'fraud', priority: 100, reason: 'hard_flags:<codes>' })`, and status `needs_review`.
    - **Without:** `reviewQueue: 'fraud'`. `approved` with a card → `verified` (`decided_by: 'auto'`). `approved` without a card → a fraud item `no_card` and `needs_review`. `needs_review` → `needs_review`.
    - It stores `signals`, `check_id` and `review_item_id`.
    - `verified`, and later every operator decision, emits `verification.decided`, records `verification.decided` and notifies `verification.decided`. A re-run (`trigger_listing_id` null) never lowers an org that is already `verified`, because spec 8.4 keeps live listings up unless an operator acts.
  - `getVerificationStatus` (spec section 3), plus `requestReverification`, `openVerificationAppeal`, `getVerificationDetails(db, orgId)` → `{ status, infoRequest }`, and `submitVerificationInfo(db, ctx, { text /* ≤ 2,000 */, websiteUrl? })` → `needs_review` with a new fraud item `info_provided`
  - `VERIFYING_COPY = "We're verifying your business. This usually takes a few hours."`
  - **Subject handler `organization`** (spec section 6 row): approve → `verified`; remove → `failed`; ask_info → `needs_info` with `info_request = data.note` and the mandatory `verification.needs_info` notification; suspend or ban → `billing.sanctionOrg`.
  - **Notification types:** `verification.needs_info` (mandatory) and `verification.decided`, category `account`, in-app and email, to Owner and Admins
  - **Prompts:** each exports `{ version: '<kind>@1', system }` and treats the host text as data. `photo_slot` receives the slot label and scores the probability of a mismatch. `listing_fraud` also gets pay versus occupation and the org signals.

- [ ] **Step 1: Write the failing tests** (`verification.test.ts`).
  - A clean org with a card and the stub → `verified`, `verification.decided` in the outbox with `{ status: 'verified' }`, the audit recorded, and the org status `verified`.
  - No card → a fraud item reason `no_card` and `needs_review`.
  - A disposable email → a fraud item with priority 100 and reason `hard_flags:disposable_email`, and the check made with `reviewQueue: null`.
  - **(Failure mode 4)** The classifier throws → a fraud item and status `needs_review`, never `failed`. `getVerificationDetails` says `needs_review`.
  - `__block__` website text → `needs_review`, not `failed`.
  - Handler approve → `verified` with `decided_by: 'operator'`. Remove → `failed` and `verification.decided { status: 'failed' }`. Ask info → `needs_info` and a `verification.needs_info` row. Suspend → `sanctionOrg('suspend')`.
  - `submitVerificationInfo` → `needs_review` and an `info_provided` item. A 2,001-character text → `bad_request`.
  - `startVerification` twice while running → one row.
  - `requestReverification` on a `verified` org with a new hard flag → a fraud item, and the org stays `verified`.
  - `openVerificationAppeal` → an appeals item whose `original_item_id` is the verification's `review_item_id`.
- [ ] **Step 2:** Run `pnpm test src/modules/verification/verification.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Load the `claude-api` skill for the prompts.
- [ ] **Step 4:** Run `pnpm test src/modules/verification src/modules/trust`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(verification): automated business verification, never auto-rejected`.

### Task 31 (W7): Host page content and checks

**Files:**
- Create:
  - `drizzle/1300_hostpages.sql`
  - `src/modules/hostpages/{schema.ts,editor.ts,editor.test.ts,check.ts,subjects.ts,notifications.ts}`
  - `src/app/api/v1/host/page/route.ts` (GET, PUT)
- Modify: `src/modules/hostpages/index.ts`

**Interfaces:**
- Consumes: `HostPageContentSchema` (Task 8); `runCheck` and `registerSubjectHandlers`; `getMediaInfo`; `billing.sanctionOrg` (fake)
- Produces:
  - **Tables:** the spec's `host_pages` and `host_follows` rows.
  - `getHostPageForEditor(db, ctx)` → `{ content, pending, status: 'live'|'checking'|'in_review' }`
  - `saveHostPage(db, ctx, content: HostPageContent)` → `{ status }`:
    - Media must be the org's and of kind `logo`, `cover`, `listing_photo` (photos) or `avatar` (team), else 400.
    - A non-empty `team` needs `teamConsent: true`, else 400.
    - When no text changed, the content applies at once (`live`). Otherwise it stores `pending_content` and enqueues `hostpages.check_content` `{ orgId }` with dedupe `hpcheck:<orgId>:<sha256 of pending>` (`checking`).
  - The `hostpages.check_content` handler: `runCheck({ kind: 'text_safety', subjectType: 'host_page', subjectId: orgId, text: <changed text> })`.
    - `approved` → applies the pending content, emits `hostpage.updated` and records `hostpages.updated`.
    - `needs_review` → keeps the pending content and `pending_check_id`, and notifies `hostpages.content_held`.
    - `rejected` → discards it and notifies `hostpages.content_held` with `{ rejected: true, reason }`.
  - The `hostpages.mark_public` handler (`subscription.changed` with status `trialing`, `active` or `past_due`): upserts `host_pages` with `first_public_at = coalesce(first_public_at, now)`
  - **Subject handler `host_page`:** approve → apply the pending content; remove → discard; ask_info → notify `hostpages.content_held` with the note; suspend or ban → `billing.sanctionOrg`
  - **Notification type:** `hostpages.content_held`, category `account`, in-app and email, to Owner and Admins

- [ ] **Step 1: Write the failing tests.**
  - Changing `about.story` → `checking`, an outbox row and the live content unchanged. After the worker with the stub → `live`, `hostpage.updated` emitted and `hostpages.updated` recorded.
  - `__flag__` in the story → `in_review`, `pending` held while `content` stays the old story, and a `hostpages.content_held` row. `__block__` → the pending content discarded and a row with `rejected: true`.
  - Changing only `logoMediaId` → `live` at once.
  - Another org's media, or an `avatar` used as `coverMediaId` → `bad_request`. A team without consent → `bad_request`.
  - Handler approve → the pending content applied; remove → discarded.
  - `mark_public` for an `active` subscription sets `first_public_at` once; a second event keeps the first value.
- [ ] **Step 2:** Run `pnpm test src/modules/hostpages/editor.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hostpages): host page editor with held changes and text checks`.

### Task 32 (W7): Public read model and host identities

**Files:**
- Create:
  - `src/modules/hostpages/{public.ts,public.test.ts,usually-hires.ts,usually-hires.test.ts,providers.ts,weather-scope.ts}`
  - `src/app/api/v1/hosts/[slug]/route.ts`

**Interfaces:**
- Consumes: `orgs.resolveSlug` and `getOrgSummaries` (fake); `billing.getSubscriberBadges` (fake); `listings.getOrgListingFacts` and `getOrgListingStats` (fake); `locations.getLocations`, `getWeather`, `listOrgLocations` and `registerWeatherOrgFilter` (fake); `getSetting('launch.public_at')`
- Produces:
  - `usuallyHires(dates: Date[]): string | null`:
    - Returns null for fewer than 2 dates.
    - Bins the dates by UTC month and picks the circular window of 1–3 consecutive months with the highest count.
    - Ties go to the shorter window after trimming empty end months, then to the earliest start month (January first).
    - Formats one month as `Feb`, or a range with an en dash, `Feb–Apr`, wrapping as `Nov–Jan`.
  - `resolveHostPage(db, slug, viewer: { userId: string | null }): Promise<{ kind: 'page'; page: HostPagePublic } | { kind: 'redirect'; slug: string } | { kind: 'not_found' }>`:
    - **Public** means the org is active, not deleted, and `host_pages.first_public_at` is not null.
    - A retired slug redirects.
  - `HostPagePublic = { identity: HostIdentity & { websiteUrl: string | null; memberSince: Date; categories: Category[] }; stats: { openJobs: number; locations: number; followers: number | null }; notHiring: { line: string } | null; replyTime: { withinADay: boolean } | null; asDescribed: { responses: number; housing: Tally; meals: Tally; pay: Tally } | null; announcements: { id; title; body; mediaId; endsAt; ctaHref }[]; jobs: { location: { id; name; city; state; addressLine1: string | null; weather: { temperatureF; condition; shortForecast } | null }; listings: PublishedListing[] }[]; about: HostPageContent['about']; photos: HostPageContent['photos']; team: HostPageContent['team'] | null; faq: HostPageContent['faq'] | null; following: boolean; noindex: boolean }`. Media IDs in `about`, `photos` and `team` are returned only for approved media.
    - `followers` is set only when ≥ 26.
    - `notHiring.line` is "Not hiring right now · Usually hires Feb–Apr", or "Not hiring right now".
    - `replyTime` appears only with ≥ 10 conversations and `withinADay`; `asDescribed` only with ≥ 5 responses.
    - `team` appears only with `teamConsent`.
    - `noindex` holds while `launch.public_at` is null or in the future.
  - `getHostIdentities` and `listPublicHostSlugs` (spec section 3). `updatedAt` = the later of the org's and the page's `updated_at`; logo and cover IDs are null unless the media is approved. `hiringNow` = `getOrgListingStats().active > 0`; `homeLocation` comes from `primaryLocationId`.
  - `registerHostPageProvider` (spec section 3), one provider per kind (a second registration throws)
  - `weather-scope.ts` calls `registerWeatherOrgFilter(async (db, orgIds) => [...(await billing.getSubscriberBadges(db, orgIds)).keys()])` at module load, imported by `index.ts`
  - `GET /hosts/[slug]` (`auth: 'none'`): 200 with the page, 404, or for a retired slug a 301 returned as `new Response(null, { status: 301, headers: { location: new URL('/api/v1/hosts/<currentSlug>', APP_URL).toString() } })` (Plan decision 15). Node's `Response.redirect` throws on a relative URL, and `apiRoute` passes a returned `Response` through.

- [ ] **Step 1: Write the failing tests.**
  - `usuallyHires`: Feb, Mar, Apr → `"Feb–Apr"`; Nov, Dec, Jan → `"Nov–Jan"`; one date → null; Feb ×2 plus Aug → `"Feb"`; Feb, Mar, Aug, Sep → `"Feb–Mar"`.
  - 25 followers → `followers: null`; 26 → 26.
  - With no `first_public_at` → `not_found`; suspended → `not_found`; deleted → `not_found`; a retired slug → `redirect`. The route answers a retired slug with status 301 and an absolute `location` ending in `/api/v1/hosts/<currentSlug>`. A slug the org reclaimed → `page`, never a redirect to itself.
  - One active listing → `hiringNow: true` and `notHiring: null`. None active, with past listings in Feb, Mar and Apr → "Not hiring right now · Usually hires Feb–Apr".
  - The categories are those of the active listings, or all past listings when none is active.
  - A `city`-precision location → `addressLine1: null`; `exact` → the line.
  - When `getWeather` omits a location (stale or failing), its `weather` is null.
  - `reply_time` with 12 conversations and `withinADay` → shown; 9 → null. `as_described` with 4 responses → null, with 5 → shown. With no provider registered, those fields are null and `announcements` is `[]`.
  - `noindex` is true when `launch.public_at` is null.
  - The weather filter returns only orgs that `getSubscriberBadges` returns.
  - `listPublicHostSlugs({ limit: 1 })` over 2 public orgs pages correctly.
- [ ] **Step 2:** Run `pnpm test src/modules/hostpages/public.test.ts src/modules/hostpages/usually-hires.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hostpages): public host page read model, identities and provider slots`.

### Task 33 (W7): Follows

**Files:**
- Create:
  - `src/modules/hostpages/{follows.ts,follows.test.ts,privacy.ts}`
  - `src/app/api/v1/hosts/[slug]/follow/route.ts`, `src/app/api/v1/me/follows/route.ts`

**Interfaces:**
- Produces:
  - `follow(db, userId, slug)` → `{ following: true }`: 404 unless the page is public. It inserts on conflict do nothing and records `hostpages.followed`.
  - `unfollow` and `listFollowerIds` (spec section 3). `listFollowerIds` uses a keyset on `user_id`.
  - `listFollows(db, userId)` → `{ items: HostIdentity[] }`
  - The `hostpages.notify_followers` handler (`listing.published` envelope, with an optional `cursor`):
    - It does nothing unless `data.first`.
    - Each run notifies 500 followers with `hosts.new_job` `{ orgName, listingTitle, href: '/jobs/view/<listingId>' }`, then enqueues the next page with dedupe `<eventId>:followers:<lastUserId>`.
  - **Notification type `hosts.new_job`:** category `jobs`, in-app, push and email, with email batch key `host_follow` and a 60-minute delay
  - **Routes:** `PUT` and `DELETE /hosts/[slug]/follow` (`auth: 'seeker'`, 60 per hour per user); `GET /me/follows` (`auth: 'seeker'`)
  - `privacyHandlers`: `export` lists follows; `erase` deletes them

- [ ] **Step 1: Write the failing tests.**
  - Following twice → one row. `unfollow` removes it. Following a non-public page → `not_found`.
  - `listFollowerIds({ limit: 2 })` over 3 followers → 2, then 1.
  - `notify_followers` with `first: true` and 1,200 followers → after the worker drains, 1,200 `hosts.new_job` notification rows and 3 handler runs. With `first: false` → none.
  - `listFollows` returns the followed host's `HostIdentity`. `hostpages.followed` is recorded. `erase` removes the user's follows.
- [ ] **Step 2:** Run `pnpm test src/modules/hostpages/follows.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/hostpages`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hostpages): follows with paged new-job notifications`.

---

## Phase B2: Screens (W8 and W9 in parallel; based on B1 merged, after Foundation B3 and the design gate)

Pages are server components that call `requireHost()` and the modules directly. Because a page doesn't go through `apiRoute`, every page file that calls an SP2 module starts with `import '@/server/sp2-wiring';` (Global Constraints), so its counters, subject handlers and providers are registered on a cold server. Client components change state only through `/api/v1`. E2E tests that need an entitled host call `entitleHost` from `tests/e2e/helpers/sp2.ts` (Task 8; Plan decision 17), and read emailed links with `readJoinLink`. Each pattern lives in `src/ui/patterns`, is props-only (no module imports, including types), and gets a gallery page. Every screen follows the spec section 7 row for its components, states and mobile/desktop layout. Each e2e file runs `AxeBuilder` and expects 0 violations at the `serious` or `critical` level.

### Task 34 (W8): Builder patterns and the detail view mapper

**Files:**
- Create:
  - `src/ui/patterns/{BuilderRail,RequiredChecklist,PhotoSlotGrid,ListingDetailView}.tsx`, `src/ui/patterns/builder-patterns.test.tsx`
  - `src/modules/listings/detail-view.ts`, `src/modules/listings/detail-view.test.ts`
  - `src/app/design-system/patterns/{builder-rail,required-checklist,photo-slot-grid,listing-detail-view}/page.tsx`
- Modify: `src/modules/listings/index.ts` (export `toListingDetailViewProps`, `formatListingPay` and `toJobCardPay`); `src/ui/components/JobCard.tsx` and `JobCard.test.tsx` (a named Foundation touchpoint: `PayPeriod` adds `'year'`, labeled `yr`)

**Interfaces:**
- Produces:
  - `BuilderRail({ sections: { key: string; label: string; complete: boolean; href: string }[]; current: string })`: the current item has `aria-current="step"`, and each complete item has a check icon and the text "Done".
  - `RequiredChecklist({ items: { label: string; missing: string[]; href: string }[] })`
  - `PhotoSlotGrid({ slots: { key: string; label: string; required: boolean; photo: { src: string; alt: string } | null; status?: 'uploading'|'scanning'|'ready'|'mismatch'|'error'; message?: string }[]; onUpload(key: string, file: File): void; onRemove(key: string): void })`
  - `ListingDetailView(props: ListingDetailViewProps)`, which renders the product section 6 order: cover, photos and host preview; description, responsibilities and a typical day; schedule and dates; pay details with deductions; housing and meals fine print with their four photos each; qualifications, certifications and physical demands; perks; category fields; the activity line; the Additional step note. It has slots `afterHeader`, `additionalStepAction` and `footer` for SP3's frame.

    `ListingDetailViewProps = { title; cover: ImageRef | null; gallery: ImageRef[]; host: { name; logoSrc: string | null; href: string }; about: { description; responsibilities: string[]; typicalDay: string | null }; schedule: string[]; pay: { headline: string; lines: string[] }; housing: Provided; meals: Provided; qualifications: { required: string[]; preferred: string[]; certifications: string[]; physicalDemands: string | null; minAge: number }; perks: string[]; categoryFields: { label; value }[]; activityLine: string | null; additionalStep: { note: string; domain: string } | null; afterHeader?; additionalStepAction?; footer? }`, where `Provided = { provided: false } | { provided: true; costLine: string; lines: string[]; photos: { label: string; image: ImageRef }[] }` and `ImageRef = { src; alt; srcSet? }`
  - `toListingDetailViewProps(content: ListingContent, d: { mediaUrl: (id: string) => ImageRef | null; host: ListingDetailViewProps['host']; confirmedActiveAt: Date | null; publishedAt: Date; now: Date; labels: { genre; occupation; perk: (code: string) => string } }): ListingDetailViewProps`:
    - `costLine` is "Free", "$150/week · deducted from pay" or "$150/week · paid directly".
    - `activityLine` is "Confirmed active today", "Confirmed active 1 day ago" or "Confirmed active N days ago", or else "Posted N days ago".
    - The pay headline is `formatListingPay(content.pay)`.
  - **Pay for all seven `ListingContent` units.** Foundation's `formatPay` takes only the periods `hour`, `day`, `week`, `month` and `season`, and `ListingContent.pay.unit` adds `year` and `crew_share`. So:
    - `JobCard`'s `PayPeriod` adds `'year'` (label `yr`), so `formatPay({ amountCents: 4500000, per: 'year' })` → "$45,000/yr".
    - `toJobCardPay(pay): Pay` (in `detail-view.ts`): units `hour` through `year` map to `{ amountCents: minCents, maxAmountCents: maxCents, per: unit }`. `crew_share` maps to the estimate, `{ amountCents: crewShareEstimate.minCents, maxAmountCents: crewShareEstimate.maxCents, per: crewShareEstimate.per }`, and to `{ amountCents: 0, per: 'season' }` while a draft has no estimate yet. The builder's live `JobCard` preview (Task 35) uses it.
    - `formatListingPay(pay): string`: `formatPay(toJobCardPay(pay))` for `hour` through `year`; for `crew_share`, "Crew share · est. " followed by the estimate's `formatPay` ("Crew share · est. $1,200–2,000/wk"), or "Crew share" with no estimate.

- [ ] **Step 1: Write the failing tests.**
  - `BuilderRail` marks the current section with `aria-current="step"`.
  - `PhotoSlotGrid` with 4 required empty housing slots renders 4 upload buttons, each with an accessible name that includes its label. A `mismatch` slot shows its message.
  - `ListingDetailView` renders the section headings in product section 6 order, and renders no housing photos when `housing.provided` is false.
  - `toListingDetailViewProps` gives `costLine` "$150/week · deducted from pay" for the fixture. A `confirmedActiveAt` 3 days before `now` → "Confirmed active 3 days ago"; the same day → "Confirmed active today".
  - `formatListingPay`: the fixture (1900–2200 per hour) → "$19–22/hr"; `year` 4,500,000–5,200,000 → "$45,000–52,000/yr"; `crew_share` with estimate 120000–200000 per week → "Crew share · est. $1,200–2,000/wk"; `crew_share` with no estimate → "Crew share". `toJobCardPay` for each of the seven units returns a `Pay` that `formatPay` accepts.
  - `JobCard.test.tsx`: `formatPay({ amountCents: 4500000, per: 'year' })` → "$45,000/yr", and the existing cases still pass.
- [ ] **Step 2:** Run `pnpm test src/ui/patterns/builder-patterns.test.tsx src/modules/listings/detail-view.test.ts src/ui/components/JobCard.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement with design-system components and token classes only.
- [ ] **Step 4:** Run the tests and `pnpm check:tokens`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): builder patterns and the shared ListingDetailView`.

### Task 35 (W8): Builder screens with autosave and Review

**Files:**
- Create:
  - `src/app/host/listings/new/page.tsx`
  - `src/app/host/listings/[id]/edit/[section]/page.tsx`, `src/app/host/listings/[id]/edit/review/page.tsx`
  - `src/app/host/listings/[id]/edit/_components/{SectionForm.tsx,LivePreview.tsx,ConflictBanner.tsx,autosave.ts,autosave.test.ts}` and `sections/*.tsx` (one per `BuilderSection`)
  - `tests/e2e/sp2-builder.spec.ts`

**Interfaces:**
- Consumes: `getListingForEditor`, `listOccupations` and `listOrgLocations`; the Task 23–25 routes; `toListingDetailViewProps` and `toJobCardPay` (for the live `JobCard` preview); the Task 34 patterns; `JobCard`; `entitleHost` and `drainJobs` (Task 8)
- Produces:
  - `send` resolves `{ sectionVersion: number }`. It rejects with `SectionConflict { section; version: number; data: unknown }` on a 409 `section_conflict`, or with a `TypeError` when the network fails. Any other error is shown with the `ErrorState`.
  - `createAutosaveQueue(o: { send: (section: BuilderSection, baseVersion: number, data: unknown) => Promise<{ sectionVersion: number }>; debounceMs?: 800; retryDelaysMs?: [1000, 2000, 5000, 10000, 30000]; onStatus: (s: 'saved'|'saving'|'offline') => void; onConflict: (c: { section; serverVersion: number; serverData: unknown }) => void })` → `{ edit(section, data): void; flush(): Promise<void>; resolveConflict(section, choice: 'theirs'|'mine'): void }`:
    - The latest data per section wins.
    - It flushes on blur and on section change.
    - A network error retries with the given delays.
    - A 409 `section_conflict` stops retrying and calls `onConflict`. "Keep mine" re-sends with `baseVersion` = `serverVersion`; "Use theirs" adopts the server data.
  - **Screens:** per the spec section 7 rows for `/host/listings/new`, `/host/listings/[id]/edit/[section]` and `.../edit/review`. The exact copy:
    - "Check this" `Badge` on AI-filled fields
    - "Not saved yet · Retrying" while offline
    - a "Saved" `Toast`
    - "Use theirs / Keep mine"
    - paste failure `ErrorState` "We couldn't read that post. Start blank instead."
    - "Uses 1 of your N listing slots" (an active edit reads "Already uses 1 of your N listing slots")
    - after Publish, "Checking your listing…" (polling the listing every 2 s), then Live, "We're taking a closer look", or the returned reasons

- [ ] **Step 1: Write the failing tests.**
  - **Unit** (`autosave.test.ts`, fake timers):
    - Three edits within 800 ms send one PATCH.
    - A `send` rejecting with `TypeError` gives status `offline`, retries after 1 s and 2 s, then `saved`.
    - A 409 calls `onConflict` once and doesn't retry. "Keep mine" re-sends with the server version as base.
  - **E2E** (`sp2-builder.spec.ts`):
    - Paste a post (with `STUB_JSON`) → a `Skeleton`, then Basics with a "Check this" badge on Title.
    - **(Failure mode 5)** Type a description, run `context.setOffline(true)` → "Not saved yet · Retrying"; go back online → "Saved", and a reload shows the text.
    - Two pages editing Basics → the second sees "Use theirs / Keep mine".
    - After `entitleHost(page)` (Professional monthly with a fresh founding code, because `launch.public_at` is null and a codeless checkout fails with `code_required`), Review shows "Uses 1 of your 10 listing slots". Publish → "Checking your listing…", then, after `drainJobs`, the live state.
    - Axe passes on the builder and Review.
- [ ] **Step 2:** Run `pnpm test src/app/host/listings` and `pnpm e2e tests/e2e/sp2-builder.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. On mobile there is one section per screen with Back/Next and a Preview `Sheet`; on desktop, the left rail, the form and the live preview.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): listing builder with resilient autosave and Review`.

### Task 36 (W8): Listings list and status screens

**Files:**
- Create: `src/app/host/listings/page.tsx`, `src/app/host/listings/[id]/page.tsx`, their `_components/*`, `tests/e2e/sp2-listings.spec.ts`

**Interfaces:**
- Consumes: `listOrgListings`; the close, confirm-active, repost and request-review routes
- Produces: the spec section 7 rows for `/host/listings` (Tabs Active / Drafts / Library, state `Pill`, `Badge` "Unpublished changes", the provider badge `Pill` linking to its `href`, search and location filter) and `/host/listings/[id]` (status `Card`; "Still hiring?" Yes / Edit / Close; "Confirmed active N days ago"; Close and Repost; for a removed listing, the reason plus "Ask for a review").

- [ ] **Step 1: Write the failing e2e test.**
  - A new host sees `EmptyState` "No listings yet" with Create.
  - After `entitleHost(page)`, a publish and `drainJobs`, the listing is under Active. Library stats show "—".
  - On the status page, Yes → "Confirmed active today". Close → `closed`, and the row moves to Library only. Repost → lands on `.../edit/review`.
  - A listing removed through the operator `decide` helper shows its reason and "Ask for a review", which submits.
  - Axe passes.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/sp2-listings.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): listings tabs and listing status page`.

### Task 37 (W9): Host page patterns

**Files:**
- Create:
  - `src/ui/patterns/{HostHeader,WeatherLine,PlanCard,LocationPicker}.tsx`, `src/ui/patterns/host-patterns.test.tsx`
  - `src/app/design-system/patterns/{host-header,weather-line,plan-card,location-picker}/page.tsx`

**Interfaces:**
- Produces:
  - `formatHostSince(d: Date): string`: `Intl` `en-US` `{ month: 'short', day: 'numeric', year: 'numeric' }`, for example "Nov 3, 2026"
  - `HostHeader({ name; logoSrc; coverSrc; hostSince: string | null; hiringNow: boolean; categories: Category[]; homeLocation: string | null; memberSince: string; replyLine: string | null; following: boolean; onFollow(): void; shareUrl: string; websiteUrl: string | null })`:
    - The badge `Tooltip` reads "Active Explore&Earn host since {hostSince}".
    - There is a **Hiring now** `Pill`, plus `CategoryBadge` icons.
    - Follow, Share and Website are real buttons and links.
  - `WeatherLine({ weather: { temperatureF: number; shortForecast: string } | null })` renders `54°F · Partly sunny` (with the forecast in sentence case) and "Weather: National Weather Service". With null it renders nothing.
  - `PlanCard({ name; priceLabel; intervalLabel; slots; seats; inviteCredits; support; current?: boolean; foundingLine?: string; action: ReactNode })`
  - `LocationPicker({ value: { lat: number; lng: number } | null; onChange; mapboxToken: string | null })`: `mapbox-gl` is loaded by `import()` only when the map is opened. Without a token, it shows latitude and longitude inputs.

- [ ] **Step 1: Write the failing tests.**
  - `WeatherLine` with `{ 54, 'Partly Sunny' }` renders text `54°F · Partly sunny`; with null it renders nothing.
  - `HostHeader` with `hostSince: 'Nov 3, 2026'` has a tooltip "Active Explore&Earn host since Nov 3, 2026", and `hiringNow` renders "Hiring now".
  - `LocationPicker` makes no `mapbox-gl` import before "Open map" is clicked (a mocked dynamic import is called 0 times, then once).
  - `PlanCard` with `foundingLine` renders it.
- [ ] **Step 2:** Run `pnpm test src/ui/patterns/host-patterns.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests and `pnpm check:tokens`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): host header, weather line, plan card and lazy location picker`.

### Task 38 (W9): Team screens and join

**Files:**
- Create: `src/app/host/team/page.tsx`, `src/app/host/team/activity/page.tsx`, `src/app/join/[token]/page.tsx`, their `_components/*`, and the team part of `tests/e2e/sp2-host-screens.spec.ts`

**Interfaces:**
- Consumes: the Task 17–19 routes
- Produces:
  - The spec section 7 rows for `/host/team`, `/host/team/activity` and `/join/[token]`: member rows with `Avatar` and a role `Select`; an invite `Dialog` with a scope picker; a seats `StatTile`; the activity list.
  - At the seat limit the invite button is disabled, with "All N seats are used · Upgrade".
  - `/join/[token]` shows `OrgLogo`, the role and Accept. Expired, mismatched email and seeker account each get their own `ErrorState`, and the seeker one uses the exact message from Task 18.

- [ ] **Step 1: Write the failing e2e test.**
  - After `entitleHost(page)` (Professional, 5 seats), the Owner invites a Recruiter scoped to one location. After `drainJobs`, `readJoinLink(inviteeEmail)` gives the `/join` link from the stub email on disk (Task 6). The invitee signs up from it (with no onboarding redirect) and accepts. The invitee's `/host/listings` shows only that location's listings.
  - On a Starter org (`entitleHost(page, { plan: 'starter' })`), the invite button reads "All 1 seats are used · Upgrade" and is disabled.
  - An expired token shows its `ErrorState`.
  - Axe passes.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): team, activity log and invitation join page`.

### Task 39 (W9): Billing screens and pricing

**Files:**
- Create: `src/app/host/billing/{page.tsx,plans/page.tsx,complete/page.tsx}`, `src/app/pricing/page.tsx`, their `_components/*`, and the billing part of `tests/e2e/sp2-host-screens.spec.ts`

**Interfaces:**
- Consumes: `getBillingOverview`, `getPublicPrices`; the checkout, complete, preview, change and portal routes; `runFoundingCodes`, `entitleHost` and `drainJobs` (Task 8)
- Produces:
  - The spec section 7 rows for `/host/billing`, `/host/billing/plans`, `/host/billing/complete` and `/pricing`:
    - `PlanCard` ×3, a monthly/annual `SegmentedControl` and an extra-slot stepper (0–50)
    - on `/host/billing/plans`, while the org has no current subscription, an optional "Founding code" `Input` whose value is sent as `foundingCode` with `POST /host/billing/checkout`. This is the only place a founding code is entered: founding sessions set `allowPromotionCodes: false`, and the code is not a Stripe promotion code, so Stripe's hosted page can't take it. A checkout error with one of these reasons shows an `ErrorState` under the Input with the API's message:
      - `code_required`: "Enter your founding host code to subscribe before launch."
      - `code_invalid`: "That code isn't valid."
      - `founding_unavailable`: "Founding spots are all taken."
    - the proration summary from preview
    - "Choose listings to keep" `Checkbox` list, limited to the new slot limit
    - the portal `Button`
    - the `past_due` banner (icon plus text) and the trial end date
    - "Founding host · 30% off for life"
    - the complete page polls until synced
  - `/pricing` has the headline "Hire people who want to be there." and shows `PLANS` values when Stripe fails.

- [ ] **Step 1: Write the failing e2e test** (with `BILLING_PROVIDER=stub`).
  - With `launch.public_at` null (the default), choosing Professional monthly with no code shows "Enter your founding host code to subscribe before launch." A made-up code shows "That code isn't valid."
  - With a code from `runFoundingCodes(1)` in "Founding code", choosing Professional monthly lands on `/host/billing/complete`, then `/host/billing` showing "Professional", "Founding host · 30% off for life", 10 slots, 5 seats and 50 invite credits.
  - After `entitleHost(page)` and 3 published listings (`drainJobs` after each), downgrading shows "Choose listings to keep" and allows at most 2 checks.
  - `/pricing` shows $99, $299 and $599 and the headline.
  - Axe passes on `/pricing` and `/host/billing`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): billing, plan change with keep list, and public pricing`.

### Task 40 (W9): Settings, locations, verification and the host page editor

**Files:**
- Create: `src/app/host/settings/{page.tsx,locations/page.tsx,verification/page.tsx}`, `src/app/host/host-page/page.tsx`, their `_components/*`, and the settings part of `tests/e2e/sp2-host-screens.spec.ts`

**Interfaces:**
- Consumes: the Task 17, 20–21, 30 and 31 routes, and `PUT /host/page/slug`
- Produces:
  - The spec section 7 rows for `/host/settings`, `/host/settings/locations`, `/host/settings/verification` and `/host/host-page`:
    - a Recruiter approval `Switch`
    - `LocationPicker` and `WeatherLine`; a geocoder miss shows "Drop a pin on the map instead"
    - a verification status `Card` with the info form and `VERIFYING_COPY`
    - Tabs (Header, About, Photos, Team, FAQ, Preview), with `PhotoSlotGrid` (24) and a slug `Input`
  - The pending state reads "Checking your changes", and in review "In review. Your current page stays live."

- [ ] **Step 1: Write the failing e2e test.**
  - After `entitleHost(page)` (weather is fetched only for entitled orgs), adding a location whose line1 contains `__nomatch__` shows "Drop a pin on the map instead". A pin saves it. After `drainJobs` (which runs `locations.resolve_nws_grid` and its first weather fetch, Task 21) and a reload, the weather line shows `54°F · Partly sunny`.
  - Saving About with `__flag__` shows "In review. Your current page stays live."
  - Setting slug `pricing` shows the reserved error.
  - Axe passes.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): settings, locations, verification status and host page editor`.

### Task 41 (W9): Public host page

**Files:**
- Create: `src/app/hosts/[slug]/page.tsx`, its `_components/*`, `src/server/host-slug-redirect.ts`, `src/server/host-slug-redirect.test.ts`, and the public part of `tests/e2e/sp2-host-screens.spec.ts`
- Modify: `src/proxy.ts` (a named Foundation touchpoint: one call to `hostSlugRedirect` before the onboarding check)

**Interfaces:**
- Consumes: `resolveHostPage` and `orgs.resolveSlug`; the follow routes; `HostHeader`, `WeatherLine` and `JobCard`; `entitleHost` and `drainJobs` (Task 8)
- Produces: the spec section 7 `/hosts/[slug]` row.
  - It renders on the server with `Cache-Control: s-maxage=60`.
  - **Retired slugs answer 301** (spec sections 4 and 5; Plan decision 15). Next.js `permanentRedirect` answers 308, so the redirect is sent from `src/proxy.ts`. `hostSlugRedirect(pathname: string, resolve: (slug: string) => Promise<{ currentSlug: string; retired: boolean } | null>): Promise<string | null>` returns `/hosts/<currentSlug>` when the path is exactly `/hosts/<slug>` (one segment) and the slug is retired, and null otherwise without calling `resolve` for any other path. The proxy calls it with `(slug) => orgs.resolveSlug(getDb(), slug)` and, for a non-null result, returns `NextResponse.redirect(new URL(target + search, req.url), 301)` with the usual security headers. The page itself still calls `permanentRedirect` if `resolveHostPage` returns `redirect` (a slug retired between the proxy and the render), and `notFound()` handles `not_found`.
  - `robots: { index: false }` applies while `noindex`.
  - Jobs are grouped by location, each with its `WeatherLine`.
  - The announcement stack sits above the tabs, and optional tabs are hidden when empty.
  - A guest pressing Follow goes to sign-in with a return URL, and the follow completes after sign-in.

- [ ] **Step 1: Write the failing tests.**
  - **Unit** (`host-slug-redirect.test.ts`): `/hosts/old` with a retired `old` → `/hosts/new`; a current slug → null; `/hosts/old/follow` and `/pricing` → null with `resolve` never called.
  - Setup for every e2e case: `entitleHost(page)` and `drainJobs`, so `hostpages.mark_public` sets `first_public_at` and the page is public.
  - A retired slug returns status 301 (not 308) with a `location` ending in `/hosts/<current>`, checked with `request.get(url, { maxRedirects: 0 })`. A reclaimed slug returns 200.
  - A guest presses Follow → signs in as a seeker → returns, and the page reads Following.
  - With no active listings and 3 past ones in Feb, Mar and Apr → "Not hiring right now · Usually hires Feb–Apr".
  - The Team tab is hidden without consent.
  - The page has `noindex` while `launch.public_at` is null.
  - Axe passes.
- [ ] **Step 2:** Run `pnpm test src/server/host-slug-redirect.test.ts` and the e2e file. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(public): host page with jobs by location, weather and follow`.

---

## Phase C: Integration (W10)

### Task 42 (W10): Cross-module proofs for rows 5, 6, 7 and 9

**Files:**
- Create: `src/modules/billing/billing.sync.test.ts`, `src/modules/billing/billing.change.test.ts`, `src/modules/listings/listings.slots.int.test.ts`, `tests/sp2/cross-module.test.ts`, `tests/sp2/wiring.test.ts`
- Modify: any module, for integration fixes (migrations in 1900–1999)

**Interfaces:**
- Consumes: every real SP2 module (no `tests/fakes/sp2` mocks), `makeFakeBillingGateway`, and `runWorker` with the default handlers

- [ ] **Step 1: Write the failing tests.**
  - **`billing.sync.test.ts`** (row 7):
    - An entitled org with 2 active listings receives `customer.subscription.deleted`, and the worker drains. Both listings are `closed` with `close_reason = 'lapsed'`, and `getSubscriberBadges` omits the org.
    - The `/hosts/<slug>` read model has `subscriber: null`.
    - Duplicate, reversed and missing webhook sequences all end in Stripe's state (failure mode 1).
    - A new Checkout 5 months later, with no code, carries `founding_30_forever`.
    - On the real ledger, Professional + 2 extra slots, then Starter, then Professional + 2 on one subscription → `getCapacity` gives `listing_slot` limit 12 and `seat` limit 5, and the org's listings stay `active` after the worker drains (Plan decision 14).
    - Lapse closures reach SP3's input: each closed listing has one `listing.closed` envelope with reason `lapsed` (with `@/server/event-subscribers` mocked to give `listing.closed` one test topic).
  - **`billing.change.test.ts`** (row 6):
    - Professional with 3 active listings; `changePlan` to Starter without a keep list → `keep_list_required`.
    - With `keepListingIds` [B, C], then a worker drain: A is `closed` with `downgrade` and appears in the Library tab, and A's revision and listing rows are otherwise untouched.
    - The change row is `applied`.
    - With a declined card → nothing closes (failure mode 2).
  - **`listings.slots.int.test.ts`** (row 5, CI Postgres):
    - On Starter, a third publish → 409 `listing_slot_limit`.
    - Two concurrent `requestPublish` calls for the last slot → exactly one `in_review` and one `listing_slot_limit`.
    - `closeListing` frees the slot, and the next publish succeeds.
  - **`tests/sp2/cross-module.test.ts`** (row 9 on real modules):
    - A Starter subscription (synced through the fake gateway) → inviting a member → 409 `seat_limit`.
    - A publish of a host's first listing runs verification, then screening, then `active`. Exactly one `listing.published` event was emitted for it: `select count(distinct payload->>'eventId') from app.outbox where payload->>'event' = 'listing.published' and payload->'data'->>'listingId' = $1` is 1, and one row has topic `hostpages.notify_followers`. (Counting all rows would break once SP3 appends its own subscriber, because `emit` writes one row per topic.)
    - **Activity across modules:** real calls to `orgs.updateOrg`, `locations.createLocation`, `listings.createListing` and `billing.changePlan` → `listActivity` returns `orgs.updated`, `locations.created`, `listings.created` and `billing.plan_changed`, proving each module passes `orgId` to `audit.record`.
  - **`tests/sp2/wiring.test.ts`** (Global Constraints): the file imports only `src/app/api/v1/host/entitlements/route.ts` (with the guard mocked as in Foundation's route tests) and no SP2 module directly. Its `GET` for a seeded org returns `listingSlots` and `seats`, which proves `@/server/sp2-wiring` registered both the `listing_slot` counter (listings) and the `seat` counter (orgs). A second case imports only the `/host/billing` route and its `GET` returns `usage` without throwing `No usage counter for listing_slot`.
- [ ] **Step 2:** Run `pnpm test src/modules/billing/billing.sync.test.ts src/modules/billing/billing.change.test.ts tests/sp2/cross-module.test.ts tests/sp2/wiring.test.ts`. Expected: FAIL until the modules are wired together.
- [ ] **Step 3:** Fix the integration gaps.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS. The integration file runs in CI.
- [ ] **Step 5:** Commit: `test(sp2): cross-module proofs for slots, downgrade, lapse and seats`.

### Task 43 (W10): Stripe test-clock suite and the billing runbook

**Files:**
- Create: `src/modules/billing/billing.stripe.int.test.ts`, `docs/runbooks/sp2-billing-setup.md`
- Modify: `.github/workflows/ci.yml` (pass `STRIPE_SECRET_KEY` from secrets to the integration job)

**Interfaces:**
- Consumes: the real gateway, `seedStripeCatalog`, and `syncSubscription`

- [ ] **Step 1: Write the failing test** (row 4; `describe.skipIf(!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))`).
  - Seed the catalog. For each case, create a test clock and a customer attached to it with `pm_card_visa`, create the subscription by API, advance the clock past the trial or first period, and read the paid invoice's `amount_due`:
    - Professional monthly with `founding_30_forever` and a trial → **20930**.
    - Starter annual founding → **69300**.
    - Non-founding Starter monthly plus 1 extra slot → **13800**.
  - **(Failure mode 3)** An Enterprise-to-Professional change on the founding subscription keeps the discount on the next invoice.
  - **(Plan decision 16)** `createCheckout` through the real gateway (no code, after setting `launch.public_at` in the past for this test database) creates a Checkout Session that Stripe accepts, whose `expires_at` is 31 minutes after `created` (± 5 s). A direct `createCheckoutSession` with `expiresAt` = now + 29 minutes is rejected, which pins Stripe's 30-minute minimum.
  - `apply_launch_date` moves `trial_end`, and no invoice is charged during the trial.
  - The test deletes its clocks afterwards.
- [ ] **Step 2:** Run `doppler run --config dev -- pnpm vitest run --project integration src/modules/billing/billing.stripe.int.test.ts` against a real Postgres (CI). Expected: FAIL before fixes.
- [ ] **Step 3:** Fix any gaps.
- [ ] **Step 4:** Write `docs/runbooks/sp2-billing-setup.md`. It gives exact steps for:
  - `doppler run --config <cfg> -- pnpm stripe:seed`, and storing the printed `STRIPE_PORTAL_CONFIG_*` values in Doppler
  - the webhook endpoint `https://<host>/api/webhooks/stripe` with events `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.trial_will_end`, `invoice.paid` and `invoice.payment_failed`, and storing `STRIPE_WEBHOOK_SECRET`
  - in dev, `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
  - Smart Retries for up to 2 weeks, then cancel the subscription
  - Stripe Tax off
  - every SP2 Doppler key per config (`BILLING_PROVIDER`, `GEOCODER_PROVIDER=census`, `WEATHER_PROVIDER=nws`, `NWS_USER_AGENT=Explore&Earn (support@exploreandearn.com)`, `LINK_SAFETY_PROVIDER=webrisk`, `WEB_RISK_API_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN` restricted to the app URLs, `EMAIL_FROM` on `send.exploreandearn.com`)
  - the open items from spec section 13 that block live mode

  Run the suite in CI. Expected: PASS.
- [ ] **Step 5:** Commit: `test(billing): Stripe test-clock invoice amounts; docs: SP2 billing runbook`.

### Task 44 (W10): Exit-criteria end-to-end tests

**Files:**
- Create: `tests/e2e/sp2-founding.spec.ts`, `tests/e2e/sp2-hostpage.spec.ts`, `tests/e2e/sp2-publish.spec.ts`
- Modify: `tests/e2e/helpers/sp2.ts` (Task 8), only if a fix needs it

**Interfaces:**
- Consumes, from `tests/e2e/helpers/sp2.ts` (Task 8): `drainJobs`, `runFoundingCodes`, `setLaunchAt`, `dbRows` and `entitleHost`

- [ ] **Step 1: Write the failing e2e tests** (on `pnpm db:local`, with stub AI, media, weather, geocoder and link safety).
  - **`sp2-founding.spec.ts`** (row 1; real Stripe test mode, skipped without `sk_test_`):
    1. `runFoundingCodes(1)` and `setLaunchAt('2027-01-15T00:00:00.000Z')`.
    2. A new host signs up, opens `/host/billing/plans`, enters the code in "Founding code" (Task 39) and chooses Professional monthly.
    3. On Stripe's hosted Checkout page, pay with card 4242 4242 4242 4242. (The code is never entered there: founding sessions set `allowPromotionCodes: false`, and the code isn't a Stripe promotion code.)
    4. Expect `/host/billing` to show "Founding host".
    5. The Stripe subscription is `trialing` with `trial_end` = 2027-04-15T00:00:00Z and coupon `founding_30_forever`.
    6. The page shows 10 slots, 5 seats and 50 invite credits.
  - **`sp2-hostpage.spec.ts`** (row 2; `BILLING_PROVIDER=stub` or after row 1):
    - `entitleHost(page)` (a fresh founding code, because `launch.public_at` is null and a codeless checkout fails with `code_required`).
    - Add a logo, cover, About text and one location, then `drainJobs`. The location becomes the org's home location on creation (Task 20), and its weather is fetched by `locations.resolve_nws_grid` (Task 21), so neither waits for a schedule.
    - `/hosts/<slug>` returns 200 with the name, the home location and `54°F · Partly sunny`.
    - After a publish and `drainJobs`, it shows **Hiring now**, and the badge tooltip reads "Active Explore&Earn host since <formatHostSince(host_since)>".
  - **`sp2-publish.spec.ts`** (row 3):
    1. `entitleHost(page)` (Professional monthly with a fresh founding code; the stub gateway then reports a card on file, so verification can auto-verify, Task 11). Fill builder sections 1–11. Review shows "Uses 1 of your 10 listing slots".
    2. Publish, then call `drainJobs` repeatedly.
    3. Within 30 s the listing is `active`.
    4. `dbRows` finds exactly one emitted `listing.published` event for that listing (`count(distinct payload->>'eventId') = 1` over outbox rows with `payload->>'event' = 'listing.published'` and that `listingId`, so SP3's later subscriber doesn't break it), and audit rows `verification.decided` and `listings.published`.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/sp2-*.spec.ts`. Expected: FAIL until everything is wired together.
- [ ] **Step 3:** Fix the integration gaps.
- [ ] **Step 4:** Run the full suite: `pnpm lint && pnpm check:tokens && pnpm typecheck && pnpm test && pnpm e2e`. Expected: all pass. CI runs the integration and Stripe suites.
- [ ] **Step 5:** Commit: `test(sp2): exit-criteria e2e for founding checkout, host page and publish`.

When Tasks 42–44 pass, every row of spec section 1 is proven. Private pre-launch waits on the Stripe live-mode item in spec section 13.
