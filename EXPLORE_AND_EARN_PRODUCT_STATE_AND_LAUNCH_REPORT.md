# Explore&Earn — Product State & Launch Readiness Report

> Generated: 2026-06-05 | Agent: Claude Code (Sonnet 4.6)

---

## 1. Existing App Surfaces

### Route Group Structure

```
apps/web/app/
  (seeker)/         ← SeekerHeader + SeekerBottomNav (Swipe · Map · Seek · Profile)
  (host)/           ← HostHeader + HostBottomNav (Dashboard · Listings · Applicants · Messages · Profile)
  (admin)/          ← README placeholder only — no routes
  (demo)/           ← README placeholder only — no routes
  (marketing)/      ← README placeholder only — no routes
  (public)/         ← README placeholder only — no routes
  listing/[id]/     ← Public listing detail (no shell)
  search/           ← Public search (no shell)
  page.tsx          ← Root homepage (no shell)
```

### Seeker Surfaces

| Route | Status | Data | Launch Critical |
|-------|--------|------|-----------------|
| `/home` | Partial — renders full dashboard UI | Fixture via data-access seam | Yes |
| `/seek` | Partial — feed + URL-synced category/benefit filters | Fixture via discovery seam | Yes |
| `/swipe` | Partial — SwipeDeck, drag + keyboard + undo + Meter | Fixture via discovery seam | Yes |
| `/map` | Placeholder — location grouping only, NO real map | Fixture via discovery seam | Yes (needs real map) |
| `/saved` | Partial — lifecycle list | Fixture | Yes |
| `/applied` | Partial — status tracking | Fixture | Yes |
| `/offered` | Partial | Fixture | Yes |
| `/accepted` | Partial | Fixture | Yes |
| `/not-selected` | Partial | Fixture | Yes |
| `/invites` | Partial | Fixture | Yes |
| `/messages` | Partial — MessageList UI | Fixture | Yes (alpha) |
| `/profile` | Partial — ProfileHub | Fixture | Yes |
| `/resume` | Partial — ResumePanel | Fixture | Yes (alpha) |
| `/settings` | Partial — SettingsPanel | Fixture | Yes (alpha) |
| `/journey` | Partial — JourneyTimeline | Fixture | No |
| `/notifications` | Partial — NotificationList | Fixture | No |
| `/help` | Partial — HelpPanel | Fixture | No |
| `/schedule` | Partial | Fixture | No |
| `/travel` | Partial | Fixture | No |

### Host Surfaces

| Route | Status | Data | Launch Critical |
|-------|--------|------|-----------------|
| `/host` | Partial — dashboard with stats | Fixture (HOST_LISTINGS, HOST_APPLICANTS) | Yes |
| `/host/listings` | Partial — listing manager with filters | Fixture | Yes |
| `/host/listings/[id]` | Partial — detail + loading skeleton | Fixture | Yes |
| `/host/listings/[id]/edit` | Partial — edit form | Fixture | Yes |
| `/host/listings/new` | Partial — create form | Fixture | Yes |
| `/host/applicants` | Partial — pipeline board | Fixture | Yes |
| `/host/applicants/[id]` | Partial — applicant detail | Fixture | Yes |
| `/host/messages` | Partial — thread groups | Fixture | Yes |
| `/host/messages/[id]` | Partial — thread view | Fixture | Yes |
| `/host/profile` | Partial — profile panel | Fixture | Yes |
| `/host/profile/edit` | Partial — profile form | Fixture | Yes |

### Public Surfaces

| Route | Status | Data | Launch Critical |
|-------|--------|------|-----------------|
| `/` | Partial — DiscoveryFeed, all fixture listings | Fixture (DISCOVERY_FIXTURES) | Yes |
| `/search` | Partial — keyword + filter SearchView | Fixture | Yes |
| `/listing/[id]` | Partial — full detail with BenefitTriad, ImageGallery, CategoryBadge | Fixture (static params) | Yes |

