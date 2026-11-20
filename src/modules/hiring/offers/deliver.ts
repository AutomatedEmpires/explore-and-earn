// Post an offer card and tell the seeker it arrived.
//
// Nothing is posted for a host the applicant gate refuses (never verified, running, needs_review,
// needs_info or failed; issue 234). The offer is set to held, so the seeker does not see it, and
// a later release delivers it once the host is verified. Messaging holds a message the same way.
import { eq } from 'drizzle-orm';
import type { Tx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { postCard } from '@/modules/messaging';
import { notify } from '@/modules/notifications';
import { hostApplicantGate } from '@/modules/verification';
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
  // A host can be refused while the text is being scanned or held; the offer waits, held.
  if (!(await hostApplicantGate(tx, row.orgId)).ok) {
    await tx.update(offers).set({ scanState: 'held' }).where(eq(offers.id, row.id));
    return;
  }
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
