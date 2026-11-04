import type { NextConfig } from 'next';
// With an extension: Next loads this file with Node's own TypeScript support, which resolves
// files only by their full name (and knows no @/ alias, so src/lib/env.ts must not use one).
import { parseEnv } from './src/lib/env.ts';

// A production build validates the whole environment first, so a deploy configured with a stub
// or local provider (or a missing key) fails on Vercel and is never promoted. The running
// server checks again when it starts (src/instrumentation.ts).
if (process.env.APP_ENV === 'prod') parseEnv(process.env);

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
