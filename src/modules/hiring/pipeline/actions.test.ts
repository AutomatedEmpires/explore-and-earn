import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents, notifications } from '@/db/schema';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { pipelineEntries } from '../schema';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { listingsFake } from '@tests/fakes/sp5/sp2';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';

vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...(await import('@tests/fakes/sp5/sp4')).applicationsFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
vi.mock('@/lib/analytics', async (orig) => ({
  ...(await orig<typeof import('@/lib/analytics')>()),
  track: vi.fn(),
}));

import { track } from '@/lib/analytics';
import '../notification-types';
import { markHired, shortlist } from './actions';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  applicationsFake.reset();
  listingsFake.reset();
  messagingFake.reset();
  vi.mocked(track).mockClear();
});

async function entry(status: 'new' | 'shortlisted' | 'interviewing' | 'offered' | 'withdrawn' = 'new') {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Lift Operator' });
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status,
  });
  return { org, seeker, listingId, applicationId, ctx: org.owner.ctx };
}

describe('shortlist and mark hired', () => {
  it('shortlists and removes the shortlist', async () => {
    const { applicationId, ctx } = await entry();
    expect(await shortlist(t.db as Db, ctx, applicationId, true)).toEqual({ status: 'shortlisted' });
    expect(await shortlist(t.db as Db, ctx, applicationId, false)).toEqual({ status: 'new' });
    const [row] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(row?.status).toBe('new');
  });

  it('rejects a shortlist after the seeker withdrew and mirrors that status', async () => {
    const { applicationId, ctx, org, seeker, listingId } = await entry();
    applicationsFake.seedApplication({
      id: applicationId,
      orgId: org.orgId,
      seekerUserId: seeker.userId,
      listingId,
      status: 'withdrawn',
    });
    await expect(shortlist(t.db as Db, ctx, applicationId, true)).rejects.toMatchObject({
      status: 409,
      details: { reason: 'stale_status', current: 'withdrawn' },
    });
    const [row] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(row?.status).toBe('withdrawn');
  });

  it('marks an interviewing applicant hired and refuses an offered one', async () => {
    const hired = await entry('interviewing');
    expect(await markHired(t.db as Db, hired.ctx, hired.applicationId)).toEqual({ status: 'hired' });
    const notes = await t.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, hired.seeker.userId));
    expect(notes.filter((row) => row.type === 'hiring.marked_hired')).toHaveLength(1);
    const audits = await t.db.select().from(auditEvents).where(eq(auditEvents.subjectId, hired.applicationId));
    expect(audits.filter((row) => row.action === 'hiring.marked_hired')).toHaveLength(1);
    expect(track).toHaveBeenCalledWith('hiring.hired', {
      applicationId: hired.applicationId,
      listingId: hired.listingId,
    });

    const offered = await entry('offered');
    await expect(markHired(t.db as Db, offered.ctx, offered.applicationId)).rejects.toMatchObject({
      status: 409,
      details: { reason: 'stale_status', current: 'offered' },
    });
  });
});
