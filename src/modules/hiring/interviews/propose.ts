// Host interview proposals, new rounds, cancellation and outcomes.
//
// Each one acts on an applicant, so each is refused unless the host is verified (legal review
// 7.1, issue 198), with the applicant list's 409, inside its transaction and before anything is
// read or written. That includes interviews the host set up while it was verified.
import { and, eq, inArray } from 'drizzle-orm';
import type { ApplicationStatus } from '@/lib/applications';
import { DEFAULT_TZ, resolveTimeZone } from '@/lib/discovery';
import type { Db, DbOrTx } from '@/lib/db';
import { withTx } from '@/lib/db';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { INTERVIEWS, type HostInterviewView, type InterviewProposal, type NewRound } from '@/lib/hiring';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { ensureThread, postEvent } from '@/modules/messaging';
import type { HostContext } from '@/server/guards';
import { requireEntry, requireListing } from '../access';
import { recordPipelineEvent, staleStatus, transitionStatus } from '../core';
import { enqueueNoteScan } from '../notes';
import { requireApplicantReads } from '../pipeline/gate';
import { interviewSlots, interviews, pipelineEntries } from '../schema';
import { blockedConflict, stampIfBlocked } from './blocks';
import { notifyInterview, publishInterviewInvite, scheduleFields } from './deliver';
import { interviewScanText } from './notes';
import { hostInterviewViews } from './reads';
import { setInterviewState } from './state';

type InterviewRow = typeof interviews.$inferSelect;

const ACTIVE = ['invited', 'scheduled', 'reschedule_requested'] as const;
const NEW_ROUND = ['invited', 'scheduled', 'reschedule_requested', 'expired'] as const;
const MIN_LEAD_MS = INTERVIEWS.minLeadMinutes * 60_000;
const MAX_AHEAD_MS = INTERVIEWS.maxAheadDays * 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const VIDEO_URL_MAX = 1000;
const OPEN: readonly string[] = ['new', 'shortlisted', 'interviewing'];

function actor(ctx: HostContext) {
  return { type: 'host' as const, userId: ctx.user.id, orgId: ctx.orgId };
}

function assertSlots(starts: Date[], durationMinutes: number, now: Date): void {
  const duration = durationMinutes * 60_000;
  const intervals = starts.map((start) => ({ start: start.getTime(), end: start.getTime() + duration }));
  for (const slot of intervals) {
    if (slot.start < now.getTime() + MIN_LEAD_MS) {
      throw badRequest('Choose a time at least an hour from now.', { reason: 'slot_too_soon' });
    }
    if (slot.start > now.getTime() + MAX_AHEAD_MS) {
      throw badRequest('Choose a time within the next 90 days.', { reason: 'slot_too_far' });
    }
  }
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev && cur && cur.start < prev.end) {
      throw badRequest('Those times overlap.', { reason: 'slots_overlap' });
    }
  }
}

function expiresAt(starts: Date[], expiryHours: number, now: Date): Date {
  const latest = Math.max(...starts.map((start) => start.getTime()));
  return new Date(Math.min(now.getTime() + expiryHours * HOUR_MS, latest));
}

/** The zone the host sent, in its canonical spelling. An unknown zone is refused. */
function chosenZone(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const zone = resolveTimeZone(input);
  // `resolveTimeZone` answers the default for a zone it does not know, so that answer is
  // valid only when the default, or an alias of it, was sent.
  if (zone === DEFAULT_TZ && !isDefaultZone(input)) {
    throw badRequest('Choose a valid time zone.', { reason: 'invalid_timezone' });
  }
  return zone;
}

function isDefaultZone(tz: string): boolean {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone === DEFAULT_TZ;
  } catch {
    return false;
  }
}

async function viewOf(db: Db, id: string, now: Date): Promise<HostInterviewView> {
  const views = await hostInterviewViews(db, [id], now);
  const view = views.get(id);
  if (!view) throw notFound('Interview not found', { reason: 'not_found' });
  return view;
}

/** The org's interview for a new round, a cancel or an outcome, once the host may act on it. */
async function loadHostInterview(db: DbOrTx, ctx: HostContext, id: string): Promise<InterviewRow> {
  await requireApplicantReads(db, ctx.orgId);
  const [row] = await db.select().from(interviews).where(eq(interviews.id, id));
  if (!row || row.orgId !== ctx.orgId) throw notFound('Interview not found', { reason: 'not_found' });
  await requireListing(db, ctx, row.listingId);
  return row;
}

