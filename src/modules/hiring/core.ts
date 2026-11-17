// Pipeline transitions: the SP4 status, the hiring mirror, the event and the audit row.
import { eq } from 'drizzle-orm';
import type { Actor, ApplicationStatus } from '@/lib/applications';
import type { Tx } from '@/lib/db';
import { conflict, notFound } from '@/lib/errors';
import { APPLICATION_UNAVAILABLE, type PipelineEventKind } from '@/lib/hiring';
import { newId } from '@/lib/ids';
import { setStatus } from '@/modules/applications';
import { record } from '@/modules/audit';
import { openAsDescribed } from '@/modules/hiring/as-described/open';
import { closeOpenItems } from '@/modules/hiring/interviews/close';
import { markThreadHired, postEvent, threadIdsForApplications } from '@/modules/messaging';
import { pipelineEntries, pipelineEvents } from './schema';

export type PipelineEntryRow = typeof pipelineEntries.$inferSelect;

export type TransitionInput = {
  applicationId: string;
  from: ApplicationStatus[];
  to: ApplicationStatus;
  actor: Actor;
  eventKind: PipelineEventKind;
  hiredSource?: 'host' | 'offer_accepted';
};

export function staleStatus(current: ApplicationStatus) {
  return conflict('This applicant was updated. Refresh to see the latest.', {
    reason: 'stale_status',
    current,
  });
}

async function lockEntry(tx: Tx, applicationId: string): Promise<PipelineEntryRow> {
  const [row] = await tx
    .select()
    .from(pipelineEntries)
    .where(eq(pipelineEntries.applicationId, applicationId))
    .for('update');
  if (!row) throw notFound(APPLICATION_UNAVAILABLE);
  return row;
}

function auditActor(actor: Actor): { actorType: 'user' | 'system'; actorId: string | null } {
  if (actor.type === 'system') return { actorType: 'system', actorId: null };
  return { actorType: 'user', actorId: actor.userId };
}

export async function recordPipelineEvent(
  tx: Tx,
  e: {
    orgId: string;
    listingId: string;
    locationId: string | null;
    applicationId?: string;
    inviteId?: string;
    kind: PipelineEventKind;
    source?: string;
    actor: Actor;
    at?: Date;
  },
): Promise<void> {
  await tx.insert(pipelineEvents).values({
    id: newId(),
    orgId: e.orgId,
    listingId: e.listingId,
    locationId: e.locationId,
    applicationId: e.applicationId ?? null,
    inviteId: e.inviteId ?? null,
    kind: e.kind,
    source: e.source ?? null,
    actorType: e.actor.type,
    actorUserId: e.actor.type === 'system' ? null : e.actor.userId,
    occurredAt: e.at ?? new Date(),
  });
}

async function writeMirror(
  tx: Tx,
  entry: PipelineEntryRow,
  i: { to: ApplicationStatus; actor: Actor; eventKind: PipelineEventKind; at: Date; hiredSource?: 'host' | 'offer_accepted' },
): Promise<void> {
  const from = entry.status as ApplicationStatus;
  await tx
    .update(pipelineEntries)
    .set({
      status: i.to,
      lastStatusAt: i.at,
      ...(i.to === 'hired' ? { hiredSource: i.hiredSource ?? null, hiredAt: i.at } : {}),
    })
    .where(eq(pipelineEntries.applicationId, entry.applicationId));
  await recordPipelineEvent(tx, {
    orgId: entry.orgId,
    listingId: entry.listingId,
    locationId: entry.locationId,
    applicationId: entry.applicationId,
    kind: i.eventKind,
    actor: i.actor,
    at: i.at,
  });
  const actor = auditActor(i.actor);
  await record(tx, {
    actorType: actor.actorType,
    actorId: actor.actorId,
    orgId: entry.orgId,
    action: 'hiring.status_changed',
    subjectType: 'application',
    subjectId: entry.applicationId,
    data: { from, to: i.to },
  });
  if (i.to === 'not_selected' || i.to === 'withdrawn') {
    await closeOpenItems(tx, { applicationId: entry.applicationId, reason: i.to });
  }
  if (i.to === 'hired') {
    await openAsDescribed(tx, { applicationId: entry.applicationId });
    const threads = await threadIdsForApplications(tx, [entry.applicationId]);
    const threadId = threads.get(entry.applicationId);
    if (threadId) {
      await markThreadHired(tx, threadId);
      await postEvent(tx, threadId, { code: 'hired', visibleTo: 'all' });
    }
  }
}

export async function transitionStatus(
  tx: Tx,
  i: TransitionInput,
  now?: Date,
): Promise<{ ok: true; from: ApplicationStatus } | { ok: false; current: ApplicationStatus }> {
  const entry = await lockEntry(tx, i.applicationId);
  const result = await setStatus(tx, {
    applicationId: i.applicationId,
    from: i.from,
    to: i.to,
    actor: i.actor,
  });
  if (!result.ok) {
    await tx
      .update(pipelineEntries)
      .set({ status: result.current })
      .where(eq(pipelineEntries.applicationId, entry.applicationId));
    return result;
  }
  const from = entry.status as ApplicationStatus;
  await writeMirror(tx, entry, {
    to: i.to,
    actor: i.actor,
    eventKind: i.eventKind,
    at: now ?? new Date(),
    hiredSource: i.hiredSource,
  });
  return { ok: true, from };
}

export async function mirrorStatus(
  tx: Tx,
  i: { applicationId: string; to: ApplicationStatus; actor: Actor; eventKind: PipelineEventKind; at: Date },
): Promise<boolean> {
  const entry = await lockEntry(tx, i.applicationId);
  if (entry.status === i.to) return false;
  await writeMirror(tx, entry, i);
  return true;
}
