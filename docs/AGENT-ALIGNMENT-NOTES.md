# Agent Alignment Notes — Explore&Earn (E&E)

> **Date:** 2026-06-04 · **Author:** Teach (founder's Notion agent) · **Branch:** `chore/lock-clerk-mapbox-runtime`
> Read this with `AGENTS.md` before doing any build work. It records a cross-app standardization pass and what it means for E&E specifically.

## The system you are part of
Three apps — **Explore&Earn (E&E)**, **BidSpace**, **Sweepza** — are built by one founder under the **AutomatedEmpires** org and coordinated through Notion. They run as **one venture system: one doctrine, one machine, one runtime, one integration spine.** Only product scope differs. E&E has been the reference implementation for workflow + runtime; this pass closes the two places where E&E was the *outlier* on the spine (auth + maps).

## Prime doctrine
**Notion decides. GitHub builds. Figma shows. Everything else runs.**
- Notion = product & vision truth. This repo = implementation truth.

## Locked cross-app standard (2026-06-04)
- **Auth = Clerk** (all three apps).
- **Maps = Mapbox** (any app that needs maps).
- **Runtime:** Node **24.16.0** (`.nvmrc`, exact) · pnpm **10.12.4** (`packageManager`) · TypeScript **^5.8.3** · Turborepo.
- Spine: Doppler (secrets) · Vercel (hosting) · Supabase Postgres + Storage (**all imagery; no image CDN**) · Stripe · PostHog + Sentry · Phosphor icons · TypeScript · Next.js.

## What changed in THIS repo (and why)
1. **`package.json`** — added `engines.node: "24.16.0"`. E&E was the only app with no `engines` pin; it now matches BidSpace + Sweepza exactly.
2. **`.env.example`** — **locked Clerk + Mapbox**:
   - Supabase relabeled **database / storage only** (no longer the auth provider).
   - Added **Clerk** auth keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, sign-in/up URLs).
   - Replaced **Azure Maps** with **Mapbox** (`NEXT_PUBLIC_MAPBOX_TOKEN`, `MAPBOX_ACCESS_TOKEN`); `AZURE_MAPS_KEY` left commented and marked DEPRECATED until the code migration lands.
3. **This note** — handoff record for build agents.

## What this pass did NOT change (do not assume it is done)
- **No application code was migrated.** Supabase Auth → Clerk and Azure Maps → Mapbox are real code changes (middleware/session, sign-in/up flows, map components, deps + lockfile) and are **gated build work**, tracked in **issue #91**. This branch only locks the decision + env manifest + docs so nobody keeps building on the old providers.
- **Do NOT** wire any new feature against Supabase Auth or Azure Maps. New auth work = Clerk. New map work = Mapbox.

## Still pending (founder / build agents)
- **Issue #91** — execute the Clerk + Mapbox code migration in E&E (needs a Build Pack + founder sign-off per `AGENTS.md`; auth is a founder-gated area).
- **CI `.nvmrc` alignment** — E&E's `.github/workflows/ci.yml` still hardcodes `node-version: 24.16.0`. BidSpace + Sweepza CI already use `node-version-file: .nvmrc`. Change E&E's setup-node step to `node-version-file: .nvmrc` so the runtime is single-sourced. (Teach could not commit this — the connected GitHub app lacks the `workflows` permission; founder or a workflow-scoped agent must apply it.)

## What to do next (agent picking this up)
- Review + merge this PR (founder is the approver — builder ≠ approver).
- Pick up issue #91 with a Build Pack to do the actual Clerk/Mapbox code migration.
- Apply the CI `.nvmrc` change above.
