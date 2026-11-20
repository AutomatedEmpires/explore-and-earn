// POST /api/v1/consent (SP8 spec 8.4 and section 5): records a visitor's cookie choice and sets
// the ee_consent cookie. Anyone may call it, signed in or not, up to 30 times an hour from one
// address. The device keeps its consent id from a valid cookie. The row holds the country header
// (two capital letters, else null), the region, the choice and the published Cookie Policy
// version (0 while none is published); never the IP address. Global Privacy Control is a
// refusal everywhere, so a request that carries it is recorded as a refusal.
import { z } from 'zod';
import { gpcFromHeaders } from '@/lib/privacy-signals';
import { getPublishedLegal } from '@/modules/content';
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  consentCookieValue,
  parseConsentCookie,
  readConsent,
  recordConsent,
} from '@/modules/privacy';
import { apiRoute } from '@/server/api';
import { clientIp } from '@/server/request-context';

const input = z.object({ analytics: z.boolean() }).strict();
const output = z.object({ consentId: z.string() });
type Output = z.output<typeof output>;

function cookieFrom(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== CONSENT_COOKIE) continue;
    return part.slice(eq + 1).trim();
  }
  return null;
}

export const POST = apiRoute({
  auth: 'optional',
  input,
  rateLimit: {
    key: (ctx) => `consent:${clientIp(ctx.req) ?? 'unknown'}`,
    limit: 30,
    windowSec: 3600,
  },
  openapi: {
    method: 'POST',
    path: '/api/v1/consent',
    summary: 'Record a cookie choice and set the ee_consent cookie',
    output,
  },
  handler: async ({ db, user, input, req }) => {
    const now = new Date();
    const previous = parseConsentCookie(cookieFrom(req.headers.get('cookie')), { now });
    const country = req.headers.get('x-vercel-ip-country')?.trim() ?? '';
    const analytics = input.analytics && !gpcFromHeaders(req.headers);
    const policy = await getPublishedLegal(db, 'cookies');

    const { consentId } = await recordConsent(db, {
      consentId: previous?.consentId ?? null,
      userId: user?.id ?? null,
      country: /^[A-Z]{2}$/.test(country) ? country : null,
      region: readConsent(req).region,
      analytics,
      policyVersion: policy?.version ?? 0,
    });

    const cookie = [
      `${CONSENT_COOKIE}=${consentCookieValue(consentId, analytics, now)}`,
      'Path=/',
      `Max-Age=${CONSENT_MAX_AGE}`,
      'SameSite=Lax',
      'Secure',
    ].join('; ');
    const res = Response.json(
      { consentId },
      { headers: { 'set-cookie': cookie, 'cache-control': 'no-store' } },
    );
    // apiRoute sends a returned Response as it is; the schema documents its body.
    return res as unknown as Output;
  },
});
