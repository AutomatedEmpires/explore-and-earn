// Seeker answers: pick a slot, ask for new times, or decline.
import { and, eq } from 'drizzle-orm';
import { TERMINAL_STATUSES } from '@/lib/applications';
import { withdraw } from '@/modules/applications';
import { record } from '@/modules/audit';
import type { Db, DbOrTx } from '@/lib/db';
import { withTx } from '@/lib/db';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { INTERVIEWS, type RequestTimes, type SeekerInterviewItem } from '@/lib/hiring';
import { track } from '@/lib/analytics';
import { enqueue } from '@/modules/jobs';
import { postEvent } from '@/modules/messaging';
import { recordPipelineEvent } from '../core';
import { interviewSlots, interviews, pipelineEntries } from '../schema';
import { notifyInterview, scheduleFields } from './deliver';
import { seekerInterviewViews } from './reads';
import { setInterviewState } from './state';

type InterviewRow = typeof interviews.$inferSelect;
type EntryRow = typeof pipelineEntries.$inferSelect;

const ACTIVE = ['invited', 'scheduled', 'reschedule_requested'] as const;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

async function loadVisible(
  db: DbOrTx,
  seekerUserId: string,
  interviewId: string,
): Promise<{ interview: InterviewRow; entry: EntryRow }> {
  const [row] = await db
    .select({ interview: interviews, entry: pipelineEntries })
    .from(interviews)
    .innerJoin(pipelineEntries, eq(interviews.applicationId, pipelineEntries.applicationId))
    .where(eq(interviews.id, interviewId));
  if (!row || row.entry.seekerUserId !== seekerUserId) {
    throw notFound('Interview not found', { reason: 'not_found' });
  }
  if (row.interview.scanState !== 'clear' && row.interview.scanState !== 'warn') {
    throw notFound('Interview not found', { reason: 'not_found' });
  }
  return row;
}

async function seekerView(db: Db, seekerUserId: string, interviewId: string, now: Date): Promise<SeekerInterviewItem> {
  const views = await seekerInterviewViews(db, seekerUserId, [interviewId], now);
  const view = views.get(interviewId);
  if (!view) throw notFound('Interview not found', { reason: 'not_found' });
  return view;
}

export async function pickSlot(
  db: Db,
  seekerUserId: string,
  interviewId: string,
  input: { slotId: string; round: number },
  now = new Date(),
): Promise<SeekerInterviewItem> {
  await withTx(db, async (tx) => {
    const visible = await loadVisible(tx, seekerUserId, interviewId);
    // The entry is locked before the interview, as a pipeline transition locks them.
    const [entry] = await tx
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, visible.entry.applicationId))
      .for('update');
    if (!entry) throw notFound('Interview not found', { reason: 'not_found' });
    if ((TERMINAL_STATUSES as readonly string[]).includes(entry.status)) {
      throw conflict('This application is closed.', { reason: 'application_closed' });
    }
    const [locked] = await tx.select().from(interviews).where(eq(interviews.id, interviewId)).for('update');
    if (!locked || locked.status !== 'invited' || locked.round !== input.round) {
      throw conflict('These times changed. Refresh to see the latest.', { reason: 'round_changed' });
    }
    if (locked.expiresAt && locked.expiresAt.getTime() <= now.getTime()) {
      throw conflict('This interview invite has expired.', { reason: 'expired' });
    }
    const [slot] = await tx.select().from(interviewSlots).where(eq(interviewSlots.id, input.slotId));
    if (
      !slot ||
      slot.interviewId !== interviewId ||
      slot.round !== locked.round ||
      slot.startsAt.getTime() <= now.getTime()
    ) {
      throw conflict('That time has passed.', { reason: 'slot_passed' });
    }
    const sequence = locked.sequence + 1;
    const scheduledEnd = new Date(slot.startsAt.getTime() + locked.durationMinutes * 60_000);
    const [updated] = await tx
      .update(interviews)
      .set({
        status: 'scheduled',
        sequence,
        scheduledSlotId: slot.id,
        scheduledStart: slot.startsAt,
        scheduledEnd,
        expiresAt: null,
      })
      .where(and(eq(interviews.id, interviewId), eq(interviews.status, 'invited'), eq(interviews.round, input.round)))
      .returning();
    if (!updated) throw conflict('These times changed. Refresh to see the latest.', { reason: 'round_changed' });
    await setInterviewState(tx, entry.applicationId, 'scheduled');
    await recordPipelineEvent(tx, {
      orgId: entry.orgId,
      listingId: entry.listingId,
      locationId: entry.locationId,
      applicationId: entry.applicationId,
      kind: 'interview_scheduled',
      actor: { type: 'seeker', userId: seekerUserId },
      at: now,
    });
    await postEvent(tx, locked.threadId, { code: 'interview_scheduled', visibleTo: 'all' });
    await notifyInterview(
      tx,
      updated,
      entry.seekerUserId,
      [
        { userId: entry.seekerUserId, audience: 'seeker' },
        { userId: updated.organizerUserId, audience: 'host' },
      ],
      'hiring.interview_scheduled',
      { icsMethod: 'REQUEST', ...scheduleFields(updated) },
    );
    const lead = slot.startsAt.getTime() - now.getTime();
    if (lead >= DAY_MS) {
      await enqueue(tx, {
        topic: 'hiring.interview_reminder',
        dedupeKey: `ivr:${interviewId}:${sequence}:24h`,
        availableAt: new Date(slot.startsAt.getTime() - DAY_MS),
        payload: { interviewId, sequence, which: '24h' },
      });
    }
    if (lead >= HOUR_MS) {
      await enqueue(tx, {
        topic: 'hiring.interview_reminder',
        dedupeKey: `ivr:${interviewId}:${sequence}:1h`,
        availableAt: new Date(slot.startsAt.getTime() - HOUR_MS),
        payload: { interviewId, sequence, which: '1h' },
      });
    }
    await record(tx, {
      actorType: 'user',
      actorId: seekerUserId,
      orgId: entry.orgId,
      action: 'hiring.interview_scheduled',
      subjectType: 'interview',
      subjectId: interviewId,
    });
  });
  track('hiring.interview_scheduled', { interviewId });
  return seekerView(db, seekerUserId, interviewId, now);
}

