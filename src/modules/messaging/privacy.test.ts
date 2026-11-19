import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { withTx } from '@/lib/db';
import { DELETED_BODY } from '@/lib/messaging';
import { newId } from '@/lib/ids';
import { setLegalHold, type HoldScope } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedMember, seedOperator } from '@tests/helpers/sp8';
import { messages, threads } from './schema';
import { privacyHandler, retentionRules } from './privacy';
import { seedHostOrg, seedSeeker } from './test-fixtures';

const removeMedia = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/modules/media', async (orig) => ({
  ...(await orig<typeof import('@/modules/media')>()),
  removeMedia,
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function pair() {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const threadId = newId();
  await t.db.insert(threads).values({
    id: threadId,
    orgId: org.orgId,
    listingId: newId(),
    seekerUserId: seeker.userId,
  });
  return { org, seeker, threadId };
}

describe('messaging privacy', () => {
  it('deletes the seeker\u2019s words and attachments and leaves the host\u2019s message', async () => {
    removeMedia.mockClear();
    const { org, seeker, threadId } = await pair();
    const mediaId = newId();
    const seekerMessage = newId();
    const hostMessage = newId();
    await t.db.insert(messages).values([
      {
        id: seekerMessage,
        threadId,
        senderType: 'seeker',
        senderUserId: seeker.userId,
        kind: 'text',
        body: 'My number is 555',
        attachmentMediaIds: [mediaId],
      },
      {
        id: hostMessage,
        threadId,
        senderType: 'host',
        senderUserId: org.owner.userId,
        kind: 'text',
        body: 'Thanks for writing',
      },
    ]);

    const first = await withTx(t.db, (tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: seeker.userId }, {
        requestId: 'req',
        now: new Date(),
        holds: [],
      }),
    );
    expect(first.erased).toBeGreaterThan(0);
    expect(removeMedia).toHaveBeenCalledWith(expect.anything(), expect.anything(), mediaId);
    const [seekerRow] = await t.db.select().from(messages).where(eq(messages.id, seekerMessage));
    expect(seekerRow?.body).toBe(DELETED_BODY);
    expect(seekerRow?.attachmentMediaIds).toEqual([]);
    const [hostRow] = await t.db.select().from(messages).where(eq(messages.id, hostMessage));
    expect(hostRow?.body).toBe('Thanks for writing');

    const second = await withTx(t.db, (tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: seeker.userId }, {
        requestId: 'req',
        now: new Date(),
        holds: [],
      }),
    );
    expect(second.erased).toBe(0);
  });

  it('changes nothing while messages are on legal hold', async () => {
    const { seeker, threadId } = await pair();
    const id = newId();
    await t.db.insert(messages).values({
      id,
      threadId,
      senderType: 'seeker',
      senderUserId: seeker.userId,
      kind: 'text',
      body: 'Keep this',
    });
    const result = await withTx(t.db, (tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: seeker.userId }, {
        requestId: 'req',
        now: new Date(),
        holds: ['messages'],
      }),
    );
    expect(result.retained.some((row) => row.reason === 'legal_hold')).toBe(true);
    const [row] = await t.db.select().from(messages).where(eq(messages.id, id));
    expect(row?.body).toBe('Keep this');
  });

  it('deletes a thread closed 13 months ago and keeps one closed 11 months ago', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const now = new Date();
    const monthsAgo = (months: number) => {
      const at = new Date(now);
      at.setUTCMonth(at.getUTCMonth() - months);
      return at;
    };
    const oldId = newId();
    const recentId = newId();
    await t.db.insert(threads).values([
      {
        id: oldId,
        orgId: org.orgId,
        listingId: newId(),
        seekerUserId: seeker.userId,
        listingClosedAt: monthsAgo(13),
      },
      {
        id: recentId,
        orgId: org.orgId,
        listingId: newId(),
        seekerUserId: seeker.userId,
        listingClosedAt: monthsAgo(11),
      },
    ]);
    await t.db.insert(messages).values([
      {
        id: newId(),
        threadId: oldId,
        senderType: 'host',
        senderUserId: org.owner.userId,
        kind: 'text',
        body: 'old',
        createdAt: monthsAgo(13),
      },
      {
        id: newId(),
        threadId: recentId,
        senderType: 'host',
        senderUserId: org.owner.userId,
        kind: 'text',
        body: 'recent',
        createdAt: monthsAgo(11),
      },
    ]);
    const rule = retentionRules.find((item) => item.key === 'messaging.messages_12m');
    expect(rule).toBeDefined();
    const result = await rule?.run(t.db, now, 10);
    expect(result?.deleted).toBe(1);
    const left = await t.db.select().from(threads).where(eq(threads.seekerUserId, seeker.userId));
    expect(left.map((row) => row.id)).toEqual([recentId]);
  });

  it('keeps an old thread while its organization, seeker or a sender is under a hold on messages or all', async () => {
    const operatorId = (await seedOperator(t.db, { role: 'owner' })).userId;
    const hold = (subject: { userId: string } | { orgId: string }, scope: HoldScope) =>
      setLegalHold(t.db, {
        ...subject,
        scope,
        reason: 'Harassment report 26-0912',
        reviewAt: '2099-01-01',
        operatorId,
      });
    const now = new Date();
    const closed = new Date(now);
    closed.setUTCMonth(closed.getUTCMonth() - 13);

    async function oldThread(i: { orgId: string; seekerUserId: string; senderUserId: string }) {
      const id = newId();
      await t.db.insert(threads).values({
        id,
        orgId: i.orgId,
        listingId: newId(),
        seekerUserId: i.seekerUserId,
        listingClosedAt: closed,
      });
      await t.db.insert(messages).values({
        id: newId(),
        threadId: id,
        senderType: 'host',
        senderUserId: i.senderUserId,
        kind: 'text',
        body: 'old',
        createdAt: closed,
      });
      return id;
    }

    const heldOrg = await seedHostOrg(t.db);
    await hold({ orgId: heldOrg.orgId }, 'messages');
    const heldSeeker = await seedSeeker(t.db);
    await hold({ userId: heldSeeker.userId }, 'all');
    const org = await seedHostOrg(t.db);
    const heldSender = await seedMember(t.db, org.orgId, 'recruiter');
    await hold({ userId: heldSender.userId }, 'messages');
    const otherScope = await seedSeeker(t.db);
    await hold({ userId: otherScope.userId }, 'applications');
    const free = await seedSeeker(t.db);

    const kept = [
      await oldThread({
        orgId: heldOrg.orgId,
        seekerUserId: free.userId,
        senderUserId: heldOrg.owner.userId,
      }),
      await oldThread({
        orgId: org.orgId,
        seekerUserId: heldSeeker.userId,
        senderUserId: org.owner.userId,
      }),
      await oldThread({
        orgId: org.orgId,
        seekerUserId: free.userId,
        senderUserId: heldSender.userId,
      }),
    ];
    const gone = [
      await oldThread({
        orgId: org.orgId,
        seekerUserId: otherScope.userId,
        senderUserId: org.owner.userId,
      }),
      await oldThread({ orgId: org.orgId, seekerUserId: free.userId, senderUserId: org.owner.userId }),
    ];

    const rule = retentionRules.find((item) => item.key === 'messaging.messages_12m');
    expect(await rule?.run(t.db, now, 100)).toEqual({ deleted: gone.length });
    const left = await t.db
      .select({ id: threads.id })
      .from(threads)
      .where(inArray(threads.id, [...kept, ...gone]));
    expect(left.map((row) => row.id).sort()).toEqual([...kept].sort());
  });
});
