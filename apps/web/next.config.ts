import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't leak the Next.js version via the X-Powered-By header.
  poweredByHeader: false,
  transpilePackages: ["@explore-and-earn/ui", "@explore-and-earn/contracts"],
  images: {
    remotePatterns: [
      {
        // Supabase Storage (avatars, listing media, etc.)
        protocol: "https",
        hostname: "mamosbzcbigcclafhmmr.supabase.co",
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
