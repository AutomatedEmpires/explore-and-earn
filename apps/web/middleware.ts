import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "./i18n/routing";
import {
  REDIRECT_PARAM,
  RETURN_PARAM,
  RETURN_PARAM_NAMES,
  safeInternalRedirect,
  type ReturnParamName,
} from "./lib/authRedirect";
import { isCommunityPath } from "./lib/communityRoutes";
import { DEV_ROLE_COOKIE, isDevBenchEnabled } from "./lib/devBench";
import { isPrivateHostDashboardPath } from "./lib/hostRoutes";

// next-intl locale middleware. Handles locale negotiation + the "as-needed"
// prefix scheme: unprefixed English paths pass through untouched, a stray
// /en/… redirects to the canonical unprefixed URL, and additional locales get
// their prefix. Run ONLY for localizable page routes (see shouldLocalize) — API
// routes and metadata files must never be rewritten into a /[locale]/ path.
const intlMiddleware = createIntlMiddleware(routing);

// Paths that are NOT under app/[locale] and therefore must bypass locale
// rewriting: API handlers, the Sentry tunnel, and the root-level metadata routes
// (sitemap/robots/llms/opengraph/icon/manifest/favicon). Clerk still runs on
// these (the matcher includes /api) — only the intl rewrite is skipped.
const NON_LOCALIZED_EXACT = new Set([
  "/sitemap.xml",
  "/robots.txt",
  "/llms.txt",
  "/favicon.ico",
  "/manifest.webmanifest",
]);
const NON_LOCALIZED_PREFIXES = ["/api", "/trpc", "/monitoring"];
const NON_LOCALIZED_STARTSWITH = ["/opengraph-image", "/icon", "/apple-icon"];

function shouldLocalize(pathname: string): boolean {
  if (NON_LOCALIZED_EXACT.has(pathname)) return false;
  if (
    NON_LOCALIZED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
  ) {
    return false;
  }
  if (NON_LOCALIZED_STARTSWITH.some((p) => pathname.startsWith(p))) return false;
  return true;
}

// "as-needed": the DEFAULT locale is unprefixed, so a stray "/en/…" is
// non-canonical and must 308 to the unprefixed URL. Do this BEFORE auth so a
// public page (e.g. /en/seek) isn't auth-walled purely by the prefix — and so
// that when non-default locales are added, only the default prefix is stripped
// ("/es/seek" passes through to normal localized handling). Returns a redirect
// response, or null when there's nothing to strip.
function redirectDefaultLocalePrefix(request: NextRequest): NextResponse | null {
  const prefix = `/${routing.defaultLocale}`;
  const { pathname } = request.nextUrl;
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;
  const url = request.nextUrl.clone();
  url.pathname = pathname.slice(prefix.length) || "/";
  return NextResponse.redirect(url);
}

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
  // /swipe is the third of those modes and was the one omitted. The footer's
  // Explore column, the homepage "three ways in" section and the for-hosts
  // discovery section have all linked it the whole time, so every signed-out
  // visitor who chose Swipe met a 404 (Clerk's protect() rewrites rather than
  // redirects — the response carried x-clerk-auth-reason: protect-rewrite,
  // which is why this looked like a missing route rather than an auth wall).
  // The page itself was always written for this visitor: with no userId it
  // skips the personalized batch and falls back to the public feed on purpose.
  // Same class of miss as the /for-hosts/demo 404 — a prerender proves the
  // route builds, never that middleware lets a stranger reach it.
  "/swipe",
  // Indexable category landing pages (/jobs + /jobs/{lane}) — advertised in
  // the sitemap and footer; MUST be reachable without a login or they cannot
  // be crawled. Bare path + "/(.*)" pair per the /sign-in convention below.
  "/jobs",
  "/jobs/(.*)",
  "/listing/(.*)",
  "/host/(.*)", // Public host profiles (/host/{id}) + layout-gated authed routes
  // Bare path + "/(.*)" pair (like /blog below) so the entry URLs themselves
  // are public — "/sign-in/(.*)" alone left /sign-in auth-guarded — without
  // the prefix-wildcard "/sign-in(.*)" form, which would also make sibling
  // routes like /sign-in-help public.
  "/sign-in",
  "/sign-in/(.*)",
  "/sign-up",
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
  // Public agent surfaces (RFC 2026-07-14 §1): the versioned read-only REST
  // API and MCP server serve anonymous external agents by design. They carry
  // their own per-IP rate limits and expose only live public inventory — the
  // privacy boundary is the DTO layer, not a login.
  "/api/public/(.*)",
  "/terms",
  "/privacy",
  "/cookies",
  "/refunds",
  "/sourced-listings", // Policy §6 disclosure page — linked from every sourced band.
  // Photo attribution page — linked from the footer on every page and listed in
  // the sitemap. It carries the CC-BY / CC-BY-SA credit for shipped photography,
  // so an anonymous reader (and a crawler) MUST be able to reach it. Same class
  // of miss as /swipe and /for-hosts/demo: a prerender proves the route builds,
  // never that middleware lets a stranger through.
  "/credits",
  "/about",
  "/faq", // Advertised in sitemap + llms.txt; legal/marketing content, no auth.
  "/for-hosts(.*)", // Prospect-facing host preview + the public demo workspace — MUST be reachable without a login. (Exact-match here 404d /for-hosts/demo in prod while the branch build passed: SSG prerender never runs middleware, so only production traffic could reveal it.)
  // The seeker half of the two-door IA (D18). Same wildcard shape as
  // /for-hosts above, and for the same reason: an exact match here is how
  // /for-hosts/demo 404'd in production while every prerender passed. This
  // page is the signed-out door to the seeker product — an auth wall on it
  // dead-ends the entire seeker funnel.
  "/for-seekers(.*)",
  "/blog", // Editorial marketing surface (PublicBottomNav-chrome'd).
  "/blog/(.*)",
  "/sitemap.xml",
  "/robots.txt",
  // Generated metadata images are requested by browsers and link unfurlers
  // without a Clerk session. Keep them outside the auth wall just like the
  // static metadata routes above.
  "/icon",
  "/opengraph-image",
  // Advertised AI site guide (linked from robots + docs) — must be readable
  // by anonymous crawlers/agents, exactly like robots.txt and the sitemap.
  "/llms.txt",
  // Seeker onboarding is auth-required, but excluded from the post-auth gate so
  // the (seeker) layout's onboarding redirect never loops back on itself.
  "/onboarding",
  "/onboarding/(.*)",
]);

