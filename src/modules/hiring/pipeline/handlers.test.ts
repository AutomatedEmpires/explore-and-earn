import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { invites, pendingPasses, pipelineEntries, pipelineEvents } from '../schema';
import { listingsFake } from '@tests/fakes/sp5/sp2';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedLocation } from '@tests/helpers/sp2';
import { envelope, FIXED_NOW, seedHostOrg, seedInvite, seedSeeker } from '@tests/helpers/sp5';

const notify = vi.hoisted(() => vi.fn(async () => {}));
const scoreApplications = vi.hoisted(() => vi.fn(async () => 0));

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
vi.mock('@/modules/notifications', async (orig) => ({
  ...(await orig<typeof import('@/modules/notifications')>()),
  notify,
}));
vi.mock('../fit-store', () => ({
  scoreApplications,
  refreshFit: vi.fn(async () => 0),
}));

import {
  onAdditionalStepChanged,
  onApplicationSubmitted,
  onApplicationWithdrawn,
} from './handlers';
import { hiringStats } from './register';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  listingsFake.reset();
  messagingFake.reset();
  notify.mockClear();
  scoreApplications.mockClear();
});

async function submitted(source: 'swipe' | 'seek' = 'swipe') {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const locationId = await seedLocation(t.db, { orgId: org.orgId });
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, locationId, title: 'Lift Operator' });
  const applicationId = newId();
  const payload = envelope('application.submitted', {
    applicationId,
    listingId,
    orgId: org.orgId,
    seekerUserId: seeker.userId,
    submittedAt: FIXED_NOW.toISOString(),
    source,
    inviteId: null,
  });
  return { org, seeker, locationId, listingId, applicationId, payload };
}

describe('application events', () => {
  it('mirrors a submission once, stores the source, and scores it', async () => {
    const { org, seeker, locationId, listingId, applicationId, payload } = await submitted();
    const other = await seedSeeker(t.db);
    const sent = await seedInvite(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      sentBy: org.owner.userId,
      status: 'sent',
    });
    await t.db.update(invites).set({ respondedAt: FIXED_NOW }).where(eq(invites.id, sent));
    const expired = await seedInvite(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: other.userId,
      sentBy: org.owner.userId,
      status: 'expired',
    });

    await onApplicationSubmitted(t.db as Db, payload);
    await onApplicationSubmitted(t.db as Db, payload);

    const entries = await t.db
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, applicationId));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: 'swipe', locationId, status: 'new' });
    const events = await t.db
      .select()
      .from(pipelineEvents)
      .where(eq(pipelineEvents.applicationId, applicationId));
    expect(events.filter((event) => event.kind === 'applied')).toHaveLength(1);
    expect(events.find((event) => event.kind === 'applied')).toMatchObject({ source: 'swipe' });

    const [appliedInvite] = await t.db.select().from(invites).where(eq(invites.id, sent));
    expect(appliedInvite?.status).toBe('applied');
    expect(appliedInvite?.respondedAt).toEqual(FIXED_NOW);
    const [untouched] = await t.db.select().from(invites).where(eq(invites.id, expired));
    expect(untouched?.status).toBe('expired');
    expect(events.filter((event) => event.kind === 'invite_applied')).toHaveLength(1);

    expect(messagingFake.calls.filter((call) => call.name === 'ensureThread')).toHaveLength(1);
    const cards = messagingFake.calls.filter((call) => call.name === 'postCard');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.args[1]).toEqual({ type: 'application', refId: applicationId });
    expect(scoreApplications).toHaveBeenCalledTimes(1);
    expect(scoreApplications).toHaveBeenCalledWith(t.db, { listingId, applicationIds: [applicationId] });
    expect(notify).not.toHaveBeenCalled();
  });

  it('withdraws once the entry exists and ignores a second delivery', async () => {
    const { applicationId, payload, org, seeker, listingId } = await submitted();
    await expect(
      onApplicationWithdrawn(
        t.db as Db,
        envelope('application.withdrawn', {
          applicationId,
          listingId,
          orgId: org.orgId,
          seekerUserId: seeker.userId,
          withdrawnAt: FIXED_NOW.toISOString(),
          reason: null,
        }),
      ),
    ).rejects.toThrow('pipeline entry not ready');

    await onApplicationSubmitted(t.db as Db, payload);
    const ensured = await messagingFake.ensureThread({} as never, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      applicationId,
    });
    await t.db.insert(pendingPasses).values({
      applicationId,
      orgId: org.orgId,
      actorUserId: org.owner.userId,
      commitAt: new Date(FIXED_NOW.getTime() + 10_000),
    });

    const withdrawn = envelope('application.withdrawn', {
      applicationId,
      listingId,
      orgId: org.orgId,
      seekerUserId: seeker.userId,
      withdrawnAt: FIXED_NOW.toISOString(),
      reason: null,
    });
    await onApplicationWithdrawn(t.db as Db, withdrawn);
    await onApplicationWithdrawn(t.db as Db, withdrawn);

    const [entry] = await t.db
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('withdrawn');
    const passes = await t.db
      .select()
      .from(pendingPasses)
      .where(eq(pendingPasses.applicationId, applicationId));
    expect(passes).toHaveLength(0);
    const events = messagingFake.calls.filter(
      (call) => call.name === 'postEvent' && (call.args[1] as { code?: string }).code === 'withdrawn',
    );
    expect(events).toEqual([{ name: 'postEvent', args: [ensured.threadId, { code: 'withdrawn', visibleTo: 'all' }] }]);
    expect(messagingFake.calls).toContainEqual({
      name: 'setThreadReadOnly',
      args: [ensured.threadId, 'withdrawn'],
    });
  });

  it('records an additional step and counts hired entries', async () => {
    const { applicationId, payload, listingId } = await submitted('seek');
    await onApplicationSubmitted(t.db as Db, payload);
    await onAdditionalStepChanged(
      t.db as Db,
      envelope('application.additional_step_changed', {
        applicationId,
        orgId: payload.data.orgId,
        completed: true,
        at: FIXED_NOW.toISOString(),
      }),
    );
    const [entry] = await t.db
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.additionalStepDone).toBe(true);

    const hiredA = newId();
    const hiredB = newId();
    const fresh = newId();
    const seeker = await seedSeeker(t.db);
    for (const [id, status] of [
      [hiredA, 'hired'],
      [hiredB, 'hired'],
      [fresh, 'new'],
    ] as const) {
      await t.db.insert(pipelineEntries).values({
        applicationId: id,
        orgId: payload.data.orgId,
        listingId,
        seekerUserId: seeker.userId,
        status,
        source: 'seek',
        appliedAt: FIXED_NOW,
        lastStatusAt: FIXED_NOW,
      });
    }
    const stats = await hiringStats(t.db, [listingId]);
    expect(stats.get(listingId)).toEqual({ hires: 2 });
  });
});
