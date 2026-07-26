# Explore & Earn — Comprehensive Application Audit

**Date:** 2026-07-26
**Commit audited:** `main @ fa86584` (immediately after PRs 279 and 280 merged)
**Production:** exploreandearn.com · Supabase `mamosbzcbigcclafhmmr` · 79 migrations applied, latest `081`
**Method:** 16 parallel domain audits + 2 adversarial verification passes (478 findings, 4.8M tokens,
1,778 tool calls), plus direct inspection of production HTTP responses and the production database by
the author. Every material claim carries a citation.

---

## A. Executive summary

Explore & Earn is a **two-sided marketplace for live-on-site seasonal work** — farm, maritime, remote
and seasonal roles where the job usually comes with housing and a relocation. Seekers browse and apply
free; **hosts pay** ($199 / $399 / $749 per month) for listing slots, invite credits, announcements and
boosts.

**The engineering is far more complete than the business is operable.** This is not a prototype: 89 page
routes, 19 route handlers, 37 server-action modules, 79 applied migrations, 59 production tables with
**100% row-level-security coverage**, 113 test files, 12 CI guardrails, and an unusually disciplined
culture of refusing to display claims the data does not support. The code quality is genuinely above
market for a pre-launch product.

But the marketplace **cannot currently run**, and the reason is not one blocker — it is four, each of
which independently prevents a launch:

| # | Blocker | Nature | Evidence |
|---|---|---|---|
| 1 | **No listing can ever go live** | Code + config | Host transition map omits `under_review → live`; the only approval path is admin |
| 2 | **No admin exists in production** | Config | `ADMIN_CLERK_USER_ID` unset ⇒ empty allow-list ⇒ every human denied |
| 3 | **Nobody can pay** | Config | `POST /api/webhooks/stripe` returns **503** right now |
| 4 | **Nothing is delivered** | Config | Notification engine is at most `ledger_only`; 0 deliveries ever |

Blockers 1 and 2 compound into the single most important finding in this audit:

> **A host can create a listing and submit it for review. Nothing and nobody in production can approve
> it. The marketplace has no path to its first unit of supply.**

The database confirms the consequence: **0 listings, 0 hosts, 0 seekers, 0 applications, 0 invites,
0 storage objects.** Every row of every marketplace table is empty. The site is live, fast and
well-built, and it has never transacted.

**Assessment: roughly 70% of a commercially launchable marketplace is genuinely complete.** The
remaining 30% is unusually cheap by volume — a large share is environment provisioning measured in
hours — but it contains a small number of real engineering defects that must not be skipped, several
of which lose money silently.

**Strengths.** Honest-by-construction product surfaces (the codebase repeatedly refuses to state what
it cannot evidence); database-enforced business rules rather than app-layer-only checks; complete RLS
coverage; a real matching engine; a genuinely complete notification engine awaiting a switch.

**Weaknesses.** No operator console reachable in production; a supply pipeline with no terminus;
payment code with three confirmed money-losing defects downstream of the 503; entitlements sold but
not enforced at the database; zero authorization test coverage at the layer that holds the
authorization; and repository documentation that describes a different, much earlier product.

**Primary risks.** *Technical:* the payment/entitlement layer is the least-tested and most
financially consequential code in the repo. *Product:* discovery has no crawlable links, so the
organic-acquisition strategy does not currently exist. *Marketplace:* zero supply and no path to
supply. *Operational:* the marketplace cannot be run without direct database access.

---

## B. Merge report — PRs 279 and 280

### What was merged

| PR | Title | Head | Merged | Files |
|---|---|---|---|---|
| 279 | Policies stop reaching `host_profiles.clerk_user_id` | `a5da94e` | `b953014` | 5 (+609/−6) |
| 280 | The listing page reads the stored match score | `4a8152e` | `fa86584` | 13 (+~700) |