type FunnelRole = "host" | "seeker";

interface ProtectedFunnel {
  readonly role: FunnelRole;
  /**
   * Which query name carries the return path. Existing funnels keep Clerk's
   * `redirect_url`; the Community correction emits the spec-named `returnTo`
   * (D18). Both are validated by the same function — see lib/authRedirect.
   */
  readonly param: ReturnParamName;
}

/**
 * Routes whose signed-out response must be a ROLE-SHAPED REDIRECT, decided
 * here rather than left to Clerk's auth.protect().
 *
 * WHY THESE CANNOT JUST BE "not public". auth.protect() has two very different
 * signed-out behaviours and neither is what any of these funnels want:
 *
 *   * A document request (a real browser) is sent to `signInUrl`, which — with
 *     no NEXT_PUBLIC_CLERK_SIGN_IN_URL configured — is Clerk's hosted Account
 *     Portal, OFF this domain. The visitor loses the role, loses the seeker
 *     framing, and returns to a page that has no idea why they arrived.
 *   * Anything else (a crawler, a link unfurler, curl, a fetch) gets
 *     notFound() — the internal rewrite that carries
 *     `x-clerk-auth-reason: protect-rewrite` and reads to the caller as a plain
 *     404. That is exactly how /swipe and /for-hosts/demo looked "missing" in
 *     production while their branch builds passed: a prerender proves a route
 *     builds, never that middleware lets a stranger reach it.
 *
 * Community (D18) is in this list because it stopped being public in V2: it is
 * an authenticated SEEKER space, so a signed-out visitor must be handed a
 * seeker sign-in that knows where to send them back to — not a 404, and not an
 * off-site portal.
 */
function protectedFunnel(pathname: string): ProtectedFunnel | null {
  if (
    isPrivateHostDashboardPath(pathname) ||
    pathname === "/claim" ||
    pathname.startsWith("/claim/")
  ) {
    return { role: "host", param: REDIRECT_PARAM };
  }
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) {
    return { role: "seeker", param: REDIRECT_PARAM };
  }
  if (isCommunityPath(pathname)) {
    return { role: "seeker", param: RETURN_PARAM };
  }
  return null;
}

function redirectToRoleSignIn(
  request: NextRequest,
  funnel: ProtectedFunnel,
): NextResponse {
  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  url.searchParams.set("role", funnel.role);
  // The path is ours (it is the URL the visitor just asked for), but it goes
  // through the same validator as an attacker-supplied one so there is exactly
  // one definition of "safe return path" in the product. A value that somehow
  // fails is dropped, not passed through: the visitor lands on the role default.
  const safePath = safeInternalRedirect(requestedPath);
  if (safePath) url.searchParams.set(funnel.param, safePath);
  return NextResponse.redirect(url);
}

