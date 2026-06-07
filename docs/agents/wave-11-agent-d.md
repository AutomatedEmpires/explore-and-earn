# Wave 11 — Agent D: Production Hardening

**Branch:** `feature/production-hardening`
**Lane:** Infrastructure, config, error boundaries, security headers, rate limiting, sitemap — no domain feature code, no Supabase migrations, no packages/db query logic

---

## Your mission

Make the application production-deployable. Every page must have an error boundary. Every critical server action must have rate limiting. The app must pass a basic security headers audit. The sitemap must be complete. The deployment config must be correct.

---

## Context: current state

- Vercel project is provisioned and deployments are running
- Clerk, Supabase, Resend, PostHog, Sentry are integrated
- `next.config.ts` exists — check what security headers it currently sets
- `middleware.ts` handles Clerk auth — check if it also handles rate limiting or security headers
- `apps/web/app/sitemap.ts` exists — read it, it likely only returns a handful of static routes
- `apps/web/app/(seeker)/` has `error.tsx`? Check. Same for `(host)`, `(admin)`, `(legal)`, public routes
- Rate limiting: nothing in the codebase — `apps/web/app/actions/` has no rate limiting on apply, invite, or message actions

---

## Task 1: Error boundaries — every route group

Check which route groups have `error.tsx`. For any that don't, create one.

Every `error.tsx` must:
- Be a `"use client"` component
- Accept `{ error: Error; reset: () => void }` props
- Display a user-friendly error message in the app's visual language (use CSS custom properties, match the shell's visual style)
- Include a "Try again" button that calls `reset()`
- Log the error to Sentry if `NEXT_PUBLIC_SENTRY_DSN` is set: `import * as Sentry from "@sentry/nextjs"; Sentry.captureException(error);`

Route groups to cover (create `error.tsx` in each if missing):
- `apps/web/app/(seeker)/error.tsx`
- `apps/web/app/(host)/error.tsx`
- `apps/web/app/(admin)/error.tsx`
- `apps/web/app/(seeker-onboard)/error.tsx`
- `apps/web/app/(host-onboard)/error.tsx`
- `apps/web/app/(legal)/error.tsx`
- `apps/web/app/error.tsx` (root-level fallback)
- `apps/web/app/listing/[id]/error.tsx`
- `apps/web/app/host/[id]/error.tsx`

Also check for `not-found.tsx` at the root level and add one if missing — it renders for 404s. Match the visual language.

---

## Task 2: Security headers in next.config.ts

Read the current `apps/web/next.config.ts`. Add a `headers()` export that sets security headers on all routes:

```typescript
async headers() {
  return [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "Content-Security-Policy",
          // Build CSP that allows: Clerk (accounts.*.clerk.com), Supabase storage,
          // Mapbox GL JS, PostHog, Sentry — check which domains are actually used
          // by reading the existing imports and scripts in the app
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://clerk.com https://*.clerk.accounts.dev https://js.sentry-cdn.com https://browser.sentry-cdn.com https://us.posthog.com",
            "style-src 'self' 'unsafe-inline' https://api.tiles.mapbox.com",
            "img-src 'self' blob: data: https://*.supabase.co https://*.mapbox.com",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.clerk.com https://api.mapbox.com https://events.mapbox.com https://us.posthog.com https://sentry.io https://api.resend.com",
            "font-src 'self' data:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; "),
        },
      ],
    },
  ];
},
```

**IMPORTANT:** Test the CSP carefully. If Clerk, Supabase Realtime, or Mapbox break under the CSP, adjust the directives. Do not ship a CSP that breaks the app. If the CSP is too strict to get right without testing in a live browser, add `report-only` mode temporarily and add a `TODO: switch to enforce mode after browser testing`.

---

## Task 3: Rate limiting on critical server actions

Use `@upstash/ratelimit` with `@upstash/redis` if Upstash is available in the Vercel env, OR implement a simple in-memory rate limit using `unstable_cache` from Next.js with a short TTL as a lighter alternative.

