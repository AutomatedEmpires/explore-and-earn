// Expire unanswered invites, complete unmarked interviews, nudge the host, and reassign.
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { withTx } from '@/lib/db';
import { INTERVIEWS } from '@/lib/hiring';
import { listMembers, type Member } from '@/modules/orgs';
import { interviews, pipelineEntries } from '../schema';
import { recordPipelineEvent } from '../core';
import { notifyInterview } from './deliver';
import { setInterviewState } from './state';

const ACTIVE = ['invited', 'scheduled', 'reschedule_requested'] as const;
const AUTO_MS = INTERVIEWS.autoCompleteHours * 60 * 60_000;

function pickSuccessor(members: Member[]): string | null {
  const byJoin = (role: Member['role']) =>
    members
      .filter((member) => member.role === role)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.userId.localeCompare(b.userId));
  return byJoin('admin')[0]?.userId ?? byJoin('owner')[0]?.userId ?? null;
}

/** Moves active interviews whose organizer left to the longest-standing Admin, else the Owner. */
export async function reassignMissingOrganizers(db: Db, now = new Date()): Promise<void> {
  void now;
  const rows = await db
    .select({ id: interviews.id, orgId: interviews.orgId, organizerUserId: interviews.organizerUserId })
    .from(interviews)
    .where(inArray(interviews.status, [...ACTIVE]));
  const byOrg = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byOrg.get(row.orgId) ?? [];
    list.push(row);
    byOrg.set(row.orgId, list);
  }
  for (const [orgId, group] of byOrg) {
    const members = await listMembers(db, orgId);
    const live = new Set(members.map((member) => member.userId));
    const target = pickSuccessor(members);
    if (!target) continue;
    const ids = group.filter((row) => !live.has(row.organizerUserId) && row.organizerUserId !== target).map((row) => row.id);
    if (ids.length === 0) continue;
    await db.update(interviews).set({ organizerUserId: target }).where(inArray(interviews.id, ids));
  }
}

export async function sweepInterviews(db: Db, now = new Date()): Promise<void> {
  await reassignMissingOrganizers(db, now);
  await withTx(db, async (tx) => {
    const expired = await tx
      .select({ interview: interviews, seekerUserId: pipelineEntries.seekerUserId })
      .from(interviews)
      .innerJoin(pipelineEntries, eq(interviews.applicationId, pipelineEntries.applicationId))
      .where(and(eq(interviews.status, 'invited'), lte(interviews.expiresAt, now)));
    for (const row of expired) {
      const [updated] = await tx
        .update(interviews)
        .set({ status: 'expired' })
        .where(and(eq(interviews.id, row.interview.id), eq(interviews.status, 'invited')))
        .returning();
      if (!updated) continue;
      await setInterviewState(tx, row.interview.applicationId, 'expired');
      await notifyInterview(
        tx,
        updated,
        row.seekerUserId,
        [{ userId: updated.organizerUserId, audience: 'host' }],
        'hiring.interview_expired',
      );
    }

    const due = new Date(now.getTime() - AUTO_MS);
    const finished = await tx
      .select({ interview: interviews, entry: pipelineEntries })
      .from(interviews)
      .innerJoin(pipelineEntries, eq(interviews.applicationId, pipelineEntries.applicationId))
      .where(and(eq(interviews.status, 'scheduled'), lte(interviews.scheduledEnd, due)));
    for (const row of finished) {
      const [updated] = await tx
        .update(interviews)
        .set({ status: 'completed', outcomeAt: now, outcomeBy: null })
        .where(and(eq(interviews.id, row.interview.id), eq(interviews.status, 'scheduled')))
        .returning();
      if (!updated) continue;
      await setInterviewState(tx, row.entry.applicationId, 'completed');
      await recordPipelineEvent(tx, {
        orgId: row.entry.orgId,
        listingId: row.entry.listingId,
        locationId: row.entry.locationId,
        applicationId: row.entry.applicationId,
        kind: 'interview_completed',
        actor: { type: 'system' },
        at: now,
      });
    }

    const nudge = await tx
      .select({ interview: interviews, seekerUserId: pipelineEntries.seekerUserId })
      .from(interviews)
      .innerJoin(pipelineEntries, eq(interviews.applicationId, pipelineEntries.applicationId))
      .where(
        and(
          eq(interviews.status, 'scheduled'),
          lte(interviews.scheduledEnd, now),
          isNull(interviews.outcomeAt),
          isNull(interviews.outcomeNudgedAt),
        ),
      );
    for (const row of nudge) {
      const [updated] = await tx
        .update(interviews)
        .set({ outcomeNudgedAt: now })
        .where(and(eq(interviews.id, row.interview.id), isNull(interviews.outcomeNudgedAt)))
        .returning();
      if (!updated) continue;
      await notifyInterview(
        tx,
        updated,
        row.seekerUserId,
        [{ userId: updated.organizerUserId, audience: 'host' }],
        'hiring.interview_outcome_due',
      );
    }
  });
}
