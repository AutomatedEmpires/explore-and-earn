// Sentry for the edge runtime, loaded by src/instrumentation.ts. Off unless SENTRY_DSN is set.
// (The proxy runs on Node.js in Next.js 16; this covers any route that opts into edge.)
import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './sentry.shared';

const dsn = process.env.SENTRY_DSN;

if (dsn) Sentry.init(sentryOptions(dsn, process.env.APP_ENV));
