// The ee_consent cookie and the region rule apiRoute uses to decide whether analytics may run.
// W5 replaces the storage of a choice; this file stays the parser.

export const CONSENT_COOKIE = 'ee_consent';
/** One year, in seconds. A cookie this old counts as no choice. */
export const CONSENT_MAX_AGE = 31_536_000;
/** How far ahead of the server clock a cookie's timestamp may be. */
const FUTURE_SKEW_SEC = 300;

/** EU 27 plus Iceland, Liechtenstein, Norway, the UK and Switzerland. */
export const CONSENT_EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
  'GB',
  'CH',
] as const;

const EU = new Set<string>(CONSENT_EU_COUNTRIES);
const COOKIE_VALUE = /^1\.([0-9a-f-]{36})\.([ar])\.(\d{1,12})$/;

export type ConsentChoice = { consentId: string; analytics: boolean; at: Date };
export type ConsentRead = { region: 'eu' | 'other'; analytics: boolean | null };

export function consentCookieValue(consentId: string, analytics: boolean, at: Date): string {
  const epoch = Math.floor(at.getTime() / 1000);
  return `1.${consentId}.${analytics ? 'a' : 'r'}.${epoch}`;
}

/** The cookie payload, or null when it is malformed, too new, too old, or before `notBefore`. */
export function parseConsentCookie(
  value: string | null,
  opts: { now?: Date; notBefore?: Date | null } = {},
): ConsentChoice | null {
  if (!value) return null;
  const match = COOKIE_VALUE.exec(value);
  if (!match) return null;
  const consentId = match[1];
  const flag = match[2];
  const epoch = Number(match[3]);
  if (!consentId || (flag !== 'a' && flag !== 'r') || !Number.isSafeInteger(epoch)) return null;

  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (epoch > nowSec + FUTURE_SKEW_SEC) return null;
  if (nowSec - epoch >= CONSENT_MAX_AGE) return null;
  const at = new Date(epoch * 1000);
  if (opts.notBefore && at < opts.notBefore) return null;
  return { consentId, analytics: flag === 'a', at };
}

/**
 * The first cookie called `name`, decoded. A value that is not valid percent-encoding is null:
 * the browser sent something we never wrote, and it counts as no choice. decodeURIComponent
 * throws on it, and apiRoute reads consent on every request, so a throw here would answer 500
 * on every API route for that browser.
 */
function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Region from `x-vercel-ip-country` (a missing header is treated as the EU). Analytics is the
 * cookie's choice, or null when the visitor has not chosen. `Sec-GPC: 1` is a refusal everywhere.
 */
export function readConsent(
  req: Request,
  opts: { notBefore?: Date | null; now?: Date } = {},
): ConsentRead {
  const country = req.headers.get('x-vercel-ip-country')?.trim().toUpperCase() ?? '';
  const region: ConsentRead['region'] = country === '' || EU.has(country) ? 'eu' : 'other';
  if (req.headers.get('sec-gpc') === '1') return { region, analytics: false };
  const parsed = parseConsentCookie(cookieValue(req.headers.get('cookie'), CONSENT_COOKIE), opts);
  return { region, analytics: parsed ? parsed.analytics : null };
}

/** Whether this request may load analytics. The EU needs an explicit yes; elsewhere, not a no. */
export function allowedByConsent(c: ConsentRead): boolean {
  return c.region === 'eu' ? c.analytics === true : c.analytics !== false;
}
