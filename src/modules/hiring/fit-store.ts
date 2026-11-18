// Stored fit for applicants (SP5 plan Task 13). The fit engine itself never writes; this file
// does. When fit is off for a listing the stored score is cleared, so none is kept (spec 8.3).
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import type { ApplicationStatus } from '@/lib/applications';
import { getHiringInfoMany } from '@/modules/listings';
import { scoreSeekers } from './fit/score';
import { pipelineEntries } from './schema';

const TERMINAL: ApplicationStatus[] = ['hired', 'not_selected', 'withdrawn', 'offer_declined'];

/**
 * Writes `fit_score`, `fit_lines`, `fit_weights_version` and `fit_computed_at` for the given
 * entries of the listing, or for every non-terminal one. Returns how many entries got a score.
 */
export async function scoreApplications(
  db: Db,
  i: { listingId: string; applicationIds?: string[] },
): Promise<number> {
  if (i.applicationIds?.length === 0) return 0;
  const [h] = await getHiringInfoMany(db, [i.listingId]);
  if (!h) return 0;
  const which = i.applicationIds
    ? and(eq(pipelineEntries.listingId, h.id), inArray(pipelineEntries.applicationId, i.applicationIds))
    : and(eq(pipelineEntries.listingId, h.id), notInArray(pipelineEntries.status, TERMINAL));
  const entries = await db
    .select({ applicationId: pipelineEntries.applicationId, seekerUserId: pipelineEntries.seekerUserId })
    .from(pipelineEntries)
    .where(which);
  if (entries.length === 0) return 0;

  const scores = await scoreSeekers(
    db,
    h,
    [...new Set(entries.map((e) => e.seekerUserId))],
  );
  const now = new Date();
  const values = entries.map((entry) => {
    const fit = scores?.get(entry.seekerUserId) ?? null;
    return {
      application_id: entry.applicationId,
      score: fit?.score ?? null,
      lines: fit?.lines ?? null,
      version: fit?.weightsVersion ?? null,
      at: fit ? now.toISOString() : null,
    };
  });
  // One statement for the whole listing, not one per entry.
  await db.execute(sql`
    update app.pipeline_entries p
    set fit_score = v.score, fit_lines = v.lines, fit_weights_version = v.version, fit_computed_at = v.at
    from jsonb_to_recordset(${JSON.stringify(values)}::jsonb)
      as v(application_id uuid, score smallint, lines jsonb, version text, at timestamptz)
    where p.application_id = v.application_id
  `);
  return values.filter((v) => v.score !== null).length;
}

/** `hiring.fit_refresh` (daily): rescores non-terminal entries on every active listing. */
export async function refreshFit(db: Db, _now: Date): Promise<number> {
  const rows = await db
    .selectDistinct({ listingId: pipelineEntries.listingId })
    .from(pipelineEntries)
    .where(notInArray(pipelineEntries.status, TERMINAL));
  if (rows.length === 0) return 0;
  const listings = await getHiringInfoMany(
    db,
    rows.map((r) => r.listingId),
  );
  let scored = 0;
  for (const h of listings) {
    if (h.status !== 'active') continue;
    scored += await scoreApplications(db, { listingId: h.id });
  }
  return scored;
}