Check if `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars are set in `.env.example`. If not, use a simple `Map`-based in-memory rate limiter acceptable for initial production (not horizontally scalable, but good enough for MVP):

```typescript
// apps/web/lib/rateLimit.ts
const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean } {
  const now = Date.now();
  const window = windows.get(key);
  if (!window || now > window.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (window.count >= limit) {
    return { allowed: false };
  }
  window.count++;
  return { allowed: true };
}
```

Apply rate limiting to these server actions by adding a check at the top of each, using `userId` as the key:

| Action | Limit | Window |
|---|---|---|
| `applyToListingAction` | 5 applies | per hour |
| `createInviteAction` | 20 invites | per hour |
| `sendMessageAction` (or equivalent) | 30 messages | per minute |
| `saveListingAction` | 100 saves | per hour |

Return `{ ok: false, error: "rate_limit_exceeded" }` when the limit is hit.

---

## Task 4: Sitemap completion

Read `apps/web/app/sitemap.ts`. It likely only returns static routes.

Extend it to include:
- All `status = 'live'` listing URLs: `/listing/[id]` — fetch from Supabase using the `anonClient()` and a simple select of `id` from `listings WHERE status = 'live'`
- All host profile URLs: `/host/[id]` — fetch `id` from `host_profiles` (all active hosts)

Cap at 50,000 entries (Google's sitemap limit). Use `<url><loc>...</loc><lastmod>...</lastmod></url>` with `updatedAt` from the listing/profile row.

```typescript
// In sitemap.ts, add dynamic entries:
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";
  
  const [listings, hosts] = await Promise.all([
    anonClient().from("listings").select("id, updated_at").eq("status", "live").limit(10000),
    anonClient().from("host_profiles").select("id, updated_at").limit(5000),
  ]);
  
  const listingUrls = (listings.data ?? []).map((l) => ({
    url: `${base}/listing/${l.id}`,
    lastModified: l.updated_at ?? new Date().toISOString(),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));
  
  const hostUrls = (hosts.data ?? []).map((h) => ({
    url: `${base}/host/${h.id}`,
    lastModified: h.updated_at ?? new Date().toISOString(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
  
  return [
    { url: base, changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/search`, changeFrequency: "daily", priority: 0.9 },
    ...listingUrls,
    ...hostUrls,
  ];
}
```

Also create `apps/web/app/robots.ts` if it doesn't exist:
```typescript
export default function robots() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/host/", "/admin/", "/onboarding/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
```

---

## Task 5: Loading states audit

Check every route group for `loading.tsx`. Some already exist (host/listings/[id], host/applicants/[id]). Add `loading.tsx` for:
- `apps/web/app/(seeker)/swipe/loading.tsx` — skeleton card stack
- `apps/web/app/(seeker)/map/loading.tsx` — map skeleton
- `apps/web/app/(seeker)/saved/loading.tsx` — card grid skeleton
- `apps/web/app/(seeker)/applied/loading.tsx` — list skeleton
- `apps/web/app/listing/[id]/loading.tsx` — detail skeleton
- `apps/web/app/host/[id]/loading.tsx` — profile skeleton

Each `loading.tsx` should return a simple skeleton using the `Skeleton` primitive from `packages/ui`. Match the rough layout of the real page so the CLS is minimal.

---

## Task 6: `next.config.ts` — image domains + bundle

Read the current `apps/web/next.config.ts`. Verify:
- `images.remotePatterns` includes `*.supabase.co` with the correct pattern
- `output` is not set to `export` (would break server components)
- `experimental.serverActions` is enabled if needed (Next 14+ enables by default)

If the config doesn't already have it, add `compress: true` and ensure `reactStrictMode: true`.

---

## Rules

- Do NOT modify domain feature files (seeker pages, host pages, query functions)
- Do NOT add migrations or touch `supabase/`
- Do NOT add new npm packages without checking `package.json` first — prefer using what's already installed
- CSS custom properties only — no hardcoded colors in error boundaries or loading states
- Error boundaries use `"use client"` directive
- Rate limiter is best-effort — never block a request with an unhandled throw

---

## Delivery

Single PR: `feat(infra): production hardening — error boundaries, security headers, rate limiting, sitemap, loading states`
