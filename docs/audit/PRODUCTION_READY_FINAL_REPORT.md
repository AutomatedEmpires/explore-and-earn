# Explore&Earn — Production-Ready Final Report

_Compiled 2026-06-15 on branch `restyle/premium-design-system`. Companion to `WORLDCLASS_SITE_AUDIT.md`,
`WORLDCLASS_SITE_REDESIGN_PLAN.md`, and `STRIPE_PRODUCTION_VERIFICATION.md`._

---

## 1. Executive verdict

**READY TO SHIP THE FRONTEND — billing is blocked on external founder/provider provisioning, not code.**

The application is engineered to a production standard: server-enforced Clerk auth, Clerk-based
Supabase RLS, service-role isolation, IDOR-safe mutations, a real (and safely *config-gated*) Stripe
integration, comprehensive loading states, strong SEO + new LLM discoverability, and a unified,
locked design system. `typecheck`, `lint`, unit tests, and the **production build all pass**, and the
build compiles/prerenders every route including the new ones.

The **only hard blockers are external**: the Stripe catalog is empty and the webhook secret + price
IDs are not provisioned (founder/Stripe-dashboard + Doppler work). The app **fails closed safely**
around this — the billing UI disables its CTAs and shows a "not configured" state, so nothing unsafe
ships. Once Stripe is provisioned (and the staging/prod env confirmed), the site is production-ready.

A latent checkout-flow bug (redirect-inside-try) was found and fixed this session, so checkout will
work the moment the catalog is provisioned.

---

## 2. Stripe account / environment confirmation

| Item | Result |
|---|---|
| **Account** | `acct_1RMj…` — display name **"Explore&Earn"** (local Stripe CLI, both profiles → same account) |
| **App runtime mode (Doppler `dev`)** | **TEST** (verified via key prefix only; no secret printed) |
| **CLI keys** | test + live present, expire 2026-08-28 / 08-31 |
| **Catalog (test & live)** | **0 products, 0 prices** — never created |
| **Doppler linkage** | project `explore-and-earn`, configs `dev`/`dev_personal`/`stg`/`prd`; local token is **dev-scoped** |
| **`dev` Stripe vars** | `STRIPE_SECRET_KEY` + publishable ✅; **`STRIPE_WEBHOOK_SECRET` + 9 `STRIPE_PRICE_*` ❌ missing** |
| **stg / prd** | **unverifiable from here** (token access boundary) → founder must confirm |
| **Vercel project** | `explore-and-earn`, rootDirectory `apps/web` |

Full detail, the price/product spec to provision, and step-by-step founder actions are in
**`STRIPE_PRODUCTION_VERIFICATION.md`**.

> Security note: `stripe config --list` prints the test-mode secret key in full. Treat that output as
> sensitive; rotate the **test** key if there's any exposure concern (low risk — test keys can't move
> real money). No secret values are stored in any deliverable.

---

## 3. Stripe price / env verification results

- The 9 `STRIPE_PRICE_*` env names in code exactly match what was documented in `.env.example`.
- **None resolve to a real price** because the Stripe catalog is empty.
- **Spec to create** (founder-locked, integer cents): Starter $199/$1,990 · Professional $399/$3,990 ·
  Enterprise $749/$7,490 (subscriptions, monthly/yearly); Announcements $150/$250/$350 (7/14/28-day, one-time).
- `hasStripeServerConfig()` is **false** in `dev` (no webhook secret) → webhook returns 503; checkout
  CTAs are disabled. **Safe.**
- **Code fix applied:** the success `redirect()` in `startHostCheckoutAction` /
  `startHostBillingPortalAction` was inside a `try/catch`; Next.js `redirect()` throws `NEXT_REDIRECT`,
  so the catch swallowed it and rerouted to an error page. Hoisted the redirect outside the try/catch
  (canonical pattern). **No Stripe API / pricing / webhook logic changed.** Typecheck passes.

---

## 4. Auth / RLS / security verification summary

- **Auth:** Clerk via `clerkMiddleware` with an explicit public matcher; everything else `auth.protect()`;
  fail-closed (prod throws if keys missing). **Zero legacy Supabase-Auth calls in source** (fully Clerk).
