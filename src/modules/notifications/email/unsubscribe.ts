// Unsubscribe links. Every email carries one (List-Unsubscribe and the footer link); following
// it turns off that category's email for the user, without signing in.
//
// Token: `<payload>.<signature>`, both base64url. The payload is `<userId>:<category>`; the
// signature is HMAC-SHA256 over the encoded payload with UNSUBSCRIBE_SECRET. The signature is
// compared as text, so any changed character (even in unused trailing bits) fails. Tokens don't
// expire: an unsubscribe link has to keep working long after the email was sent.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { record } from '@/modules/audit';
import { setPreference } from '../notify';
import { CATEGORIES, type Category } from '../types';

const MAX_TOKEN_LENGTH = 512;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function sign(payload: string): string {
  return createHmac('sha256', getEnv().UNSUBSCRIBE_SECRET)
    .update(`unsubscribe.v1.${payload}`)
    .digest('base64url');
}

function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function buildUnsubscribeToken(userId: string, category: Category): string {
  const payload = Buffer.from(`${userId}:${category}`, 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(t: string): { userId: string; category: Category } | null {
  if (typeof t !== 'string' || t.length === 0 || t.length > MAX_TOKEN_LENGTH) return null;
  const parts = t.split('.');
  if (parts.length !== 2) return null;
  const [payload = '', signature = ''] = parts;
  if (!BASE64URL.test(payload) || !BASE64URL.test(signature)) return null;

  const given = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(sign(payload), 'utf8');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const [userId = '', category = '', ...rest] = Buffer.from(payload, 'base64url')
    .toString('utf8')
    .split(':');
  if (rest.length > 0 || !UUID.test(userId) || !isCategory(category)) return null;
  return { userId: userId.toLowerCase(), category };
}

/** The absolute unsubscribe URL for one user and category. */
export function unsubscribeUrl(userId: string, category: Category): string {
  const base = getEnv().APP_URL.replace(/\/+$/, '');
  return `${base}/api/v1/unsubscribe?token=${encodeURIComponent(buildUnsubscribeToken(userId, category))}`;
}

/** Where users manage every notification switch. */
export function manageNotificationsUrl(): string {
  return `${getEnv().APP_URL.replace(/\/+$/, '')}/notifications`;
}

/**
 * Turns off email for the token's category and records `notifications.unsubscribed`.
 * Returns null (and changes nothing) for an invalid token. Repeating it is harmless.
 */
export async function unsubscribe(
  db: DbOrTx,
  token: string,
): Promise<{ userId: string; category: Category } | null> {
  const target = verifyUnsubscribeToken(token);
  if (!target) return null;
  await db.transaction(async (tx) => {
    await setPreference(tx, target.userId, target.category, 'email', false);
    await record(tx, {
      actorType: 'user',
      actorId: target.userId,
      action: 'notifications.unsubscribed',
      subjectType: 'user',
      subjectId: target.userId,
      data: { category: target.category, channel: 'email' },
    });
  });
  return target;
}
