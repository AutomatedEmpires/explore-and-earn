// Next.js server instrumentation, run once when a server instance starts:
// - validates the environment on the Node.js runtime, so a bad deploy (for example a stub
//   provider with APP_ENV=prod) refuses to start instead of failing every request later;
// - starts Sentry on the server runtimes when SENTRY_DSN is set, and reports errors from
//   server components, route handlers and the proxy.
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEnv } = await import('@/lib/env');
    getEnv();
  }
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('../sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

// A no-op while Sentry is not initialized.
export const onRequestError = Sentry.captureRequestError;
