import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Baseline security headers applied to every response. CSP is sent in
// report-only mode first: it logs violations without blocking, so we can verify
// Clerk / Mapbox / Supabase / Sentry / PostHog all load before switching to an
// enforcing `Content-Security-Policy` header.
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
    // Report-only first — switch to enforcing after verifying nothing breaks.
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.clerk.com https://*.clerk.accounts.dev https://browser.sentry-cdn.com https://us.posthog.com",
      "style-src 'self' 'unsafe-inline' https://api.tiles.mapbox.com https://api.mapbox.com",
      "img-src 'self' blob: data: https://*.supabase.co https://*.mapbox.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.clerk.com https://api.mapbox.com https://events.mapbox.com https://us.posthog.com https://us.i.posthog.com https://sentry.io https://*.ingest.sentry.io",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "report-uri /api/csp-report"
    ].join("; ")
  }
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't leak the Next.js version via the X-Powered-By header.
  poweredByHeader: false,
  transpilePackages: ["@explore-and-earn/ui", "@explore-and-earn/contracts", "@explore-and-earn/db"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      {
        // Supabase Storage (avatars, listing media, etc.)
        // *.supabase.co covers any project ref (staging → production swap
        // requires only an env var change, not a code change).
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**"
      },
      {
        // Clerk-hosted user avatars
        protocol: "https",
        hostname: "img.clerk.com",
        pathname: "/**"
      }
    ]
  }
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  autoInstrumentServerFunctions: true,
  hideSourceMaps: true,
  tunnelRoute: "/monitoring"
});
