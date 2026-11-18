import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { markReadByData } from '@/modules/notifications';
import { threadReads, threads } from './schema';
import { seedThread, seekerViewer } from './test-fixtures';
import { listThreads } from './threads';
import { markThreadRead } from './reads';

vi.mock('@/modules/notifications', async (orig) => {
  const actual = await orig<typeof import('@/modules/notifications')>();
  return {
    ...actual,
    markReadByData: vi.fn(actual.markReadByData),
  };
});

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  vi.mocked(markReadByData).mockClear();
});

describe('markThreadRead', () => {
  it('upserts the read row, marks the message notifications read, and clears unread', async () => {
    const seeded = await seedThread(t.db);
    const viewer = seekerViewer(seeded.seekerId);
    await t.db
      .update(threads)
      .set({ lastToSeekerAt: new Date(Date.now() - 60_000) })
      .where(eq(threads.id, seeded.threadId));

    const before = await listThreads(t.db, viewer);
    expect(before.items.find((item) => item.threadId === seeded.threadId)?.unread).toBe(true);

    await markThreadRead(t.db, viewer, seeded.threadId);

    const [read] = await t.db
      .select()
      .from(threadReads)
      .where(eq(threadReads.threadId, seeded.threadId));
    expect(read?.userId).toBe(seeded.seekerId);
    expect(markReadByData).toHaveBeenCalledWith(t.db, seeded.seekerId, {
      types: ['messages.new'],
      key: 'threadId',
      value: seeded.threadId,
    });
    const after = await listThreads(t.db, viewer);
    expect(after.items.find((item) => item.threadId === seeded.threadId)?.unread).toBe(false);
  });
});
