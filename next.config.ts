import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Inlined into the browser bundle at build time, so client Sentry (sentry.client.config.ts)
  // follows the server's SENTRY_DSN and APP_ENV. A Sentry DSN is public by design.
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? '',
    NEXT_PUBLIC_APP_ENV: process.env.APP_ENV ?? 'dev',
  },
};

export default nextConfig;
