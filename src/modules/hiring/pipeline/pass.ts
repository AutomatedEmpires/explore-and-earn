// Pass with a 10-second undo. The commit job sends the Not selected message.
//
// Pass and Undo act on an applicant, so both ask the verified-host gate first (legal review 7.1,
// issue 234): a host it refuses gets the applicant list's 409 and nothing is written. The commit
// job asks again: a pass that was pending when the host was refused is dropped, not committed,
// so no applicant is closed out by a host the platform has refused.
import { and, eq } from 'drizzle-orm';
import type { ApplicationStatus } from '@/lib/applications';
import { PASS_UNDO_MS } from '@/lib/hiring';
import { conflict } from '@/lib/errors';
import type { Db, DbOrTx } from '@/lib/db';
import { withTx } from '@/lib/db';
import { fillTemplate } from '@/lib/messaging';
import { record } from '@/modules/audit';
import { getHostCards } from '@/modules/applications';
import { enqueue } from '@/modules/jobs';
import { getHiringInfoMany } from '@/modules/listings';
import {
  getNotSelectedMessage,
  sendHostMessage,
  threadIdsForApplications,
} from '@/modules/messaging';
import { getOrgSummaries, listMembers } from '@/modules/orgs';
import { hostApplicantGate } from '@/modules/verification';
import type { HostContext } from '@/server/guards';
import { requireEntry } from '../access';
import { staleStatus, transitionStatus, type PipelineEntryRow } from '../core';
import { pendingPasses, pipelineEntries } from '../schema';
import { requireApplicantReads } from './gate';

const PASS_FROM: ApplicationStatus[] = ['new', 'shortlisted', 'interviewing', 'offered'];

function firstToken(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? '';
}

function readCommit(payload: unknown): { applicationId: string; commitAt: string } {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('applicationId' in payload) ||
    !('commitAt' in payload)
  ) {
    throw new Error('Expected hiring.commit_pass payload');
  }
  const row = payload as { applicationId: unknown; commitAt: unknown };
  if (typeof row.applicationId !== 'string' || typeof row.commitAt !== 'string') {
    throw new Error('Expected hiring.commit_pass payload');
  }
  return { applicationId: row.applicationId, commitAt: row.commitAt };
}

async function notSelectedBody(
  db: DbOrTx,
  entry: PipelineEntryRow,
  passerUserId: string,
): Promise<{ threadId: string | null; body: string }> {
  const [message, cards, listings, orgs, members, threads] = await Promise.all([
    getNotSelectedMessage(db, entry.orgId),
    getHostCards(db, { orgId: entry.orgId, applicationIds: [entry.applicationId] }),
    getHiringInfoMany(db, [entry.listingId]),
    getOrgSummaries(db, [entry.orgId]),
    listMembers(db, entry.orgId),
    threadIdsForApplications(db, [entry.applicationId]),
  ]);
  const card = cards.find((item) => item.applicationId === entry.applicationId);
  const passer = members.find((member) => member.userId === passerUserId);
  return {
    threadId: threads.get(entry.applicationId) ?? null,
    body: fillTemplate(message.body, {
      first_name: card?.firstName ?? '',
      position: listings[0]?.title ?? '',
      org_name: orgs.get(entry.orgId)?.name ?? '',
      my_first_name: firstToken(passer?.displayName),
    }),
  };
}

export async function pass(
  db: Db,
  ctx: HostContext,
  applicationId: string,
  now: Date = new Date(),
): Promise<{ undoUntil: string }> {
  return withTx(db, async (tx) => {
    await requireApplicantReads(tx, ctx.orgId);
    const entry = await requireEntry(tx, ctx, applicationId, { forUpdate: true });
    if (!PASS_FROM.includes(entry.status as ApplicationStatus)) throw staleStatus(entry.status as ApplicationStatus);
    const [pending] = await tx
      .select()
      .from(pendingPasses)
      .where(eq(pendingPasses.applicationId, applicationId))
      .for('update');
    if (pending) return { undoUntil: pending.commitAt.toISOString() };

    const commitAt = new Date(now.getTime() + PASS_UNDO_MS);
    await tx.insert(pendingPasses).values({
      applicationId,
      orgId: entry.orgId,
      actorUserId: ctx.user.id,
      commitAt,
    });
    await enqueue(tx, {
      topic: 'hiring.commit_pass',
      payload: { applicationId, commitAt: commitAt.toISOString() },
      availableAt: commitAt,
      dedupeKey: `pass:${applicationId}:${commitAt.getTime()}`,
    });
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: entry.orgId,
      action: 'hiring.pass_scheduled',
      subjectType: 'application',
      subjectId: applicationId,
      data: { commitAt: commitAt.toISOString() },
    });
    return { undoUntil: commitAt.toISOString() };
  });
}

export async function undoPass(
  db: Db,
  ctx: HostContext,
  applicationId: string,
  now: Date = new Date(),
): Promise<{ status: ApplicationStatus }> {
  return withTx(db, async (tx) => {
    await requireApplicantReads(tx, ctx.orgId);
    const entry = await requireEntry(tx, ctx, applicationId, { forUpdate: true });
    const [pending] = await tx
      .select()
      .from(pendingPasses)
      .where(eq(pendingPasses.applicationId, applicationId))
      .for('update');
    if (!pending || now.getTime() >= pending.commitAt.getTime()) {
      throw conflict('The undo window has closed.', { reason: 'undo_expired' });
    }
    await tx.delete(pendingPasses).where(eq(pendingPasses.applicationId, applicationId));
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: entry.orgId,
      action: 'hiring.pass_undone',
      subjectType: 'application',
      subjectId: applicationId,
    });
    return { status: entry.status as ApplicationStatus };
  });
}

export async function commitPass(db: Db, payload: unknown, now: Date): Promise<void> {
  const { applicationId, commitAt } = readCommit(payload);
  const commitTime = new Date(commitAt);
  if (now.getTime() < commitTime.getTime()) return;

  await withTx(db, async (tx) => {
    const [pending] = await tx
      .delete(pendingPasses)
      .where(and(eq(pendingPasses.applicationId, applicationId), eq(pendingPasses.commitAt, commitTime)))
      .returning();
    if (!pending) return;

    // The host was refused after it passed: the pending row is gone and nothing else happens.
    const gate = await hostApplicantGate(tx, pending.orgId);
    if (!gate.ok) {
      await record(tx, {
        actorType: 'system',
        orgId: pending.orgId,
        action: 'hiring.pass_dropped',
        subjectType: 'application',
        subjectId: applicationId,
        data: { reason: `verification_${gate.reason}` },
      });
      return;
    }

    const result = await transitionStatus(
      tx,
      {
        applicationId,
        from: PASS_FROM,
        to: 'not_selected',
        actor: { type: 'host', userId: pending.actorUserId, orgId: pending.orgId },
        eventKind: 'not_selected',
      },
      now,
    );
    if (!result.ok) return;

    const [entry] = await tx
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, applicationId));
    if (!entry) return;
    const { threadId, body } = await notSelectedBody(tx, entry, pending.actorUserId);
    if (threadId) {
      await sendHostMessage(tx, { threadId, senderUserId: pending.actorUserId, body });
    }
    await record(tx, {
      actorType: 'user',
      actorId: pending.actorUserId,
      orgId: pending.orgId,
      action: 'hiring.pass_committed',
      subjectType: 'application',
      subjectId: applicationId,
    });
  });
}
