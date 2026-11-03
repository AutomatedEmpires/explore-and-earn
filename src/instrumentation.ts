// Next.js server instrumentation: starts Sentry on the server runtimes when SENTRY_DSN is set,
// and reports errors from server components, route handlers and the proxy.
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('../sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

// A no-op while Sentry is not initialized.
export const onRequestError = Sentry.captureRequestError;
