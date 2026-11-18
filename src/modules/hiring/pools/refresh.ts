// The candidate pool refresh (SP5 spec 8.2, plan Task 13). One SP4 pool query of up to 500
// seekers, minus this listing's applicants and seekers who blocked or muted the org, scored and
// upserted by (listing, seeker). Saved and hidden flags survive a refresh. Seekers SP4 no longer
// returns become ineligible, with their cached state, availability and skills cleared. A
// per-listing advisory lock stops two refreshes running at once.
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { queryRows, withTx, type Db, type DbOrTx } from '@/lib/db';
import { POOL, todayInZone } from '@/lib/hiring';
import { newId } from '@/lib/ids';
import type { PoolCard } from '@/lib/profiles';
import { normalizeSkill, type ListingHiringInfo } from '@/modules/listings';
import { queryPoolCandidates } from '@/modules/profiles';
import { getRelationships } from '@/modules/safety';
import { toPoolListing } from '../fit/listing';
import { scoreSeekers } from '../fit/score';
import { FIT_WEIGHTS_VERSION } from '../fit/weights';
import { candidatePoolEntries, candidatePoolRuns, pipelineEntries } from '../schema';

/** The pool card's skills as `normalizeSkill` keys, for the skills filter. */
export function skillKeysOf(card: PoolCard): string[] {
  return [...new Set(card.skills.map((s) => normalizeSkill(s.label).key).filter((key) => key !== ''))];
}

/** The card's US state, or null outside the US. */
function stateOf(card: PoolCard): string | null {
  return card.countryCode === 'US' && card.region !== null && card.region.length === 2 ? card.region : null;
}

/** Seekers among `seekerUserIds` who have applied to the listing (any status). */
export async function applicantSeekerIds(
  db: DbOrTx,
  listingId: string,
  seekerUserIds: string[],
): Promise<Set<string>> {
  if (seekerUserIds.length === 0) return new Set();
  const rows = await db
    .select({ seekerUserId: pipelineEntries.seekerUserId })
    .from(pipelineEntries)
    .where(and(eq(pipelineEntries.listingId, listingId), inArray(pipelineEntries.seekerUserId, seekerUserIds)));
  return new Set(rows.map((row) => row.seekerUserId));
}

export async function refreshPool(db: Db, h: ListingHiringInfo, now: Date): Promise<'refreshed' | 'busy'> {
  return withTx(db, async (tx) => {
    const [lock] = await queryRows<{ locked: boolean }>(
      tx,
      sql`select pg_try_advisory_xact_lock(hashtextextended(${`pool:${h.id}`}, 0)) as locked`,
    );
    if (!lock?.locked) return 'busy';

    const { items } = await queryPoolCandidates(tx, { listing: toPoolListing(h), limit: POOL.queryLimit });
    const seekerIds = items.map((card) => card.seekerUserId);
    const applicants = await applicantSeekerIds(tx, h.id, seekerIds);
    const relationships = await getRelationships(tx, { orgId: h.orgId, seekerUserIds: seekerIds });
    const away = new Set(relationships.filter((r) => r.blocked || r.muted).map((r) => r.seekerUserId));
    const pool = items.filter((card) => !applicants.has(card.seekerUserId) && !away.has(card.seekerUserId));
    const poolIds = pool.map((card) => card.seekerUserId);
    const scores = await scoreSeekers(tx, h, poolIds, todayInZone(h.timezone, now));

    if (pool.length > 0) {
      await tx
        .insert(candidatePoolEntries)
        .values(
          pool.map((card) => {
            const fit = scores?.get(card.seekerUserId) ?? null;
            return {
              id: newId(),
              listingId: h.id,
              orgId: h.orgId,
              seekerUserId: card.seekerUserId,
              eligible: true,
              fitScore: fit?.score ?? null,
              fitLines: fit?.lines ?? null,
              state: stateOf(card),
              availableFrom: card.availabilityDate,
              skillsNorm: skillKeysOf(card),
              computedAt: now,
            };
          }),
        )
        .onConflictDoUpdate({
          target: [candidatePoolEntries.listingId, candidatePoolEntries.seekerUserId],
          set: {
            eligible: true,
            fitScore: sql`excluded.fit_score`,
            fitLines: sql`excluded.fit_lines`,
            state: sql`excluded.state`,
            availableFrom: sql`excluded.available_from`,
            skillsNorm: sql`excluded.skills_norm`,
            computedAt: sql`excluded.computed_at`,
          },
        });
    }

    await tx
      .update(candidatePoolEntries)
      .set({
        eligible: false,
        fitScore: null,
        fitLines: null,
        state: null,
        availableFrom: null,
        skillsNorm: [],
        computedAt: now,
      })
      .where(
        and(
          eq(candidatePoolEntries.listingId, h.id),
          eq(candidatePoolEntries.eligible, true),
          poolIds.length > 0 ? notInArray(candidatePoolEntries.seekerUserId, poolIds) : undefined,
        ),
      );

    if (h.publishedRevisionId) {
      const run = {
        listingId: h.id,
        orgId: h.orgId,
        listingRevisionId: h.publishedRevisionId,
        weightsVersion: FIT_WEIGHTS_VERSION,
        candidateCount: pool.length,
        computedAt: now,
      };
      await tx
        .insert(candidatePoolRuns)
        .values(run)
        .onConflictDoUpdate({ target: candidatePoolRuns.listingId, set: run });
    }
    return 'refreshed';
  });
}
