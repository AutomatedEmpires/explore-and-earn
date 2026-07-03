# Explore&Earn — World-Class Site Audit

_Full-site product, engineering, UX, accessibility, SEO, LLM, dependency, architecture, and production-readiness audit._
_Audited 2026-06-15 on branch `restyle/premium-design-system`. Verified against actual code, not assumptions._

> **Read this first.** The brief assumed a "prototype-level" app. The repo tells a more mature
> story: this is a **well-architected Next.js 15 / React 19 monorepo** with server-enforced
> auth (Clerk), Supabase RLS, real Stripe billing, a **founder-locked design-token system** with
> a substantial `ui-*` primitive layer already built, dynamic SEO metadata, JobPosting JSON-LD,
> a sitemap, robots, and an OG image. `typecheck` and `lint` both pass clean. A premium visual
> restyle is **~80% executed on this branch** (83 working-tree changes, uncommitted).
>
> The honest, high-leverage work that remains is therefore **not** "rebuild everything." It is:
> close the SEO/LLM-discoverability gap, add structured data + a public FAQ + an `llms.txt`,
> finish the form/empty/loading state coverage, fix a handful of a11y and config-hygiene items,
> and document the production gaps that require backend/founder approval. This audit is scoped to
> that truth.

---

## 1. Executive summary

**Current state.** Production-grade bones, mid-flight premium restyle. The app compiles (`tsc -b` ✓),
lints clean (`eslint .` ✓), and ships a coherent marketplace: public discovery (`/seek`, `/swipe`,
`/map`, `/search`), public listing + host detail pages with SEO metadata, role-scoped dashboards
(seeker / host / admin), application/offer/invite/messaging lifecycles, a community hub, and a
Stripe-backed host billing + boosted-announcement surface. Auth, authorization, and data access are
**server-enforced** with defense-in-depth (middleware → layout gate → server-action guard → RLS).

**Biggest risks (production).**
- **Stripe price-ID env vars are referenced in code but absent from `.env.example`** — a checkout
  throws at runtime if any are unset in Vercel. (`services/stripe/index.ts`.)
