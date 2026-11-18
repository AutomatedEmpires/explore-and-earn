import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import { withTx } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { safetyFake } from '@tests/fakes/sp5/sp4';
import { messages, threads } from './schema';
import { hostViewer, seedHostOrg, seedSeeker, seedThread, seekerViewer, type SeededThread } from './test-fixture';
import { ensureThread, getThread, listThreads, postEvent } from './threads';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));

let t: TestDb;
const day = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  const saved = [...safetyFake.subjects];
  listingsFake.reset();
  orgsFake.reset();
  safetyFake.reset();
  for (const subject of saved) safetyFake.subjects.push(subject);
});

async function world(): Promise<SeededThread> {
  const seeded = await seedThread(t.db);
  listingsFake.setListing({ id: seeded.listingId, orgId: seeded.orgId, title: 'Lift Operator' });
  orgsFake.setAccess(seeded.ownerId, { all: true });
  orgsFake.setOrgName(seeded.orgId, seeded.orgName);
  return seeded;
}

describe('ensureThread', () => {
  it('creates once, then fills a missing application id', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const listingId = newId();
    const created = await withTx(t.db, (tx) =>
      ensureThread(tx, { orgId: org.orgId, listingId, seekerUserId: seeker.userId }),
    );
    expect(created.created).toBe(true);
    const again = await withTx(t.db, (tx) =>
      ensureThread(tx, { orgId: org.orgId, listingId, seekerUserId: seeker.userId }),
    );
    expect(again).toEqual({ threadId: created.threadId, created: false });

    const applicationId = newId();
    const withApplication = await withTx(t.db, (tx) =>
      ensureThread(tx, {
        orgId: org.orgId,
        listingId,
        seekerUserId: seeker.userId,
        applicationId,
      }),
    );
    expect(withApplication).toEqual({ threadId: created.threadId, created: false });
    const [row] = await t.db.select().from(threads).where(eq(threads.id, created.threadId));
    expect(row?.applicationId).toBe(applicationId);
  });
});

describe('participation', () => {
  it('lets the seeker and a location-scoped recruiter read, and hides everyone else', async () => {
    const seeded = await world();
    const locationId = newId();
    listingsFake.setListing({
      id: seeded.listingId,
      orgId: seeded.orgId,
      locationId,
      title: 'Lift Operator',
    });
    const recruiterId = newId();
    orgsFake.setAccess(recruiterId, { all: false, listingIds: [], locationIds: [locationId] });
    const outsiderId = newId();
    orgsFake.setAccess(outsiderId, { all: false, listingIds: [], locationIds: [] });

    await expect(
      getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId),
    ).resolves.toMatchObject({ thread: { id: seeded.threadId }, canSend: true });
    await expect(
      getThread(t.db, hostViewer(recruiterId, seeded.orgId, 'recruiter'), seeded.threadId),
    ).resolves.toMatchObject({ thread: { id: seeded.threadId } });

    const denied = [
      seekerViewer(newId()),
      hostViewer(newId(), seeded.orgId, 'billing'),
      hostViewer(outsiderId, seeded.orgId, 'recruiter'),
    ];
    for (const viewer of denied) {
      await expect(getThread(t.db, viewer, seeded.threadId)).rejects.toBeInstanceOf(AppError);
      await expect(getThread(t.db, viewer, seeded.threadId)).rejects.toMatchObject({ status: 404 });
    }
  });
});

