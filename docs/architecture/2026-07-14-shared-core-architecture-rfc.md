# RFC — Shared-Core Architecture (API-first foundations)

**Date:** 2026-07-14
**Branch:** `fable/intelligence-core`
**Status:** Accepted with this branch — the intelligence-core systems (Matching v2,
The Guide, Agent Data & Geo) are its first implementations; parallel lanes
(UI redesign, night mode, i18n, PWA, SEO, media) build against it.
**Consumes (does not change):** ADR-040 matching config (LOCKED), ADR-039
entitlement pattern, ADR-028 pricing, the API envelope in
`packages/contracts/src/api.ts`, Glacier tokens (`apps/web/styles/tokens.css`).

## 0. The one rule

**Business rules, authorization, matching, public inventory, geographic
filtering, and canonical contracts never live inside React components or
route-specific code.** One capability, many adapters. Web pages, the PWA,
future Capacitor/React Native clients, public agents, MCP clients, and the
in-app assistant are all *clients* of the same shared core.

## 1. Layer boundaries

```
packages/contracts        Pure types + locked const tuples. Zero runtime deps.
                          Stable codes, never display strings (i18n-ready).
packages/db               Data access + pure domain logic.
  src/queries/*           One module per aggregate. anonClient (public reads),
                          authedClient(clerkToken) + explicit clerkUserId
                          scoping (user reads/writes), adminClient (service ops).
  src/lib/*               PURE domain engines (matchEngine, matchTrace,
                          behavioralSignals, publicInventory mapping). No I/O.
apps/web/services/*       Composition services (matching, assistant, stripe,
                          entitlements). Server-only. May do I/O via packages/db.
apps/web/app/actions/*    Server actions = the authenticated mutation surface.
                          Resolve identity via Clerk auth() ONLY, then call db.
apps/web/app/api/*        Transport adapters ONLY:
  api/public/v1/*         Versioned public read-only REST (ApiResponse<T> envelope).
  api/public/mcp/*        Versioned public read-only MCP (same service layer).
  api/assistant           The Guide (identity closed over in tools).
apps/web/components/*     Presentation. Never imports supabase/stripe directly.
```

Canonical shared capabilities and their single home:

| Capability | Home | Adapters |
|---|---|---|
| Match engine + score trace | `packages/db/src/lib/matchEngine.ts`, `matchTrace.ts` | seeker feed, listing detail, host ranking, host sourcing, The Guide, tests |
| Behavioral reorder signals | `packages/db/src/lib/behavioralSignals.ts` (pure) | discovery ordering only — never the fit score |
| Public inventory search | `packages/db` `searchListings` + `packages/db/src/lib/publicInventory.ts` (DTO mapping/validation) | /seek, /search, public API, MCP, llms.txt counts |
| Geo filtering | `GeoBounds` contract + `searchListings.bounds` | map, public API, MCP, future native |
| Invite entitlements | `apps/web/services/entitlements` + `packages/db/queries/inviteEntitlements.ts` | host UI, server actions (enforcement), The Guide |
| Résumé intelligence | `packages/db/src/lib/resumeInsights.ts` (pure) + contracts | resume builder, The Guide, future importer |
| Structured data (JSON-LD) | `apps/web/lib/seo.ts` builders | listing/host/home pages — never hand-built per route |

## 2. Security invariants (enforced in code, tested)

1. Authorization and ownership are **server-side**: `auth().userId` is the only
   identity source; it is never decoded from a token and never accepted from a
   client or model. Query modules take `clerkUserId` as an explicit, verified
   parameter and scope every statement with it.
2. RLS stays on as defense-in-depth where enabled (match_scores, saved_listings,
   listing_passes, messages, notifications, assistant_threads). Tables without
   RLS (host_profiles, invites) rely on the manual scoping above — new tables
   ship WITH RLS in their migration (see 061).
3. **Model-supplied identity is never trusted.** Assistant/MCP tool schemas
   expose business inputs only; `{ token, userId }` is closed over at tool
   construction. Role escalation (seeker→host tools) requires a server-verified
   host profile.
4. Entitlements are enforced server-side inside the mutation path (server
   action + DB constraint), never only in UI. Invite consumption is idempotent
   (unique `invite_id` in the ledger) and safe under concurrency (atomic RPC).
