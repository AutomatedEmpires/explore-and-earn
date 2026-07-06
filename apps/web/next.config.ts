import { createRequire } from "node:module";
import path from "node:path";

import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const require = createRequire(import.meta.url);

// Baseline security headers applied to every response.
//
// CSP is sent in REPORT-ONLY mode: it logs violations to /api/csp-report
// (→ Sentry) without blocking, so we can confirm every third party loads before
// switching to enforcing. The allowlist below is the full production set —
// Clerk, Supabase, Mapbox, Cloudinary, PostHog, Sentry, Google OAuth, and
// Cloudflare Turnstile (Clerk bot protection).
//
// TO PROMOTE TO ENFORCING (Phase 2, do NOT do blindly):
//   1. Add the PRODUCTION Clerk Frontend-API host to script-src + connect-src
//      (e.g. https://clerk.<yourdomain>.com — it is domain-specific and is NOT
//      under *.clerk.com, so an enforcing policy without it white-screens the
//      whole app).
//   2. Deploy report-only, then watch /api/csp-report (Sentry) for a real
//      traffic window across sign-in, map, swipe, listing, billing.
//   3. Only then rename this key to "Content-Security-Policy".
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.clerk.com https://*.clerk.accounts.dev https://js.clerk.dev https://challenges.cloudflare.com https://browser.sentry-cdn.com https://us.posthog.com https://us-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline' https://api.tiles.mapbox.com https://api.mapbox.com",
  "img-src 'self' blob: data: https://img.clerk.com https://*.supabase.co https://*.mapbox.com https://res.cloudinary.com",
  // res.cloudinary.com: the visual-assets layer fetch()es illustration SVGs at
  // runtime (packages/ui/src/visual-assets/useStreamlineSvg.ts) — img-src alone
  // does not cover fetch(), so without this the illustrations break the moment
  // CSP switches from report-only to enforcing.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.clerk.com https://*.clerk.accounts.dev https://api.mapbox.com https://events.mapbox.com https://us.posthog.com https://us.i.posthog.com https://eu.posthog.com https://sentry.io https://*.ingest.sentry.io https://res.cloudinary.com",
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
    // Tree-shake barrel imports so only the referenced symbols ship. Critical
    // for @phosphor-icons/react (importing ~100 icons from its index must not
    // pull the full ~9,000-icon set) and for the @explore-and-earn/ui barrel.
    optimizePackageImports: ["@phosphor-icons/react", "@explore-and-earn/ui"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      {
        // Supabase Storage (avatars, listing media, etc.)
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**"
      },
      {
        // Clerk-hosted user avatars
        protocol: "https",
        hostname: "img.clerk.com",
        pathname: "/**"
      },
      {
        // Cloudinary — curated photo library, icon CDN, transformed assets
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**"
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

export default withSentryConfig(nextConfig, {
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
