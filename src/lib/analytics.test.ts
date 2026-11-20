import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allowedByConsent, readConsent } from '@/modules/privacy';
import { runWithRequestContext } from '@/server/request-context';
import { isAnalyticsAllowed, resetAnalyticsForTests, scrubProps, track } from './analytics';
import { initAnalytics, trackClient } from './analytics-client';
import { scrubClientProps } from './analytics-scrub';
import { resetEnvCache } from './env';

const sent = vi.hoisted(() => ({ events: [] as unknown[], options: [] as unknown[] }));

const browser = vi.hoisted(() => ({
  posthog: { __loaded: false } as { __loaded: boolean },
  init: vi.fn<(key: string, config: Record<string, unknown>) => void>(),
  capture: vi.fn<(event: string, props?: Record<string, unknown>) => void>(),
}));

vi.mock('posthog-js', () => {
  Object.assign(browser.posthog, { init: browser.init, capture: browser.capture });
  return { default: browser.posthog };
});

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
  browser.posthog.__loaded = false;
  browser.init.mockClear();
  browser.capture.mockClear();
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

// Outside a request these tests pass `{ allowed: true }`, as a caller that knows the person's
// consent does (Plan decision 19).
const ALLOWED = { allowed: true } as const;

describe('track', () => {
  it('drops personal-data props before sending', () => {
    track('x', { email: 'a@b', listingId: '1' }, undefined, ALLOWED);
    expect(sent.events).toHaveLength(1);
    expect(sent.events[0]).toMatchObject({ event: 'x', properties: { listingId: '1' } });
    expect((sent.events[0] as { properties: object }).properties).toEqual({ listingId: '1' });
  });

  it('uses the given distinct id (an internal user id)', () => {
    track('listing.saved', { listingId: '1' }, 'user-123', ALLOWED);
    expect(sent.events[0]).toMatchObject({ distinctId: 'user-123', event: 'listing.saved' });
  });

  it('turns off GeoIP, since server events carry the server address', () => {
    track('x', undefined, undefined, ALLOWED);
    expect(sent.options[0]).toMatchObject({ disableGeoip: true });
  });

  it('does nothing without a PostHog key', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    resetEnvCache();
    resetAnalyticsForTests();
    track('x', { listingId: '1' }, undefined, ALLOWED);
    expect(sent.events).toHaveLength(0);
  });
});

// SP8 Plan decision 19: an event is sent only on an explicit yes, from the request's verdict
// or the caller. A job, cron run or webhook has no request context, so it sends nothing unless
// it passes `{ allowed: true }` (trackForUser does, from the person's consent record).
describe('track and consent', () => {
  it('sends inside a request that allows analytics, and never in one that refuses it', () => {
    runWithRequestContext({ requestId: 'req-test-0003', analyticsAllowed: true }, () =>
      track('listing.saved', { listingId: '1' }, 'user-123'),
    );
    expect(sent.events).toHaveLength(1);
    expect(isAnalyticsAllowed()).toBe(false);

    runWithRequestContext({ requestId: 'req-test-0004', analyticsAllowed: false }, () => {
      expect(isAnalyticsAllowed()).toBe(false);
      // An explicit yes never overrides a request that refused (Global Privacy Control).
      track('listing.saved', { listingId: '1' }, 'user-123', { allowed: true });
    });
    expect(sent.events).toHaveLength(1);
  });

  it('drops an event outside a request, unless the caller allows it', () => {
    track('resume_import_finished', { status: 'merged' }, 'user-123');
    expect(sent.events).toHaveLength(0);
    track('resume_import_finished', { status: 'merged' }, 'user-123', { allowed: false });
    expect(sent.events).toHaveLength(0);
    track('resume_import_finished', { status: 'merged' }, 'user-123', { allowed: true });
    expect(sent.events).toHaveLength(1);
  });

  it('drops an event in a request context that has no verdict yet', () => {
    runWithRequestContext({ requestId: 'req-test-0005' }, () => {
      expect(isAnalyticsAllowed()).toBe(false);
      track('x', { listingId: '1' });
    });
    expect(sent.events).toHaveLength(0);
  });
});

