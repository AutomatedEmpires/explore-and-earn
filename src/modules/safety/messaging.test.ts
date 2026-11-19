// The blocked SP5 thread, end to end with the real safety module (SP4 spec 8.7 and 10; SP5
// "Read-only"). A block either way makes the thread read-only for both sides and stops every
// send. Each side is told `blocked` only when it made the block itself; the other side sees
// `unavailable`, so a seeker never learns that a host blocked them, and a host never learns
// that a seeker did.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { getThread, sendHostMessage, sendMessage, type ThreadViewer } from '@/modules/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedSeeker, seedThread } from '@tests/helpers/sp5';
import { block, unblock } from './index';
import { blocks } from './schema';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  listingsFake.reset();
  orgsFake.reset();
});

type World = {
  orgId: string;
  ownerId: string;
  seekerId: string;
  threadId: string;
  seeker: ThreadViewer;
  host: ThreadViewer;
};

async function world(): Promise<World> {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  const threadId = await seedThread(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
  });
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Lift Operator' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge Lodge');
  return {
    orgId: org.orgId,
    ownerId: org.owner.userId,
    seekerId: seeker.userId,
    threadId,
    seeker: { kind: 'seeker', userId: seeker.userId },
    host: { kind: 'host', ctx: org.owner.ctx },
  };
}

async function messageCount(threadId: string): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    t.db,
    sql`select count(*)::int as n from app.messages where thread_id = ${threadId}`,
  );
  return row?.n ?? 0;
}

async function expectNobodyCanSend(w: World): Promise<void> {
  for (const viewer of [w.seeker, w.host]) {
    await expect(
      sendMessage(t.db, viewer, w.threadId, { clientId: newId(), body: 'Hello' }),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'read_only' } });
  }
  const sent = await withTx(t.db, (tx) =>
    sendHostMessage(tx, { threadId: w.threadId, senderUserId: w.ownerId, body: 'Hello' }),
  );
  expect(sent).toBeNull();
  expect(await messageCount(w.threadId)).toBe(0);
}

describe('a blocked thread', () => {
  it('stays open while nobody blocked anybody', async () => {
    const w = await world();
    await expect(getThread(t.db, w.seeker, w.threadId)).resolves.toMatchObject({
      readOnly: null,
      canSend: true,
    });
    await expect(getThread(t.db, w.host, w.threadId)).resolves.toMatchObject({
      readOnly: null,
      canSend: true,
    });
  });

  it('a seeker blocking the org: read-only both ways, and only the seeker is told why', async () => {
    const w = await world();
    await block(t.db, { type: 'user', id: w.seekerId }, { type: 'org', id: w.orgId }, w.seekerId);

    await expectNobodyCanSend(w);
    await expect(getThread(t.db, w.seeker, w.threadId)).resolves.toMatchObject({
      readOnly: 'blocked',
      canSend: false,
    });
    await expect(getThread(t.db, w.host, w.threadId)).resolves.toMatchObject({
      readOnly: 'unavailable',
      canSend: false,
    });
    const [row] = await queryRows<{ read_only_reason: string | null }>(
      t.db,
      sql`select read_only_reason from app.threads where id = ${w.threadId}`,
    );
    expect(row?.read_only_reason).toBe('blocked');
  });

  it('the org blocking the seeker: read-only both ways, and only the host is told why', async () => {
    const w = await world();
    await block(t.db, { type: 'org', id: w.orgId }, { type: 'user', id: w.seekerId }, w.ownerId);

    await expectNobodyCanSend(w);
    await expect(getThread(t.db, w.host, w.threadId)).resolves.toMatchObject({
      readOnly: 'blocked',
      canSend: false,
    });
    await expect(getThread(t.db, w.seeker, w.threadId)).resolves.toMatchObject({
      readOnly: 'unavailable',
      canSend: false,
    });
  });

  it('stays read-only after an unblock, without telling either side about a block', async () => {
    const w = await world();
    await block(t.db, { type: 'org', id: w.orgId }, { type: 'user', id: w.seekerId }, w.ownerId);
    await getThread(t.db, w.seeker, w.threadId);
    await unblock(t.db, { type: 'org', id: w.orgId }, { type: 'user', id: w.seekerId }, w.ownerId);
    expect(await t.db.select().from(blocks).where(eq(blocks.blockerId, w.orgId))).toEqual([]);

    for (const viewer of [w.seeker, w.host]) {
      await expect(getThread(t.db, viewer, w.threadId)).resolves.toMatchObject({
        readOnly: 'unavailable',
        canSend: false,
      });
    }
  });
});
