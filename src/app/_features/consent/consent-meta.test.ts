// consentMeta (SP8 plan Task 26): the root layout's reading of a visitor's consent, which
// initAnalytics reads back before it loads PostHog.
import { describe, expect, it } from 'vitest';
import { analyticsAllowedByMeta, parseConsentMeta } from '@/lib/analytics-client';
import { consentCookieValue } from '@/modules/privacy';
import { consentMeta } from './consent-meta';

const NOW = new Date('2026-12-01T12:00:00Z');
const CONSENT_ID = '0190f7a2-0000-7000-8000-00000000c0de';

function meta(
  headers: Record<string, string>,
  o: { cookie?: string | null; notBefore?: Date | null; viewAs?: boolean } = {},
): string {
  return consentMeta({
    headers: new Headers(headers),
    cookieValue: o.cookie ?? null,
    notBefore: o.notBefore ?? null,
    viewAs: o.viewAs ?? false,
    now: NOW,
  });
}

describe('consentMeta', () => {
  it('reads an EU visitor with no choice as unset', () => {
    expect(meta({ 'x-vercel-ip-country': 'DE' })).toBe('eu:unset:0');
    // A missing country header counts as the EU (spec 8.4).
    expect(meta({})).toBe('eu:unset:0');
  });

  it('counts Global Privacy Control as a refusal outside the EU too', () => {
    expect(meta({ 'x-vercel-ip-country': 'US', 'sec-gpc': '1' })).toBe('other:denied:0');
    const accepted = consentCookieValue(CONSENT_ID, true, NOW);
    expect(meta({ 'x-vercel-ip-country': 'US', 'sec-gpc': '1' }, { cookie: accepted })).toBe(
      'other:denied:0',
    );
  });

  it('reads the cookie choice, and marks a view-as session', () => {
    const accepted = consentCookieValue(CONSENT_ID, true, NOW);
    expect(meta({ 'x-vercel-ip-country': 'DE' }, { cookie: accepted, viewAs: true })).toBe(
      'eu:granted:1',
    );
    const refused = consentCookieValue(CONSENT_ID, false, NOW);
    expect(meta({ 'x-vercel-ip-country': 'FR' }, { cookie: refused })).toBe('eu:denied:0');
    expect(meta({ 'x-vercel-ip-country': 'US' })).toBe('other:unset:0');
  });

  it('asks again after a new material Cookie Policy, and ignores a malformed cookie', () => {
    const before = consentCookieValue(CONSENT_ID, true, new Date(NOW.getTime() - 60_000));
    expect(meta({ 'x-vercel-ip-country': 'DE' }, { cookie: before, notBefore: NOW })).toBe(
      'eu:unset:0',
    );
    expect(meta({ 'x-vercel-ip-country': 'DE' }, { cookie: '1.nope.a.1' })).toBe('eu:unset:0');
  });

  it('round-trips through the parser initAnalytics uses', () => {
    expect(analyticsAllowedByMeta(parseConsentMeta(meta({ 'x-vercel-ip-country': 'DE' })))).toBe(
      false,
    );
    expect(analyticsAllowedByMeta(parseConsentMeta(meta({ 'x-vercel-ip-country': 'US' })))).toBe(
      true,
    );
    const accepted = consentCookieValue(CONSENT_ID, true, NOW);
    expect(
      analyticsAllowedByMeta(
        parseConsentMeta(meta({ 'x-vercel-ip-country': 'DE' }, { cookie: accepted })),
      ),
    ).toBe(true);
  });
});