---

## 2. Backend / Data / Auth / Payment Status

### Canonical Listing Object
**NOT COMPLETE.** Fragments exist as local view models in `discovery/listing.ts`, `host/models.ts`, and `listing/fixtures.ts`. No single canonical `OpportunityListing` type in `packages/contracts`. Issue #58 (Contracts V1, `ready-for-engineering`) must land first.

### Database Schema
**PLACEHOLDER.** `supabase/migrations/001_extensions_and_enums.sql` is 2 lines: a TODO comment. No tables. No RLS. No real schema.

### Authentication
**NONE.** No auth in the current codebase. Notion D013 locked Clerk as the standard. PR #102 implements Clerk (DRAFT, needs founder approval). Routes are fully public.

### Payments / Stripe
**FOUNDER-GATED.** Not implemented. Issue #48 is in backlog. Stripe keys in `.env.example`.

### Maps
**PLACEHOLDER.** `OpportunityMap.tsx` groups listings by location text. No tile map library. Azure Maps removed, Mapbox decided but not wired.

### Media / Cloudinary
**ENV VARS ONLY.** No Cloudinary integration. Fixtures use placeholder strings.

### Notifications / Email
**UI PLACEHOLDER.** NotificationList renders fixture data. Resend key in `.env.example`.

### Matching
**FOUNDER-GATED.** Not implemented. Issue #46. Seeker home "matched listings" is fixture data.

### Admin / Moderation
**UNDEFINED.** `(admin)` route group is a README placeholder.

### Analytics / Observability
**ENV VARS ONLY.** PostHog and Sentry keys in `.env.example`. No SDK wiring in the app.

---

## 3. Launch Readiness Scorecard

| Area | Score | Honest Assessment |
|------|-------|-------------------|
| Product clarity | 8/10 | Design system, card spec, AGENTS.md all locked and clear |
| Seeker discovery UI | 6/10 | Feed, swipe, map, filters render correctly; all fixture |
| Seeker dashboard UI | 5/10 | Lifecycle buckets render; no real state |
| Host dashboard UI | 5/10 | Dashboard, listings, pipeline render; all fixture |
| Host listing management | 4/10 | Forms exist; no persistence |
| Application pipeline | 4/10 | UI renders; no real applications |
| Listing detail | 6/10 | Full detail component with triad, gallery, badge |
| Canonical data model | 3/10 | Partial contracts; no full listing type; no DB schema |
| Backend persistence | 1/10 | 1 placeholder migration; no real queries |
| Auth | 1/10 | None in current code; Clerk locked by Notion but not wired |
| Payments | 0/10 | Founder-gated; not started |
| Admin / moderation | 0/10 | README placeholder only |
| Search / map | 4/10 | Text search works; map is grouping-only |
| Messaging | 3/10 | UI renders; no real messaging |
| Mobile UX | 6/10 | Mobile-first shell, bottom navs, swipe gestures |
| Design system | 8/10 | Tokens, typography, colors, spacing all locked |
| Streamline icon assets | 5/10 | Registry + placeholders; real glyphs need local wiring |
| Testing / CI | 4/10 | 5 smoke tests; no unit tests; CI concurrency bug |
| Deployment / env | 2/10 | Doppler defined; no Vercel config; no preview URLs |
| Security / privacy | 1/10 | No auth, no RLS, not safe for real users |
| Analytics / observability | 2/10 | Keys exist; no SDK integration |
| **Overall MVP readiness** | **3/10** | Strong UI foundation; backend/auth/persistence are critical gaps |

---

## 4. Critical Path to Launch

