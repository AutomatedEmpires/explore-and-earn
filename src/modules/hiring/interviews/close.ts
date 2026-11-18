// Close the open interview and offer when an application leaves, and reassign on member removal.
import { and, eq, inArray } from 'drizzle-orm';
import type { Db, Tx } from '@/lib/db';
import { withTx } from '@/lib/db';
import { readEnvelope } from '@/modules/jobs';
import { postEvent } from '@/modules/messaging';
import { listMembers } from '@/modules/orgs';
import { interviews, offers, pipelineEntries } from '../schema';
import { notifyInterview, scheduleFields } from './deliver';
import { setInterviewState, setOfferState } from './state';
import '../notification-types';

const ACTIVE = ['invited', 'scheduled', 'reschedule_requested'] as const;

function successor(members: { userId: string; role: string; joinedAt: Date }[]): string | null {
  const pick = (role: string) =>
    members
      .filter((member) => member.role === role)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.userId.localeCompare(b.userId));
  return pick('admin')[0]?.userId ?? pick('owner')[0]?.userId ?? null;
}

export async function onMemberRemoved(db: Db, payload: unknown): Promise<void> {
  const envelope = readEnvelope(payload, 'org.member_removed');
  const { orgId, userId, reassignToUserId } = envelope.data;
  await withTx(db, async (tx) => {
    const members = await listMembers(tx, orgId);
    const target = members.some((member) => member.userId === reassignToUserId)
      ? reassignToUserId
      : successor(members);
    if (!target || target === userId) return;
    await tx
      .update(interviews)
      .set({ organizerUserId: target })
      .where(
        and(eq(interviews.orgId, orgId), eq(interviews.organizerUserId, userId), inArray(interviews.status, [...ACTIVE])),
      );
  });
}

export async function closeOpenItems(
  tx: Tx,
  i: { applicationId: string; reason: 'withdrawn' | 'not_selected' },
): Promise<void> {
  const [entry] = await tx
    .select()
    .from(pipelineEntries)
    .where(eq(pipelineEntries.applicationId, i.applicationId));
  const [interview] = await tx
    .select()
    .from(interviews)
    .where(and(eq(interviews.applicationId, i.applicationId), inArray(interviews.status, [...ACTIVE])))
    .for('update');
  if (interview) {
    const wasScheduled = interview.status === 'scheduled';
    const previous = scheduleFields(interview);
    const [updated] = await tx
      .update(interviews)
      .set({ status: 'canceled', sequence: interview.sequence + 1 })
      .where(and(eq(interviews.id, interview.id), inArray(interviews.status, [...ACTIVE])))
      .returning();
    if (updated) {
      await setInterviewState(tx, i.applicationId, 'canceled');
      await postEvent(tx, interview.threadId, { code: 'interview_canceled', visibleTo: 'all' });
      if (entry) {
        const recipient = i.reason === 'withdrawn' ? updated.organizerUserId : entry.seekerUserId;
        const audience = i.reason === 'withdrawn' ? 'host' : 'seeker';
        await notifyInterview(
          tx,
          updated,
          entry.seekerUserId,
          [{ userId: recipient, audience }],
          'hiring.interview_canceled',
          wasScheduled ? { icsMethod: 'CANCEL', ...previous } : { icsMethod: 'CANCEL' },
        );
      }
    }
  }

  const [offer] = await tx
    .select()
    .from(offers)
    .where(and(eq(offers.applicationId, i.applicationId), eq(offers.status, 'sent')))
    .for('update');
  if (offer) {
    const [updated] = await tx
      .update(offers)
      .set({ status: 'canceled', respondedAt: new Date() })
      .where(and(eq(offers.id, offer.id), eq(offers.status, 'sent')))
      .returning();
    if (updated) {
      await setOfferState(tx, i.applicationId, 'canceled');
      await postEvent(tx, offer.threadId, { code: 'offer_canceled', visibleTo: 'all' });
    }
  }
}
