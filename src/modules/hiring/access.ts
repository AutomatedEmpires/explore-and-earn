// Listing and pipeline-entry scope for a host.
import { eq } from 'drizzle-orm';
import type { ListingHiringInfo } from '@/modules/listings';
import { getHiringInfoMany } from '@/modules/listings';
import { canAccessListing } from '@/modules/orgs';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { APPLICATION_UNAVAILABLE } from '@/lib/hiring';
import { inScope, listingScope } from '@/modules/messaging';
import type { HostContext } from '@/server/guards';
import type { PipelineEntryRow } from './core';
import { pipelineEntries } from './schema';

export async function requireListing(
  db: DbOrTx,
  ctx: HostContext,
  listingId: string,
): Promise<ListingHiringInfo> {
  const [info] = await getHiringInfoMany(db, [listingId]);
  if (!info || info.orgId !== ctx.orgId) throw notFound('Listing not found');
  if (!(await canAccessListing(db, ctx, { id: info.id, locationId: info.locationId }))) {
    throw notFound('Listing not found');
  }
  return info;
}

export async function requireEntry(
  db: DbOrTx,
  ctx: HostContext,
  applicationId: string,
  o?: { forUpdate?: boolean },
): Promise<PipelineEntryRow> {
  const query = db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
  const [row] = o?.forUpdate ? await query.for('update') : await query;
  if (!row || row.orgId !== ctx.orgId) throw notFound(APPLICATION_UNAVAILABLE);
  const scope = await listingScope(db, ctx);
  if (!inScope(scope, row.listingId)) throw notFound(APPLICATION_UNAVAILABLE);
  return row;
}

export type { HostContext };
