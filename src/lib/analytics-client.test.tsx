// @vitest-environment jsdom
// The browser's PostHog load follows the visitor's consent (SP8 spec 8.4, Plan decision 19, and
// the lead's note on explore-and-earn#149 from the review of PR 194): an EU visitor needs an
// explicit yes, Global Privacy Control is a no everywhere, and view-as never loads it. The root
// layout's <meta name="ee-consent"> carries the server's reading of the visitor's consent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyticsAllowedByMeta,
  grantAnalyticsConsent,
  initAnalytics,
  parseConsentMeta,
  revokeAnalyticsConsent,
} from './analytics-client';

const browser = vi.hoisted(() => ({
  posthog: { __loaded: false } as { __loaded: boolean },
  init: vi.fn(),
  optIn: vi.fn(),
  optOut: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => {
  Object.assign(browser.posthog, {
    init: browser.init,
    opt_in_capturing: browser.optIn,
    opt_out_capturing: browser.optOut,
    reset: browser.reset,
  });
  return { default: browser.posthog };
});

function setMeta(content: string | null): void {
  document.head.querySelectorAll('meta[name="ee-consent"]').forEach((node) => node.remove());
  if (content === null) return;
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'ee-consent');
  meta.setAttribute('content', content);
  document.head.append(meta);
}

beforeEach(() => {
  browser.posthog.__loaded = false;
  browser.init.mockClear();
  browser.optIn.mockClear();
  browser.optOut.mockClear();
  browser.reset.mockClear();
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key');
});

afterEach(() => {
  setMeta(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('initAnalytics and the consent meta tag', () => {
  it.each([
    ['eu:unset:0', false],
    ['eu:denied:0', false],
    ['eu:granted:0', true],
    ['other:unset:0', true],
    ['other:granted:0', true],
    ['other:denied:0', false],
    ['other:unset:1', false],
    ['eu:granted:1', false],
  ])('with %s loads PostHog: %s', (content, loads) => {
    setMeta(content);
    initAnalytics();
    expect(browser.init).toHaveBeenCalledTimes(loads ? 1 : 0);
  });

  it('loads nothing on a page without the tag, or with a malformed one', () => {
    setMeta(null);
    initAnalytics();
    setMeta('us:granted:0');
    initAnalytics();
    expect(browser.init).not.toHaveBeenCalled();
  });

  it('loads nothing under Global Privacy Control, even outside the EU', () => {
    setMeta('other:unset:0');
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    initAnalytics();
    expect(browser.init).not.toHaveBeenCalled();
  });

  it('waits for the document when called before the tag has been parsed', () => {
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    initAnalytics();
    expect(browser.init).not.toHaveBeenCalled();

    setMeta('other:unset:0');
    readyState.mockReturnValue('interactive');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(browser.init).toHaveBeenCalledTimes(1);
    readyState.mockRestore();
  });

  it('parses the tag the way the layout writes it', () => {
    expect(parseConsentMeta('eu:granted:1')).toEqual({
      region: 'eu',
      state: 'granted',
      viewAs: true,
    });
    expect(parseConsentMeta('other:unset:0')).toEqual({
      region: 'other',
      state: 'unset',
      viewAs: false,
    });
    expect(parseConsentMeta('')).toBeNull();
    expect(parseConsentMeta(null)).toBeNull();
    expect(analyticsAllowedByMeta(null)).toBe(false);
  });
});

describe('grantAnalyticsConsent and revokeAnalyticsConsent', () => {
  it('loads PostHog after Accept on an EU page that started without it', () => {
    setMeta('eu:unset:0');
    initAnalytics();
    expect(browser.init).not.toHaveBeenCalled();

    grantAnalyticsConsent();
    expect(browser.init).toHaveBeenCalledTimes(1);
  });

  it('resumes capturing when PostHog was already loaded', () => {
    browser.posthog.__loaded = true;
    grantAnalyticsConsent();
    expect(browser.init).not.toHaveBeenCalled();
    expect(browser.optIn).toHaveBeenCalledTimes(1);
  });

  it('never loads under Global Privacy Control', () => {
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    grantAnalyticsConsent();
    expect(browser.init).not.toHaveBeenCalled();
  });

  it('stops capturing and forgets the browser after a refusal', () => {
    revokeAnalyticsConsent();
    expect(browser.optOut).not.toHaveBeenCalled();

    browser.posthog.__loaded = true;
    revokeAnalyticsConsent();
    expect(browser.optOut).toHaveBeenCalledTimes(1);
    expect(browser.reset).toHaveBeenCalledTimes(1);
  });
});