5. Public surfaces (REST/MCP/llms.txt/JSON-LD) expose **live listings and public
   host fields only** — never seeker data, applicant data, drafts, moderation
   fields, billing data, or internal match weights.
6. Inputs are schema-validated at every transport boundary; outputs are
   contract-bound DTOs (never raw rows). Public agent endpoints are read-only.
7. Additive migrations only; numbers reserved in
   `tools/scripts/migration-allocations.json`; never applied by agents.
8. Logs and error payloads carry no secrets and no unnecessary PII.

## 3. No-fabrication enforcement (structural, not prompt-level)

- Facts originate from typed rows; every assistant tool returns typed source
  data, and system prompts forbid invention *in addition to* the structure.
- Match explanations derive **only** from the structured score trace
  (`MatchSignal[]` — typed codes + numeric params). Human copy is rendered from
  codes at display time (G34: sentences are never persisted, never generated
  free-form by a model and passed off as engine output).
- Missing fields stay missing: signals carry `polarity: "missing"`; public
  DTOs and JSON-LD omit absent properties rather than inventing placeholders.
- Résumé inferences carry provenance (`evidence: { source, field, excerpt }`)
  and confidence, and are **proposals**: nothing writes to canonical profile
  tables except the existing owner-authenticated resume actions after explicit
  user acceptance. The Guide has no write tools.
- Empty search results return empty arrays with honest metadata.
- Tests pin missing-data behavior for every new engine/builder.

## 4. Internationalization architecture (for the i18n lane)

Decisions the shared core guarantees; the i18n lane implements the UI layer.

- **Contracts carry stable codes, not English.** Categories
  (`farm|maritime|remote|seasonal|mix`), benefit provisions, match signal
  codes, API error codes are machine codes. Display strings live in message
  catalogs keyed by those codes (`match.signal.category_preferred`, …).
- **Locale routing:** `[locale]` segment (or domain strategy) is a presentation
  concern; server components resolve locale → catalog and pass rendered strings
  down. Client components receive strings, not keys, wherever possible.
- **Formatting:** dates/pay/numbers format at render with `Intl.*` using the
  resolved locale + listing currency (`compensation_currency` is already
  stored). Money stays integer cents end-to-end (G1/G23); no float conversion
  in formatting helpers.
- **Time zones:** listings dates are timestamptz; render helpers accept an
  explicit IANA zone. Never derive timezone from coordinates client-side.
- **RTL:** tokens + layout must be logical-property based (`margin-inline`),
  owned by the design lane; contracts impose no LTR assumptions.
- **Public API/MCP:** v1 responses are locale-neutral (codes + user-generated
  content verbatim). An `Accept-Language`-negotiated presentation layer may be
  added in v2 without breaking v1. User-generated content is never machine-
  translated silently — translation is opt-in presentation.
- **Localized metadata/SEO** stays in the SEO lane; JSON-LD builders accept
  already-resolved strings and never hardcode English labels beyond schema.org
  enumerations.

## 5. Glacier theming architecture (for the night-mode lane)

- **One token system.** `apps/web/styles/tokens.css` remains the single source;
  night mode is a **semantic re-mapping of the same token names** under
  `[data-theme="night"]` (plus `@media (prefers-color-scheme: dark)` default),
  never component-specific dark overrides and never a second token file.
- **Server-rendered theme state:** the html element gets `data-theme` from the
  user preference cookie during SSR (system preference as fallback via a
  pre-hydration inline script) so there is no flash. Explicit user choice wins
  over system preference; the day/night auto rule (if adopted) is a preference
  *producer*, not a second mechanism.
- **Contrast:** every semantic token pair must meet WCAG AA in both themes —
  the night lane owns values; shared components must consume only semantic
  tokens so they inherit compliance.
- **Map theming:** Mapbox style id is selected by the same `data-theme` state;
  no component queries `prefers-color-scheme` directly.
- Shared-core surfaces added by this branch (public pages, assistant UI)
  consume semantic tokens exclusively, so they theme for free.

## 6. Caching strategy

