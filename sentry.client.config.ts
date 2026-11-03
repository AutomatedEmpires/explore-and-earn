// Sentry in the browser, loaded by src/instrumentation-client.ts. Off unless SENTRY_DSN is set:
// next.config.ts copies it into NEXT_PUBLIC_SENTRY_DSN at build time (a DSN is public by design).
// No session replay: it would record what people type and read.
import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './sentry.shared';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) Sentry.init(sentryOptions(dsn, process.env.NEXT_PUBLIC_APP_ENV));
