# Dev Mock Bench — Design Spec

**Date:** 2026-06-17
**Branch:** `tooling/dev-mock-bench`
**Status:** Approved (design), implementing
**Author:** engineer station (Claude)

## Goal

A **dev-only** "mock bench" that lets a reviewer browse **every surface of the app
as seeker / host / admin**, with mock data, **without** juggling Clerk logins or
seeding accounts. "Review as though it's real." **Never reachable in production.**

Decided in brainstorming:
- **Capability:** full impersonation (flip role instantly, no Clerk login).
- **Mock data:** component fixtures (deterministic, zero DB dependency).
- **Toolbar:** floating, on every page (in dev only).
- **Enablement:** auto-on whenever `NODE_ENV !== "production"` (i.e. local `next dev`
  only — preview/prod builds run `NODE_ENV=production`). Kill-switch
  `NEXT_PUBLIC_DEV_BENCH=0` to force-off; otherwise no flag to flip.

## Safety spine (the one rule everything keys off)

`apps/web/lib/devBench/index.ts` exports:

```ts
export function isDevBenchEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.NEXT_PUBLIC_DEV_BENCH !== "0";
}
```

- Prod and Vercel **preview** both build with `NODE_ENV=production`, so the bench is
  structurally off there — matching the existing middleware comment that preview
  must enforce real auth.
- The dev-only **webpack alias** (below) is also gated on `NODE_ENV !== "production"`,
  so in a prod build the shim is **not even bundled**.
- Guardrail script `tools/scripts/check-dev-bench.mjs` (wired into `pnpm guardrails`)
  fails if `NEXT_PUBLIC_DEV_BENCH` is set to anything other than `0`/unset in a
  committed env file, and asserts the gate string is intact.

## Architecture

### 1. Impersonation without touching 67 call sites — Clerk server shim + alias

67 files / 96 `auth()` calls import `@clerk/nextjs/server` directly. Rather than edit
them, a **dev-only webpack module alias** swaps that import for a thin shim.

- `apps/web/lib/devBench/clerkServerShim.ts`:
  - `export * from "clerk-real/server"` (re-exports the real module: `clerkMiddleware`,
    `createRouteMatcher`, `clerkClient`, etc., unchanged).
  - Overrides `auth()` and `currentUser()`: when `isDevBenchEnabled()` **and** a dev
    role cookie is present, return a **synthetic session** (`userId = DEV_USER_ID`,
    `getToken` → sentinel string); otherwise delegate to real Clerk.
  - `cookies()` is **lazily** imported inside the override so the top-level module is
    import-safe in every runtime (RSC, route handler, edge middleware).
- `apps/web/lib/devBench/clerk-real.d.ts`: `declare module "clerk-real/server" { export * from "@clerk/nextjs/server"; }`
  — gives TypeScript the real types without a runtime path.
- `next.config.ts` `webpack()` hook, **only when `NODE_ENV !== "production"` and `isServer`**:
  - `"clerk-real/server$"` → `require.resolve("@clerk/nextjs/server")` (real file)
  - `"@clerk/nextjs/server$"` → the shim path
  - Exact-match (`$`) aliases so deep imports are unaffected and the shim's own import
    (`clerk-real/server`) does not alias back to itself (no circular resolution).

Net effect: with a role cookie set, **every** server `auth()` returns a non-null
`userId`, so no page bails to `/sign-in`.

### 2. Gate branches (small, explicit)

The shim gives `userId`, but profile/role gates still need handling. In dev-bench mode
**all gates are satisfied** so any surface is reachable; the role cookie is cosmetic
(drives identity name, header scope, default landing, toolbar highlight):

- `apps/web/middleware.ts`: if `isDevBenchEnabled()` and the `ee_dev_role` cookie is
  present (read from `request.cookies`), treat the route as public (skip
  `auth.protect()`), so protected routes render without a real Clerk session.
- `app/(host)/layout.tsx`: if `isDevBenchEnabled()`, synthesize a host profile from the
  `HOST_PROFILE` fixture instead of redirecting to `/host/onboarding`.
- `app/(admin)/layout.tsx` + `lib/admin.ts`: `isAdminUserId`/`isCurrentUserAdmin` return
  true under dev bench, so admin surfaces render.
- `app/(seeker)/layout.tsx`: already resilient (try/catch → safe defaults); add the
  fixture seeker identity for a nicer name.

### 3. Mock data — fixtures first

Core data modules get one branch: when `isDevBenchEnabled()`, return fixtures **before**
hitting Supabase (locally `hasPublicDataConfig` is true, so this forces determinism).
Start with the shared seams: `components/discovery/data.ts`, `components/seeker/data.ts`,
`components/seeker/resume.ts`, `components/listing/toDetailData.ts`. Surfaces whose data
path has no fixture get one **incrementally** as gaps surface during the walkthrough —
not all ~50 upfront.

### 4. Bench UI

- `app/(dev)/dev/page.tsx` — its own route group (no role shell). Shows current role,
  three role-switch buttons (a server action sets the `ee_dev_role` cookie), and a
  categorized index of **every** surface (seeker / host / admin / public) as links.
- `components/dev/DevBenchToolbar.tsx` — floating, fixed overlay with a clear
  "DEV BENCH · not production" treatment; current role, one-click role flip, link to
  `/dev`. Mounted in root `layout.tsx` **only when `isDevBenchEnabled()`**.

## Files

**New:** `lib/devBench/index.ts`, `lib/devBench/clerkServerShim.ts`,
`lib/devBench/clerk-real.d.ts`, `lib/devBench/devBench.test.ts`,
`app/(dev)/dev/page.tsx`, `app/(dev)/dev/actions.ts`,
`components/dev/DevBenchToolbar.tsx` (+ `.module.css`),
`tools/scripts/check-dev-bench.mjs`.

**Edit:** `next.config.ts`, `middleware.ts`, `app/layout.tsx`,
`app/(seeker)/layout.tsx`, `app/(host)/layout.tsx`, `app/(admin)/layout.tsx`,
`lib/admin.ts`, the core data modules above, `apps/web/.env.example`,
root `package.json` (`guardrails` script).

## Out of scope (YAGNI)

- No write/mutation support as the impersonated user — reviewing is read-only;
  fixture data is in-memory, so any mutation simply won't persist.
- No new Clerk or DB accounts; no changes to real auth.
- Not pre-building fixtures for all ~50 surfaces — only as gaps appear.

## Verification

- `tsc -b` (typecheck) and `eslint .` clean.
- Unit test: `isDevBenchEnabled()` returns false when `NODE_ENV==="production"` even with
  the flag set (prod-off guarantee).
- Manual: with bench on, walk seeker/host/admin/public surfaces in the browser; confirm
  each renders with mock data and the role switcher works. With `NEXT_PUBLIC_DEV_BENCH=0`,
  confirm the toolbar/`/dev` disappear and real auth gates return.