describe('what each side sees', () => {
  it('hides pending, held and host-only events from the seeker, and labels the host states', async () => {
    const seeded = await world();
    const pendingId = newId();
    const heldId = newId();
    const warnId = newId();
    await t.db.insert(messages).values([
      {
        id: pendingId,
        threadId: seeded.threadId,
        senderType: 'host',
        senderUserId: seeded.ownerId,
        kind: 'text',
        body: 'sending',
        scanState: 'pending',
      },
      {
        id: heldId,
        threadId: seeded.threadId,
        senderType: 'host',
        senderUserId: seeded.ownerId,
        kind: 'text',
        body: 'held back',
        scanState: 'held',
      },
      {
        id: warnId,
        threadId: seeded.threadId,
        senderType: 'host',
        senderUserId: seeded.ownerId,
        kind: 'text',
        body: 'careful',
        scanState: 'warn',
      },
    ]);
    await withTx(t.db, (tx) =>
      postEvent(tx, seeded.threadId, { code: 'withdrawn', visibleTo: 'host' }),
    );

    const seeker = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(seeker.messages.map((message) => message.id)).toEqual([warnId]);
    expect(seeker.messages[0]).toMatchObject({ warn: true, body: 'careful' });

    const host = await getThread(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'), seeded.threadId);
    const byId = new Map(host.messages.map((message) => [message.id, message]));
    expect(byId.get(pendingId)?.state).toBe('sending');
    expect(byId.get(heldId)?.state).toBe('not_delivered');
    expect(host.messages.some((message) => message.event === 'withdrawn')).toBe(true);
  });
});

describe('read only', () => {
  it('closes a listing after 90 days and opens it before that', async () => {
    const closed = await world();
    await t.db
      .update(threads)
      .set({ listingClosedAt: new Date(Date.now() - 91 * day) })
      .where(eq(threads.id, closed.threadId));
    await expect(getThread(t.db, seekerViewer(closed.seekerId), closed.threadId)).resolves.toMatchObject({
      readOnly: 'listing_closed',
      canSend: false,
    });

    const open = await world();
    await t.db
      .update(threads)
      .set({ listingClosedAt: new Date(Date.now() - 89 * day) })
      .where(eq(threads.id, open.threadId));
    await expect(getThread(t.db, seekerViewer(open.seekerId), open.threadId)).resolves.toMatchObject({
      readOnly: null,
      canSend: true,
    });
  });

  it('stamps a block the first time the thread is read', async () => {
    const seeded = await world();
    safetyFake.setBlocked(seeded.orgId, seeded.seekerId);
    await expect(getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId)).resolves.toMatchObject({
      readOnly: 'blocked',
      canSend: false,
    });
    const [row] = await t.db.select().from(threads).where(eq(threads.id, seeded.threadId));
    expect(row?.readOnlyReason).toBe('blocked');
  });
});

describe('listThreads', () => {
  it('returns the host only the listings in scope, and can keep the read ones out', async () => {
    const seeded = await world();
    const otherListing = newId();
    listingsFake.setListing({ id: otherListing, orgId: seeded.orgId, title: 'Cook' });
    const otherSeeker = newId();
    await t.db.execute(sql`
      insert into app.users (id, clerk_user_id, email, account_type, adult_attested_at)
      values (${otherSeeker}, ${`user_${otherSeeker}`}, ${`${otherSeeker}@ex.test`}, 'seeker', now())
    `);
    const { threadId: otherThread } = await withTx(t.db, (tx) =>
      ensureThread(tx, {
        orgId: seeded.orgId,
        listingId: otherListing,
        seekerUserId: otherSeeker,
      }),
    );
    const at = new Date();
    await t.db
      .update(threads)
      .set({ lastToHostAt: at })
      .where(eq(threads.id, seeded.threadId));
    await t.db.update(threads).set({ lastToHostAt: at }).where(eq(threads.id, otherThread));

    const recruiterId = newId();
    orgsFake.setAccess(recruiterId, { all: false, listingIds: [seeded.listingId], locationIds: [] });
    const scoped = await listThreads(t.db, hostViewer(recruiterId, seeded.orgId, 'recruiter'));
    expect(scoped.items.map((item) => item.threadId)).toEqual([seeded.threadId]);

    const owner = await listThreads(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'));
    expect(owner.items.map((item) => item.threadId).sort()).toEqual([otherThread, seeded.threadId].sort());

    await t.db.update(threads).set({ lastToHostAt: null }).where(eq(threads.id, seeded.threadId));
    const unread = await listThreads(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'), {
      unread: true,
    });
    expect(unread.items.map((item) => item.threadId)).toEqual([otherThread]);
  });
});