/**
 * Scrub an unsafe (or duplicated) return path off the auth entry URLs.
 *
 * Runs for BOTH accepted names. A single valid value passes through untouched;
 * anything else — an absolute URL, a protocol-relative host, a backslash trick,
 * or two copies of the parameter so a later reader picks the other one — is
 * deleted and the visitor is redirected to the cleaned URL.
 */
function stripUnsafeAuthRedirect(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/sign-in" && pathname !== "/sign-up") return null;

  const unsafe = RETURN_PARAM_NAMES.filter((name) => {
    const candidates = searchParams.getAll(name);
    if (candidates.length === 0) return false;
    if (candidates.length > 1) return true;
    return !safeInternalRedirect(candidates[0] ?? undefined);
  });
  if (unsafe.length === 0) return null;

  const url = request.nextUrl.clone();
  for (const name of unsafe) url.searchParams.delete(name);
  return NextResponse.redirect(url);
}

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
      const defaultLocaleRedirect = redirectDefaultLocalePrefix(request);
      if (defaultLocaleRedirect) return defaultLocaleRedirect;
      const safeAuthRedirect = stripUnsafeAuthRedirect(request);
      if (safeAuthRedirect) return safeAuthRedirect;
      const localize = shouldLocalize(request.nextUrl.pathname);
      // DEV MOCK BENCH (review tooling only): when impersonating a role locally,
      // skip Clerk protection so every surface is reachable without a login.
      // The bypass ONLY renders role shells — the session's getToken() hands back
      // the inert sentinel token (not the real service-role key) and the admin
      // grant stays off unless isDevBenchPrivileged() (explicit NEXT_PUBLIC_DEV_BENCH=1
      // + non-prod Supabase URL). So a stray `next dev` against prod env renders
      // empty shells with NO real data or admin — never bundled in a prod build
      // (NODE_ENV gate). See lib/devBench.
      if (isDevBenchEnabled() && request.cookies.get(DEV_ROLE_COOKIE)) {
        // Still run the locale middleware so the bench resolves the right
        // /[locale]/ route (just without the Clerk gate).
        return localize ? intlMiddleware(request) : undefined;
      }
      const funnel = protectedFunnel(request.nextUrl.pathname);
      if (funnel) {
        const { userId } = await auth();
        if (!userId) return redirectToRoleSignIn(request, funnel);
      }
      if (!isPublicRoute(request)) {
        await auth.protect();
      }
      // After auth, hand localizable page routes to next-intl. API + metadata
      // routes fall through untouched (Clerk has already run on them).
      return localize ? intlMiddleware(request) : undefined;
    })
  : function authFallbackMiddleware(request: NextRequest) {
      // DEV MOCK BENCH: same impersonation bypass the Clerk branch has, so
      // keyless local QA (and the keyless Playwright harness) can traverse
      // role SHELLS with the ee_dev_role cookie. Gated by isDevBenchEnabled()
      // (NODE_ENV — never in a prod build); the privileged grants (real
      // service-role key + admin) stay behind isDevBenchPrivileged() in
      // lib/devBench + lib/admin, so this only ever opens inert shells.
      const defaultLocaleRedirect = redirectDefaultLocalePrefix(request);
      if (defaultLocaleRedirect) return defaultLocaleRedirect;
      const safeAuthRedirect = stripUnsafeAuthRedirect(request);
      if (safeAuthRedirect) return safeAuthRedirect;
      const localize = shouldLocalize(request.nextUrl.pathname);
      if (isDevBenchEnabled() && request.cookies.get(DEV_ROLE_COOKIE)) {
        return localize ? intlMiddleware(request) : NextResponse.next();
      }
      const funnel = protectedFunnel(request.nextUrl.pathname);
      if (funnel) return redirectToRoleSignIn(request, funnel);
      // Fail closed: when Clerk is not configured (local/dev only, since
      // production and preview throw above), protected routes are denied
      // rather than silently opened.
      if (!isPublicRoute(request)) {
        return new NextResponse("Unauthorized — Clerk not configured", {
          status: 401,
        });
      }

      // Public route: still run locale negotiation for page routes so keyless
      // local QA / Playwright get the same /[locale]/ resolution as production.
      return localize ? intlMiddleware(request) : NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
