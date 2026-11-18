import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { ClassifyOptions } from '@/lib/ai';
import { runWorker } from '@/modules/jobs';
import { listOpenReviewItems } from '@/modules/trust';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { jobHandlers } from './jobs';
import './notification-types';
import { messages } from './schema';
import { sendMessage } from './send';
import { scanHostText } from './scan';
import { hostViewer, seedThread, seekerViewer } from './test-fixture';
import { getThread } from './threads';

const ai = vi.hoisted(() => ({
  override: null as null | ((o: ClassifyOptions<unknown>) => Promise<unknown>),
}));

vi.mock('@/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai')>();
  return {
    ...actual,
    classify: vi.fn((o: ClassifyOptions<unknown>) =>
      ai.override ? ai.override(o) : actual.classify(o),
    ),
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
  ai.override = null;
});

async function hostSend(body: string) {
  const seeded = await seedThread(t.db);
  const sent = await sendMessage(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'), seeded.threadId, {
    clientId: newId(),
    body,
  });
  return { seeded, messageId: sent.message.id };
}

async function scanPending(): Promise<void> {
  await runWorker(t.db, { handlers: jobHandlers });
}

describe('message scan', () => {
  it('delivers a flagged host message as a warning and opens one moderation item', async () => {
    const { seeded, messageId } = await hostSend('Send a deposit __flag__');
    await scanPending();
    const view = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(view.messages.find((message) => message.id === messageId)).toMatchObject({ warn: true });
    const items = await listOpenReviewItems(t.db, 'message', messageId);
    expect(items.filter((item) => item.queue === 'moderation')).toHaveLength(1);
  });

  it('keeps a pending host message off the seeker thread until the job runs', async () => {
    const { seeded, messageId } = await hostSend('On my way');
    const before = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(before.messages.map((message) => message.id)).not.toContain(messageId);
  });

  it('delivers a classifier failure as a warning, never as clear', async () => {
    ai.override = () => Promise.reject(new Error('classifier down'));
    const { seeded, messageId } = await hostSend('See you at the dock');
    await scanPending();
    const [row] = await t.db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.scanState).toBe('warn');
    const view = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(view.messages.find((message) => message.id === messageId)?.warn).toBe(true);
  });

  it('never shows a blocked host message to the seeker and does not notify them', async () => {
    const { seeded, messageId } = await hostSend('__block__');
    await scanPending();
    const view = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(view.messages.map((message) => message.id)).not.toContain(messageId);
    const [notes] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.notifications
          where user_id = ${seeded.seekerId} and type = 'messages.new'`,
    );
    expect(notes?.n).toBe(0);
  });

  it('opens one fraud item after three held texts from an org, and not a second on the fourth', async () => {
    const seeded = await seedThread(t.db);
    const ids = [newId(), newId(), newId(), newId()];
    for (const subjectId of ids) {
      await scanHostText(t.db, {
        subjectType: 'message',
        subjectId,
        text: '__block__',
        orgId: seeded.orgId,
      });
    }
    const fraud = await listOpenReviewItems(t.db, 'organization', seeded.orgId);
    expect(fraud.filter((item) => item.reason === 'repeated_scam_text')).toHaveLength(1);
    for (const subjectId of ids) {
      const items = await listOpenReviewItems(t.db, 'message', subjectId);
      expect(items.some((item) => item.reason === 'message_scam_held')).toBe(true);
    }
    const [audits] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.audit_events
          where org_id = ${seeded.orgId} and action = 'messaging.text_held'`,
    );
    expect(audits?.n).toBe(4);
  });
});
