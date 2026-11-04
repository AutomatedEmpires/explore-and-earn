// Sentry for the Node.js runtime, loaded by src/instrumentation.ts. Off unless SENTRY_DSN is set.
import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './sentry.shared';

const dsn = process.env.SENTRY_DSN;

if (dsn) Sentry.init(sentryOptions(dsn, process.env.APP_ENV));
