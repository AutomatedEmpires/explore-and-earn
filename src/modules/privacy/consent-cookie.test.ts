import { describe, expect, it } from 'vitest';
import {
  CONSENT_COOKIE,
  CONSENT_EU_COUNTRIES,
  allowedByConsent,
  consentCookieValue,
  parseConsentCookie,
  readConsent,
} from './consent-cookie';

const id = '018f6b2e-6c3a-7b2e-8c3a-6c3a7b2e8c3a';
const now = new Date('2026-06-01T00:00:00Z');

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/', { headers });
}

describe('parseConsentCookie', () => {
  it('rejects a malformed, future, expired or pre-notBefore value', () => {
    expect(parseConsentCookie(`1.${id}.x.1767225600`, { now })).toBeNull();
    expect(parseConsentCookie(`1.${id}.a.abc`, { now })).toBeNull();
    const ahead = Math.floor(now.getTime() / 1000) + 3_600;
    expect(parseConsentCookie(`1.${id}.a.${ahead}`, { now })).toBeNull();
    const stale = Math.floor(now.getTime() / 1000) - 31_536_001;
    expect(parseConsentCookie(`1.${id}.a.${stale}`, { now })).toBeNull();
    const fresh = consentCookieValue(id, true, now);
    expect(parseConsentCookie(fresh, { now, notBefore: new Date(now.getTime() + 1000) })).toBeNull();
    expect(parseConsentCookie(fresh, { now })).toEqual({ consentId: id, analytics: true, at: now });
    expect(parseConsentCookie(consentCookieValue(id, false, now), { now })?.analytics).toBe(false);
  });
});

describe('readConsent', () => {
  it('treats a missing country as the EU and names the extra EEA countries', () => {
    expect(CONSENT_EU_COUNTRIES).toHaveLength(32);
    expect(readConsent(req())).toEqual({ region: 'eu', analytics: null });
    expect(readConsent(req({ 'x-vercel-ip-country': 'DE' }))).toEqual({
      region: 'eu',
      analytics: null,
    });
    for (const cc of ['GB', 'CH', 'NO', 'IS', 'LI']) {
      expect(readConsent(req({ 'x-vercel-ip-country': cc })).region).toBe('eu');
    }
    expect(readConsent(req({ 'x-vercel-ip-country': 'US' }))).toEqual({
      region: 'other',
      analytics: null,
    });
  });

  it('treats a cookie that is not valid percent-encoding as no choice, and never throws', () => {
    // decodeURIComponent throws URIError on these. apiRoute reads consent on every request, so a
    // throw here would answer 500 on every API route for that browser.
    for (const bad of ['%', '%E0%A4%A', '1.%ZZ.a.1', `%C0%AF${consentCookieValue(id, true, now)}`]) {
      const cookie = `other=1; ${CONSENT_COOKIE}=${bad}`;
      expect(() => readConsent(req({ cookie }), { now })).not.toThrow();
      const read = readConsent(req({ 'x-vercel-ip-country': 'DE', cookie }), { now });
      expect(read).toEqual({ region: 'eu', analytics: null });
      expect(allowedByConsent(read)).toBe(false);
    }
    // A valid choice still reads when another cookie on the header is malformed.
    const cookie = `junk=%; ${CONSENT_COOKIE}=${consentCookieValue(id, true, now)}`;
    expect(readConsent(req({ 'x-vercel-ip-country': 'DE', cookie }), { now }).analytics).toBe(true);
  });

  it('reads the cookie and lets Sec-GPC refuse analytics everywhere', () => {
    const cookie = `${CONSENT_COOKIE}=${consentCookieValue(id, true, now)}`;
    expect(
      readConsent(req({ 'x-vercel-ip-country': 'DE', cookie }), { now }).analytics,
    ).toBe(true);
    expect(
      readConsent(req({ 'x-vercel-ip-country': 'US', cookie, 'sec-gpc': '1' }), { now }),
    ).toEqual({ region: 'other', analytics: false });
    expect(allowedByConsent({ region: 'eu', analytics: true })).toBe(true);
    expect(allowedByConsent({ region: 'eu', analytics: null })).toBe(false);
    expect(allowedByConsent({ region: 'other', analytics: null })).toBe(true);
    expect(allowedByConsent({ region: 'other', analytics: false })).toBe(false);
  });
});