function assertWindows(windows: { start: string; end: string }[], now: Date): void {
  if (windows.length > INTERVIEWS.maxWindows) {
    throw badRequest('Ask for at most 3 windows.', { reason: 'too_many_windows' });
  }
  const min = INTERVIEWS.minWindowMinutes * 60_000;
  const max = INTERVIEWS.windowsMaxAheadDays * DAY_MS;
  for (const window of windows) {
    const start = new Date(window.start).getTime();
    const end = new Date(window.end).getTime();
    if (end <= now.getTime()) throw badRequest('Choose a time that has not passed.', { reason: 'window_passed' });
    if (end - start < min) throw badRequest('Each window is at least 30 minutes.', { reason: 'window_too_short' });
    if (start > now.getTime() + max) throw badRequest('Ask for a time within 60 days.', { reason: 'window_too_far' });
  }
}

export async function requestNewTimes(
  db: Db,
  seekerUserId: string,
  interviewId: string,
  input: RequestTimes,
  now = new Date(),
): Promise<SeekerInterviewItem> {
  assertWindows(input.windows, now);
  await withTx(db, async (tx) => {
    await loadVisible(tx, seekerUserId, interviewId);
    const [locked] = await tx.select().from(interviews).where(eq(interviews.id, interviewId)).for('update');
    if (!locked || (locked.status !== 'invited' && locked.status !== 'scheduled')) {
      throw conflict('This interview is no longer open.', { reason: 'interview_closed' });
    }
    // The same answer `pickSlot` gives: an invite past its expiry is not reopened.
    if (locked.status === 'invited' && locked.expiresAt && locked.expiresAt.getTime() <= now.getTime()) {
      throw conflict('This interview invite has expired.', { reason: 'expired' });
    }
    const wasScheduled = locked.status === 'scheduled';
    const previous = scheduleFields(locked);
    const [updated] = await tx
      .update(interviews)
      .set({
        status: 'reschedule_requested',
        sequence: locked.sequence + 1,
        expiresAt: null,
        requestedWindows: input.windows,
        requestNote: input.note ?? null,
      })
      .where(eq(interviews.id, interviewId))
      .returning();
    if (!updated) throw notFound('Interview not found', { reason: 'not_found' });
    const [entry] = await tx
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, locked.applicationId));
    if (!entry) throw notFound('Interview not found', { reason: 'not_found' });
    await setInterviewState(tx, entry.applicationId, 'reschedule_requested');
    await notifyInterview(
      tx,
      updated,
      entry.seekerUserId,
      [{ userId: updated.organizerUserId, audience: 'host' }],
      'hiring.interview_times_requested',
      wasScheduled ? { icsMethod: 'CANCEL', ...previous } : {},
    );
  });
  return seekerView(db, seekerUserId, interviewId, now);
}

export async function declineInterview(
  db: Db,
  seekerUserId: string,
  interviewId: string,
  input: { alsoWithdraw: boolean },
  now = new Date(),
): Promise<{ interview: SeekerInterviewItem; withdrawn: boolean }> {
  await withTx(db, async (tx) => {
    const visible = await loadVisible(tx, seekerUserId, interviewId);
    const [locked] = await tx.select().from(interviews).where(eq(interviews.id, interviewId)).for('update');
    if (!locked || !(ACTIVE as readonly string[]).includes(locked.status)) {
      throw conflict('This interview is no longer open.', { reason: 'interview_closed' });
    }
    const wasScheduled = locked.status === 'scheduled';
    const previous = scheduleFields(locked);
    const [updated] = await tx
      .update(interviews)
      .set({ status: 'declined', sequence: locked.sequence + 1 })
      .where(eq(interviews.id, interviewId))
      .returning();
    if (!updated) throw notFound('Interview not found', { reason: 'not_found' });
    await setInterviewState(tx, visible.entry.applicationId, 'declined');
    await notifyInterview(
      tx,
      updated,
      visible.entry.seekerUserId,
      [{ userId: updated.organizerUserId, audience: 'host' }],
      'hiring.interview_declined',
      wasScheduled ? { icsMethod: 'CANCEL', ...previous } : {},
    );
    if (input.alsoWithdraw) {
      await withdraw(tx, { applicationId: visible.entry.applicationId, seekerUserId });
    }
  });
  return {
    interview: await seekerView(db, seekerUserId, interviewId, now),
    withdrawn: input.alsoWithdraw,
  };
}