```
NOW   →  Rebase + merge PR #103 (shell ownership smoke)
      →  Fix CI concurrency bug (1-line change)
      →  Founder approves auth gate → merge PR #102 (Clerk + Mapbox)
          
NEXT  →  Land Issue #58 (Contracts V1 — expand packages/contracts)
      →  Land Supabase schema V1 (Issue #47, founder gate required)
      →  Implement Clerk auth + route protection (from PR #102 foundation)
      →  Replace fixture data seams with real DB queries

THEN  →  Cloudinary media pipeline
      →  Vercel staging deploy + PostHog + Sentry
      →  Real listing seed → invite first hosts/seekers

POST-ALPHA →  Stripe payments (#48), matching (#46), moderation, admin
POST-ALPHA →  Onboarding flows, legal pages, full mobile polish

MVP   →  Public launch gate
```

---

## 5. Launch Timeline Estimates

### Scenario A — UI Prototype (Fixture Demo, Deployed)

**Definition:** Demoable app, all fixture data, deployed to Vercel preview URL.

**Remaining work:**
- Rebase + merge PR #103
- Fix CI concurrency bug
- Add Vercel deploy config + preview workflow
- Optional: wire PostHog basic pageview

**Estimate: 3–7 days**
**Blocker:** None material — Vercel project needs to exist

---

### Scenario B — Private Alpha

**Definition:** Real auth (Clerk), real listings from manual seed, minimal host/seeker create+apply flow, real Supabase persistence, manual admin via Supabase Studio.

**Remaining work (beyond Scenario A):**
- Merge PR #102 (Clerk + Mapbox) — founder gate
- Supabase schema V1 — founder gate
- Data seams → real DB queries
- Host listing create/edit persistence
- Application submit flow (seeker → host)
- Cloudinary media upload + display
- Resend email (application confirmation)
- Vercel staging + Doppler env wiring
- PostHog + Sentry SDK integration

**Estimate: 4–8 weeks**
**Blockers:** Founder must approve auth gate (PR #102) + schema build pack (Issue #47)

---

### Scenario C — Public MVP

**Definition:** Real hosts/seekers can find each other, apply, accept/decline. Host subscription. Basic moderation. Legal pages. Analytics. Support.

**Remaining work (beyond Scenario B):**
- Stripe host billing (Issue #48, founder gate)
- Matching / recommendations (Issue #46, founder gate)
- Admin dashboard (moderation, content review, user management)
- Onboarding flows (seeker + host)
- Legal pages (Terms, Privacy Policy)
- Full mobile UX polish + accessibility audit
- Security audit (auth, RLS, API, content moderation)
- Early host/seeker recruitment

**Estimate: 3–6 months**
**Blockers:** All Scenario B blockers + Stripe/matching/moderation founder gates + legal review

---

## 6. Recommended Next 10 Branches / PRs

| # | Branch | Scope | Why now |
|---|--------|-------|---------|
| 1 | (PR #103) `fix/shell-ownership-smoke` | Rebase onto main, merge | Clears shell tech debt now |
| 2 | `fix/ci-concurrency-expression` | Fix `ci-$ github.ref` → `ci-${{ github.ref }}` | 1-line CI correctness fix |
| 3 | `chore/copilot-instructions` | Add `.github/copilot-instructions.md` | Workspace-level Copilot guidance |
| 4 | `chore/stack-doc-sync-clerk-mapbox` | Update `docs/architecture/stack-and-providers.md` + `.env.example` | Aligns docs with Notion D013 |
| 5 | `feat/vercel-deploy-config` | Add `vercel.json`, preview deployment workflow | Enables shareable prototype |
| 6 | `foundation/contracts-v1-expand` | Issue #58 — expand `packages/contracts` | Unblocks data model + schema |
| 7 | `feat/auth-clerk-foundation` | Finalize PR #102 (Clerk + middleware + Mapbox) — after founder approval | Real auth |
| 8 | `foundation/analytics-observability` | Wire PostHog pageview + Sentry error boundary | Observability before alpha |
| 9 | `backend/supabase-schema-v1` | Listings/hosts/seekers/applications + RLS — founder gate | Real persistence |
| 10 | `foundation/canonical-listing-type` | Single `OpportunityListing` type + replace discovery fixtures | Canonical data model |
