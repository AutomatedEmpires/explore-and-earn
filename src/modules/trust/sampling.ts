// Accuracy sampling (`trust.audit_sample`, weekly): a random share of the past week's automatic
// decisions is copied into the `audit_sample` queue, so operators can check the classifier.
import { and, asc, gt, inArray, lte, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getSetting } from '@/modules/settings';
import { openReviewItem } from './routing';
import { trustChecks } from './schema';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Samples the trust checks decided automatically (approved or rejected) in the 7 days up to
 * `now`: each is taken with probability `rate` (default: the `trust.audit_sample_rate`
 * setting), so about `rate × total` of them. Each sample opens an `audit_sample` item about the
 * check's subject, linked to the check; a check is never sampled twice. Returns the count.
 */
export async function auditSample(
  db: DbOrTx,
  now: Date,
  rate?: number,
  rand: () => number = Math.random,
): Promise<number> {
  const r = rate ?? (await getSetting(db, 'trust.audit_sample_rate'));
  if (!(r >= 0 && r <= 1)) throw badRequest('The sample rate must be between 0 and 1');
  if (r === 0) return 0;

  const since = new Date(now.getTime() - WEEK_MS);
  const candidates = await db
    .select({
      id: trustChecks.id,
      kind: trustChecks.kind,
      subjectType: trustChecks.subjectType,
      subjectId: trustChecks.subjectId,
      decision: trustChecks.decision,
      score: trustChecks.score,
    })
    .from(trustChecks)
    .where(
      and(
        inArray(trustChecks.decision, ['approved', 'rejected']),
        gt(trustChecks.createdAt, since),
        lte(trustChecks.createdAt, now),
        sql`not exists (
          select 1 from app.review_items r
          where r.queue = 'audit_sample' and r.check_id = ${trustChecks.id}
        )`,
      ),
    )
    .orderBy(asc(trustChecks.createdAt), asc(trustChecks.id));

  let sampled = 0;
  for (const check of candidates) {
    if (!(rand() < r)) continue;
    await openReviewItem(db, {
      queue: 'audit_sample',
      subjectType: check.subjectType,
      subjectId: check.subjectId,
      reason: `Accuracy sample: ${check.kind} was ${check.decision} automatically`,
      checkId: check.id,
      ...(check.score === null ? {} : { aiConfidence: check.score }),
    });
    sampled++;
  }

  logger.info('trust accuracy sample taken', {
    candidates: candidates.length,
    sampled,
    rate: r,
    since: since.toISOString(),
  });
  return sampled;
}