export async function proposeInterview(
  db: Db,
  ctx: HostContext,
  applicationId: string,
  input: InterviewProposal,
  now = new Date(),
): Promise<HostInterviewView> {
  const starts = input.slots.map((slot) => new Date(slot.start));
  assertSlots(starts, input.durationMinutes, now);
  const zone = chosenZone(input.timezone);
  const videoUrl = input.format === 'video' ? (input.videoUrl ?? null) : null;
  if (videoUrl && videoUrl.length > VIDEO_URL_MAX) {
    throw badRequest('Use a shorter video link.', { reason: 'video_url_too_long' });
  }
  const id = await withTx(db, async (tx) => {
    await requireApplicantReads(tx, ctx.orgId);
    const entry = await requireEntry(tx, ctx, applicationId, { forUpdate: true });
    if (!OPEN.includes(entry.status)) throw staleStatus(entry.status as ApplicationStatus);
    if (await stampIfBlocked(tx, { orgId: entry.orgId, seekerUserId: entry.seekerUserId, applicationId })) {
      return null;
    }
    const [active] = await tx
      .select({ id: interviews.id })
      .from(interviews)
      .where(and(eq(interviews.applicationId, applicationId), inArray(interviews.status, [...ACTIVE])));
    if (active) throw conflict('An interview is already open for this application.', { reason: 'interview_active' });
    const listing = await requireListing(tx, ctx, entry.listingId);
    const { threadId } = await ensureThread(tx, {
      orgId: entry.orgId,
      listingId: entry.listingId,
      seekerUserId: entry.seekerUserId,
      applicationId,
    });
    const interviewId = newId();
    const note = input.note?.trim() ? input.note.trim() : null;
    const address = input.format === 'in_person' ? (input.address ?? null) : null;
    const phoneNote = input.format === 'phone' ? (input.phoneNote ?? null) : null;
    // Every host text the seeker will read is scanned before the invite is delivered.
    const scanned = interviewScanText({ note, phoneNote, address, videoUrl }) !== null;
    const row: InterviewRow = {
      id: interviewId,
      orgId: entry.orgId,
      listingId: entry.listingId,
      applicationId,
      threadId,
      organizerUserId: ctx.user.id,
      status: 'invited',
      format: input.format,
      videoUrl,
      address,
      phoneNote,
      note,
      timezone: zone ?? resolveTimeZone(listing.timezone),
      durationMinutes: input.durationMinutes,
      expiryHours: input.expiryHours,
      round: 1,
      sequence: 0,
      expiresAt: expiresAt(starts, input.expiryHours, now),
      scheduledSlotId: null,
      scheduledStart: null,
      scheduledEnd: null,
      requestedWindows: null,
      requestNote: null,
      outcomeBy: null,
      outcomeAt: null,
      outcomeNudgedAt: null,
      scanState: scanned ? 'pending' : 'clear',
      checkId: null,
      createdAt: now,
      updatedAt: now,
    };
    await tx.insert(interviews).values(row);
    await tx.insert(interviewSlots).values(
      starts.map((start) => ({
        id: newId(),
        interviewId,
        round: 1,
        startsAt: start,
        endsAt: new Date(start.getTime() + input.durationMinutes * 60_000),
      })),
    );
    if (entry.status === 'new' || entry.status === 'shortlisted') {
      const moved = await transitionStatus(tx, {
        applicationId,
        from: ['new', 'shortlisted'],
        to: 'interviewing',
        actor: actor(ctx),
        eventKind: 'interview_invited',
      }, now);
      if (!moved.ok) throw staleStatus(moved.current);
    }
    await setInterviewState(tx, applicationId, 'invited');
    if (scanned) await enqueueNoteScan(tx, 'interview', interviewId);
    else await publishInterviewInvite(tx, row);
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: entry.orgId,
      action: 'hiring.interview_proposed',
      subjectType: 'interview',
      subjectId: interviewId,
    });
    return interviewId;
  });
  if (id === null) throw blockedConflict();
  return viewOf(db, id, now);
}

export async function proposeNewRound(
  db: Db,
  ctx: HostContext,
  interviewId: string,
  input: NewRound,
  now = new Date(),
): Promise<HostInterviewView> {
  const starts = input.slots.map((slot) => new Date(slot.start));
  assertSlots(starts, input.durationMinutes, now);
  const zone = chosenZone(input.timezone);
  const blocked = await withTx(db, async (tx) => {
    const current = await loadHostInterview(tx, ctx, interviewId);
    if (!(NEW_ROUND as readonly string[]).includes(current.status)) {
      throw conflict('This interview can no longer take a new round.', { reason: 'interview_closed' });
    }
    // An expired interview outlives Pass, withdrawal and hire, so the application decides.
    // The entry is locked before the interview, as a pipeline transition locks them.
    const entry = await requireEntry(tx, ctx, current.applicationId, { forUpdate: true });
    if (!OPEN.includes(entry.status)) throw staleStatus(entry.status as ApplicationStatus);
    if (
      await stampIfBlocked(tx, {
        orgId: entry.orgId,
        seekerUserId: entry.seekerUserId,
        applicationId: entry.applicationId,
      })
    ) {
      return true;
    }
    const [locked] = await tx.select().from(interviews).where(eq(interviews.id, interviewId)).for('update');
    if (!locked || !(NEW_ROUND as readonly string[]).includes(locked.status)) {
      throw conflict('This interview can no longer take a new round.', { reason: 'interview_closed' });
    }
    const wasScheduled = locked.status === 'scheduled';
    const previous = scheduleFields(locked);
    const nextRound = locked.round + 1;
    const nextSequence = locked.sequence + 1;
    const [updated] = await tx
      .update(interviews)
      .set({
        status: 'invited',
        round: nextRound,
        sequence: nextSequence,
        durationMinutes: input.durationMinutes,
        expiryHours: input.expiryHours,
        timezone: zone ?? locked.timezone,
        expiresAt: expiresAt(starts, input.expiryHours, now),
        // `scheduledSlotId` stays: it is how the calendar file still cancels the old time.
        scheduledStart: null,
        scheduledEnd: null,
        requestedWindows: null,
        requestNote: null,
      })
      .where(eq(interviews.id, interviewId))
      .returning();
    if (!updated) throw notFound('Interview not found', { reason: 'not_found' });
    await tx.insert(interviewSlots).values(
      starts.map((start) => ({
        id: newId(),
        interviewId,
        round: nextRound,
        startsAt: start,
        endsAt: new Date(start.getTime() + input.durationMinutes * 60_000),
      })),
    );
    await setInterviewState(tx, locked.applicationId, 'invited');
    if (locked.scanState === 'clear' || locked.scanState === 'warn') {
      await notifyInterview(
        tx,
        updated,
        entry.seekerUserId,
        [{ userId: entry.seekerUserId, audience: 'seeker' }],
        'hiring.interview_invited',
        wasScheduled ? { icsMethod: 'CANCEL', ...previous } : {},
      );
    }
    return false;
  });
  if (blocked) throw blockedConflict();
  return viewOf(db, interviewId, now);
}

