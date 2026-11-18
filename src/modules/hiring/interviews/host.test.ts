import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';
import { afterAll, beforeAll } from 'vitest';
import { proposeInterview } from './propose';
import { listHostInterviews } from './reads';

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

let t: TestDb;
const NOW = new Date('2026-11-03T17:00:00Z');
const HOUR = 60 * 60_000;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
});

describe('listHostInterviews', () => {
  it('includes an unscheduled interview whose expiry falls in the window', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
    orgsFake.setAccess(org.owner.userId, { all: true });
    const applicationId = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'new',
    });
    const view = await proposeInterview(
      t.db as Db,
      org.owner.ctx,
      applicationId,
      {
        slots: [{ start: new Date(NOW.getTime() + 30 * HOUR).toISOString() }],
        durationMinutes: 30,
        format: 'phone',
        expiryHours: 72,
      },
      NOW,
    );
    const listed = await listHostInterviews(
      t.db,
      org.owner.ctx,
      { from: NOW.toISOString(), to: new Date(NOW.getTime() + 31 * HOUR).toISOString() },
      NOW,
    );
    const item = listed.items.find((row) => row.interviewId === view.id);
    expect(item?.listingTitle).toBe('Deckhand');
    expect(item?.needsAction).toBe(false);
    expect(item?.expiresAt).toBe(new Date(NOW.getTime() + 30 * HOUR).toISOString());
  });
});
