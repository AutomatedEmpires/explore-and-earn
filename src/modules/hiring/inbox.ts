// How many delivered hiring items are waiting on the seeker.
import { and, eq, gt, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { interviews, invites, offers, pipelineEntries } from './schema';

const DELIVERED = ['clear', 'warn'] as const;

export async function pendingInboxCount(db: DbOrTx, seekerUserId: string, now = new Date()): Promise<number> {
  const [inviteRows, interviewRows, offerRows] = await Promise.all([
    db
      .select({ id: invites.id })
      .from(invites)
      .where(
        and(
          eq(invites.seekerUserId, seekerUserId),
          eq(invites.status, 'sent'),
          gt(invites.expiresAt, now),
          inArray(invites.scanState, [...DELIVERED]),
        ),
      ),
    db
      .select({ id: interviews.id })
      .from(interviews)
      .innerJoin(pipelineEntries, eq(interviews.applicationId, pipelineEntries.applicationId))
      .where(
        and(
          eq(pipelineEntries.seekerUserId, seekerUserId),
          eq(interviews.status, 'invited'),
          inArray(interviews.scanState, [...DELIVERED]),
        ),
      ),
    db
      .select({ id: offers.id })
      .from(offers)
      .innerJoin(pipelineEntries, eq(offers.applicationId, pipelineEntries.applicationId))
      .where(
        and(
          eq(pipelineEntries.seekerUserId, seekerUserId),
          eq(offers.status, 'sent'),
          inArray(offers.scanState, [...DELIVERED]),
        ),
      ),
  ]);
  return inviteRows.length + interviewRows.length + offerRows.length;
}
