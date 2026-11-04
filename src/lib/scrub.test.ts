import { describe, expect, it } from 'vitest';
import { sentryOptions } from '../../sentry.shared';
import { scrubSentryEvent } from './scrub';

const leaked = 'Failed query: insert into "app"."users" ("email") values ($1)\nparams: maya@example.test';

describe('Sentry beforeSend', () => {
  it("drops a failed query's parameters from the message and every exception value", () => {
    const event = {
      message: leaked,
      exception: {
        values: [{ value: `Could not save: ${leaked}` }, { value: 'violates check constraint' }],
      },
      logentry: { message: leaked, formatted: leaked },
    };
    const clean = scrubSentryEvent(event);
    expect(JSON.stringify(clean)).not.toContain('maya@example.test');
    expect(clean.exception.values[0]?.value).toBe(
      'Could not save: Failed query: insert into "app"."users" ("email") values ($1)',
    );
    expect(clean.exception.values[1]?.value).toBe('violates check constraint');
  });

  it('is installed in every runtime config', () => {
    const options = sentryOptions('https://key@o0.ingest.sentry.io/0', 'prod');
    expect(typeof options.beforeSend).toBe('function');
    const event = { exception: { values: [{ value: leaked }] } };
    const sent = options.beforeSend?.(event as never, {}) as typeof event;
    expect(JSON.stringify(sent)).not.toContain('maya@example.test');
  });
});
