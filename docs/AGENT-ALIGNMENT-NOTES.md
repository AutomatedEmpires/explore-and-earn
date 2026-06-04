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
- Spine: Doppler (secrets) · Vercel (hosting) · Supabase Postgres (**DB/storage only**) · Stripe · Cloudinary · PostHog + Sentry · Streamline icons · TypeScript · Next.js.

## What changed in THIS repo (and why)
1. **`package.json`** — added `engines.node: "24.16.0"`. E&E was the only app with no `engines` pin; it now matches BidSpace + Sweepza exactly.
2. **`.env.example`** — **locked Clerk + Mapbox**:
   - Supabase relabeled **database / storage only** (no longer the auth provider).
   - Added **Clerk** auth keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, sign-in/up URLs).
   - Replaced **Azure Maps** with **Mapbox** (`NEXT_PUBLIC_MAPBOX_TOKEN`, `MAPBOX_ACCESS_TOKEN`); `AZURE_MAPS_KEY` left commented and marked DEPRECATED until the code migration lands.
3. **This note** — handoff record for build agents.
4. **`middleware.ts`** — migrated from Supabase Auth stub → **Clerk** (`clerkMiddleware` + `createRouteMatcher`). Seeker and host routes are now protected; unauthenticated requests are redirected by Clerk automatically.
5. **`apps/web/app/layout.tsx`** — **`ClerkProvider`** wraps the app root, enabling session access throughout the React tree.
6. **`apps/web/package.json`** — `@clerk/nextjs` added as a dependency.
7. **`docs/architecture/stack-and-providers.md`** — updated provider table: Auth → Clerk, Maps → Mapbox, Supabase → DB/storage only.

## Migration status

### Auth (Supabase Auth → Clerk) — ✅ COMPLETE
- `@clerk/nextjs` installed.
- `ClerkProvider` wraps the app root in `apps/web/app/layout.tsx`.
- `middleware.ts` uses `clerkMiddleware` to protect seeker + host routes.
- Auth service placeholder updated with Clerk guidance.
- Supabase Postgres and Storage are retained; Supabase Auth is retired.

### Maps (Azure Maps → Mapbox) — ⏳ PENDING real tile/vector implementation
- Decision locked: **Mapbox** is the provider (cross-app standard).
- `.env.example` already lists `NEXT_PUBLIC_MAPBOX_TOKEN` and `MAPBOX_ACCESS_TOKEN`.
- The Sprint Zero `OpportunityMap` component is a location-grouped list view (no map library was ever wired in Sprint Zero). Mapbox GL JS integration lands when the geocoded data layer ships (tracked separately).
- **Do NOT** wire any map work against Azure Maps — Mapbox only.

## Still pending (founder / build agents)
- **CI `.nvmrc` alignment** — E&E's `.github/workflows/ci.yml` still hardcodes `node-version: 24.16.0`. BidSpace + Sweepza CI already use `node-version-file: .nvmrc`. Change E&E's setup-node step to `node-version-file: .nvmrc` so the runtime is single-sourced. (Requires `workflows` permission.)
- **Mapbox GL JS wiring** — when the geocoded listings data layer ships, swap `OpportunityMap`'s list view for a real Mapbox tile/vector map behind the same component contract.
- **RLS migration** — update Supabase RLS policies to key on Clerk user ID (instead of Supabase Auth `auth.users.id`) once the Clerk JWT → Supabase integration is configured.
