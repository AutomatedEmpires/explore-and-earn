// Who is looking at a discovery surface (SP3 spec 8.3, 8.12 and section 10). Discovery is
// public, so a viewer may be a guest; any failure to identify the caller makes them a guest
// rather than failing the read.
//
// - `seekerId` is set only for seeker accounts: hosts, operators and guests get no overlay,
//   skips or saved state (spec 8.1).
// - `viewerKey` dedupes views and feeds the placement hook: the user id, or for guests an HMAC
//   of the IP alone (no cookie, and not the user agent). Neither leaves the server.
// - `tz` is the viewer's IANA zone from `?tz=` or the `ee_tz` cookie, else America/Chicago.
import 'server-only';
import { createHmac } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { cookies, headers } from 'next/headers';
import { getDb } from '@/lib/db';
import { DEFAULT_TZ, resolveTimeZone } from '@/lib/discovery';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { findUserByClerkId } from '@/modules/identity';

export type Viewer = {
  userId: string | null;
  seekerId: string | null;
  accountType: 'seeker' | 'host' | 'operator' | null;
  viewerKey: string;
  tz: string;
};

/** The functional cookie the seeker shell sets from the browser's time zone. */
export const TZ_COOKIE = 'ee_tz';

/** HMAC-SHA256 of `v` keyed with ANALYTICS_HASH_SECRET, base64url (43 characters). */
export function hmacKey(v: string): string {
  return createHmac('sha256', getEnv().ANALYTICS_HASH_SECRET).update(v).digest('base64url');
}

/**
 * The user id, or for a guest an HMAC of the IP. The user agent is ignored: rotating it must
 * not mint a new viewer. `userAgent` stays on the argument so callers do not change.
 */
export function viewerKeyFor(i: {
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
}): string {
  if (i.userId) return i.userId;
  return hmacKey(i.ip || 'unknown');
}

/** The first `x-forwarded-for` address, else `x-real-ip`. */
function clientIp(h: Headers): string | null {
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || h.get('x-real-ip')?.trim() || null;
}

/** The first candidate that is a known time zone, else the default. */
function pickTimeZone(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (!c) continue;
    const tz = resolveTimeZone(c);
    if (tz !== DEFAULT_TZ || c === DEFAULT_TZ) return tz;
  }
  return DEFAULT_TZ;
}

function cookieValue(header: string | null, name: string): string | null {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

async function resolveViewer(i: {
  tz: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<Viewer> {
  let user: { id: string; accountType: Viewer['accountType'] } | null = null;
  try {
    const { userId: clerkUserId } = await auth();
    if (clerkUserId) {
      const row = await findUserByClerkId(getDb(), clerkUserId);
      if (row && !row.deletedAt) user = { id: row.id, accountType: row.accountType };
    }
  } catch (err) {
    logger.warn('discovery.viewer_unresolved', { err });
  }
  const userId = user?.id ?? null;
  return {
    userId,
    seekerId: user?.accountType === 'seeker' ? user.id : null,
    accountType: user?.accountType ?? null,
    viewerKey: viewerKeyFor({ userId, ip: i.ip, userAgent: i.userAgent }),
    tz: i.tz,
  };
}

/** The viewer of an API request. */
export async function getViewer(req: Request): Promise<Viewer> {
  const tz = pickTimeZone(
    new URL(req.url).searchParams.get('tz'),
    cookieValue(req.headers.get('cookie'), TZ_COOKIE),
  );
  return resolveViewer({ tz, ip: clientIp(req.headers), userAgent: req.headers.get('user-agent') });
}

/** The viewer of the page being rendered (Server Components). */
export async function getPageViewer(): Promise<Viewer> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  return resolveViewer({
    tz: pickTimeZone(c.get(TZ_COOKIE)?.value),
    ip: clientIp(h),
    userAgent: h.get('user-agent'),
  });
}

/** A JSON response no shared cache may store (every discovery response). */
export function privateJson(body: unknown, init?: ResponseInit): Response {
  const responseHeaders = new Headers(init?.headers);
  responseHeaders.set('cache-control', 'private, no-store');
  return Response.json(body, { ...init, headers: responseHeaders });
}
