import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { DEV_ROLE_COOKIE, isDevBenchEnabled } from "./lib/devBench";

const isPublicRoute = createRouteMatcher([
  "/",
  "/search",
  // Public discovery surfaces. These live in the (seeker) route group but its
  // layout renders safe defaults for signed-out visitors (no userId → no
  // redirect), and their data (live listings) is public. The homepage hero
  // CTAs, robots.txt, sitemap, and llms.txt all advertise /seek + /map as
  // public — they MUST be reachable without a login or the funnel dead-ends.
  "/seek",
  "/map",
  "/listing/(.*)",
  "/host/(.*)", // Public host profiles (/host/{id}) + layout-gated authed routes
  "/sign-in/(.*)",
  "/sign-up/(.*)",
  "/api/webhooks/(.*)",
  "/api/health",
  // Browser CSP violation reports are fired by the UA with no Clerk session —
  // most of them from signed-out visitors on public pages. Without this entry,
  // clerkMiddleware rejects every report before the handler runs and the
  // report-only rollout collects nothing.
  "/api/csp-report",
  // Vercel Cron invokes this with `Authorization: Bearer ${CRON_SECRET}`, not a
  // Clerk session — so it must bypass Clerk's auth.protect() to reach the route
  // handler, which validates the cron secret itself. Without this, the daily
  // expire-listings job is rejected before its own auth check ever runs.
  "/api/cron/(.*)",
  "/terms",
  "/privacy",
  "/cookies",
  "/about",
  "/faq", // Advertised in sitemap + llms.txt; legal/marketing content, no auth.
  "/for-hosts", // Prospect-facing host preview — MUST be reachable without a login.
  "/blog", // Editorial marketing surface (PublicBottomNav-chrome'd).
  "/blog/(.*)",
  "/sitemap.xml",
  "/robots.txt",
  // Advertised AI site guide (linked from robots + docs) — must be readable
  // by anonymous crawlers/agents, exactly like robots.txt and the sitemap.
  "/llms.txt",
  // Seeker onboarding is auth-required, but excluded from the post-auth gate so
  // the (seeker) layout's onboarding redirect never loops back on itself.
  "/onboarding",
  "/onboarding/(.*)",
]);

const hasClerkMiddlewareConfig =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY);

// Clerk must be configured in EVERY deployed environment (production AND
// preview). Preview deployments are publicly reachable, so they must enforce
// the same auth as production. Do NOT reintroduce a `VERCEL_ENV === "preview"`
// bypass here — it leaves preview environments fully unauthenticated.
if (process.env.NODE_ENV === "production" && !hasClerkMiddlewareConfig) {
  throw new Error(
    "Clerk env vars (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY) must be set in all deployed environments, including preview.",
  );
}

export default hasClerkMiddlewareConfig
  ? clerkMiddleware(async (auth, request) => {
      // DEV MOCK BENCH (review tooling only): when impersonating a role locally,
      // skip Clerk protection so every surface is reachable without a login.
      // isDevBenchEnabled() is false in production/preview, so this never opens
      // a deployed environment. See lib/devBench.
      if (isDevBenchEnabled() && request.cookies.get(DEV_ROLE_COOKIE)) {
        return;
      }
      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    })
  : function authFallbackMiddleware(request: Request) {
      // DEV MOCK BENCH: same impersonation bypass the Clerk branch has, so
      // keyless local QA (and the keyless Playwright harness) can traverse
      // role shells with the ee_dev_role cookie. isDevBenchEnabled() is
      // compile-time false in production builds — this can never open a
      // deployed environment.
      if (
        isDevBenchEnabled() &&
        (request as { cookies?: { get(name: string): unknown } }).cookies?.get(
          DEV_ROLE_COOKIE,
        )
      ) {
        return NextResponse.next();
      }
      // Fail closed: when Clerk is not configured (local/dev only, since
      // production and preview throw above), protected routes are denied
      // rather than silently opened.
      if (!isPublicRoute(request as Parameters<typeof isPublicRoute>[0])) {
        return new NextResponse("Unauthorized — Clerk not configured", {
          status: 401,
        });
      }

      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
