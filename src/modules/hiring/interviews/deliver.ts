// Post an interview card and tell the people the change is for.
import { eq } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { getHiringInfoMany } from '@/modules/listings';
import { postCard } from '@/modules/messaging';
import { notify } from '@/modules/notifications';
import { getOrgSummaries } from '@/modules/orgs';
import { getCommunityIdentities } from '@/modules/profiles';
import { interviews, pipelineEntries } from '../schema';
import { isBlocked } from './blocks';
import '../notification-types';

type InterviewRow = typeof interviews.$inferSelect;

export async function placeOf(
  db: DbOrTx,
  listingId: string,
  orgId: string,
): Promise<{ title: string; orgName: string; timezone: string }> {
  const [info] = await getHiringInfoMany(db, [listingId]);
  const orgs = await getOrgSummaries(db, [orgId]);
  return {
    title: info?.title ?? '',
    orgName: orgs.get(orgId)?.name ?? 'Org',
    timezone: info?.timezone ?? 'UTC',
  };
}

export async function seekerFirstName(db: DbOrTx, userId: string): Promise<string> {
  const names = await getCommunityIdentities(db, [userId]);
  return names.get(userId)?.firstName ?? '';
}

export function scheduleFields(row: Pick<InterviewRow, 'scheduledStart' | 'scheduledEnd'>): Record<string, string> {
  const out: Record<string, string> = {};
  if (row.scheduledStart) out.start = row.scheduledStart.toISOString();
  if (row.scheduledEnd) out.end = row.scheduledEnd.toISOString();
  return out;
}

export async function notifyInterview(
  db: DbOrTx,
  row: InterviewRow,
  seekerUserId: string,
  recipients: { userId: string; audience: 'seeker' | 'host' }[],
  type: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const place = await placeOf(db, row.listingId, row.orgId);
  const firstName = await seekerFirstName(db, seekerUserId);
  const base = getEnv().APP_URL.replace(/\/+$/, '');
  for (const recipient of recipients) {
    const path = recipient.audience === 'host' ? `/host/messages/${row.threadId}` : `/inbox/${row.threadId}`;
    await notify(db, recipient.userId, type, {
      interviewId: row.id,
      sequence: row.sequence,
      threadId: row.threadId,
      audience: recipient.audience,
      orgName: place.orgName,
      position: place.title,
      firstName,
      url: `${base}${path}`,
      ...extra,
    });
  }
}

export async function publishInterviewInvite(tx: Tx, row: InterviewRow): Promise<void> {
  const [entry] = await tx
    .select()
    .from(pipelineEntries)
    .where(eq(pipelineEntries.applicationId, row.applicationId));
  if (!entry) return;
  // A block can land while the text is being scanned; nothing goes out after it.
  if (await isBlocked(tx, { orgId: row.orgId, seekerUserId: entry.seekerUserId })) return;
  await postCard(tx, row.threadId, { type: 'interview', refId: row.id }, row.organizerUserId);
  await notifyInterview(
    tx,
    row,
    entry.seekerUserId,
    [{ userId: entry.seekerUserId, audience: 'seeker' }],
    'hiring.interview_invited',
  );
}