| Surface | Strategy |
|---|---|
| Public listing search / detail / host profile | `unstable_cache`, 60 s revalidate + tag invalidation (`public-listings`, `public-host-profiles`) — existing `apps/web/lib/serverCache.ts`; every mutation of public data must `revalidateTag` |
| Public API v1 | `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on list; 300 s on detail. Closed/unpublished listings 404 at source, so staleness is bounded by s-maxage |
| MCP responses | same service layer; transport marked non-cacheable (per-call tool results), bounded result sizes instead |
| llms.txt | static prose + live counts, ISR `revalidate: 3600` |
| JSON-LD | rendered with the page; inherits page caching |
| match_scores | persisted cache table (052); recomputed on apply/publish and by cron; reads are user/host scoped via RLS |
| Personalized data (feeds, entitlements, assistant) | **never** publicly cached; request-scoped only |
| Entitlements | computed per request from tier + ledger (no cached balances — the ledger is the truth) |

## 7. Performance budgets (launch targets, enforced where practical)

Grounded in the current app (Next 15 App Router on Vercel, mobile-first):

- Route-level first-load JS ≤ **250 kB** gzip for public discovery routes; no
  new third-party scripts on public pages (current set: PostHog only).
- LCP ≤ **2.5 s** (p75 mobile), CLS ≤ **0.1**, INP ≤ **200 ms** — Vercel Web
  Vitals defaults; images via Supabase Storage + the responsive pipeline.
- Public API: p95 ≤ **500 ms** per call at the default page size (24); max page
  size 100; list payload ≤ **100 kB** typical.
- MCP tool results bounded: ≤ 20 listings per search result, text fields
  truncated to ≤ 500 chars in summaries.
- Matching: `computeMatch` stays pure/synchronous (µs-scale); batch recompute
  bounded by existing caps (500 candidates); trace building adds no I/O.
- Assistant: `stopWhen: stepCountIs(5)`, `maxOutputTokens: 1500` (existing),
  per-user rate limits (§8). Résumé analysis is deterministic (no model call).
- Enforcement: budgets encoded as constants/tests where measurable (page-size
  caps, result caps, rate limits); Web Vitals monitored via Vercel/PostHog.

## 8. Rate limiting

`checkRateLimit` (fixed-window, in-memory) is the current primitive — adequate
single-instance; swap to Upstash Redis behind the same signature when scaling
horizontally. Buckets added by this branch:

- Public API: per-IP 60/min (list), 120/min (detail).
- MCP: per-IP 30/min tool calls.
- Assistant: existing 20 / 5 min per user, plus per-tool budgets for expensive
  tools (screening, résumé analysis: 30 / 10 min).
- Invites: entitlement ledger is the hard gate; the 20/h rate limit remains as
  abuse backstop.

## 9. Testing strategy

- **Pure engines** (match, trace, behavioral, résumé insights, DTO mappers,
  JSON-LD builders): exhaustive Vitest unit tests, no mocks, in
  `packages/db/tests` / `apps/web/tests/unit`.
- **Contracts:** type-tests (`__type-tests__`) + consistency tests (quota gate
  vs pricing display, ADR-039 pattern).
- **Authorization/adversarial:** unit tests that assert cross-tenant inputs are
  rejected at the service boundary (model-supplied ids, foreign listing ids,
  exhausted entitlements, duplicate/concurrent consumption via the unique
  constraint + RPC contract).
- **AI boundary:** the model is never live in tests — tool `execute` functions
  are called directly with mocked db results; missing-AI-key behavior is a
  plain route test.
- **PII leakage:** DTO tests assert public shapes contain an exact allow-list
  of keys (snapshot the key set, not values).
- **Cache behavior:** unit tests on header values + tag invalidation calls.
- Deterministic always: inject `nowMs`; never depend on wall clock.

## 10. Consequences

- New public surfaces adopt `ApiResponse<T>` (its first real consumers), making
  the envelope the de-facto standard for future `/api/v1/*`.
- `packages/contracts` stays zero-dependency; runtime validation lives at
  transport boundaries (hand-rolled narrowing or zod inside `apps/web`, which
  already ships zod via the `ai` SDK).
- The invite allowance in `PLAN_ENTITLEMENTS` moves to the founder's 2026-07-14
  directive (starter 3 / professional 10 / enterprise 20 per month), superseding
  the ADR-005 "starter 0" figure; a consistency test binds enforcement to the
  displayed entitlement.
- `fable/intelligence-core` does not merge to `main` itself; integration is
  reviewed with the parallel design branch.
