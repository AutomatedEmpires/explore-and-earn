// Options shared by the client, server and edge Sentry configs.
// Errors carry ids, not personal data (spec section 13), so Sentry 11's data collection, which
// by default sends users, cookies, headers, bodies, query strings and local variables, is off
// except for the request id that ties an event to our logs. beforeSend also drops the parameter
// values (often emails and names) that drizzle puts in a failed query's error message.
// Session replay is off in every environment (legal review 4.5): it would record what people
// type and read. No replay is sampled, and any replay integration is dropped.
import type { init } from '@sentry/nextjs';
import { isReplayIntegration } from './src/lib/privacy-signals';
import { scrubSentryEvent } from './src/lib/scrub';

type Options = NonNullable<Parameters<typeof init>[0]>;

export function sentryOptions(dsn: string, appEnv: string | undefined): Options {
  const env = appEnv || 'dev';
  return {
    dsn,
    environment: env,
    tracesSampleRate: env === 'prod' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: (defaults) => defaults.filter((i) => !isReplayIntegration(i.name)),
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
