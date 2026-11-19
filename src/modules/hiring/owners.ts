// Who an invite, interview or offer belongs to, for another module's rule that keeps what a
// legal hold covers (trust.checks_12m: a check on one of them). Read-only, and reads only this
// module's tables, so the caller never names them in raw SQL
// (tests/lint/table-ownership.test.ts).
import { eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { interviews, invites, offers, pipelineEntries } from './schema';

/** The items hiring answers for. */
export type HiringOwnedItem = 'invite' | 'interview' | 'offer';

/** The organization an item belongs to and the people on it, without duplicates. */
export type HiringItemOwners = { orgId: string; userIds: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The owners of each item of one type, by id, in one read:
 * - an invite: its organization, the invited seeker and the person who sent it;
 * - an interview: its organization, the candidate and the person who organized it;
 * - an offer: its organization, the candidate and the person who made it.
 * The candidate of an interview or offer is the seeker on its application's pipeline entry.
 * An id that is not a uuid or names no item is left out of the map.
 */
export async function hiringItemOwners(
  db: DbOrTx,
  type: HiringOwnedItem,
  ids: readonly string[],
): Promise<Map<string, HiringItemOwners>> {
  const wanted = [...new Set(ids.filter((id) => UUID.test(id)))];
  const out = new Map<string, HiringItemOwners>();
  if (wanted.length === 0) return out;

  const rows =
    type === 'invite'
      ? await db
          .select({
            id: invites.id,
            orgId: invites.orgId,
            seeker: invites.seekerUserId,
            staff: invites.sentBy,
          })
          .from(invites)
          .where(inArray(invites.id, wanted))
      : type === 'interview'
        ? await db
            .select({
              id: interviews.id,
              orgId: interviews.orgId,
              seeker: pipelineEntries.seekerUserId,
              staff: interviews.organizerUserId,
            })
            .from(interviews)
            .leftJoin(pipelineEntries, eq(pipelineEntries.applicationId, interviews.applicationId))
            .where(inArray(interviews.id, wanted))
        : await db
            .select({
              id: offers.id,
              orgId: offers.orgId,
              seeker: pipelineEntries.seekerUserId,
              staff: offers.createdBy,
            })
            .from(offers)
            .leftJoin(pipelineEntries, eq(pipelineEntries.applicationId, offers.applicationId))
            .where(inArray(offers.id, wanted));
  for (const row of rows) {
    out.set(row.id, { orgId: row.orgId, userIds: people(row.seeker, row.staff) });
  }
  return out;
}

function people(...ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}