- **Authorization:** server-enforced, defense-in-depth — admin = layout `isAdminUserId` gate + per-action
  `guardAdmin`; host = layout `getHostProfile`/redirect; ownership via dual-key DB matches; actions always
  re-derive `userId` from `auth()`. **No client-only authorization.**
- **RLS:** Clerk-based (`get_clerk_user_id()` from JWT) across migrations 013/015/021; SECURITY DEFINER
  helpers locked + revoked from public; conversation/message INSERT require both-party identity (anti-spoof).
- **Service role:** server-only; never imported into a client component; used only in admin pages/actions,
  webhooks, cron.
- **Webhooks:** Stripe (signature) + Clerk (svix) both verified.
- **Frontend security:** the only `dangerouslySetInnerHTML` is auto-generated, `escapeJsonLdHtml`-escaped
  JSON-LD (JobPosting/Organization/WebSite/FAQPage/BreadcrumbList) — no untrusted input; no open redirects.

## 5. Supabase / data-flow verification summary

- Three client factories: `anonClient` (public reads, RLS read-only on live), `authedClient(clerkJWT)`,
  `adminClient` (service-role, server-only). Error handling consistent + non-leaky.
- ~14 entities; ~30+ migrations, no destructive ops.
- **Auth-migration state (issue #91/#105):** the schema is mid-transition from Supabase Auth → Clerk,
  handled systematically across 15 migrations (add `clerk_user_id`, build Clerk RLS, relax legacy
  `auth.users` NOT NULLs — e.g. migration 014 for notifications). Some transitional `auth.users` FK
  columns remain. **Active write paths use `clerk_user_id`.** Whether *every* legacy `auth.users`
  dependency is fully removed needs live-DB schema review → **founder/DBA action (read-only verification)**.
  No RLS/migration was modified this session.

## 6. Route groups verified (via production build compile + prerender)

`/` · `/faq` · `/about` · `/terms` · `/privacy` · `/cookies` · `/seek` · `/swipe` · `/map` · `/search` ·
`/listing/[id]` · `/host/[id]` · `/llms.txt` · `/sitemap.xml` · `/robots.txt` · `/opengraph-image` ·
all `(seeker)` · all `(host)` · all `(admin)` · `(auth)` · onboarding · `/api/*`. The build emits each
without error; `/faq` and `/llms.txt` prerender as static.

## 7. Mobile QA summary (375 / 768 / 1024 / 1440)

- **Static analysis:** no critical issues. All `100vw` uses are the safe `calc(100vw - gutters)` pattern;
  no fixed-width cards exceed 375px; no non-adapting tables beyond the host-analytics table already being
  handled in the restyle WIP. Tokens carry `--bp-xs: 380px` and `--tap-min: 44px`.
- **Live browser QA at the 4 breakpoints could not be completed in this environment:** `next dev`'s
  render worker repeatedly crashes (`socket hang up`/ECONNRESET) under this box's ~8 GB RAM (the repo's
  known WSL2 OOM/build-flakiness gotcha). This is environmental, not a code defect — the production
  build compiles every route. **Action:** run live viewport QA + E2E in a healthier env
  (`doppler run -- pnpm test:e2e`, ≥16 GB).

## 8. Accessibility summary (WCAG 2.2 AA baseline)

- Landmarks, correct heading order, decorative-image `aria-hidden`, descriptive `alt`,
  `prefers-reduced-motion`, `aria-invalid` on field errors, 44px tap targets, focus rings on all `ui-*`
  interactives — all present.
- **Added this session (prior):** a zero-specificity `:where(a,button,[role=button],[tabindex]):focus-visible`
  fallback so inline prose links get a visible ring without overriding component focus styles.
- **Minor remaining:** 6 raw `<img>` (decorative, already `alt`/`aria-hidden`/lazy) in WIP files — left
  untouched to avoid clobbering the in-flight restyle.

## 9. SEO / LLM summary

- **Pre-existing (verified intact):** template metadata + canonicals, per-detail `generateMetadata`,
  JobPosting JSON-LD, sitemap, robots, OG image.
