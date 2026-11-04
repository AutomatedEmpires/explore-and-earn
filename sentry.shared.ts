// Options shared by the client, server and edge Sentry configs.
// Errors carry ids, not personal data (spec section 13), so Sentry 11's data collection, which
// by default sends users, cookies, headers, bodies, query strings and local variables, is off
// except for the request id that ties an event to our logs. beforeSend also drops the parameter
// values (often emails and names) that drizzle puts in a failed query's error message.
import type { init } from '@sentry/nextjs';
import { scrubSentryEvent } from './src/lib/scrub';

type Options = NonNullable<Parameters<typeof init>[0]>;

export function sentryOptions(dsn: string, appEnv: string | undefined): Options {
  const env = appEnv || 'dev';
  return {
    dsn,
    environment: env,
    tracesSampleRate: env === 'prod' ? 0.1 : 1.0,
    beforeSend: (event) => scrubSentryEvent(event),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['x-request-id'] }, response: { allow: ['x-request-id'] } },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
    },
  };
}