- **Auth migration debt:** `.env.example` documents an in-progress move *off* Supabase Auth and
  Azure Maps (issue #91). Clerk + Mapbox are wired in code; verify no orphaned Supabase-auth tables
  / RLS policies keyed to the old identity model remain.
- **Resend has no SDK dependency** — `packages/mailer` calls the REST API via raw `fetch`. Works,
  but no type-safety on responses; brittle.
- **CSP is report-only**, not enforced (`next.config.ts`); `/api/csp-report` silently 204s with no
  logging, so violations are invisible.

**Biggest design/UX gaps.** (Mostly already being closed on this branch.) Historically: no shared
form primitive, flat stat strips, opacity-only skeletons, unthemed Clerk, hardcoded hex bypassing
tokens. The token layer and `ui-*` primitives (`ui-input/textarea/select/field/label/help/error`,
`ui-section-head`, `ui-empty`, `ui-stat`, shimmer skeleton, gradient + elevation tokens, `--bp-xs`)
**now exist** in `styles/primitives.css` + `styles/tokens.css`. Remaining: full adoption sweep across
every form, and the handful of intentional-but-driftable hardcoded hexes in `StatusCard`.

**Biggest production-readiness gaps.** No `llms.txt`; no public FAQ; homepage lacks `Organization`/
`WebSite` structured data; ~30 authenticated routes have no `loading.tsx`; CSP not enforced; Stripe
price IDs undocumented; thin automated test coverage (one Playwright smoke spec + a few vitest units).

**Highest-impact opportunities (safe, no backend).**
1. **LLM/chatbot discoverability** — `llms.txt` + a public FAQ page + `Organization`/`WebSite`/`FAQPage`
   JSON-LD. The product is exceptionally well-suited to AI citation (clear triad, clear categories)
   and currently leaves that on the table.
2. **SEO depth** — structured data beyond JobPosting; FAQ rich-result eligibility.
3. **State coverage** — `loading.tsx` for the high-traffic dashboards; consistent empty states.
4. **Config hygiene** — document every required env var; drop deprecated Azure key.

---

## 2. Project architecture

**Monorepo.** pnpm (`10.12.4`) + Turborepo (`^2.5.4`). Node pinned to `24.16.0` (`.nvmrc`, `engines`).
Workspace globs: `apps/*`, `packages/*`, `tools/*`.

| Workspace | Role |
|---|---|
| `apps/web` | The Next.js 15 App Router product (all routes, components, styles). |
| `apps/jobs` | Empty scaffold (no production deps yet). |
| `packages/contracts` | Shared types — `enums`, `categories`, `benefits` (Housing/Meals/Pay triad), `media`, `card`. Single source of truth; features must not redefine. |
| `packages/db` | Supabase client factories (`anonClient`, `authedClient`, `adminClient`) + typed query/mutation modules. Vitest. |
| `packages/ui` | Token-driven primitives (`Badge`, `Button`, `Chip`, `Meter`, `Skeleton`, `Card`, `Modal`, `Icon` registry), `cloudinary.ts` URL helpers, `dompurify`. |
| `packages/mailer` | Resend transport via raw `fetch` (no SDK). Idempotency guard. |
| `packages/stripe-seed` | **Stub** — `stripeSeedPlaceholder()`; catalog seeding TODO. |
| `packages/test-utils` | Types only. |
| `tools/*` | `db-assert` guardrails, github↔notion sync, eslint plugin. |

**Framework versions.** Next.js `15.5.18` (declared `^15.3.0`), React / React-DOM `19.2.6`
(declared `^19.0.0`). `@clerk/nextjs ^7.4.2`, `@supabase/supabase-js ^2.107.0`, `stripe ^22.2.0`,
`@sentry/nextjs ^10.22.0`, `posthog-js ^1.310.1`, `mapbox-gl ^3.6.0` + `react-map-gl ^7.1.7`,
`svix ^1.42.0`, `dompurify ^3.4.8`. **No Tailwind** — styling is hand-authored token-driven CSS
(`styles/tokens.css`, `styles/primitives.css`, `styles/host.css`) + CSS Modules per component.

**Build system / scripts.**
- `pnpm dev` → `next dev` (web only, `WATCHPACK_POLLING=true` for WSL2).
- `pnpm build` → `turbo run build`; web build runs `next build` then a `repair-client-reference-manifests.mjs`
  post-step (monorepo RSC manifest fix).
- `pnpm typecheck` → `tsc -b` (composite project refs). **✓ passes.**
- `pnpm lint` → `eslint .` (flat config, ESLint 9). **✓ passes.**
- `pnpm test` → recursive vitest where present. `pnpm test:e2e` → Playwright (web).
- `pnpm guardrails` → `db:assert` + pricing / calendar-sync / match-isolation / category-taxonomy /
  canon-contract drift checks. (CI-grade invariants — a genuine strength.)

**Deployment.** Vercel (`.vercel/` present, `VERCEL_TOKEN`, `NEXT_PUBLIC_APP_URL`). Secrets via
Doppler (`.env.example` is names-only, the only env file committed). Sentry source-map upload wired
into `next.config.ts` via `withSentryConfig`.

**Architectural smells.**
- Three empty route groups with TODO READMEs: `(demo)`, `(marketing)`, `(public)`. Intentional
  placeholders, but they read as unfinished; either populate or remove before launch.
- `apps/jobs` is an empty workspace — fine for now, but it's in the build graph.
- `packages/stripe-seed` is a placeholder while real Stripe checkout runs from env price IDs — the
  catalog is hand-managed in Stripe + env, not seeded from canon. Acceptable, but document it.

---

## 3. Critical dependency audit

| Dependency | Where used | Why critical | Status / version | Risk | Notes / fixes |
|---|---|---|---|---|---|
| **Next.js** | whole app | framework | `15.5.18` | Low | Modern instrumentation pattern; healthy. |
| **React 19** | whole app | framework | `19.2.6` | Low | Server Components throughout; client only where needed. |
| **Clerk** (`@clerk/nextjs`) | `middleware.ts`, `app/api/webhooks/clerk`, `(auth)`, every `auth()` call | auth (cross-app standard, locked 2026-06-04) | `^7.4.2`, wired | **Med** | Production guard throws if keys missing. Verify `public_metadata.role` flow + webhook sync. |
| **Supabase** (`supabase-js`) | `packages/db`, webhooks, `lib/email.ts` | database + storage (auth moved to Clerk) | `^2.107.0`, wired | **Med** | RLS comprehensive (migration 013). Confirm no legacy auth tables remain (#91). |
| **Stripe** | `services/stripe/index.ts`, `app/api/webhooks/stripe`, `actions/hostBilling.ts` | billing (subs + boosted announcements) | `^22.2.0`, wired | **High** | **Price-ID env vars missing from `.env.example`** → runtime throw on checkout. Webhook sig-verified. |
| **Sentry** (`@sentry/nextjs`) | `instrumentation.ts`, `instrumentation-client.ts`, `next.config.ts`, `lib/sentry.ts` | error monitoring | `^10.22.0`, wired | Low | 5% trace, 10% replay-on-error. Server + client DSN both required. |
| **PostHog** (`posthog-js`) | `app/providers.tsx`, `CookieBanner.tsx` | analytics | `^1.310.1`, wired | Low | `opt_out_capturing_by_default: true` — consent-gated (good). Server keys present but unused. |
| **Resend** | `packages/mailer`, `lib/email.ts` | transactional email | **no SDK** (raw `fetch`) | **Med** | Add `resend` dep or document the HTTP contract. Welcome emails sent from Clerk webhook. |
| **Mapbox** (`mapbox-gl`,`react-map-gl`) | `components/map/MapView.tsx` | maps (replaces Azure) | `^3.6.0`/`^7.1.7`, wired | Low | CSP + Permissions-Policy allow tiles + geolocation. |
| **Cloudinary** | `packages/ui/cloudinary.ts` | image delivery | wired (CDN read-only) | Low | API key/secret present but unused (no uploads). Cloud `dwiwyt9vi` hardcoded in helper. |
| **svix** | `app/api/webhooks/clerk` | webhook sig verification | `^1.42.0`, wired | Low | Mandatory verification; throws on bad sig. |
| **dompurify** | `packages/ui` | UGC sanitization | `^3.4.8` | Low | Present; confirm it's applied at every UGC render site. |
| **Playwright** | `apps/web/tests` | E2E | `^1.60.0` | **Med** | Only a smoke spec — thin coverage for a marketplace. |
| **Validation lib** | — | — | **absent** | **Med** | No zod / react-hook-form. Forms hand-roll validation → inconsistent. Consider zod. |

---

## 4. Environment and configuration audit

`.env.example` is **names-only** (no values) — correct posture; Doppler is the source of truth, and
it's the only env file committed. Public vs private separation is disciplined: only intentionally
public values carry `NEXT_PUBLIC_` (Supabase URL + anon key, Clerk publishable, Stripe publishable,
PostHog, Mapbox, Cloudinary cloud name, Sentry DSN, app URL). **No secret is exposed via
`NEXT_PUBLIC_`.** Service-role key and webhook secrets are server-only.

**Required env vars (documented):** Doppler token; Supabase URL/anon/service-role/access-token/refs/
DATABASE_URL; Clerk publishable/secret/webhook/sign-in/sign-up URLs; Stripe secret/webhook/publishable;
Vercel token + `NEXT_PUBLIC_APP_URL`; Cloudinary ×4; PostHog ×4; Sentry ×5; Resend key; Mapbox ×2;
GitHub + agent webhooks.

**Gaps / production-readiness concerns:**
- ❌ **Stripe price IDs undocumented.** Code reads `STRIPE_PRICE_STARTER_MONTHLY/_YEARLY`,
  `..._PROFESSIONAL_...`, `..._ENTERPRISE_...`, `STRIPE_PRICE_ANNOUNCEMENT_7D/_14D/_28D`. None are in
  `.env.example`. **Fix in this pass** (add as documented names-only). _(See §8, §20.)_
- ⚠️ **Deprecated `AZURE_MAPS_KEY`** still present (commented "remove once Mapbox migration completes").
  Remove to reduce config debt.
- ⚠️ `RESEND_FROM_EMAIL` consumed by mailer but not listed.
- ⚠️ `CRON_SECRET` used by `/api/cron/expire-listings` Bearer check but not listed.
- ✅ CSP report-only in `next.config.ts` with `report-uri /api/csp-report`. Promote to enforcing
  after a violation-free observation window — **and start logging** the reports.

---

## 5. Route inventory

Route groups: `(auth)`, `(admin)`, `(host)`, `(host-onboard)`, `(seeker)`, `(seeker-onboard)`,
`(legal)`, `(marketing)` empty, `(public)` empty, `(demo)` empty; plus top-level `/listing/[id]`,
`/host/[id]`, `/search`, `/api/*`, `sitemap.ts`, `robots.txt`, `opengraph-image.tsx`.

**Public / indexable.** `/` (home — boosted feed, category reel, employer pricing, community teaser;
`metadata` + OG), `/search`, `/seek`, `/swipe`, `/map` (discovery; static metadata), `/listing/[id]`
(**`generateMetadata` + canonical + OG + JobPosting JSON-LD**; loading + error), `/host/[id]`
(**`generateMetadata` + canonical + OG**; loading + error), `/about` `/terms` `/privacy` `/cookies`
(`force-static`, per-page metadata). **`/listing/[id]` and `/host/[id]` are the SEO crown jewels and
are done well.**

**Auth.** `/sign-in`, `/sign-up` (Clerk catch-all, themed via `clerk-appearance.ts`). No per-route
loading/error (acceptable — Clerk handles).

**Seeker** `(seeker)`: `/home`, `/profile` (+`/edit`), `/resume`, `/applied` (+`/[id]`, robots
`index:false`), `/accepted`, `/offered`, `/not-selected`, `/withdrawn`, `/invites`, `/messages`
(+`/[id]`), `/journey`, `/community` (+`/announcements`, `/photos`), `/saved`, `/settings`,
`/notifications`, `/travel`, `/schedule`, `/help`, `/map`, `/swipe`, `/seek`. Onboarding `(seeker-onboard)`:
`/onboarding` → `/prefs` → `/skills` → `/done` (client wizard; layout enforces auth + supplies metadata).

**Host** `(host)`: `/host` (dashboard), `/host/listings` (+`/new`, `/[id]`, `/[id]/edit`),
`/host/applicants` (+`/[id]`), `/host/seeker/[id]`, `/host/messages` (+`/[id]`), `/host/invites`,
`/host/profile` (+`/edit`), `/host/billing`, `/host/analytics`, `/host/settings`. Onboarding
`(host-onboard)`: `/host/onboarding`.

**Admin** `(admin)`: `/admin` (marketplace stats), `/admin/listings` (+`/[id]`), `/admin/applications`,
`/admin/hosts`, `/admin/email-preview` (+`/[template]`). All **service-role gated** behind layout
`isAdminUserId` + per-action `guardAdmin`.

**API.** `GET /api/health`; `POST /api/csp-report` (silent 204); `POST /api/webhooks/stripe`
(sig-verified); `POST /api/webhooks/clerk` (svix-verified, user sync + welcome email);
`GET /api/cron/expire-listings` (Bearer `CRON_SECRET`, service-role).

**Server actions** (`app/actions/*`, ~20 files): admin, applications, applicationStatus, community,
hostBilling, hostProfile, invites, listings, messages, notificationPrefs, notifications, reports,
resumeBuilder, savedListings, seekerApplications, seekerOnboarding, seekerProfile, seekerResume,
seekerSettings, swipe. **Every one re-derives `userId` from `auth()` server-side** and passes a
Clerk-templated Supabase token to the DB layer — no client-supplied identity.

**Status flags.**
- **Missing `loading.tsx`** on ~30 authenticated routes (`/home`, `/profile`, most host + admin routes).
  Not broken, but first-paint feels janky on slow DB. **P1 polish.**
- **Empty groups** `(demo)`, `(marketing)`, `(public)` — TODO placeholders. **P3.**
- **`(seeker)/layout.tsx`** hardcodes `unreadCommunity: 0` with a TODO until `community_post_views`
  exists. **Backend-gated.**
- No route is broken or faked.

---

## 6. User flow audit

| Flow | Path | Friction / gaps | Recommendation |
|---|---|---|---|
| Visitor → understand → sign up | `/` → `/about` → `/sign-up` | Strong hero + triad; **no FAQ**, no `Organization` schema; pricing only on home. | Add FAQ + structured data (this pass). |
| Seeker onboarding | `/onboarding` 3-step wizard → `/done` | Client wizard, no per-step skeleton; selected-state styling historically ad-hoc (being tokenized). | Confirm `ui-field` adoption; add progress affordance. |
| Resume / profile | `/resume`, `/profile/edit` | Rich CRUD via server actions; no page-level loading. | Add loading + autosave affordance. |
| Discovery | `/seek` `/swipe` `/map` | Premium DiscoveryCard; filters URL-driven; swipe physics inline-styled (fragile). | Preserve; extend mobile only. |
| Save → apply | save action → `applyToListingAction` | Server-enforced ownership; apply requires auth → redirect with `redirect_url`. | OK. Add post-apply confirmation polish. |
| Invite / offer | `/invites`, `/offered` → accept/decline actions | Clear actions; states present. | Strengthen empty + success states. |
| Messaging | `/messages/[id]` ↔ `/host/messages/[id]` | RLS dual-identity INSERT guard (strong); client thread. | OK; add optimistic send. |
| Host create listing | `/host/listings/new` (guarded by profile completeness) | Aborts cleanly if profile incomplete; **no guided builder**. | P2 builder polish. |
| Host review applicants | `/host/applicants` → `/[id]` | Human applicant detail + status machine. | Preserve; premium polish. |
| Community | `/community` + sub-feeds | Host-only posts, seeker comments/reactions; moderation actions exist. | Polish empty/loading (skeletons added on branch). |
| Billing / boost | `/host/billing`, announcement checkout | **Real Stripe**; throws if price IDs unset. | Document env; do not touch logic. |

---

## 7. Navigation audit

- **Public:** `PublicEntryHeader` + `PublicBottomNav` (legal + public). `GlobalHeader` (navy gradient,
  scope badge, hide-on-scroll) for app surfaces — polished, preserve.
- **Seeker:** `DashboardNav` / `SeekerSidebar` + bottom nav; community tabs.
- **Host:** host header + nav (`host.css` chrome).
- **Admin:** minimal; role-gated.
- **Footer:** `SiteFooter` (social + legal links + wordmark) site-wide.
- **Legal:** `LegalPageNav` (per-page section jumplinks).

**Issues / fixes.** Footer legal links omit a **FAQ** entry (none exists yet — add). Active-state and
ARIA-current coverage is generally present. Touch targets: a few sub-44px (destination pills 36px,
some icon buttons 28–36px) — historically flagged; tokens now provide `--tap-min: 44px`. Ensure the
footer/legal/inline links carry a visible `:focus-visible` (global fallback recommended).

---

## 8. Stripe / payment / billing audit

**Stripe is real**, not stubbed (the `stripe-seed` package is the only placeholder). Two modes:
- **Subscriptions** — host plans Starter/Professional/Enterprise (monthly/yearly). `actions/hostBilling.ts`
  → `startHostCheckoutAction` (ownership-checked: resolves `getHostProfile` first) and
  `startHostBillingPortalAction` (customer portal).
- **Payments** — boosted **announcement** purchases (7/14/28-day) via `createAnnouncementCheckoutAction`.

**Webhook** `app/api/webhooks/stripe/route.ts`: requires `stripe-signature`, verifies via
`verifyStripeWebhookEvent`, handles `checkout.session.completed` + `customer.subscription.*`, syncs
`host_profiles.subscription_tier` through the **service-role** client. Metadata (`clerkUserId`,
`subscriptionTier`, `hostProfileId`) links Stripe ↔ Clerk. Logs to console.

**What exists / missing / unsafe.**
- ✅ Sig verification, ownership checks, server-only secret key, test-mode posture.
- ❌ **Price-ID env vars not in `.env.example`** → `requireEnv` throws at checkout if unset in Vercel.
  **Fix (docs only) this pass.** Cross-check Vercel prod/preview secrets.
- ⚠️ Catalog hand-managed (no seed from canon). Document the price→env mapping.
- 🔒 **Do not blindly change** any checkout, webhook, tier-sync, or pricing **value** — founder
  approval gate (AGENTS.md §4). Pricing-drift guardrail (`check-pricing.mjs`) enforces canon.

UI surfaces (plan cards on `/`, `/host/billing`) may be restyled; **payment logic is untouchable**.

---

## 9. Supabase / database / data-flow audit

**Clients** (`packages/db/src`): `anonClient()` (public reads, RLS read-only on `status='live'`),
`authedClient(clerkToken)` (Bearer Clerk JWT; RLS via `auth.jwt()->>'sub'`), `adminClient(serviceRoleKey)`
(**server-only**, every caller must independently verify admin). **Service-role key never reaches a
client component** — verified usages are admin pages, admin actions, Clerk/Stripe webhooks, cron.

**Inferred entities.** `users_profile_shadow`, `seeker_profiles`, `host_profiles`, `listings`,
`applications`, `saved_listings`, `seeker_resume_*` (experience/education/certifications),
`conversations`, `messages` (sender_type + sender_profile_id), `notifications`, `community_photos`,
`host_announcements`, `reports`.

**RLS** (`supabase/migrations/013_rls_policies.sql`): `SECURITY DEFINER` helpers
(`get_clerk_user_id`, `current_seeker_profile_ids`, `current_host_profile_ids`,
`current_host_listing_ids`) with locked `search_path`, revoked from public. Policies: owner-scoped
profiles; public read of live listings + hosts-with-live-listings; applications visible to seeker
owner + host-of-listing; **conversations/messages INSERT require both-party identity match**
(anti-spoof — strong). ~20 migrations, no destructive ops in chain.

**Risks / fixes.** Error handling is consistent and non-leaky (`.maybeSingle()`/`.single()` with
generic messages). Missing `loading.tsx` is the main UX-side data gap. `unreadCommunity` hardcoded 0
until table exists. Confirm `community`/`reports`/`announcements` RLS match the tier-gating intent.
**No client-side data exposure or dangerous mutation found.**

---

## 10. Auth and permission audit

**Auth = Clerk.** `middleware.ts` (`clerkMiddleware`): explicit public matcher (`/`, `/search`,
`/listing/*`, `/host/*`, `/sign-in/*`, `/sign-up/*`, `/api/webhooks/*`, `/api/health`, legal,
`/sitemap.xml`, `/robots.txt`, `/onboarding*`); everything else `auth.protect()`. **Fail-closed**:
production throws if Clerk env missing; dev denies non-public with 401.

**Roles.** Seeker (default), Host (`host_profiles` row; Clerk `public_metadata.role==='host'` at
webhook), Admin (**allow-list** via `ADMIN_CLERK_USER_ID`, not a Clerk role), Community (seeker
feature, completion-gated).

**Enforcement (server-side, defense-in-depth).**
- Admin: `(admin)/layout.tsx` → `isAdminUserId(userId)` redirect + `actions/admin.ts guardAdmin()`
  on every mutation. **Not UI-only.**
- Host: `(host)/layout.tsx` → `getHostProfile` or redirect `/host/onboarding`.
- Ownership: listing mutations match `id` **and** `host_profile_id`; actions never trust client IDs.

**Verdict:** authorization is comprehensively server-enforced; **no client-only authz found**; admin
protection is belt-and-suspenders. _Only safe UI work: improve permission-denied / empty states._

---

## 11. Accessibility and ARIA audit (target WCAG 2.2 AA)

**Strengths.** `<main>` landmarks; `aria-label`/`aria-labelledby` on sections; correct h1→h2→h3 with
no skips; decorative images `alt="" aria-hidden`, content images descriptive `alt`; `aria-invalid`
on field errors; `prefers-reduced-motion` honored in `primitives.css` + `host.css` + `page.module.css`;
hover micro-interactions gated behind `(prefers-reduced-motion: no-preference)`; `--tap-min: 44px`
applied to buttons/inputs/stats/tiles; `--ui-focus-ring` on buttons, chips, inputs, host actions.

**Gaps / fixes.**
- Inline **body links** (legal, about, footer) rely on browser-default focus — add a scoped global
  `:focus-visible` fallback. _(This pass.)_
- A few **sub-44px** targets (destination pills 36px; some 28–36px icon buttons).
- Verify modal/drawer focus-trap + restore + `Esc` on `PopupShell`, drawers, `HeroPhotoPickerModal`.
- Confirm form errors are wired with `aria-describedby` to `.ui-error` (markup contract exists).

---

## 12. Mobile-first audit

Token scale now includes `--bp-xs: 380px` (the historically unserved 320–639px tier). Known issues
being addressed on this branch: grids that didn't collapse at 375px (host listing-card stats, host
form `.row`, legal badge grid), `HostAnalytics` table non-adaptive, horizontal rails lacking scroll
affordance (now `.ui-rail` with edge fade), DiscoveryCard cramped <320px, map height locked to tall
`dvh`. **Route-by-route remediation:** continue the `ui-*` adoption sweep; verify no horizontal
overflow at 375/768/1024/1440 in final QA (Phase 12).

---

## 13. SEO audit

**Strong baseline.** Root `metadata` with title template + `metadataBase` + OG siteName +
Twitter `summary_large_image`. `/listing/[id]` + `/host/[id]` implement `generateMetadata` with
**canonical**, OG (image = cover/photo or default), Twitter card. **JobPosting JSON-LD** per listing
(`lib/seo.ts`, with `</script>`-escape hardening — good). `sitemap.ts` (static + dynamic listings +
hosts, graceful fallback). `robots.txt` route (disallows auth-gated surfaces, allows `/seek` `/map`,
references sitemap). `opengraph-image.tsx` (1200×630, token-colored).

**Gaps / fixes.**
- ❌ No **`Organization`** / **`WebSite`** (with `SearchAction`) JSON-LD on the homepage. _(This pass.)_
- ❌ No **`FAQPage`** structured data (no FAQ page exists). _(This pass.)_
- ⚠️ No `BreadcrumbList` on listing/host detail (nice-to-have).
- ⚠️ Seeker/host account pages inherit template metadata (correct — they're noindex-by-robots anyway).

---

## 14. LLM / chatbot optimization audit

**This is the single biggest *missed, safe* opportunity.** The product is unusually legible to an AI
(crisp entity model: Explore&Earn = opportunity marketplace; seekers free; hosts subscribe;
**Housing/Meals/Pay** on every listing; four lanes farm/maritime/remote/seasonal; three modes
seek/swipe/map). The homepage + `/about` already render this in **crawlable server-side text**.

**What an AI crawler can't do well today:**
- ❌ No **`llms.txt`** / AI site guide. _(This pass — high value, zero risk.)_
- ❌ No **public FAQ** for the common questions an assistant gets asked ("is it free?", "how do I
  apply?", "what's included?", "how does hosting work?"). _(This pass.)_
- ⚠️ Some discovery content lives behind client interactivity (drawers) — but the canonical
  explanation pages are server-rendered, so core understanding is intact.

**Plan:** ship `llms.txt` (entities, value prop, who/what/how, categories, triad, apply/host flows,
key URLs) + a `/faq` page whose Q&A doubles as `FAQPage` JSON-LD. Genuinely useful, not keyword-stuffed.

---

## 15. Performance audit

**Good posture.** Server Components by default; clients only where interactive (forms, map, threads,
swipe). `next/font` for Patrick Hand / Inter / Cabin Sketch with `display: swap` + CSS variables.
Image `remotePatterns` for Supabase / Clerk / Cloudinary / Mapbox. Sentry sampling conservative (5%).

**Opportunities (safe).** Add `loading.tsx` skeletons to heavy dashboards (perceived perf). Confirm
`next/image` (not raw `<img>`) on listing galleries + cards for sizing/lazy. Mapbox GL is heavy —
ensure it's only imported on `/map` (it is, client-scoped). Watch DiscoveryCard inline-style churn
(`will-change`) on long feeds. No large-dependency red flags.

---

## 16. Design system audit

**Token system is a strength.** `tokens.css` = two-tier (TIER 1 primitives → TIER 2 semantics):
surfaces, ink hierarchy, category accents, **Housing/Meals/Pay** triad, status/lifecycle states,
2px spacing scale, radius scale, **elevation** (`--elevation-card/-hover/-overlay`), motion + easing,
**breakpoints incl. `--bp-xs`**, typography (display/UI/accent + size/lh pairs), `--tap-min`,
**gradient tokens** (sky, paper-warm, gold, per-category atmospheres, lifecycle, progress), and a
**form-field token block** (`--field-*`).

**Primitives present** (`primitives.css` + `packages/ui`): `ui-button` (primary/secondary/ghost),
`ui-card` (+raised/interactive/discovery), `ui-badge` (8 variants), `ui-chip`, `ui-meter`,
`ui-skeleton` (+shimmer, reduced-motion), `ui-modal`, **`ui-field/label/input/textarea/select/help/error`**
(+`--invalid`), **`ui-section-head`**, **`ui-empty`**, **`ui-stat`** (+primary), `ui-category-badge`
(`data-category`), `ui-cat-surface`, `ui-avatar`, `ui-rail` (edge fade), `ui-response-actions`.
`host.css` mirrors the system for host surfaces (`host-page/panel/hero/kpi/stat/status/boost-badge/
action-tile/attention`).

**Remaining inconsistencies.** Worst hardcoded-hex offender: `StatusCard.module.css` (~13 raw hexes —
intentional status visualization, but driftable; map to `--gradient-state-*` / `--color-gold`).
`FeaturedEmployersRail` + homepage hero use intentional rgba photo overlays (acceptable). The real
remaining work is **adoption**: route every form/stat strip through the new `ui-*` primitives.

---

## 17. Content and trust audit

**Strong.** Homepage hero ("Built by seekers, for seekers"; triad visible before commit; seek/swipe/map
named). `/about` is comprehensive: marketplace-not-job-board positioning, "seekers pay nothing ever,"
the three questions, four categories with descriptions, how-it-works, why-we-built-it, contact. Legal
suite complete (terms/privacy/cookies). Verified-host signal + report/flag action exist.

**Gaps.** No **FAQ** (trust + LLM). No dedicated "how to apply" / "how hosting works" step-by-step
beyond `/about` prose. Empty-state copy varies (the `ui-empty` primitive standardizes this — adopt).
Add FAQ + footer link in this pass.

---

## 18. Testing and QA audit

- **Build:** `tsc -b` ✓, `eslint .` ✓ (run this session).
- **E2E:** one Playwright smoke spec — thin for a marketplace.
- **Unit:** vitest in `packages/db`, `packages/mailer` (not exhaustive).
- **Guardrails:** `pnpm guardrails` enforces pricing / calendar-sync / match-isolation / category-taxonomy
  / canon-contract invariants — a real strength.
- **CI:** `.github/workflows` present (lint/typecheck/tests/drift + PR-agent dispatch).

**Gaps / commands.** Add E2E for: auth redirect, apply flow, host listing create, admin gate, Stripe
checkout entry. Run before launch: `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
(+ `pnpm test:e2e`, `pnpm guardrails`).

## 19. Security-sensitive frontend audit

- ✅ No secret in `NEXT_PUBLIC_`. ✅ Service-role key server-only. ✅ Webhooks signature-verified
  (svix + Stripe). ✅ Only `dangerouslySetInnerHTML` use is the **auto-generated, escaped** JobPosting
  JSON-LD — safe. ✅ Redirects use hardcoded `/sign-in?redirect_url=...` prefixes + Clerk's own
  validation — no open redirect. ✅ `dompurify` available for UGC.
- ⚠️ **Verify** dompurify (or plain-text rendering) is applied at **every** UGC sink (comments,
  announcements, messages, resume free-text). Confirm `reports`/rate-limit (`lib/rateLimit.ts` is
  in-memory — fine for now, Redis at scale).
- 🔒 Backend-gated (separate work): CSP enforcement + report logging; any RLS change; auth-migration cleanup.

---

## 20. Prioritized remediation roadmap

**P0 — critical blockers (before production launch)**
1. **Document Stripe price-ID env vars** in `.env.example` + verify they exist in Vercel prod/preview.
   _Why:_ checkout throws otherwise. _Risk:_ none (docs). _This pass (docs) + ops verify._
2. **Resolve auth-migration debt (#91):** confirm no orphaned Supabase-auth tables/RLS. _Backend/founder._
3. **Add `CRON_SECRET` + `RESEND_FROM_EMAIL`** to `.env.example`; verify cron auth in prod. _Low risk._

**P1 — production readiness**
4. `loading.tsx` skeletons for high-traffic dashboards (`/home`, `/host`, `/profile`, applicants).
5. **CSP:** start logging `/api/csp-report`; plan promotion from report-only to enforcing. _Backend._
6. Add `resend` SDK (or document the raw-HTTP contract) in `packages/mailer`.
7. Expand E2E (auth gate, apply, listing create, admin gate, checkout entry).

**P2 — UX / design unification**
8. Finish `ui-*` adoption sweep across all forms + stat strips; tokenize `StatusCard` hexes.
9. Mobile-first sweep at 375px (grids, tables, rails) + sub-44px target fixes.
10. Guided host listing builder; premium applicant review; polished empty/success states.

**P3 — growth / SEO / LLM**
11. **`llms.txt`** + **public FAQ** + **`Organization`/`WebSite`/`FAQPage` JSON-LD**. _This pass._
12. `BreadcrumbList` on detail pages; footer FAQ link; richer internal linking.

**P4 — polish**
13. Populate or remove empty `(demo)`/`(marketing)`/`(public)` groups.
14. Global `:focus-visible` fallback for inline links; motion/skeleton refinements.

---

### What is being implemented in this pass (safe, additive, non-conflicting)

`llms.txt` · public **FAQ** page (+`FAQPage` JSON-LD, footer + legal-nav link, sitemap) ·
homepage **`Organization` + `WebSite`** JSON-LD · onboarding metadata descriptions ·
`.env.example` Stripe price-ID + cron/resend documentation · global `:focus-visible` link fallback.
**Untouched:** auth, RLS, Stripe logic, pricing values, the in-flight visual restyle, any contract/route/mutation.
