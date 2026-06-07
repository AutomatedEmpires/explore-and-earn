import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Security + CSP headers applied to every route. CSP is Report-Only first —
// switch the key to "Content-Security-Policy" to enforce after verifying that
// nothing breaks (Clerk / Mapbox / Supabase / PostHog / Sentry) in the browser.
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
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.clerk.com https://*.clerk.accounts.dev https://browser.sentry-cdn.com https://us.posthog.com",
      "style-src 'self' 'unsafe-inline' https://api.tiles.mapbox.com https://api.mapbox.com",
      "img-src 'self' blob: data: https://*.supabase.co https://*.mapbox.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.clerk.com https://api.mapbox.com https://events.mapbox.com https://us.posthog.com https://sentry.io https://o*.ingest.sentry.io",
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
  transpilePackages: ["@explore-and-earn/ui", "@explore-and-earn/contracts"],
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
