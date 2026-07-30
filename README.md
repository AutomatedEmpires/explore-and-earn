# Explore & Earn

**A work-stay marketplace built by seekers, for seekers — every opportunity answers three questions upfront: Where will I sleep? What will I eat? What will I earn?**

[![CI](https://github.com/AutomatedEmpires/explore-and-earn/actions/workflows/ci.yml/badge.svg)](https://github.com/AutomatedEmpires/explore-and-earn/actions/workflows/ci.yml)
[![Database Security](https://github.com/AutomatedEmpires/explore-and-earn/actions/workflows/db-security.yml/badge.svg)](https://github.com/AutomatedEmpires/explore-and-earn/actions/workflows/db-security.yml)
[![Migration Guard](https://github.com/AutomatedEmpires/explore-and-earn/actions/workflows/migration-guard.yml/badge.svg)](https://github.com/AutomatedEmpires/explore-and-earn/actions/workflows/migration-guard.yml)
[![CodeQL](https://github.com/AutomatedEmpires/explore-and-earn/actions/workflows/codeql.yml/badge.svg)](https://github.com/AutomatedEmpires/explore-and-earn/actions/workflows/codeql.yml)

## Overview

Explore & Earn connects **seekers** — people who want to travel and work — with **hosts** offering work-stay opportunities: farms, boats, lodges, seasonal operations, and remote-friendly businesses. It is live in production at **[exploreandearn.com](https://exploreandearn.com)**, with paid host subscriptions operating on Stripe.

The product's core contract is the **Opportunity Triad**. Every listing must state, as first-class structured data, **Housing** (where you sleep), **Meals** (what you eat), and **Pay** (what you earn). The triad is enforced in the type system (`BenefitTriad` in `packages/contracts`), in publication gates, and in CI guardrails — it can never be collapsed into a vague "perks" label.

Hosts publish listings, review applicants, message, and manage billing from a dedicated workspace. Seekers discover opportunities through a card-first feed, apply with a structured resume, and track their whole season — applications, offers, travel, and community — inside the app.

## Why it exists

Work-exchange platforms typically bury the actual deal: what you get for your labor is scattered across free-text descriptions, and listings routinely overpromise. Explore & Earn treats the deal as data. If a listing doesn't answer Housing, Meals, and Pay honestly, it doesn't publish. Provenance tracking, benefit truth defaults, and moderation tooling extend the same honesty posture across the marketplace.

## Product

Opportunity categories are fixed: **farm, maritime, remote, seasonal** (plus a mix lane), defined once in `packages/contracts/src/enums.ts` and guarded in CI.

### Seeker surfaces (`(seeker)` route group)

- **Discovery** — `seek` feed, `swipe`, Mapbox-powered `map`, `search`, and `saved` searches, all rendered through the canonical Discovery Card contract (`packages/contracts/src/card.ts`).
- **Application lifecycle** — `applied`, `offered`, `accepted`, `not-selected`, `withdrawn`, plus re-apply flows, backed by lifecycle write policies and expiry migrations.
- **Explainable matching** — persisted match scores (`052_match_scores`) with match-trace contracts, recomputation hooks, and a new-match-alerts cron.
- **Season tools** — `home` dashboard, `journey`, `travel`, `schedule`, structured `resume` builder, and a 28-badge progression system (`packages/contracts/src/badges.ts`).
- **Community & messaging** — community spaces, conversations with RLS-hardened policies, and a notification center with per-channel preferences.
- **Guide assistant** — an Anthropic-powered assistant (`apps/web/services/assistant`) that degrades gracefully to a "not available" state when unconfigured.

### Host surfaces (`(host)` route group)

- **Listings workspace** — create, edit, and publish listings with coordinate constraints, logistics, and category-depth fields; self-publish with entitlement enforcement.
- **Applicant pipeline** — applicant review, seeker profiles, messaging, and an outreach/coach surface.
- **Billing** — Stripe-hosted checkout and customer portal for Starter / Professional / Enterprise plans (monthly and yearly), listing boosts (7/14/28 days), a flat 7-day community announcement placement, and a per-tier additional-active-listing add-on.
- **Trust mechanics** — Verified-Host badge is subscription-gated; invite quotas are tier-locked (Enterprise 20 / Pro 10 / Starter 3) via an invite credit ledger.

### Founder operations (`(admin)` route group)

An admin panel gated by an explicit Clerk user-id allow-list (not a role), with moderation actions, refund review, reports, and account-deletion request handling.

### Platform

- **Public read API** (`/api/public/v1/listings`, `/api/public/v1/organizations`) and an **MCP endpoint** (`/api/public/mcp`) for agent access to public inventory.
- **PWA** (app manifest + web push channel), locale-aware routing via `next-intl` (English shipped), token-driven theming.
- **Email** via Resend with a bounce/complaint suppression webhook (`/api/webhooks/resend`).

## Status

| Area | State |
| --- | --- |
| Marketplace (seeker + host + admin surfaces) | **Live** at exploreandearn.com |
| Stripe payments (subscriptions, boosts, add-ons) | **Live** |
| V2 redesign program (PRs #294–#305) | **Merged and deployed** (2026-07-29); follow-on redesign waves continue |
| Notification engine (dispatch, digests, backoff, unsubscribe) | **Built, staged activation** — a founder-controlled env ladder (`disabled` → … → `enabled`); production sends await founder provisioning |
| Listing-source ingestion (sourced listings, provenance) | **Built, dark** — each source requires explicit compliance approval before activation (`078_sourced_ingestion_activation`) |
| Migrations 058–065 (additive) | **Awaiting founder apply pipeline** per repo operating contract |
| Founding-host program, prospect claim flow | Schema and routes present (`087`, `086`, `/claim/[id]`); activation is founder-gated |

Deploys are automatic: merging `main` ships to production via Vercel.

## Architecture

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, React 19) in `apps/web` |
| Database | Supabase Postgres with Row Level Security (85 versioned migrations) |
| Auth | Clerk (webhook-synced user shadow tables) |
| Payments | Stripe (checkout, portal, webhooks, seeded price manifest) |
| Email | Resend (+ suppression webhooks via Svix) |
| Storage | Supabase Storage — host uploads plus the bucketed site-photos system; no external image CDN |
| AI | Anthropic (assistant surfaces, via Vercel AI Gateway) |
| Maps | Mapbox (`react-map-gl`, geocoding) |
| Analytics | PostHog |
| Monitoring | Sentry |
| Tooling | pnpm workspaces + Turborepo, TypeScript strict, Vitest, Playwright |

```
apps/
  web/              # Next.js app: [locale] route groups (seeker/host/admin/legal), api/ (cron, webhooks, public v1 + MCP)
  jobs/             # background job workers
packages/
  contracts/        # shared typed contracts: triad, card, matching, pricing, permissions, badges
  ui/               # component + icon registry (single Phosphor-based <Icon> system)
  db/               # database clients (anon + service-role admin)
  mailer/           # transactional email rendering
  stripe-seed/      # Stripe catalog seeding
supabase/
  migrations/       # 001–087, RLS-first schema
tools/scripts/      # guardrail + ratchet check scripts
docs/               # design system, runbooks, security, product canon
```

## Engineering discipline

Operational rigor is a deliberate feature of this codebase:

- **Authorization is tested, not assumed.** The `Database Security` workflow rebuilds a real Postgres from all migrations and runs the full authorization assertion suite (`pnpm db:authz`) on **every** pull request — deliberately unfiltered, because a PR that never touches SQL can still change what a role can reach.
- **Migration numbering is guarded.** `Migration Guard` fails any PR with a malformed, duplicate, or unreserved migration prefix (allocation ledger in `tools/scripts/migration-allocations.json`); merged migrations are then applied to production idempotently by the `Deploy Migrations to Production` workflow.
- **Design ratchets only tighten.** CI enforces raw-color (G50), tokenization (G51), and locale-literal (G52) baselines — hardcoded colors and untranslated strings cannot creep in, and the baselines may only shrink.
- **Product-truth guardrails.** `pnpm guardrails` chains thirteen checks: DB assertions, pricing-contract integrity, founding-host claim honesty, category taxonomy lock, match isolation, canonical contracts, dev-bench safety, preview readiness, and the design ratchets.
- **Static analysis.** CodeQL runs on every push, PR, and a weekly schedule; workflow files are linted via `pnpm lint:workflows`.

```bash
pnpm typecheck && pnpm lint && pnpm test   # correctness
pnpm guardrails                            # product + design invariants
```

## Getting started

Requires **Node 24.16.0** and **pnpm 10** (via corepack).

```bash
pnpm install
pnpm dev          # Next.js dev server (apps/web, Turbopack)
pnpm typecheck    # strict TypeScript across the workspace
pnpm lint         # ESLint
pnpm test         # Vitest unit suites
pnpm test:e2e     # Playwright end-to-end suite
pnpm guardrails   # full guardrail chain
```

Environment variables are documented **names-only** in `.env.example` (root) and `apps/web/.env.example`; values live in a locked secrets manager and are never committed. Key groups: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` / `CLERK_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_*`, `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_DSN`, `CRON_SECRET`, `NOTIFICATION_ENGINE_STAGE`, `AI_GATEWAY_API_KEY`, and `ADMIN_CLERK_USER_ID`.

The app degrades gracefully in local development: without Resend configured, emails log to the console; without an AI key, the assistant surface reports itself unavailable instead of erroring.

## For contributors and agents

`AGENTS.md` is the operating contract for any human or agent working here — locked product invariants (the triad, category taxonomy, invite quotas, design ratchets), founder approval gates, and the typed substrate to compose against (`packages/contracts`, `packages/ui`). Read it before writing code. Design truth is codified in `docs/design/`; runbooks for billing, migrations, cron, and the notification engine live in `docs/runbooks/`.
