// Post an offer card and tell the seeker it arrived.
import { eq } from 'drizzle-orm';
import type { Tx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { postCard } from '@/modules/messaging';
import { notify } from '@/modules/notifications';
import { offers, pipelineEntries } from '../schema';
import { isBlocked } from '../interviews/blocks';
import { placeOf, seekerFirstName } from '../interviews/deliver';
import '../notification-types';

type OfferRow = typeof offers.$inferSelect;

export async function publishOffer(tx: Tx, row: OfferRow): Promise<void> {
  const [entry] = await tx
    .select()
    .from(pipelineEntries)
    .where(eq(pipelineEntries.applicationId, row.applicationId));
  if (!entry) return;
  // A block can land while the text is being scanned; nothing goes out after it.
  if (await isBlocked(tx, { orgId: row.orgId, seekerUserId: entry.seekerUserId })) return;
  const place = await placeOf(tx, row.listingId, row.orgId);
  const firstName = await seekerFirstName(tx, entry.seekerUserId);
  const base = getEnv().APP_URL.replace(/\/+$/, '');
  await postCard(tx, row.threadId, { type: 'offer', refId: row.id }, row.createdBy);
  await notify(tx, entry.seekerUserId, 'hiring.offer_received', {
    offerId: row.id,
    threadId: row.threadId,
    audience: 'seeker',
    orgName: place.orgName,
    position: row.position,
    firstName,
    url: `${base}/inbox/${row.threadId}`,
  });
}