export async function cancelInterview(
  db: Db,
  ctx: HostContext,
  interviewId: string,
  _input?: { reason?: string },
  now = new Date(),
): Promise<HostInterviewView> {
  await withTx(db, async (tx) => {
    await loadHostInterview(tx, ctx, interviewId);
    const [locked] = await tx.select().from(interviews).where(eq(interviews.id, interviewId)).for('update');
    if (!locked || !(ACTIVE as readonly string[]).includes(locked.status)) {
      throw conflict('This interview is no longer open.', { reason: 'interview_closed' });
    }
    const wasScheduled = locked.status === 'scheduled';
    const [updated] = await tx
      .update(interviews)
      .set({ status: 'canceled', sequence: locked.sequence + 1 })
      .where(and(eq(interviews.id, interviewId), inArray(interviews.status, [...ACTIVE])))
      .returning();
    if (!updated) throw conflict('This interview is no longer open.', { reason: 'interview_closed' });
    await setInterviewState(tx, locked.applicationId, 'canceled');
    // The seeker never saw a pending or held invite, so its cancel is for the host only.
    const delivered = locked.scanState === 'clear' || locked.scanState === 'warn';
    await postEvent(tx, locked.threadId, { code: 'interview_canceled', visibleTo: delivered ? 'all' : 'host' });
    const [entry] = await tx
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, locked.applicationId));
    if (entry && delivered) {
      await notifyInterview(
        tx,
        updated,
        entry.seekerUserId,
        [{ userId: entry.seekerUserId, audience: 'seeker' }],
        'hiring.interview_canceled',
        wasScheduled ? { icsMethod: 'CANCEL', ...scheduleFields(locked) } : { icsMethod: 'CANCEL' },
      );
    }
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: locked.orgId,
      action: 'hiring.interview_canceled',
      subjectType: 'interview',
      subjectId: interviewId,
    });
  });
  return viewOf(db, interviewId, now);
}

export async function recordInterviewOutcome(
  db: Db,
  ctx: HostContext,
  interviewId: string,
  outcome: 'completed' | 'no_show',
  now = new Date(),
): Promise<HostInterviewView> {
  await withTx(db, async (tx) => {
    await loadHostInterview(tx, ctx, interviewId);
    const [locked] = await tx.select().from(interviews).where(eq(interviews.id, interviewId)).for('update');
    if (!locked || locked.status !== 'scheduled' || !locked.scheduledEnd || locked.scheduledEnd.getTime() > now.getTime()) {
      throw conflict('The interview has not ended yet.', { reason: 'not_yet_passed' });
    }
    const [entry] = await tx
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, locked.applicationId));
    if (!entry) throw notFound('Interview not found', { reason: 'not_found' });
    await tx
      .update(interviews)
      .set({ status: outcome, outcomeBy: ctx.user.id, outcomeAt: now })
      .where(and(eq(interviews.id, interviewId), eq(interviews.status, 'scheduled')));
    await setInterviewState(tx, locked.applicationId, outcome);
    await recordPipelineEvent(tx, {
      orgId: entry.orgId,
      listingId: entry.listingId,
      locationId: entry.locationId,
      applicationId: entry.applicationId,
      kind: outcome === 'completed' ? 'interview_completed' : 'interview_no_show',
      actor: actor(ctx),
      at: now,
    });
    await postEvent(tx, locked.threadId, {
      code: outcome === 'completed' ? 'interview_completed' : 'interview_no_show',
      visibleTo: outcome === 'completed' ? 'all' : 'host',
    });
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: locked.orgId,
      action: 'hiring.interview_outcome',
      subjectType: 'interview',
      subjectId: interviewId,
      data: { outcome },
    });
  });
  return viewOf(db, interviewId, now);
}