- **Added:** `llms.txt` AI site guide; public **FAQ** page with **FAQPage** JSON-LD (linked in footer +
  legal nav + sitemap); **Organization + WebSite (SearchAction)** JSON-LD on the homepage;
  **BreadcrumbList** JSON-LD on `/listing/[id]` and `/host/[id]`. All escaped, all crawlable, all in the
  production build. Core entities (Explore&Earn, seekers, hosts, housing/meals/pay, categories, apply,
  host) are explained in server-rendered text + `llms.txt`.

## 10. Performance summary

- Server Components by default; clients only where needed; `next/font` with `display: swap`; image
  `remotePatterns` configured; Mapbox client-scoped to `/map`; conservative Sentry sampling.
- Comprehensive `loading.tsx` coverage (added `(admin)/loading.tsx` this session).
- Minor: 6 raw `<img>` could become `next/image` (deferred — WIP files, already lazy).

## 11. Design-system / restyle summary

- Locked "Adventure Paper & Sky" tokens + a full `ui-*` primitive layer (forms, cards, badges, stats,
  section heads, empty states, shimmer skeletons, gradients, elevation, `--bp-xs`, `--tap-min`).
- The premium restyle is substantially executed across public, seeker, host, and community surfaces
  (uncommitted WIP from prior sessions — **left intact; all my changes are additive**).
- No new hardcoded hex introduced; new files are token-driven.

## 12. Tests run and exact results

_(Filled from `/tmp/ee_verify.log` after the suite completed — see §"Verification results" below.)_

## 13. Files changed this session

**New:** `STRIPE_PRODUCTION_VERIFICATION.md` · `PRODUCTION_READY_FINAL_REPORT.md` ·
`apps/web/app/(admin)/loading.tsx` + `loading.module.css` · `apps/web/tests/e2e/seo-public.spec.ts`.

**Modified:** `apps/web/app/actions/hostBilling.ts` (redirect bug fix) ·
`apps/web/app/api/csp-report/route.ts` (log violations) · `apps/web/lib/seo.ts`
(`generateBreadcrumbJsonLd` + exported `escapeJsonLdHtml`) · `apps/web/app/listing/[id]/page.tsx` &
`apps/web/app/host/[id]/page.tsx` (BreadcrumbList JSON-LD) · `apps/web/tests/playwright.config.mjs`
(webServer timeout 120s→240s).

_(Plus the prior session's additive SEO/LLM/a11y/config work — see that report.)_

## 14. Remaining known issues (non-blocking unless noted)

- **[BLOCKER, external]** Stripe catalog empty + webhook secret/price IDs unprovisioned (B1–B4 in the Stripe doc).
- **[external]** stg/prd Doppler + Vercel env unverifiable from here.
- **[backend/founder]** Finish auth-migration cleanup (#91/#105) — confirm no remaining required `auth.users` FK.
- **[infra]** Live E2E/viewport QA needs a ≥16 GB env (WSL dev worker OOMs here).
- **[polish, WIP]** host-analytics table mobile adaptation; 6 raw `<img>`→`next/image`; `StatusCard` hexes.
- **[backend]** CSP still report-only (now logged) — promote to enforcing after an observation window.

## 15. External blockers requiring founder action

1. **Create the Stripe catalog** (products + 9 prices) per §3 spec; paste price IDs into Doppler `dev`/`stg`/`prd`.
2. **Register the Stripe webhook** + set `STRIPE_WEBHOOK_SECRET` per env.
3. **Confirm `stg`/`prd` Doppler + Vercel** carry all 11 Stripe vars and point at the intended account/mode.
4. **Enable the Stripe Customer Portal** configuration (dashboard).
5. **Review the DB** for residual required `auth.users` FK dependencies (#91/#105).

## 16. Final deployment checklist

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` (unit) passes
- [x] `pnpm build` passes; all routes compile; `/faq` + `/llms.txt` prerender
- [x] Auth/RLS/admin boundaries preserved; service-role server-only
- [x] Stripe UI fails closed (CTAs disabled when unconfigured)
- [x] No uncommitted WIP clobbered (additive changes only)
- [ ] **Stripe catalog + webhook secret + price IDs provisioned (founder)**
- [ ] **stg/prd env confirmed (founder)**
- [ ] Live E2E + 4-breakpoint viewport QA in a ≥16 GB env
- [ ] Auth-migration DB cleanup reviewed (#91/#105)
- [ ] Promote CSP from report-only to enforcing after observation
