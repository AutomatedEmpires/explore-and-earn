// The consent the root layout writes into `<meta name="ee-consent">` for initAnalytics (SP8
// Plan decision 19): `<region>:<granted|denied|unset>:<0|1>`. The region comes from
// `x-vercel-ip-country` (a missing header counts as the EU, spec 8.4); the state from the
// ee_consent cookie, where a choice older than the newest material Cookie Policy counts as no
// choice; `Sec-GPC: 1` is `denied` everywhere; the last field is 1 in a view-as session.
// parseConsentMeta in src/lib/analytics-client.tsx reads it back.
import { gpcFromHeaders } from '@/lib/privacy-signals';
import { CONSENT_EU_COUNTRIES, parseConsentCookie } from '@/modules/privacy';

const EU = new Set<string>(CONSENT_EU_COUNTRIES);

export type ConsentRegion = 'eu' | 'other';
export type ConsentState = 'granted' | 'denied' | 'unset';
/** Request headers: a `Headers` or Next.js's read-only headers. */
type HeaderReader = { get(name: string): string | null };

export function consentRegion(headers: HeaderReader): ConsentRegion {
  const country = headers.get('x-vercel-ip-country')?.trim().toUpperCase() ?? '';
  return country === '' || EU.has(country) ? 'eu' : 'other';
}

export function consentState(i: {
  headers: HeaderReader;
  cookieValue: string | null;
  notBefore: Date | null;
  now?: Date;
}): ConsentState {
  if (gpcFromHeaders(i.headers)) return 'denied';
  const choice = parseConsentCookie(i.cookieValue, { notBefore: i.notBefore, now: i.now });
  if (!choice) return 'unset';
  return choice.analytics ? 'granted' : 'denied';
}

export function consentMeta(i: {
  headers: HeaderReader;
  cookieValue: string | null;
  notBefore: Date | null;
  viewAs: boolean;
  now?: Date;
}): string {
  return `${consentRegion(i.headers)}:${consentState(i)}:${i.viewAs ? 1 : 0}`;
}
