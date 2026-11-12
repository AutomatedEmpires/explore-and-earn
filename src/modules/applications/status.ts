// Status changes, withdraw and the Additional step tick (SP4 spec 8.5; plan Task 21).
//
// Every write locks the application row first, so two moves never interleave, and writes its
// event row, domain event and audit row in the caller's transaction. Each is safe to retry:
// setStatus is a compare-and-set, a second withdraw finds the application already withdrawn and
// changes nothing, and the tick is a set-to-value, not a toggle.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { withTx, type Db, type DbOrTx, type Tx } from '@/lib/db';
import {
  canTransition,
  NOTE_MAX,
  type Actor,
  type ApplicationStatus,
  type ReceiptDto,
  type SetStatusInput,
  type WithdrawReason,
} from '@/lib/applications';
import { AppError, conflict, forbidden, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { emit } from '@/modules/jobs';
import { getRevision } from '@/modules/listings';
import { notify } from '@/modules/notifications';
import { buildReceipt, isTerminal, WITHDRAWABLE } from './receipt';
import { applicationEvents, applications, type ApplicationRow } from './schema';
import { resolveListingTeam } from './submit';

/** A new transaction on a Db, or a savepoint inside the caller's transaction. */
function transact<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as Db).transaction(fn);
}

async function lockApplication(tx: Tx, applicationId: string): Promise<ApplicationRow | undefined> {
  const [row] = await tx
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .for('update');
  return row;
}

const actorUserId = (actor: Actor): string | null =>
  actor.type === 'system' ? null : actor.userId;

const auditActor = (actor: Actor) =>
  actor.type === 'system'
    ? ({ actorType: 'system', actorId: null } as const)
    : ({ actorType: 'user', actorId: actor.userId } as const);

/**
 * Compare-and-set. A host actor must belong to the application's org and a seeker actor must
 * own it, and the move must be in the transition table for that actor: otherwise `forbidden`.
 * When the current status is not one of `from`, nothing changes and the current status comes
 * back, so the caller (SP5) can tell the host the application moved.
 */
export function setStatus(
  tx: DbOrTx,
  i: SetStatusInput,
): Promise<{ ok: true } | { ok: false; current: ApplicationStatus }> {
  return transact(tx, async (t) => {
    const row = await lockApplication(t, i.applicationId);
    if (!row) throw notFound('Application not found');
    if (i.actor.type === 'host' && i.actor.orgId !== row.orgId) throw forbidden();
    if (i.actor.type === 'seeker' && i.actor.userId !== row.seekerUserId) throw forbidden();
    if (!i.from.includes(row.status)) return { ok: false, current: row.status };
    if (!canTransition(row.status, i.to, i.actor.type)) {
      throw forbidden('That change is not allowed.', { reason: 'transition_not_allowed' });
    }

    const at = new Date();
    await t
      .update(applications)
      .set({ status: i.to, statusChangedAt: at })
      .where(eq(applications.id, row.id));
    const eventId = newId();
    await t.insert(applicationEvents).values({
      id: eventId,
      applicationId: row.id,
      type: 'status_changed',
      fromStatus: row.status,
      toStatus: i.to,
      actorType: i.actor.type,
      actorUserId: actorUserId(i.actor),
    });
    await emit(
      t,
      'application.status_changed',
      {
        applicationId: row.id,
        orgId: row.orgId,
        from: row.status,
        to: i.to,
        actorType: i.actor.type,
        at: at.toISOString(),
      },
      eventId,
    );
    await record(t, {
      ...auditActor(i.actor),
      orgId: row.orgId,
      action: 'applications.status_changed',
      subjectType: 'application',
      subjectId: row.id,
      data: { from: row.status, to: i.to, actorType: i.actor.type },
    });
    return { ok: true };
  });
}

/** The listing's notify members at the revision the seeker applied to; none if it is gone. */
async function notifyMemberIdsOf(tx: Tx, revisionId: string): Promise<string[]> {
  try {
    return (await getRevision(tx, revisionId)).content.applying.notifyMemberIds;
  } catch (err) {
    if (err instanceof AppError && err.code === 'not_found') return [];
    throw err;
  }
}

/**
 * Withdraws a locked application. `firstName` goes into the hosts' notification; a system
 * withdrawal (privacy erasure) passes null, so the name is not copied anywhere new.
 */
