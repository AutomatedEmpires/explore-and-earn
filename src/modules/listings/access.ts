// Loading a listing for a host request: the org comes from the session and the member's
// recruiter scope applies, so another org's listing, or one outside the scope, is a 404.
import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { canAccessListing } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';
import { listings } from './schema';

export type ListingRecord = typeof listings.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** The listing `id` of the caller's org, if the caller may see it; else `not_found`. */
export async function loadListing(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
  opts: { forUpdate?: boolean } = {},
): Promise<ListingRecord> {
  if (!isUuid(id)) throw notFound('Listing not found');
  const query = db
    .select()
    .from(listings)
    .where(and(eq(listings.id, id), eq(listings.orgId, ctx.orgId)));
  const [row] = opts.forUpdate ? await query.for('update') : await query;
  if (!row) throw notFound('Listing not found');
  if (!(await canAccessListing(db, ctx, { id: row.id, locationId: row.locationId }))) {
    throw notFound('Listing not found');
  }
  return row;
}

/** A listing row by id alone (jobs and subject handlers), or null. */
export async function findListing(
  db: DbOrTx,
  id: string,
  opts: { forUpdate?: boolean } = {},
): Promise<ListingRecord | null> {
  if (!isUuid(id)) return null;
  const query = db.select().from(listings).where(eq(listings.id, id));
  const [row] = opts.forUpdate ? await query.for('update') : await query;
  return row ?? null;
}

/** The location a draft names: the onsite location, or a remote listing's host location. */
export function draftLocationId(draft: unknown): string | null {
  const where = (draft as { where?: { mode?: unknown; locationId?: unknown; hostLocationId?: unknown } })
    ?.where;
  if (!where) return null;
  const id = where.mode === 'remote' ? where.hostLocationId : where.locationId;
  return isUuid(id) ? id : null;
}

/** The title a draft names, or null. */
export function draftTitle(draft: unknown): string | null {
  const title = (draft as { basics?: { title?: unknown } })?.basics?.title;
  return typeof title === 'string' && title.trim() !== '' ? title.trim().slice(0, 200) : null;
}

/** The audit actor for a host member. */
export const userActor = (ctx: HostContext) => ({ actorType: 'user' as const, actorId: ctx.user.id });
