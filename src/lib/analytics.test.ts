import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAnalyticsForTests, scrubProps, track } from './analytics';
import { resetEnvCache } from './env';

const sent = vi.hoisted(() => ({ events: [] as unknown[], options: [] as unknown[] }));

vi.mock('posthog-node', () => ({
  PostHog: class {
    constructor(_key: string, options: unknown) {
      sent.options.push(options);
    }
    capture(message: unknown) {
      sent.events.push(message);
    }
    flush() {
      return Promise.resolve();
    }
  },
}));

beforeEach(() => {
  sent.events.length = 0;
  sent.options.length = 0;
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key');
  resetEnvCache();
  resetAnalyticsForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  resetAnalyticsForTests();
});

describe('track', () => {
  it('drops personal-data props before sending', () => {
    track('x', { email: 'a@b', listingId: '1' });
    expect(sent.events).toHaveLength(1);
    expect(sent.events[0]).toMatchObject({ event: 'x', properties: { listingId: '1' } });
    expect((sent.events[0] as { properties: object }).properties).toEqual({ listingId: '1' });
  });

  it('uses the given distinct id (an internal user id)', () => {
    track('listing.saved', { listingId: '1' }, 'user-123');
    expect(sent.events[0]).toMatchObject({ distinctId: 'user-123', event: 'listing.saved' });
  });

  it('turns off GeoIP, since server events carry the server address', () => {
    track('x');
    expect(sent.options[0]).toMatchObject({ disableGeoip: true });
  });

  it('does nothing without a PostHog key', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    resetEnvCache();
    resetAnalyticsForTests();
    track('x', { listingId: '1' });
    expect(sent.events).toHaveLength(0);
  });
});

describe('scrubProps', () => {
  it('removes every key that looks like personal data, at any depth', () => {
    expect(
      scrubProps({
        listingId: '1',
        displayName: 'Sam',
        Phone: '555',
        mailingAddress: 'x',
        messageText: 'hi',
        body: 'hello',
        filters: { category: 'farm', userEmail: 'a@b' },
        items: [{ id: 1, name: 'n' }],
        count: 3,
      }),
    ).toEqual({
      listingId: '1',
      filters: { category: 'farm' },
      items: [{ id: 1 }],
      count: 3,
    });
  });
});