async function withdrawLocked(
  tx: Tx,
  row: ApplicationRow,
  i: { actor: Actor; reason?: WithdrawReason; note?: string; firstName: string | null },
): Promise<void> {
  const at = new Date();
  const reason = i.reason ?? null;
  await tx
    .update(applications)
    .set({ status: 'withdrawn', withdrawnReason: reason, statusChangedAt: at })
    .where(eq(applications.id, row.id));
  const eventId = newId();
  await tx.insert(applicationEvents).values({
    id: eventId,
    applicationId: row.id,
    type: 'withdrawn',
    fromStatus: row.status,
    toStatus: 'withdrawn',
    actorType: i.actor.type,
    actorUserId: actorUserId(i.actor),
    note: i.note?.trim().slice(0, NOTE_MAX) || null,
  });
  await emit(
    tx,
    'application.withdrawn',
    {
      applicationId: row.id,
      listingId: row.listingId,
      orgId: row.orgId,
      seekerUserId: row.seekerUserId,
      withdrawnAt: at.toISOString(),
      reason,
    },
    eventId,
  );

  const team = await resolveListingTeam(tx, {
    orgId: row.orgId,
    listingId: row.listingId,
    notifyMemberIds: await notifyMemberIdsOf(tx, row.listingRevisionId),
  });
  for (const member of team) {
    await notify(tx, member.userId, 'applications.withdrawn', {
      applicationId: row.id,
      listingId: row.listingId,
      listingTitle: row.snapshot.listing.title,
      ...(i.firstName ? { firstName: i.firstName } : {}),
      url: `/host/applicants?application=${row.id}`,
    });
  }
  // Codes only: the note is the seeker's own words and stays out of the audit log.
  await record(tx, {
    ...auditActor(i.actor),
    orgId: row.orgId,
    action: 'applications.withdrawn',
    subjectType: 'application',
    subjectId: row.id,
    data: { from: row.status, reason },
  });
}

/**
 * Emits `application.withdrawn`. Works from `new`, `shortlisted`, `interviewing` and
 * `offered`; any other status is 409 `not_withdrawable`, except `withdrawn` itself, which is
 * left as it is (a retry). Someone else's application is `not_found`.
 */
export function withdraw(
  tx: DbOrTx,
  i: { applicationId: string; seekerUserId: string; reason?: WithdrawReason; note?: string },
): Promise<void> {
  return transact(tx, async (t) => {
    const row = await lockApplication(t, i.applicationId);
    if (!row || row.seekerUserId !== i.seekerUserId) throw notFound('Application not found');
    if (row.status === 'withdrawn') return;
    if (!WITHDRAWABLE.includes(row.status)) {
      throw conflict("This application can't be withdrawn.", { reason: 'not_withdrawable' });
    }
    await withdrawLocked(t, row, {
      actor: { type: 'seeker', userId: i.seekerUserId },
      reason: i.reason,
      note: i.note,
      firstName: row.snapshot.profile.firstName,
    });
  });
}

async function withdrawOpen(
  tx: Tx,
  where: { seekerUserId: string; orgId?: string },
  actor: Actor,
): Promise<number> {
  const rows = await tx
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.seekerUserId, where.seekerUserId),
        where.orgId ? eq(applications.orgId, where.orgId) : sql`true`,
        inArray(applications.status, [...WITHDRAWABLE]),
      ),
    )
    .orderBy(applications.id)
    .for('update');
  for (const row of rows) {
    await withdrawLocked(tx, row, {
      actor,
      firstName: actor.type === 'seeker' ? row.snapshot.profile.firstName : null,
    });
  }
  return rows.length;
}

/** Withdraws the seeker's open applications to the org (a block with the option ticked). */
export function withdrawOpenForOrg(
  tx: DbOrTx,
  i: { seekerUserId: string; orgId: string },
): Promise<number> {
  return transact(tx, (t) => withdrawOpen(t, i, { type: 'seeker', userId: i.seekerUserId }));
}

/** Privacy erasure: withdraws every open application of the seeker as the system. */
export function withdrawAllAsSystem(tx: Tx, seekerUserId: string): Promise<number> {
  return withdrawOpen(tx, { seekerUserId }, { type: 'system' });
}

/**
 * Sets or clears the seeker's "I completed the employer's form" tick until the application
 * reaches a terminal status (409 `terminal`). Setting it to the value it already has changes
 * nothing. A listing without an Additional step has nothing to tick (409 `no_additional_step`).
 */
export function setAdditionalStep(
  db: Db,
  i: { applicationId: string; seekerUserId: string; completed: boolean },
): Promise<ReceiptDto> {
  return withTx(db, async (tx) => {
    const row = await lockApplication(tx, i.applicationId);
    if (!row || row.seekerUserId !== i.seekerUserId) throw notFound('Application not found');
    if (isTerminal(row.status)) {
      throw conflict('This application is closed.', { reason: 'terminal' });
    }
    if (row.snapshot.listing.additionalStep === null) {
      throw conflict('This listing has no extra step.', { reason: 'no_additional_step' });
    }
    if ((row.additionalStepCompletedAt !== null) === i.completed) return buildReceipt(tx, row);

    const at = new Date();
    const [updated] = await tx
      .update(applications)
      .set({ additionalStepCompletedAt: i.completed ? at : null })
      .where(eq(applications.id, row.id))
      .returning();
    const eventId = newId();
    await tx.insert(applicationEvents).values({
      id: eventId,
      applicationId: row.id,
      type: 'additional_step_changed',
      fromStatus: row.status,
      toStatus: row.status,
      actorType: 'seeker',
      actorUserId: i.seekerUserId,
    });
    await emit(
      tx,
      'application.additional_step_changed',
      { applicationId: row.id, orgId: row.orgId, completed: i.completed, at: at.toISOString() },
      eventId,
    );
    await record(tx, {
      actorType: 'user',
      actorId: i.seekerUserId,
      orgId: row.orgId,
      action: 'applications.additional_step_set',
      subjectType: 'application',
      subjectId: row.id,
      data: { completed: i.completed },
    });
    return buildReceipt(tx, updated ?? row);
  });
}
