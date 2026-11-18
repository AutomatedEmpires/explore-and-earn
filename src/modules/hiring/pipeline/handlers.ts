// SP4 application events: the pipeline mirror, the thread card, and fit scoring.
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { withTx } from '@/lib/db';
import { readEnvelope } from '@/modules/jobs';
import { getHiringInfoMany } from '@/modules/listings';
import { ensureThread, postCard, postEvent, setThreadReadOnly, threadIdsForApplications } from '@/modules/messaging';
import { mirrorStatus, recordPipelineEvent } from '../core';
import { scoreApplications } from '../fit-store';
import { invites, pendingPasses, pipelineEntries } from '../schema';

export async function onApplicationSubmitted(db: Db, payload: unknown): Promise<void> {
  const { data } = readEnvelope(payload, 'application.submitted');
  const [info] = await getHiringInfoMany(db, [data.listingId]);
  const at = new Date(data.submittedAt);
  const inserted = await withTx(db, async (tx) => {
    const rows = await tx
      .insert(pipelineEntries)
      .values({
        applicationId: data.applicationId,
        orgId: data.orgId,
        listingId: data.listingId,
        locationId: info?.locationId ?? null,
        seekerUserId: data.seekerUserId,
        status: 'new',
        source: data.source,
        appliedAt: at,
        lastStatusAt: at,
      })
      .onConflictDoNothing()
      .returning({ applicationId: pipelineEntries.applicationId });
    if (rows.length === 0) return false;

    const actor = { type: 'seeker' as const, userId: data.seekerUserId };
    await recordPipelineEvent(tx, {
      orgId: data.orgId,
      listingId: data.listingId,
      locationId: info?.locationId ?? null,
      applicationId: data.applicationId,
      kind: 'applied',
      source: data.source,
      actor,
      at,
    });

    const updated = await tx
      .update(invites)
      .set({ status: 'applied' })
      .where(
        and(
          eq(invites.listingId, data.listingId),
          eq(invites.seekerUserId, data.seekerUserId),
          inArray(invites.status, ['sent', 'interested']),
        ),
      )
      .returning({ id: invites.id });
    for (const invite of updated) {
      await recordPipelineEvent(tx, {
        orgId: data.orgId,
        listingId: data.listingId,
        locationId: info?.locationId ?? null,
        applicationId: data.applicationId,
        inviteId: invite.id,
        kind: 'invite_applied',
        actor,
        at,
      });
    }

    const { threadId } = await ensureThread(tx, {
      orgId: data.orgId,
      listingId: data.listingId,
      seekerUserId: data.seekerUserId,
      applicationId: data.applicationId,
    });
    await postCard(tx, threadId, { type: 'application', refId: data.applicationId }, data.seekerUserId);
    return true;
  });
  if (!inserted) return;
  await scoreApplications(db, { listingId: data.listingId, applicationIds: [data.applicationId] });
}

export async function onApplicationWithdrawn(db: Db, payload: unknown): Promise<void> {
  const { data } = readEnvelope(payload, 'application.withdrawn');
  const [entry] = await db
    .select({ applicationId: pipelineEntries.applicationId })
    .from(pipelineEntries)
    .where(eq(pipelineEntries.applicationId, data.applicationId));
  if (!entry) throw new Error('pipeline entry not ready');

  await withTx(db, async (tx) => {
    const changed = await mirrorStatus(tx, {
      applicationId: data.applicationId,
      to: 'withdrawn',
      actor: { type: 'seeker', userId: data.seekerUserId },
      eventKind: 'withdrawn',
      at: new Date(data.withdrawnAt),
    });
    await tx.delete(pendingPasses).where(eq(pendingPasses.applicationId, data.applicationId));
    if (!changed) return;
    const threads = await threadIdsForApplications(tx, [data.applicationId]);
    const threadId = threads.get(data.applicationId);
    if (!threadId) return;
    await postEvent(tx, threadId, { code: 'withdrawn', visibleTo: 'all' });
    await setThreadReadOnly(tx, threadId, 'withdrawn');
  });
}

export async function onAdditionalStepChanged(db: Db, payload: unknown): Promise<void> {
  const { data } = readEnvelope(payload, 'application.additional_step_changed');
  const updated = await db
    .update(pipelineEntries)
    .set({ additionalStepDone: data.completed })
    .where(eq(pipelineEntries.applicationId, data.applicationId))
    .returning({ applicationId: pipelineEntries.applicationId });
  if (updated.length === 0) throw new Error('pipeline entry not ready');
}
