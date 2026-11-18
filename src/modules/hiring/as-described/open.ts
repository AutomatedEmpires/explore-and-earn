// One As-described row per hire. A second hire event for the same application does nothing.
import { eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { APPLICATION_UNAVAILABLE } from '@/lib/hiring';
import { newId } from '@/lib/ids';
import { getHiringInfoMany } from '@/modules/listings';
import { pipelineEntries } from '../schema';

export async function openAsDescribed(
  tx: DbOrTx,
  i: { applicationId: string; hiredSource?: 'host' | 'offer_accepted'; at?: Date },
): Promise<void> {
  const [entry] = await tx
    .select()
    .from(pipelineEntries)
    .where(eq(pipelineEntries.applicationId, i.applicationId));
  if (!entry) throw notFound(APPLICATION_UNAVAILABLE);

  const source = i.hiredSource ?? entry.hiredSource;
  const eligibleVia = source === 'host' ? 'host_marked' : 'offer_accepted';
  const [info] = await getHiringInfoMany(tx, [entry.listingId]);

  await tx.execute(sql`
    insert into app.as_described_responses (
      id, application_id, org_id, listing_id, seeker_user_id, eligible_via, asks_housing, asks_meals
    ) values (
      ${newId()}, ${entry.applicationId}, ${entry.orgId}, ${entry.listingId}, ${entry.seekerUserId},
      ${eligibleVia}, ${info?.housingProvided ?? false}, ${info?.mealsProvided ?? false}
    )
    on conflict (application_id) do nothing
  `);
}
