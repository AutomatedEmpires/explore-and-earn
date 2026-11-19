// The date before which a cookie choice no longer counts (SP8 spec 8.4): the effective date of
// the newest material Cookie Policy version readers have seen. A new material version asks EU
// visitors again. apiRoute reads it on every request, so it is cached for 300 seconds.
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { logger } from '@/lib/logger';
import { legalDocuments } from './schema-legal';

const CACHE_MS = 300_000;

let cached: { value: Date | null; expiresAt: number } | null = null;

/**
 * The `effective_at` of the latest published or superseded material `cookies` version, or null
 * when there is none. A failed read is logged and answers null without being cached, so a
 * database outage never fails a request that only needed this date.
 */
export async function getConsentNotBefore(
  db: DbOrTx,
  now: Date = new Date(),
): Promise<Date | null> {
  if (cached && now.getTime() < cached.expiresAt) return cached.value;
  try {
    const [row] = await db
      .select({ effectiveAt: legalDocuments.effectiveAt })
      .from(legalDocuments)
      .where(
        and(
          eq(legalDocuments.slug, 'cookies'),
          inArray(legalDocuments.status, ['published', 'superseded']),
          or(eq(legalDocuments.material, true), eq(legalDocuments.version, 1)),
        ),
      )
      .orderBy(desc(legalDocuments.version))
      .limit(1);
    const value = row?.effectiveAt ?? null;
    cached = { value, expiresAt: now.getTime() + CACHE_MS };
    return value;
  } catch (err) {
    logger.warn('Could not read the Cookie Policy date', { err });
    return null;
  }
}

/** Forgets the cached date. For tests. */
export function resetConsentEpochCache(): void {
  cached = null;
}
