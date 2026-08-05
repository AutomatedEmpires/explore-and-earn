import { createRequire } from "node:module";
import path from "node:path";

import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const require = createRequire(import.meta.url);

// next-intl: threads the per-request i18n config (locale + messages) into the
// build. Points at i18n/request.ts. Applied to the base config BELOW, then
// wrapped by Sentry so both integrations compose.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Locale alternation for path-to-regexp params in `redirects()`.
 *
 * Mirrors `routing.locales` in i18n/routing.ts. next.config is evaluated by
 * Node before the app's module graph exists, so it does not import the routing
 * module; the duplication is asserted in
 * apps/web/tests/unit/host-nav-renames.test.ts, which reads both files.
 */
const LOCALE_PATTERN = "en";

// Baseline security headers applied to every response.
//
// CSP is sent in REPORT-ONLY mode: it logs violations to /api/csp-report
// (→ Sentry) without blocking, so we can confirm every third party loads before
// switching to enforcing. The allowlist below is the full production set —
// Clerk, Supabase, Mapbox, PostHog, Sentry, Google OAuth, and Cloudflare
// Turnstile (Clerk bot protection). All product imagery — host uploads and
// app-managed site photography alike — is served from Supabase Storage, so
// there is no third-party image host in the allowlist.
//
// TO PROMOTE TO ENFORCING (Phase 2, do NOT do blindly):
//   1. Deploy report-only, then watch /api/csp-report (Sentry) for a real
//      traffic window across sign-in, map, swipe, listing, billing.
//   2. Only then rename this key to "Content-Security-Policy".
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://clerk.exploreandearn.com https://*.clerk.com https://*.clerk.accounts.dev https://js.clerk.dev https://challenges.cloudflare.com https://browser.sentry-cdn.com https://us.posthog.com https://us-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline' https://api.tiles.mapbox.com https://api.mapbox.com",
  "img-src 'self' blob: data: https://img.clerk.com https://*.supabase.co https://*.mapbox.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://clerk.exploreandearn.com https://*.clerk.com https://*.clerk.accounts.dev https://api.mapbox.com https://events.mapbox.com https://us.posthog.com https://us.i.posthog.com https://eu.posthog.com https://sentry.io https://*.ingest.sentry.io",
  "font-src 'self' data:",
  "frame-src 'self' https://*.clerk.accounts.dev https://accounts.clerk.dev https://challenges.cloudflare.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/csp-report"
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)"
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: CSP_DIRECTIVES
  }
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't leak the Next.js version via the X-Powered-By header.
  poweredByHeader: false,
  transpilePackages: ["@explore-and-earn/ui", "@explore-and-earn/contracts", "@explore-and-earn/db"],
  experimental: {
    // A custom webpack hook disables Next's build worker auto-detection. Keep
    // compilation isolated so the production builder can reclaim compiler
    // memory between phases instead of exceeding Vercel's standard 8 GB
    // container. The hook below only adds a development Clerk alias.
    webpackBuildWorker: true,
    // Reduce Webpack's peak allocation while building the large App Router
    // surface. This trades a little build time for materially lower memory.
    webpackMemoryOptimizations: true,
    // Raw images are capped at 4 MiB; this leaves framing room under Vercel's
    // non-configurable 4.5 MB Function request-body limit. The action then
    // validates, decodes, and re-encodes before persistence.
    serverActions: {
      bodySizeLimit: "4.2mb",
    },
    // Tree-shake barrel imports so only the referenced symbols ship. Critical
    // for @phosphor-icons/react (importing ~100 icons from its index must not
    // pull the full ~9,000-icon set) and for the @explore-and-earn/ui barrel.
    optimizePackageImports: ["@phosphor-icons/react", "@explore-and-earn/ui"],
  },
  async redirects() {
    return [
      {
        // Some user agents still request the conventional path directly even
        // when rel=icon points at the generated metadata route.
        source: "/favicon.ico",
        destination: "/icon",
        permanent: true,
      },
      // ── D17 host-nav renames (redesign V2-B) ───────────────────────────────
      // "Invites" → Outreach, "Assistant" → Recruiting Coach. Hosts have these
      // URLs bookmarked, emailed to their team, and — for /host/invites — baked
      // into a live Stripe checkout success_url on sessions that may already be
      // in flight. Permanent (308) so the method and body survive the hop and
      // search engines transfer the old path.
      //
      // Sources are listed twice on purpose. localePrefix is "as-needed", so
      // English is unprefixed (/host/invites) while any future locale carries a
      // prefix (/es/host/invites); one pattern cannot cover both, and the
      // prefixed form would 404 silently the day a second locale ships. The
      // :locale param is CONSTRAINED to the configured locale list rather than
      // left as a bare wildcard — an unconstrained /:locale would swallow
      // /anything/host/invites and redirect it to a 404. Keep LOCALE_PATTERN in
      // sync with routing.locales in i18n/routing.ts; a unit test asserts it.
      {
        source: "/host/invites",
        destination: "/host/outreach",
        permanent: true,
      },
      {
        source: `/:locale(${LOCALE_PATTERN})/host/invites`,
        destination: "/:locale/host/outreach",
        permanent: true,
      },
      {
        source: "/host/assistant",
        destination: "/host/coach",
        permanent: true,
      },
      {
        source: `/:locale(${LOCALE_PATTERN})/host/assistant`,
        destination: "/:locale/host/coach",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // PWA service worker: never long-cache the SW script itself, so a
        // redeploy's updated worker is fetched promptly. Root scope is served
        // from /public so no Service-Worker-Allowed override is needed, but we
        // set it explicitly for clarity/future-proofing.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" }
        ]
      },
      {
        // Manifest is served by app/manifest.ts at /manifest.webmanifest; keep
        // it lightly cached so icon/name changes propagate without a hard purge.
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, must-revalidate" }
        ]
      }
    ];
  },
  images: {
    remotePatterns: [
      {
        // Supabase Storage (avatars, listing media, site photography)
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**"
      },
      {
        // Supabase Storage image transformations — the sized variants the photo
        // buckets request (see lib/photoBuckets.ts bucketPhotoUrl).
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/render/image/**"
      },
      {
        // Clerk-hosted user avatars
        protocol: "https",
        hostname: "img.clerk.com",
        pathname: "/**"
      },
      {
        // Local Supabase stack (dev bench) — without this, next/image rejects
        // locally-stored covers on the bench now that cards render through it.
        // Loopback-only; irrelevant (and unreachable) in production.
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/**"
      }
    ]
  },
  webpack(config, { isServer }) {
    // DEV MOCK BENCH (review tooling only) — webpack path.
    //
    // The default `dev` script now uses Turbopack (`next dev --turbopack`), which
    // is much faster to boot but whose `resolveAlias` cannot express this shim
    // cleanly (no absolute-path targets, and the real-Clerk re-alias would loop).
    // So the bench lives on the WEBPACK dev path only: run `pnpm dev:webpack` to
    // use role-impersonation. Turbopack dev uses real Clerk (normal login).
    //
    // Outside production, alias the Clerk server import to a shim that can return
    // a synthetic session while impersonating a role — so the bench needs no
    // Clerk login. Gated on NODE_ENV so the shim is never bundled in a production
    // (or preview) build, and scoped to the server build since
    // "@clerk/nextjs/server" is server-only. The `$` suffix is an exact-match
    // alias: deep imports are untouched, and the shim's own `clerk-real/server`
    // import resolves to the real file rather than aliasing back to itself.
    if (process.env.NODE_ENV !== "production" && isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "clerk-real/server$": require.resolve("@clerk/nextjs/server"),
        "@clerk/nextjs/server$": path.resolve(
          process.cwd(),
          "lib/devBench/clerkServerShim.ts",
        ),
      };
    }
    return config;
  }
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  // Moved under `webpack` — the top-level option was deprecated in @sentry/nextjs.
  webpack: {
    autoInstrumentServerFunctions: true
  },
  hideSourceMaps: true,
  tunnelRoute: "/monitoring"
});
