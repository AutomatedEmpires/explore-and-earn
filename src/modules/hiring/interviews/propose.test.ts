import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interviews, notifications, pipelineEntries } from '@/db/schema';
import { newId } from '@/lib/ids';
import type { HostContext } from '@/server/guards';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { asHost, call, mockDbModule, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';
import { POST } from '@/app/api/v1/host/applicants/[applicationId]/interviews/route';
import { withTx, type Db } from '@/lib/db';
import { releaseInterviewNote } from './notes';
import { proposeInterview, proposeNewRound } from './propose';
import { declineInterview, pickSlot, requestNewTimes } from './respond';
import { listSeekerInterviews } from './reads';

vi.mock('@/lib/db', async (orig) => mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...applicationsFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...messagingFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...orgsFake,
}));

const t = setupRouteDb();
const NOW = new Date('2026-11-03T17:00:00Z');
const HOUR = 60 * 60_000;

function slotId(view: { slots: { id: string }[] }): string {
  const chosen = view.slots[0];
  if (!chosen) throw new Error('expected a slot');
  return chosen.id;
}

function slot(ms: number): { start: string } {
  return { start: new Date(NOW.getTime() + ms).toISOString() };
}

async function scene(status: 'new' | 'shortlisted' | 'interviewing' = 'new') {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge');
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status,
  });
  return { org, seeker, listingId, applicationId, ctx: org.owner.ctx };
}

async function propose(
  ctx: HostContext,
  applicationId: string,
  extra: { slots?: { start: string }[]; expiryHours?: 48 | 72; note?: string } = {},
) {
  return proposeInterview(
    t.db as Db,
    ctx,
    applicationId,
    {
      slots: extra.slots ?? [slot(2 * HOUR), slot(30 * HOUR)],
      durationMinutes: 30,
      format: 'phone',
      expiryHours: extra.expiryHours ?? 72,
      note: extra.note,
    },
    NOW,
  );
}

beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
});