**PR 279** rewrites the 11 RLS policies that reached `host_profiles.clerk_user_id` through a
cross-table sub-select (3 on `host_announcements`, 8 on `storage.objects`) onto the existing
`current_host_profile_ids()` / `current_seeker_profile_ids()` SECURITY DEFINER helpers. It revokes
nothing. It exists because a cross-table sub-select inside a policy **is** permission-checked against
the invoking role — verified empirically — so the planned column revoke would have broken every
storage upload (including seekers') and the community feed.

**PR 280** stops the listing-detail page recomputing the match fit from a reduced input set (7 of 20
seeker fields, 12 of 20 listing fields) and makes it read the persisted `match_scores` row the
discovery card reads. Measured divergence before the fix: **72 vs 84** on the same seeker + listing —
straddling 75, which is simultaneously the card's pill threshold and the "Strong match" band floor.

### Reconciliation

**No conflicts existed and none were manufactured.** Verified before merging:

- **Zero overlapping files** between the two changesets.
- `git merge-tree` dry run: **0 conflict markers**.
- Only 279 adds a migration (`081`); 280 adds none.
- Neither diff contains `TODO`, `FIXME`, `HACK`, `PLACEHOLDER`, `@ts-ignore`, `console.log`,
  `debugger`, `.only(` or `skip(`.

An integration branch containing both was built and validated **before** main was touched:
`supabase db reset` through 081 (exit 0, self-assertion passed), typecheck 0, guardrails 0, lint 0,
db suite 51 files, web suite 60 files, and all three DB-connected assertions green.

Because merging `main` auto-deploys production and auto-applies migrations, 279 was merged first and
its production effect verified before 280 was brought up to date and merged.

### Checks run and results

| Check | Result |
|---|---|
| `supabase db reset` (full 79-migration rebuild) | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm guardrails` (12 guardrails) | exit 0 |
| `pnpm lint` | 0 errors |
| `packages/db` tests | 51 files passed, 2 skipped |
| `apps/web` tests | 60 files passed |
| `assert_housing_photo_library` / `assert_profile_onboarding` / `assert_rpc_grants` | all exit 0 |
| GitHub CI on both PRs | all required checks green |
| `db-migrate` to production | **success**, 2m48s |

### Production verification after the merge

Queried directly against production:

```
ledger_rows              = 79
latest_migration         = 081
inline_policies_remaining= 0
policies_using_helper    = 29
host_profiles anon cols  = 17
host_profiles authed cols= 19
```

Public surfaces after both deploys: `/` 200, `/seek` 200, `/search` 200, `/host` 200,
`/sitemap.xml` 200, `/robots.txt` 200. `POST /api/webhooks/stripe` still 503 (expected — unrelated).

### Changed during reconciliation

Nothing was changed to resolve a conflict. Two changes were made **in response to bot review** while
PR 280 was open, both real defects:

1. **Copilot** — `cap in MATCH_SCORE_CAPS` walks the prototype chain (`"toString"`, `"__proto__"`
   decoded as caps, then rendered with an undefined signal code); `row.band as MatchBand` was an
   unchecked cast into icon/meter lookups. Fixed with `Object.hasOwn` and by recovering the band from
   the score.
2. **CodeRabbit** — `typeof NaN === "number"` admitted NaN scores (which compare false against every
   band floor and would have resolved to `needs_attention` as a genuine-looking verdict); and
   `(row.components ?? {})` let strings, numbers, booleans and arrays through the cast. Both bounded
   and parsed.

All review threads resolved; each fix is mutation-verified (breaking the guard fails exactly the test
that names it).

### Resulting state

- `main` @ `fa86584`; both PRs **MERGED**; **0 open PRs**.
- Both branches confirmed **fully represented in main** (zero diff vs main) — nothing unmerged.
- Per instruction, **no branches were deleted or closed.** 22 remote branches remain; see §32.

### Follow-up remaining from this work

Migration 081 deliberately revokes nothing. The original objective — revoking `clerk_user_id` and
`deleted_at` from `authenticated` — is **still open**, and is now unblocked at the policy layer.
Remaining: ~24 application call sites (a floor, not a total — the sweep classified 40 of 121
candidates) and one CI gate. Fully specced in `docs/security/policy-host-identity-helpers.md`.

---

## C. Product and business model

**Concept.** A marketplace for work that comes with a place to live. Seekers (often young, mobile,
seasonal workers) find farm/maritime/remote/seasonal roles; hosts (farms, vessels, lodges, seasonal
employers) find staff willing to relocate.

**Categories are founder-locked** to `farm | maritime | remote | seasonal` (+ `mix`).

**The value triad is Housing / Meals / Pay** and is enforced in the database: migration 070 added
`listings_publication_triad_chk`, which refuses to let a non-sourced listing enter `under_review` or
`live` while any of the three is `not_stated`. This is the clearest example of the codebase's design
philosophy — the honesty rule is a CHECK constraint, not a lint.

**Revenue model — host subscriptions only.** Canonical source is
`packages/contracts/src/pricing.ts`, protected by both a custom ESLint rule
(`no-pricing-literals`) and a guard script (`check-pricing.mjs`).

| Tier | Monthly | Annual | Listings | Invite credits/mo | Announcements/mo | Team seats | Analytics |
|---|---|---|---|---|---|---|---|
| Starter | $199 | $1,990 | 1 | 3 | 0 | 0 | basic |
| Professional | $399 | $3,990 | 5 | 10 | 1 | 0 | full |
| Enterprise | $749 | $7,490 | 10 | 20 | **0** | 0 | full |

Annual = exactly 10 monthly payments ("two months free"; percentage-discount language is forbidden).

**Founding Host program** — lifetime-locked pricing at $149 / $299 / $599, hard cap of **100 seats**,
host-scoped so it survives tier changes, forfeited permanently on cancellation
(`FOUNDING_LOCKED_PRICING`, `FOUNDING_SEAT_CAP`). A prior audit recorded this as pure marketing with
no code path; that has since been implemented and the pricing constants are now real. **It remains
unexercisable** for the same reason as everything else commercial — Stripe is unconfigured.

**Note the Enterprise `teamSeats: 0`.** This is deliberate and is the single best illustration of the
project's standard. The comment in `pricing.ts:57-63` records that team seats were Enterprise's
headline differentiator at $749/mo, that `team_memberships` exists as a table with RLS but no
application code reads or writes it, and that "an entitlement that renders as a sold feature must be
backed by a code path". The entitlement was zeroed rather than faked. **However** — the committed
Stripe catalogue snapshot (`packages/stripe-seed/expected-stripe-manifest.json`) still describes
Enterprise as "10 listings, 20 invite credits, **1 team seat**". That description would ship to
customers on the Stripe-hosted checkout page. *(30 minutes to fix; extend the drift test to cover
descriptions.)*

**Marketplace loop:** host publishes → seeker discovers → seeker applies (or host invites) →
conversation → offer → engagement → completion → review. Every step exists in code. The loop is
broken at step one.

---

## D. Architecture and integrations

**Single Next.js 15.5.20 / React 19.2.7 App Router application** (`apps/web`) deployed on Vercel with
`rootDirectory: apps/web` — which means **the production build bypasses Turborepo entirely**.
`apps/jobs` is a 5-line placeholder; there is no queue or worker runtime. All background work is six
Vercel Crons.

**Monorepo:** `apps/{web,jobs}` + `packages/{contracts,db,ui,mailer,stripe-seed,test-utils}` + `tools/`.

| Concern | Implementation | Status |
|---|---|---|
| Database | Supabase Postgres, 59 tables, 79 migrations | production-ready |
| Auth | Clerk (native Supabase third-party JWT — not the deprecated template) | production-ready |
| Authorization | Postgres RLS + column grants + SECURITY DEFINER RPCs | production-ready, untested |
| Storage | Supabase Storage (`listing-media`, `profile-photos`, `community-photos`) + Cloudinary | partially integrated |
| Payments | Stripe (subscriptions, boosts, announcements, invite packs, refunds) | **blocked — 503** |
| Email | Resend + bounce/complaint webhook → suppressions | blocked by engine stage |
| Push | web-push / VAPID | blocked by engine stage |
| Maps | Mapbox — real map **and** forward geocoding | implemented |
| Analytics | PostHog (consent-gated, lazy) | implemented |
| Errors | Sentry | implemented |
| AI | Vercel AI Gateway → `anthropic/claude-sonnet-4.5` | implemented |
| Rate limiting | Upstash / Vercel KV, distributed | implemented |
| Public API | read-only REST v1 + an MCP server | production-ready |

**Environment.** The code reads **59 distinct environment variables**. A `vercel env pull` artifact at
the repo root records the production key inventory. **Important caveat, established by the
verification pass:** 50 of its 76 keys have blank values (every secret is redacted), so *presence*
proves nothing about configuration — only *absence* of a key name and *non-blank plaintext values*
are usable evidence.

On that basis:
- `ADMIN_CLERK_USER_ID` — **key absent**. Corroborated by `ops/.../ENV_CONTRACT.md:29`
  ("Deliberately absent; admin remains locked").
- `STRIPE_SECRET_KEY` — **key absent**. Independently corroborated by the live 503.
- `NOTIFICATION_ENGINE_STAGE` — **`"ledger_only"` in plaintext**, one of the 26 non-blank values.

That last point corrects a widely-repeated assumption in this project's own handoff notes. See §27.

**Known architectural debt:** `packages/db/src/types.gen.ts` is stale (68 tables; missing
`account_deletion_requests` from migration 079), forcing `as unknown as SupabaseClient` casts that
erase type safety on the newest tables. `packages/mailer` has compiled `.js`/`.d.ts` artifacts
committed alongside their source. CSP is still report-only.

---

## E. Surface inventory (summary)

89 page routes and 19 route handlers. All read real Supabase queries; fixtures are strictly
`NODE_ENV`-gated. Full per-route detail is in the audit dataset; the material findings:

| Surface | Classification | Note |
|---|---|---|
| `/`, `/for-hosts`, `/about`, legal pages | production-ready | Real content, good metadata |
| `/seek`, `/map`, `/search` | functional-but-incomplete | Render, but return zero results |
| `/listing/[id]` | **blocked** | 565 lines, the deepest page in the app; every UUID 404s (0 listings) |
| `/host/[id]` | **blocked** | 528 lines; every UUID 404s (0 hosts) |
| `/host/*` (19 routes) | **blocked** | Every authenticated user is bounced to `/host/onboarding` |
| `/host/billing` | blocked | Honestly self-reports "Stripe is not fully configured yet" |
| `/admin/*` | **blocked** | Unreachable — empty allow-list |
| `/api/webhooks/stripe` | **blocked** | 503 |
| `sitemap.xml`, `robots.txt`, `llms.txt`, OG image | production-ready | Degrade honestly to zero-count |
| Public REST v1 + MCP | production-ready | Read-only |

**Guest-funnel defect (not a blocker, but the highest-value UX fix found).** `/seek` and `/map` are
the two most heavily advertised public surfaces (sitemap priority 0.9/0.8, homepage CTAs) but live in
the `(seeker)` route group, whose layout renders `SeekerShell` **with no guest mode**. A signed-out
visitor sees a 16-item seeker dashboard rail (Saved, Applied, Invites, Offers, Messages, Badges…)
where every link except `/seek` and `/map` bounces to sign-in.

**Orphaned routes:** `/host/seeker/[id]` (zero references anywhere), `/withdrawn` (no references),
`/admin/photo-buckets` (linked only from the dev bench). `HideOnHost` omits `/badges` and
`/assistant`, so the marketing footer leaks into the Seeker OS on those two routes.

---

## F. Capability matrix

| Capability | Seeker | Host | Founding host | Admin | Status |
|---|---|---|---|---|---|
| Sign up / sign in | ✅ | ✅ | ✅ | — | production-ready (Clerk) |
| Profile + résumé | ✅ | ✅ | ✅ | — | production-ready |
| Create listing (draft) | — | ✅ | ✅ | — | production-ready |
| Submit for review | — | ✅ | ✅ | — | production-ready |
| **Publish listing** | — | ❌ | ❌ | ❌ | **broken — no path exists** |
| Discovery / search / map | ✅ | — | — | — | functional, zero data |
| Save / pass | ✅ | — | — | — | production-ready |
| Apply | ✅ | — | — | — | production-ready (résumé-gated) |
| Invite a seeker | — | ✅ | ✅ | — | functional; credits enforced |
| **Read applicant identity/résumé** | — | ❌ | ❌ | — | **broken — RLS blocks it** |
| Messaging | ✅ | ✅ | ✅ | — | functional-but-incomplete |
| Offer → accept → complete | ✅ | ✅ | ✅ | — | functional |
| Reviews | ✅ | ✅ | ✅ | — | functional |
| Subscribe / pay | — | ❌ | ❌ | — | **blocked (503)** |
| Refunds | — | ⚠️ | ⚠️ | ❌ | **broken (3 defects)** |
| Moderation / approval | — | — | — | ❌ | built, unreachable |
| Suspend or ban a user | — | — | — | ❌ | **not implemented** |
| Any notification | ❌ | ❌ | ❌ | ❌ | blocked |

---

## G. Marketplace lifecycle and state machine

Listing states: `draft → under_review → live → paused → archived`, plus `closed`.
Enforced in **three** independent places: a TypeScript map, the host UI, and the role-aware trigger
`private.enforce_listing_host_status_transition()` (migration 077), which inspects
`current_user = 'authenticated'` and refuses host-driven moves into `live`.

**Two structural defects:**

1. **`under_review → live` does not exist for hosts** — deliberately, per the comment in
   `listingLifecycle.ts:33-37` ("a separate approval flow outside this host control set"). The only
   writer of `live` for a *new* listing is admin moderation. The one app call that sets `"live"`
   (`actions/listings.ts:419`) is `resumeListingAction` — `paused → live` only. With admin locked
   out, **the state machine has no terminus**.

2. **`closed` is a permanent orphan.** Three writers can put a listing into `closed` (admin
   rejection, the sourced staleness sweep, full-snapshot reconciliation). Nothing — host, admin or
   cron — can take it out. `closed: []` in the app map; 077's allow-list has no `closed` edge. A
   rejected listing is destroyed, not returned for correction. *(Mitigation: `adminHoldListing`
   returns `under_review → draft`, so rejection is the wrong tool for a fixable problem — but the
   trap is easy to fall into and irreversible.)*

Applications/invites/offers have a `lifecycle_transition` table and trigger governing legal edges,
with expiry defaults (30 / 14 / 7 days) from migration 067.

---

## H. Entitlement enforcement

| Entitlement | Sold on | Enforced in UI | Enforced in server | Enforced in DB | Verdict |
|---|---|---|---|---|---|
| Listing cap (1/5/10) | 4 surfaces | ✅ | ✅ (on `→under_review` only) | ❌ | **3 bypasses** |
| Invite credits (3/10/20) | 4 surfaces | ✅ | ✅ | ✅ (062 RPC + advisory lock) | **correct** |
| Announcements (0/1/3) | 3 surfaces | ✅ | ✅ | ❌ | **bypassable** |
| Team seats | Stripe description only | n/a | n/a | n/a | zeroed in contract; Stripe copy stale |
| Analytics basic vs full | 4 surfaces | ❌ | ❌ | ❌ | **sold, not implemented** |
| Verified-Host badge | public | ✅ | ✅ | ✅ | correct (admin workflow exists) |

**The invite-credit path is the model to copy** — migration 062 implements it as a SECURITY DEFINER
RPC with an advisory lock and an idempotency ledger. The announcement quota and listing cap should be
rebuilt on that pattern (or the 070/071 "CHECK-is-the-gate" pattern) before money is accepted.

**Announcement quota bypass (critical).** The only quota check is in the server action; the RLS INSERT
policy tests ownership alone, with a literal comment "quota enforced in server action", and no column
grants were ever narrowed. A host with a Supabase anon key and their own JWT can insert announcements
directly via PostgREST without limit. Compounding this: `host_announcements_owner_update` is
USING-only with no WITH CHECK, so a host can rewrite **any** column of their own announcement after
the fact — including flipping a Stripe-created draft to `status='active'` without paying.

**Additional-listing add-on** is priced at $99/$75/$49 on the settings page with no checkout, no
Stripe price env var, and no per-host override column. It cannot be honoured even manually.

---

## I. Matching system

**Architecture:** deterministic, rules-based, weighted scoring (ADR-040). Not AI, not embeddings, not
collaborative filtering. Component weights live in `packages/contracts/src/matching-config.ts`:
`categoryRoleFit` 30, `locationTravelFit` 20, `availabilityOverlap` 20, plus pay/housing/meals
alignment, completeness 5, and post-score **caps** (ceilings) for hard mismatches.

Bands: `strong ≥ 75`, `developing ≥ 50`, `needs_attention ≥ 0`.

**Computation runs off the request path** (on profile save, on apply, on listing publish) and persists
to `match_scores` (migration 052), which stores numbers only — never explanation text (G34). The
human-readable trace is derived at render time.

**PR 280 fixed the headline defect here.** Two independent computations existed; the detail page now
reads the stored row. Remaining known weaknesses:

- **Three engine rules can never fire in production today:** `requiredCertificationMissing`,
  `visaSupportRequiredButUnavailable`, and `seeker_blocked_or_restricted`. The first two are inert
  because nothing in `apps/web` ever *writes* `required_certifications`, `visa_support` or
  `visa_support_needed` — reads only. The third has no backing column anywhere and is unreachable
  product-wide.
- **The caps are asymmetric and invert if half-fixed.** `requiredCertificationMissing` is gated first
  on the listing array, and `overlapFraction(required, undefined) === 0 < 1` — so supplying the
  listing side alone makes the cap fire for *every* seeker. This regression has shipped once before;
  `services/matching/index.ts:44-47` carries the scar. Documented on `fitFieldsToMatchInput` by PR 280.
- **Cold start is unaddressed.** With 0 listings there is nothing to rank; with a new seeker the
  profile-completeness component dominates.

**Recommended evolution.** *v1 (now):* keep the deterministic engine; write the missing inputs;
fix both cap sides together. *v2:* behavioural signals (saves, passes, apply-throughs) already have
tables (`listing_passes`, `behaviorInteractions`). *v3 (scale):* embedding-based candidate generation
in front of the deterministic re-ranker, so explainability survives.

---

## J. Security, privacy and trust

**Headline: no critical or high-severity externally exploitable vulnerability was found.** That is a
genuinely strong result and deserves to be stated plainly.

Verified positives:
- Every route handler and all 37 server actions authenticate.
- All three webhooks verify signatures (Stripe `constructEvent`; Clerk via Svix; Resend via
  constant-time HMAC with a ±5-minute replay window and a fail-closed 503).
- All six cron routes gate on a constant-time `CRON_SECRET` comparison.
- **59/59 production tables have RLS enabled** (author-verified directly against production).
  13 are deny-by-default with zero policies (server-only: `events`, `media_assets`, `email_log`,
  `notification_deliveries`, …). 5 carry a `USING(true)` read policy — `event_types` and
  `lifecycle_transition` (reference data), `host_reviews` (intentionally public), and two community
  reaction tables (worth a product decision, not a vulnerability).

**Material findings, by severity:**

| Sev | Finding | Impact |
|---|---|---|
| **Critical** | Announcement quota bypass via direct PostgREST | Paid feature obtainable free; unlimited |
| **Critical** | `host_announcements` UPDATE has no WITH CHECK | Host can self-activate an unpaid announcement |
| **High** | Listing cap has no DB backstop (3 bypasses) | Tier limits unenforceable |
| **High** | `applications` INSERT accepts any status | Bypasses lifecycle engine and capacity guard |
| **High** | Host cannot read applicant identity/résumé (RLS) | Core workflow silently returns nothing |
| **Medium** | CSP is report-only | Reduced XSS defence-in-depth |
| **Info** | Root `.env.local` holds live KV/Redis tokens | Gitignored; workstation hygiene, not a leak |

**Privacy.** Account deletion is a *reviewed request queue* (migration 079), not an immediate delete —
correct for a marketplace with in-flight obligations, and honest: the previously-fabricated
"5 business days" promise was removed. Data export is not implemented. Location privacy is handled
(coarse `primary_location_name` public; exact coordinates revoked from `anon` and `authenticated` by
migration 080).

**The largest security gap is not a vulnerability — it is the absence of verification.**
`supabase/tests/` contains exactly one file: a README reading *"TODO: Add SQL-based RLS coverage
tests."* The entire authorization model (30+ policies, six column-grant allow-lists, three role-aware
triggers, a dozen SECURITY DEFINER RPCs) has shipped on the strength of code review and text greps.
The two DB-backed tests that exist (`rlsIsolation`, `listingHostStatusIntegration`) **self-skip in CI**.

---

## K. Accessibility, SEO, responsive, performance

**SEO — one finding dominates.** `packages/ui/src/DiscoveryCard.tsx` contains **zero `href`
attributes** (author-verified). The card title is
`<button onClick={() => onOpen(data.id)}>`, and the default `onOpen` opens a client-side quick-view.
**There is not one crawlable link to a listing on any discovery surface.** Combined with a sitemap
that currently contains only ~20 static URLs, Explore & Earn has **no organic-acquisition
architecture today** — regardless of how good the per-page metadata is (and it is good: JobPosting and
BreadcrumbList JSON-LD, canonicals, OG images, honest fallback descriptions).

This is the highest-leverage non-blocking fix in the audit: making cards real anchors is a small
change that converts an entire well-built content surface into an acquisition channel.

**Accessibility.** Strong foundations — the design system enforces three ratchets in CI (G50 raw
colour, G51 tokenization, G52 locale literals), the fit meter deliberately carries meaning in a word
rather than colour, and decorative steps are `aria-hidden`. Not audited against a real screen reader;
map and swipe surfaces need alternative paths verified.

**Responsive.** Broadly good. Admin tables and filter surfaces are the likely practical-usability
weak points; unverified on real devices.

**Performance.** Not measured — no build, no Lighthouse run, no load test was performed in this audit.
`force-dynamic` on the two heaviest public routes (`/listing/[id]`, `/host/[id]`) means no static
caching; with zero data this is untested at any scale.

---

## L. Testing and production readiness

113 test files (60 web, 53 db) — but **what they cover matters more than the count**.

| Layer | Covered? |
|---|---|
| Pure logic (matching, contracts, honesty rules) | ✅ Well covered |
| Server actions | ⚠️ Partial |
| RLS / column grants / authorization | ❌ **None** |
| Payments / webhook route | ❌ **None** |
| Browser E2E | ⚠️ 3 specs; not gated in CI |
| Migrations | ⚠️ Static text assertions only |

**The CI pipeline that gates `main` never starts a database, never starts a browser, and never
exercises the payment path.** All three production blockers are therefore invisible to every required
check and would stay green forever.

`stripe-payment-confirmation.test.ts` is a tautology: it defines a **local copy** of `checkoutIsPaid`
three lines above the assertions and tests the copy. If the real implementation regressed tomorrow,
the test would still pass. *(1 hour to fix — export the predicate and import it.)*

**Rollback and backups.** A rollback *candidate* deployment id and command are documented but have
never been exercised, and the named target predates PRs 269–280. There is **no reference anywhere in
the repository** to Supabase backups, PITR retention, restore procedure, or RPO/RTO.

**If main were deployed right now:** it would deploy successfully and serve a fast, polished,
completely empty marketplace. No user could publish a listing, pay, or receive any notification.

---

## M. Admin and operational readiness

**The marketplace cannot currently be operated without direct database access.**

`lib/admin.ts:14-16` builds the allow-list as
`[process.env.ADMIN_CLERK_USER_ID ?? ""].filter(Boolean)`. Unset ⇒ `[]` ⇒ `isAdminUserId()` false for
everyone ⇒ `(admin)/layout.tsx` redirects every visitor, and every admin server action returns
`{ok:false, error:"forbidden"}`. `ENV_CONTRACT.md:29` records this as intentional
("Deliberately absent; admin remains locked").

| Operator task | Built? | Reachable? |
|---|---|---|
| Approve / reject / hold a listing | ✅ | ❌ |
| Moderate reports | ✅ | ❌ |
| Handle erasure requests | ✅ | ❌ |
| Verify a host | ✅ | ❌ |
| Inspect claims / notifications | ✅ | ❌ |
| Issue a refund | ⚠️ built, 3 defects | ❌ |
| Override a tier | ❌ | — |
| **Suspend or ban a user** | ❌ | — |

The last row is a genuine gap, not a config issue: the schema has three separate places to express
suspension and migration 008 seeds `account_suspended`/`account_banned` notification types, but **no
application code writes any of them**. There is no way to remove a bad actor from the marketplace.

**Business intelligence.** A founder cannot currently answer "how many hosts signed up this week"
without SQL. PostHog is wired and consent-gated, but no funnel/dashboard definitions exist in-repo.

---

## N. Blocker register

| # | Blocker | Sev | Affected workflow | Action required | Owner | Effort | Parallel? |
|---|---|---|---|---|---|---|---|
| 1 | No path from `under_review` to `live` | Critical | All supply | Founder policy decision: self-publish, auto-approve, or staffed review — then wire it | Founder + eng | 1–2 d | No |
| 2 | `ADMIN_CLERK_USER_ID` unset | Critical | All operations | Set env var; generalize to a list | Founder | 1 h | Yes |
| 3 | Stripe unconfigured (503) | Critical | All revenue | Provision 8 vars **together**; seed 6 prices; register webhook | Founder | 1 d | Yes |
| 4 | Notification engine not at `enabled` | Critical | Every comms path | Walk the ladder per runbook | Founder | 1–2 d | Yes |
| 5 | Announcement quota bypass | Critical | Monetization integrity | Move quota to a SECURITY DEFINER RPC (copy 062) | Eng | 2–3 d | Yes |
| 6 | Host cannot read applicant résumé | Critical | Core host workflow | Add host-facing SECURITY DEFINER bridge | Eng | 2–3 d | Yes |
| 7 | Refund → `boost_campaigns` (nonexistent table) | High | Money | Rename to `listing_boost_campaigns` + test | Eng | 15 min | Yes |
| 8 | Subscription refunds never look up the charge | High | Money | Look up invoice/PaymentIntent; validate amount | Eng | 2–3 d | Yes |
| 9 | Refund race + no Stripe idempotency key | High | Money | Claim row before calling Stripe; pass idempotency key | Eng | 0.5 d | Yes |
| 10 | Tier sync silently writes zero rows | High | Money | `.select("id")` + throw so Stripe retries | Eng | 1 h | Yes |
| 11 | Listing cap has no DB backstop | High | Monetization integrity | DB trigger counting live+paused+under_review | Eng | 1 wk | Yes |
| 12 | `applications` INSERT accepts any status | High | Lifecycle integrity | Narrow INSERT grant + WITH CHECK | Eng | 1 d | Yes |
| 13 | `closed` is a terminal orphan | High | Supply recovery | Add `closed → draft` admin reopen | Eng | 1–2 d | Yes |
| 14 | Zero RLS/authorization test coverage | High | Everything | pgTAP suite in `supabase/tests/` | Eng | 1–2 wk | Yes |
| 15 | No crawlable listing links | High | Acquisition | Make DiscoveryCard title an anchor | Eng | 1–2 d | Yes |
| 16 | No suspend/ban capability | High | Trust & safety | Implement enforcement across auth + RLS + reads | Eng | 1 wk | Yes |
| 17 | No backups / PITR / rollback rehearsal | High | Business continuity | Confirm Supabase plan; document + rehearse | Founder + eng | 1 d | Yes |
| 18 | Guest sees seeker dashboard rail | Medium | Guest funnel | Guest mode in `SeekerShell` | Eng | 1 d | Yes |
| 19 | README / AGENTS.md describe "Sprint Zero" | Medium | Team onboarding | Rewrite both | Eng | 2–4 h | Yes |
| 20 | Stripe Enterprise copy says "1 team seat" | Medium | Truth in advertising | Edit description; extend drift test | Eng | 30 min | Yes |

---

## O. Remaining-work backlog

### P0 — launch-blocking

1. **Decide and implement the publication policy.** *Acceptance:* a host can take a listing from
   draft to live by a documented route, and the route is exercised end to end in staging.
2. **Provision the admin allow-list.** *Acceptance:* a named human loads `/admin` in production and
   approves a listing.
3. **Provision Stripe fully and atomically.** *Acceptance:* one test-mode subscription completes; the
   webhook returns 200; `subscription_tier` updates; the billing portal opens. **Do not partially
   provision** — `hasStripeServerConfig()` checks only 2 of the 8 vars, so a partial provision yields
   a webhook that accepts events and lands every subscription as unmapped: a silent revenue hole
   worse than the current honest 503.
4. **Fix the four money defects** (blockers 7–10) before the first charge.
5. **Close the two entitlement bypasses** (announcements, listing cap) before charging for them.
6. **Restore the host applicant-review path** (blocker 6).
7. **Walk the notification ladder to `enabled`.** *Acceptance:* an application produces a real in-app
   notification and a real email with a working unsubscribe link.
8. **Confirm backups and rehearse one rollback.**

### P1 — required for a commercially credible launch

9. RLS/pgTAP test suite; un-skip the two DB-backed tests in CI.
10. Crawlable listing links + sitemap that includes listings.
11. `closed → draft` reopen path.
12. Suspend/ban capability.
13. Narrow the `applications` INSERT grant.
14. Guest mode for `/seek` and `/map`.
15. Fix the Stripe Enterprise description; delete or build the additional-listing add-on.
16. Rewrite README and AGENTS.md; reconcile the migration registry (`highestApplied: "048"` vs 79
    applied).

### P2 — post-launch

17. Complete the 081 follow-up (revoke `clerk_user_id` / `deleted_at`; ~24 call sites).
18. Implement the basic-vs-full analytics split, or stop selling it.
19. Write the missing matching inputs (both sides of each cap, together).
20. Founder-facing analytics dashboard.
21. Data export for GDPR parity with the deletion queue.

### P3 — scale

22. Behavioural ranking; embedding candidate generation.
23. CSP to enforce.
24. Regenerate `types.gen.ts` and remove the `as unknown as` casts.
25. Team seats (build the feature or retire the concept).

---

## P. Completion plan

**Critical path (strictly sequential):**
publication policy decision → admin access → first listing live → Stripe provisioned → money defects
fixed → first real payment → notifications enabled.

**Parallelizable immediately:** all engineering defects (blockers 5–16), the RLS test suite, SEO
links, documentation.

**Effort by workstream** (engineering days, excluding founder decision latency):

| Workstream | P0 | P1 | Total |
|---|---|---|---|
| Config / provisioning | 2 | — | 2 |
| Payments | 4 | — | 4 |
| Entitlements | 8 | — | 8 |
| Database / RLS | 4 | 10 | 14 |
| Admin & ops | 1 | 6 | 7 |
| Notifications | 2 | — | 2 |
| SEO / frontend | — | 4 | 4 |
| Testing | — | 10 | 10 |
| Docs / content | — | 2 | 2 |
| **Total** | **21** | **32** | **53** |

**Forecast** (one experienced full-stack engineer; founder decisions resolved promptly):

| Milestone | Best case | Likely | Risk-adjusted |
|---|---|---|---|
| Closed founding-host pilot (real listings, no payments) | 1 week | 2 weeks | 3 weeks |
| First real payment accepted safely | 3 weeks | 5 weeks | 7 weeks |
| Public beta (seekers invited) | 5 weeks | 8 weeks | 11 weeks |
| Commercially credible launch | 8 weeks | 12 weeks | 16 weeks |

*Assumptions:* the four config blockers are founder-hours not engineering-weeks; no new scope; the
publication-policy decision is made within days, not weeks. **The dominant schedule risk is not
engineering — it is decision latency and the absence of test coverage at the authorization layer.**

---

## Q. Final verdict

**Where are we today?** A well-engineered, honest, empty marketplace that is live on the internet and
has never transacted. The build quality is high; the operability is near zero.

**What percentage is genuinely complete?** **~70%** of a commercially launchable marketplace.
Discovery, profiles, listings, applications, offers, messaging, reviews, matching and the notification
engine are built. Missing: the ability to publish, operate, charge, or communicate.

**Main holdup?** **There is no path for a listing to become live** — a deliberate admin-approval
design combined with an admin lane that is switched off in production. Everything else is downstream
of having zero supply.

**Most dangerous unresolved issue?** The **payment and entitlement layer**: four money-losing defects
and two entitlement bypasses, in the least-tested code in the repository, behind a 503 that currently
hides them. The 503 is the only thing preventing them from causing damage.

**What can be demonstrated confidently today?** The full seeker and host UX against seeded local data;
the honesty architecture (triad gate, provenance, benefit evidence); the matching engine and its
explainability; the security posture (100% RLS, signed webhooks, no critical vulnerabilities); the
notification engine in `ledger_only` with real delivery rows.

**What cannot yet be promised?** That anyone can list, pay, be notified, be moderated, or be removed.

**Before the first founding host:** blockers 1, 2 and 6 — publish path, admin access, applicant
visibility. Notifications should reach at least `internal_preview`.

**Before the first seeker is invited:** the above, plus notifications at `enabled` (a seeker who
applies and hears nothing will not return), plus guest mode on `/seek`.

**Before the first real payment:** blockers 3, 5, 7, 8, 9, 10 — and provision Stripe atomically.

**When can Explore & Earn reasonably launch?** A closed founding-host pilot in **2 weeks**. Real
payments in **5 weeks**. A commercially credible public launch in **12 weeks**, risk-adjusted to 16.

**What should the team do next?** In this order:
1. Founder decides the publication policy (this unblocks everything).
2. Set `ADMIN_CLERK_USER_ID`; approve one listing end to end.
3. Fix the four money defects while Stripe is still off — the 503 is free cover.
4. Provision Stripe atomically; run one test-mode subscription.
5. Walk the notification ladder.
6. Then, and only then, invite founding hosts.

---

## Caveats and what could not be verified

- **Production Vercel environment could not be read directly.** All env conclusions derive from a
  4-day-old `vercel env pull` artifact in which 50 of 76 values are blank. Only *key absence* and
  *non-blank plaintext values* are used as evidence here. **Confirm `ADMIN_CLERK_USER_ID`,
  `STRIPE_SECRET_KEY`, `CRON_SECRET` and `NOTIFICATION_ENGINE_STAGE` in the Vercel dashboard before
  acting on §M or §N.**
- **`NOTIFICATION_ENGINE_STAGE` is recorded as `"ledger_only"`, not unset.** This project's own
  handoff notes have repeatedly said "unset ⇒ disabled". The distinction matters: under `ledger_only`
  the engine *runs* the full pipeline and writes `suppressed` delivery rows; under `disabled` it
  no-ops entirely. With 0 users, 0 delivery rows is consistent with both. The user-visible outcome
  is identical — **nothing is delivered** — but the remediation path and the monitoring signal differ.
- **Nothing was executed against production.** No build, no load test, no Lighthouse, no browser
  session. Performance, Core Web Vitals and real-device responsive behaviour are **unmeasured**.
- **Provider-side registration is unverified.** Code proves the Clerk and Resend webhook handlers are
  correct; nothing in the repo proves the endpoints are registered in those dashboards, or that the
  Resend sending domain is verified.
- **Whether the six Vercel crons are firing or 401-ing is unresolved**, because `CRON_SECRET` presence
  could not be confirmed.
- The 478 findings behind this report were produced by 16 parallel agents and checked by 2 adversarial
  verifiers, which corrected 15 claims. Individual line-number citations may drift by a few lines;
  every claim reproduced in *this* document was either author-verified directly or carries the
  qualification above.
