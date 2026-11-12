// The module-load registrations and the listing-event subscriber (SP4 plan Task 21): SP3's
// seeker overlay, SP2's listing stats and the `apply` event.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSp2, statsProviders } from '@tests/fakes/sp4/sp2';
import { calls, overlay, resetSp3 } from '@tests/fakes/sp4/sp3';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedUser } from '@tests/helpers/sp4';
import { eventHandlers, LISTING_EVENT_TOPIC } from './events';
import './register';
import { withdraw } from './status';
import { submitApplication } from './submit';
import { deckhand, input, resetMocks, safety, seedWorld, type World } from './test-fixtures';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp4/sp2')).listingsModule,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp4/sp2')).orgsAdditions,
}));
vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);
vi.mock('@/modules/locations', async () => (await import('@tests/fakes/sp4/sp2')).locationsModule);
vi.mock('@/modules/discovery', async (orig) => ({
  ...(await orig<typeof import('@/modules/discovery')>()),
  ...(await import('@tests/fakes/sp4/sp3')).discoveryModule,
}));
vi.mock('@/modules/profiles', async () => (await import('./test-fixtures')).profilesMock());
vi.mock('@/modules/safety', async () => (await import('./test-fixtures')).safetyMock());
vi.mock('@/modules/notifications', async (orig) => ({
  ...(await orig<typeof import('@/modules/notifications')>()),
  notify: vi.fn(async () => {}),
}));

let t: TestDb;
let w: World;
// register.ts registered at import, before any beforeEach could reset the fake.
const statsProvider = statsProviders.get('applications');

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  resetSp2();
  resetSp3();
  resetMocks();
  w = await seedWorld(t.db);
});

describe('the SP3 seeker overlay', () => {
  it('counts every application as applied, whatever its status', async () => {
    const a = deckhand(w);
    const b = deckhand(w);
    const c = deckhand(w);
    const first = await submitApplication(t.db, w.seeker.id, input(a));
    await submitApplication(t.db, w.seeker.id, input(b));
    await withdraw(t.db, {
      applicationId: first.application.applicationId,
      seekerUserId: w.seeker.id,
    });

    const applied = await overlay.current?.appliedListingIds(t.db, w.seeker.id, 'all');
    expect([...(applied ?? [])].sort()).toEqual([a.listingId, b.listingId].sort());

    const some = await overlay.current?.appliedListingIds(t.db, w.seeker.id, [
      b.listingId,
      c.listingId,
    ]);
    expect([...(some ?? [])]).toEqual([b.listingId]);
    expect(await overlay.current?.appliedListingIds(t.db, w.seeker.id, [])).toEqual(new Set());
  });

  it("never returns another seeker's applications", async () => {
    await submitApplication(t.db, w.seeker.id, input(deckhand(w)));
    const other = await seedUser(t.db, { accountType: 'seeker' });
    expect(await overlay.current?.appliedListingIds(t.db, other.id, 'all')).toEqual(new Set());
  });

  it('hides the hosts the seeker blocked, not the seekers they blocked', async () => {
    safety.listBlocks.mockResolvedValue([
      {
        blockId: 'b1',
        by: { type: 'user', id: w.seeker.id },
        target: { type: 'org', id: w.orgId },
        createdAt: new Date(),
      },
      {
        blockId: 'b2',
        by: { type: 'user', id: w.seeker.id },
        target: { type: 'user', id: w.owner.user.id },
        createdAt: new Date(),
      },
    ]);
    expect(await overlay.current?.hiddenOrgIds(t.db, w.seeker.id)).toEqual([w.orgId]);
    expect(safety.listBlocks.mock.calls[0]?.[1]).toEqual({ type: 'user', id: w.seeker.id });
  });
});

describe('the SP2 listing stats provider', () => {
  it('counts applications per listing', async () => {
    const a = deckhand(w);
    const b = deckhand(w);
    const other = await seedUser(t.db, { accountType: 'seeker' });
    await submitApplication(t.db, w.seeker.id, input(a));
    await submitApplication(t.db, other.id, input(a));
    expect(statsProvider).toBeDefined();
    const stats = await statsProvider?.(t.db, [a.listingId, b.listingId]);
    expect(stats?.get(a.listingId)).toEqual({ applications: 2 });
    expect(stats?.get(b.listingId)).toBeUndefined();
    expect(await statsProvider?.(t.db, [])).toEqual(new Map());
  });
});

describe('applications.listing_event', () => {
  const envelope = (applicationId: string, listingId: string) => ({
    event: 'application.submitted',
    eventId: '019a4a3c-0000-7000-8000-0000000f0010',
    data: {
      applicationId,
      listingId,
      orgId: w.orgId,
      seekerUserId: w.seeker.id,
      submittedAt: new Date().toISOString(),
      source: 'swipe',
      inviteId: null,
    },
  });

  it('records one apply event per application, however often the job runs', async () => {
    const handler = eventHandlers[LISTING_EVENT_TOPIC];
    const ctx = { db: t.db, now: new Date() };
    await handler?.(envelope('app-1', 'listing-1'), ctx);
    await handler?.(envelope('app-1', 'listing-1'), ctx);
    expect(calls.listingEvents).toEqual([
      { listingId: 'listing-1', type: 'apply', source: 'swipe', dedupeKey: 'apply:app-1' },
    ]);
  });

  it('rejects a payload that is not the submitted event', async () => {
    const handler = eventHandlers[LISTING_EVENT_TOPIC];
    await expect(handler?.({ nope: true }, { db: t.db, now: new Date() })).rejects.toThrow(
      'Expected event application.submitted',
    );
  });
});
