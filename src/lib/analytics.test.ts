import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAnalyticsForTests, scrubProps, track } from './analytics';
import { initAnalytics } from './analytics-client';
import { scrubClientProps } from './analytics-scrub';
import { resetEnvCache } from './env';

const sent = vi.hoisted(() => ({ events: [] as unknown[], options: [] as unknown[] }));

const browser = vi.hoisted(() => ({
  init: vi.fn<(key: string, config: Record<string, unknown>) => void>(),
}));

vi.mock('posthog-js', () => ({
  default: {
    __loaded: false,
    init: browser.init,
    capture: vi.fn(),
  },
}));

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
  vi.unstubAllGlobals();
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

// An operator invitation lands on /sign-up?__clerk_ticket=<invitation ticket>; tokens in a URL
// must never reach PostHog.
const TICKET_URL = 'https://app.example.test/sign-up?__clerk_ticket=abc&__clerk_status=sign_up';

describe('scrubClientProps', () => {
  it('drops the query string and fragment from every URL PostHog records', () => {
    expect(
      scrubClientProps({
        $current_url: TICKET_URL,
        $referrer: 'https://accounts.example.test/verify?token=t0k#step-2',
        $session_entry_url: `${TICKET_URL}#top`,
        $set_once: {
          $initial_current_url: TICKET_URL,
          $initial_referrer: '$direct',
        },
        $pathname: '/sign-up',
        $host: 'app.example.test',
        listingId: '1',
      }),
    ).toEqual({
      $current_url: 'https://app.example.test/sign-up',
      $referrer: 'https://accounts.example.test/verify',
      $session_entry_url: 'https://app.example.test/sign-up',
      $set_once: {
        $initial_current_url: 'https://app.example.test/sign-up',
        $initial_referrer: '$direct',
      },
      $pathname: '/sign-up',
      $host: 'app.example.test',
      listingId: '1',
    });
  });

  it('still drops personal-data keys that are not PostHog properties', () => {
    expect(scrubClientProps({ $os: 'Mac OS X', email: 'a@b', listingId: '1' })).toEqual({
      $os: 'Mac OS X',
      listingId: '1',
    });
  });
});

describe('initAnalytics', () => {
  it('masks URL tokens at the source and strips URLs again before sending', () => {
    vi.stubGlobal('window', {});
    browser.init.mockClear();

    initAnalytics();

    expect(browser.init).toHaveBeenCalledTimes(1);
    const config = browser.init.mock.calls[0]?.[1] ?? {};
    // Masking covers what before_send never sees, such as the /flags request's person properties.
    expect(config).toMatchObject({
      mask_personal_data_properties: true,
      disable_capture_url_hashes: true,
    });
    expect(config.custom_personal_data_properties).toEqual(
      expect.arrayContaining(['__clerk_ticket', '__clerk_status', 'token', 'redirect_url']),
    );

    const beforeSend = config.before_send as (e: { properties: Record<string, unknown> }) => {
      properties: Record<string, unknown>;
    };
    const event = beforeSend({ properties: { $current_url: TICKET_URL, $pathname: '/sign-up' } });
    expect(event.properties).toEqual({
      $current_url: 'https://app.example.test/sign-up',
      $pathname: '/sign-up',
    });
  });

  // SP3 regression: discovery URLs carry the search text and coordinates in the query string
  // (spec section 10), and before_send must keep cutting every URL back to origin and path.
  it('never sends discovery search text or coordinates from a page URL', () => {
    vi.stubGlobal('window', {});
    browser.init.mockClear();

    initAnalytics();

    const config = browser.init.mock.calls[0]?.[1] ?? {};
    const beforeSend = config.before_send as (e: { properties: Record<string, unknown> }) => {
      properties: Record<string, unknown>;
    };
    const url =
      'https://exploreandearn.com/map?q=lift+operator&cat=farm&lat=39.74&lng=-104.99&bbox=-125,24,-66,50';
    const event = beforeSend({
      properties: { $current_url: url, $referrer: url, $pathname: '/map' },
    });
    expect(event.properties).toEqual({
      $current_url: 'https://exploreandearn.com/map',
      $referrer: 'https://exploreandearn.com/map',
      $pathname: '/map',
    });
  });
});
