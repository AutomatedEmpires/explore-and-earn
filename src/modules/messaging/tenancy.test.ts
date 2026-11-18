// Tenant boundaries for threads (explore-and-earn#184). A host acting for one org never
// reaches another org's thread, and a list cursor never widens the tenant filter.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { safetyFake } from '@tests/fakes/sp5/sp4';
import { getAttachmentUrl } from './attachments';
import './notification-types';
import { markThreadRead } from './reads';
import { messages, threadReads, threads } from './schema';
import { sendMessage } from './send';
import {
  hostViewer,
  seedAttachment,
  seedHostOrg,
  seedMember,
  seedSeeker,
  seedThread,
  seekerViewer,
} from './test-fixtures';
import { ensureThread, getThread, listThreads } from './threads';

vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));

// One more than the list page size (30), so the list has a second page.
const OVER_ONE_PAGE = 31;
// The lowest uuid there is: it sorts after every other id on a descending page.
const LOWEST_ID = '00000000-0000-4000-8000-000000000001';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  const saved = [...safetyFake.subjects];
  safetyFake.reset();
  for (const subject of saved) safetyFake.subjects.push(subject);
});

describe('cross-org thread access', () => {
  it('keeps an owner, an admin and an all-listings recruiter of org A out of an org B thread', async () => {
    const b = await seedThread(t.db);
    const mediaId = await seedAttachment(t.db, { ownerUserId: b.seekerId });
    await sendMessage(t.db, seekerViewer(b.seekerId), b.threadId, {
      clientId: newId(),
      body: 'My resume',
      attachmentMediaIds: [mediaId],
    });

    // Org B's own owner still reads the thread and its file.
    const own = hostViewer(b.ownerId, b.orgId, 'owner');
    await expect(getThread(t.db, own, b.threadId)).resolves.toMatchObject({
      thread: { id: b.threadId },
    });
    await expect(getAttachmentUrl(t.db, own, b.threadId, mediaId)).resolves.toContain(mediaId);

    const a = await seedHostOrg(t.db, { name: 'Pine Hollow Camp' });
    const admin = await seedMember(t.db, a.orgId, 'admin');
    const recruiter = await seedMember(t.db, a.orgId, 'recruiter', { scope: 'all' });
    const outsiders = [
      hostViewer(a.owner.userId, a.orgId, 'owner'),
      hostViewer(admin.userId, a.orgId, 'admin'),
      hostViewer(recruiter.userId, a.orgId, 'recruiter'),
    ];

    for (const viewer of outsiders) {
      await expect(getThread(t.db, viewer, b.threadId)).rejects.toMatchObject({ status: 404 });
      await expect(
        sendMessage(t.db, viewer, b.threadId, { clientId: newId(), body: 'Hello from A' }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(markThreadRead(t.db, viewer, b.threadId)).rejects.toMatchObject({
        status: 404,
      });
      await expect(getAttachmentUrl(t.db, viewer, b.threadId, mediaId)).rejects.toMatchObject({
        status: 404,
      });
      const listed = await listThreads(t.db, viewer, { listingId: b.listingId });
      expect(listed.items).toEqual([]);
    }

    const sent = await t.db.select().from(messages).where(eq(messages.threadId, b.threadId));
    expect(sent.map((row) => row.senderType)).toEqual(['seeker']);
    const reads = await t.db.select().from(threadReads).where(eq(threadReads.threadId, b.threadId));
    expect(reads).toEqual([]);
  });
});

describe('listThreads cursor', () => {
  it('keeps page two inside the host org when another org shares the cursor millisecond', async () => {
    const at = new Date('2026-11-18T12:00:00.000Z');
    const a = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const own: string[] = [];
    for (let n = 0; n < OVER_ONE_PAGE; n++) {
      const { threadId } = await withTx(t.db, (tx) =>
        ensureThread(tx, { orgId: a.orgId, listingId: newId(), seekerUserId: seeker.userId }),
      );
      own.push(threadId);
    }
    await t.db.update(threads).set({ lastToHostAt: at }).where(eq(threads.orgId, a.orgId));

    const b = await seedHostOrg(t.db, { name: 'Pine Hollow Camp' });
    const bSeeker = await seedSeeker(t.db);
    await t.db.insert(threads).values({
      id: LOWEST_ID,
      orgId: b.orgId,
      listingId: newId(),
      seekerUserId: bSeeker.userId,
      lastToHostAt: at,
    });

    const viewer = hostViewer(a.owner.userId, a.orgId, 'owner');
    const first = await listThreads(t.db, viewer);
    expect(first.items).toHaveLength(30);
    expect(first.nextCursor).not.toBeNull();
    const second = await listThreads(t.db, viewer, { cursor: first.nextCursor ?? undefined });
    const seen = [...first.items, ...second.items].map((item) => item.threadId);
    expect(seen).not.toContain(LOWEST_ID);
    expect([...seen].sort()).toEqual([...own].sort());
    expect(second.nextCursor).toBeNull();
  });

  it('keeps page two inside the seeker’s own threads when another seeker shares the millisecond', async () => {
    const at = new Date('2026-11-18T13:00:00.000Z');
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const own: string[] = [];
    for (let n = 0; n < OVER_ONE_PAGE; n++) {
      const { threadId } = await withTx(t.db, (tx) =>
        ensureThread(tx, { orgId: org.orgId, listingId: newId(), seekerUserId: seeker.userId }),
      );
      own.push(threadId);
    }
    await t.db
      .update(threads)
      .set({ lastToSeekerAt: at })
      .where(eq(threads.seekerUserId, seeker.userId));

    const other = await seedSeeker(t.db);
    const foreignId = '00000000-0000-4000-8000-000000000002';
    await t.db.insert(threads).values({
      id: foreignId,
      orgId: org.orgId,
      listingId: newId(),
      seekerUserId: other.userId,
      lastToSeekerAt: at,
    });

    const viewer = seekerViewer(seeker.userId);
    const first = await listThreads(t.db, viewer);
    expect(first.items).toHaveLength(30);
    const second = await listThreads(t.db, viewer, { cursor: first.nextCursor ?? undefined });
    const seen = [...first.items, ...second.items].map((item) => item.threadId);
    expect(seen).not.toContain(foreignId);
    expect([...seen].sort()).toEqual([...own].sort());
  });
});
