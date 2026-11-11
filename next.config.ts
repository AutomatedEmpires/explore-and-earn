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
  // pdfkit reads its font metrics (AFM files) from its own package directory at runtime, so it
  // stays a plain Node dependency instead of being bundled (SP4 resume PDFs).
  serverExternalPackages: ['pdfkit'],
  // The resume PDF routes embed the Figtree TTFs, read from disk when a PDF renders. Keys are
  // picomatch globs over the route path, so a dynamic segment's brackets are escaped.
  outputFileTracingIncludes: {
    '/api/v1/me/resume.pdf': ['./src/modules/profiles/resume/fonts/**/*'],
    '/api/v1/me/applications/\\[id\\]/resume.pdf': ['./src/modules/profiles/resume/fonts/**/*'],
    '/api/v1/host/applications/\\[id\\]/resume.pdf': ['./src/modules/profiles/resume/fonts/**/*'],
  },
  // Inlined into the browser bundle at build time, so client Sentry (sentry.client.config.ts)
  // follows the server's SENTRY_DSN and APP_ENV. A Sentry DSN is public by design.
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? '',
    NEXT_PUBLIC_APP_ENV: process.env.APP_ENV ?? 'dev',
  },
};

export default nextConfig;