describe('proposeInterview', () => {
  it('rejects a slot that is too soon, too far, or overlapping, and a second open interview', async () => {
    const { ctx, applicationId } = await scene();
    await expect(propose(ctx, applicationId, { slots: [slot(59 * 60_000)] })).rejects.toMatchObject({
      code: 'bad_request',
      details: { reason: 'slot_too_soon' },
    });
    await expect(propose(ctx, applicationId, { slots: [slot(91 * 24 * HOUR)] })).rejects.toMatchObject({
      code: 'bad_request',
      details: { reason: 'slot_too_far' },
    });
    await expect(
      propose(ctx, applicationId, { slots: [slot(2 * HOUR), slot(2 * HOUR + 15 * 60_000)] }),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'slots_overlap' } });
    await propose(ctx, applicationId);
    await expect(propose(ctx, applicationId)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'interview_active' },
    });
  });

  it('moves a new application to interviewing and sets expires_at from the nearer limit', async () => {
    const { ctx, applicationId } = await scene();
    const view = await propose(ctx, applicationId);
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('interviewing');
    expect(entry?.interviewState).toBe('invited');
    const [row] = await t.db.select().from(interviews).where(eq(interviews.id, view.id));
    expect(row?.expiresAt?.toISOString()).toBe(new Date(NOW.getTime() + 30 * HOUR).toISOString());
    expect(row?.sequence).toBe(0);
    expect(row?.round).toBe(1);
    expect(row?.organizerUserId).toBe(ctx.user.id);

    const far = await scene();
    const farView = await propose(far.ctx, far.applicationId, { slots: [slot(5 * 24 * HOUR)] });
    const [farRow] = await t.db.select().from(interviews).where(eq(interviews.id, farView.id));
    expect(farRow?.expiresAt?.toISOString()).toBe(new Date(NOW.getTime() + 72 * HOUR).toISOString());

    const short = await scene();
    const shortView = await propose(short.ctx, short.applicationId, {
      slots: [slot(5 * 24 * HOUR)],
      expiryHours: 48,
    });
    const [shortRow] = await t.db.select().from(interviews).where(eq(interviews.id, shortView.id));
    expect(shortRow?.expiresAt?.toISOString()).toBe(new Date(NOW.getTime() + 48 * HOUR).toISOString());
  });

  it('hides a blocked or pending note from the seeker and delivers a warning', async () => {
    const held = await scene();
    const heldView = await propose(held.ctx, held.applicationId, { note: 'please __block__ this' });
    const pending = await listSeekerInterviews(t.db, held.seeker.userId, { now: NOW });
    expect(pending.items.map((item) => item.id)).not.toContain(heldView.id);
    await expect(pickSlot(t.db as Db, held.seeker.userId, heldView.id, { slotId: newId(), round: 1 }, NOW)).rejects.toMatchObject({
      details: { reason: 'not_found' },
    });
    await expect(
      requestNewTimes(t.db as Db, held.seeker.userId, heldView.id, { windows: [{ start: slot(2 * HOUR).start, end: slot(3 * HOUR).start }] }, NOW),
    ).rejects.toMatchObject({ details: { reason: 'not_found' } });
    await expect(declineInterview(t.db as Db, held.seeker.userId, heldView.id, { alsoWithdraw: false }, NOW)).rejects.toMatchObject({
      details: { reason: 'not_found' },
    });
    expect(messagingFake.calls.some((call) => call.name === 'postCard')).toBe(false);
    const invited = await t.db.select().from(notifications).where(eq(notifications.userId, held.seeker.userId));
    expect(invited.some((row) => row.type === 'hiring.interview_invited')).toBe(false);

    await withTx(t.db as Db, (tx) =>
      releaseInterviewNote(tx, heldView.id, { state: 'held', checkId: newId(), labels: [] }),
    );
    const afterHold = await listSeekerInterviews(t.db, held.seeker.userId, { now: NOW });
    expect(afterHold.items.map((item) => item.id)).not.toContain(heldView.id);

    const warned = await scene();
    messagingFake.reset();
    const warnView = await propose(warned.ctx, warned.applicationId, { note: 'bring boots' });
    await withTx(t.db as Db, (tx) =>
      releaseInterviewNote(tx, warnView.id, { state: 'warn', checkId: newId(), labels: [] }),
    );
    const listed = await listSeekerInterviews(t.db, warned.seeker.userId, { now: NOW });
    expect(listed.items.find((item) => item.id === warnView.id)?.note).toBe('bring boots');
    expect(messagingFake.calls.some((call) => call.name === 'postCard')).toBe(true);
    const notes = await t.db.select().from(notifications).where(eq(notifications.userId, warned.seeker.userId));
    expect(notes.some((row) => row.type === 'hiring.interview_invited')).toBe(true);
  });

  it('rejects the 31st proposal in an hour', async () => {
    const { ctx, applicationId } = await scene();
    asHost(ctx);
    const body = {
      slots: [slot(2 * HOUR)],
      durationMinutes: 30,
      format: 'phone',
      expiryHours: 72,
    };
    let last = 0;
    for (let n = 0; n < 31; n += 1) {
      const res = await call(POST, request('POST', `/api/v1/host/applicants/${applicationId}/interviews`, { body }), {
        applicationId,
      });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe('proposeNewRound', () => {
  it('advances the round so a pick of the old round is rejected', async () => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId, { slots: [slot(48 * HOUR)] });
    const picked = await pickSlot(t.db as Db, seeker.userId, view.id, { slotId: slotId(view), round: 1 }, NOW);
    expect(picked.status).toBe('scheduled');
    const next = await proposeNewRound(
      t.db as Db,
      ctx,
      view.id,
      { slots: [slot(72 * HOUR)], durationMinutes: 30, expiryHours: 72 },
      NOW,
    );
    expect(next.round).toBe(2);
    await expect(
      pickSlot(t.db as Db, seeker.userId, view.id, { slotId: slotId(view), round: 1 }, NOW),
    ).rejects.toMatchObject({ details: { reason: 'round_changed' } });
  });
});