// Legal review 4.5 (P0 item 18): Global Privacy Control is a rejection everywhere, not only in
// the EU. apiRoute puts the consent verdict in the request context; track reads it.
describe('track and Global Privacy Control', () => {
  const contextFor = (headers: Record<string, string>) => ({
    requestId: 'req-test-0001',
    analyticsAllowed: allowedByConsent(
      readConsent(new Request('http://localhost:3000/api/v1/thing', { headers })),
    ),
  });

  it('sends nothing for a US request that carries Sec-GPC: 1', () => {
    runWithRequestContext(contextFor({ 'x-vercel-ip-country': 'US', 'sec-gpc': '1' }), () =>
      track('discovery_search', { surface: 'seek' }, 'user-123'),
    );
    expect(sent.events).toHaveLength(0);
  });

  it('still sends for the same US request without the signal', () => {
    runWithRequestContext(contextFor({ 'x-vercel-ip-country': 'US' }), () =>
      track('discovery_search', { surface: 'seek' }, 'user-123'),
    );
    expect(sent.events).toHaveLength(1);
  });

  it('sends nothing whenever the request context disallows analytics', () => {
    runWithRequestContext({ requestId: 'req-test-0002', analyticsAllowed: false }, () =>
      track('x', { listingId: '1' }),
    );
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

  // Legal review 4.5: events never carry message text, resume text or work-authorization values.
  it('never carries message text, resume text or work-authorization values', () => {
    expect(
      scrubProps({
        listingId: '1',
        threadId: 't1',
        surface: 'seek',
        context: 'feed',
        subjectId: 's1',
        contentType: 'image/jpeg',
        message: 'Can you start in May?',
        text: 'Can you start in May?',
        preview: 'Can you start',
        resume: 'Ten seasons as a lift operator',
        resumeText: 'Ten seasons as a lift operator',
        coverNote: 'Hi there',
        answers: ['Yes'],
        workAuthorization: 'authorized',
        authorizedToWork: true,
        needsSponsorship: false,
        visaType: 'J-1',
        citizenship: 'US',
        immigrationStatus: 'x',
        dateOfBirth: '2001-04-03',
        birthYear: 2001,
        dob: '2001-04-03',
        nested: { screeningAnswer: 'Yes', applicationId: 'a1' },
      }),
    ).toEqual({
      listingId: '1',
      threadId: 't1',
      surface: 'seek',
      context: 'feed',
      subjectId: 's1',
      contentType: 'image/jpeg',
      nested: { applicationId: 'a1' },
    });
  });

  it('drops free text under any key: long strings never reach analytics', () => {
    const sentence =
      'I am authorized to work in the US and can start on May 18, here is my phone number.';
    expect(
      scrubProps({
        listingId: '019a4a3c-0000-7000-8000-00000000a001',
        detail: sentence,
        tags: ['farm', sentence],
      }),
    ).toEqual({ listingId: '019a4a3c-0000-7000-8000-00000000a001', tags: ['farm'] });
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

  it('keeps long PostHog URLs but drops message and resume text', () => {
    const url = `https://app.example.test/jobs/view/1/${'a'.repeat(120)}`;
    expect(
      scrubClientProps({ $current_url: url, messageText: 'hi', resume: 'x', listingId: '1' }),
    ).toEqual({ $current_url: url, listingId: '1' });
  });
});

/**
 * A page outside the EU where the visitor has not refused analytics: the root layout's
 * `<meta name="ee-consent" content="other:unset:0">`, which initAnalytics reads before it loads
 * PostHog (Plan decision 19). analytics-client.test.tsx covers the other consent states.
 */
function browserOutsideTheEu(): void {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {
    readyState: 'complete',
    querySelector: (selector: string) =>
      selector === 'meta[name="ee-consent"]' ? { getAttribute: () => 'other:unset:0' } : null,
  });
}

describe('initAnalytics', () => {
  it('masks URL tokens at the source and strips URLs again before sending', () => {
    browserOutsideTheEu();

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
    browserOutsideTheEu();

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

  // Legal review 4.5: session replay is off in production, and so in every environment.
  it('never records a session, records no element text and sends no message text', () => {
    browserOutsideTheEu();

    initAnalytics();

    const config = browser.init.mock.calls[0]?.[1] ?? {};
    expect(config).toMatchObject({ disable_session_recording: true, autocapture: false });
    const beforeSend = config.before_send as (e: { properties: Record<string, unknown> }) => {
      properties: Record<string, unknown>;
    };
    expect(
      beforeSend({ properties: { $pathname: '/inbox', messageText: 'hi', threadId: 't1' } })
        .properties,
    ).toEqual({ $pathname: '/inbox', threadId: 't1' });
  });

  it('does not load PostHog when the browser sends Global Privacy Control', () => {
    browserOutsideTheEu();
    vi.stubGlobal('navigator', { globalPrivacyControl: true });

    initAnalytics();

    expect(browser.init).not.toHaveBeenCalled();
  });

  it('loads PostHog when the browser does not send the signal', () => {
    browserOutsideTheEu();
    vi.stubGlobal('navigator', { globalPrivacyControl: false });

    initAnalytics();

    expect(browser.init).toHaveBeenCalledTimes(1);
  });
});

describe('trackClient', () => {
  it('sends nothing until PostHog has loaded', () => {
    trackClient('listing.saved', { listingId: '1' });
    expect(browser.capture).not.toHaveBeenCalled();
  });

  it('sends nothing under Global Privacy Control, even if PostHog loaded earlier', () => {
    browser.posthog.__loaded = true;
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    trackClient('listing.saved', { listingId: '1' });
    expect(browser.capture).not.toHaveBeenCalled();
  });

  it('sends scrubbed props once PostHog has loaded', () => {
    browser.posthog.__loaded = true;
    vi.stubGlobal('navigator', {});
    trackClient('listing.saved', { listingId: '1', messageText: 'hi' });
    expect(browser.capture).toHaveBeenCalledWith('listing.saved', { listingId: '1' });
  });
});
