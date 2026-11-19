// The verified-host gate on applicant messaging (legal review 7.1; lead decision of 2026-11-18 on
// issue 45; issue 199). A host the applicant gate refuses (never verified, running,
// needs_review, needs_info or failed) loses applicant messaging: no thread list, no thread read
// or attachment, no send and no bulk send, with the applicant list's 409. Its applicant keeps
// reading their own messages, in a thread that is read-only and reads `unavailable`, which never
// names verification.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { READ_ONLY } from '@/lib/messaging';
import { runWorker } from '@/modules/jobs';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { safetyFake } from '@tests/fakes/sp5/sp4';
import { getAttachmentUrl } from './attachments';
import { createBulkMessage } from './bulk';
import { requireMessagingAccess } from './gate';
import { jobHandlers } from './jobs';
import './notification-types';
import { bulkMessages, messages, threads } from './schema';
import { releaseMessage, sendHostMessage, sendMessage } from './send';
import {
  GATE_REFUSAL,
  GATED_STATUSES,
  seedAttachment,
  seedSeeker,
  seedThread,
  seekerViewer,
  setVerification,
  type SeededThread,
} from './test-fixtures';
import { getThread, listThreads, setThreadReadOnly } from './threads';

vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));
vi.mock('./scan', async (orig) => {
  const actual = await orig<typeof import('./scan')>();
  return { ...actual, scanHostText: vi.fn(actual.scanHostText) };
});

import * as scan from './scan';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await import('./register');
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  const saved = [...safetyFake.subjects];
  safetyFake.reset();
  for (const subject of saved) safetyFake.subjects.push(subject);
  vi.mocked(scan.scanHostText).mockClear();
});

async function refusal(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof AppError)) throw new Error(`expected an AppError, got ${String(err)}`);
  return err;
}

function shape(err: AppError) {
  return { status: err.status, code: err.code, message: err.message, details: err.details };
}

function owner(seeded: SeededThread) {
  return { kind: 'host', ctx: seeded.owner } as const;
}

async function stored(threadId: string) {
  return t.db.select().from(messages).where(eq(messages.threadId, threadId));
}

async function seekerSays(seeded: SeededThread, body: string): Promise<void> {
  await sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
    clientId: newId(),
    body,
  });
}

function expectRefusal(err: AppError, status: (typeof GATED_STATUSES)[number]): void {
  expect(shape(err)).toEqual({
    status: 409,
    code: 'conflict',
    message: GATE_REFUSAL[status],
    details: { reason: `verification_${status}` },
  });
}

// Messaging never imports hiring, tests included (tests/sp5/architecture.test.ts). The host
// threads route test holds this copy to the applicant list's own gate.
describe('the refusal', () => {
  it.each(GATED_STATUSES)("is the applicant list's 409 for %s", async (status) => {
    const seeded = await seedThread(t.db);
    await setVerification(t.db, seeded.orgId, status);
    expectRefusal(await refusal(requireMessagingAccess(t.db, seeded.orgId)), status);
  });

  it('lets a verified host through', async () => {
    const seeded = await seedThread(t.db);
    await expect(requireMessagingAccess(t.db, seeded.orgId)).resolves.toBeUndefined();
  });
});

describe('a host the gate refuses', () => {
  it.each(GATED_STATUSES)('lists no thread when %s', async (status) => {
    const seeded = await seedThread(t.db);
    await setVerification(t.db, seeded.orgId, status);
    expectRefusal(await refusal(listThreads(t.db, owner(seeded))), status);
  });

  it.each(GATED_STATUSES)(
    'reads no thread when %s, and the read touches nothing',
    async (status) => {
      const seeded = await seedThread(t.db);
      await seekerSays(seeded, 'My address is 12 Pine Road');
      // A block the host made: a read past the gate would stamp it on the thread.
      safetyFake.setBlocked(seeded.orgId, seeded.seekerId, 'org');
      await setVerification(t.db, seeded.orgId, status);
      expectRefusal(await refusal(getThread(t.db, owner(seeded), seeded.threadId)), status);
      const [row] = await t.db.select().from(threads).where(eq(threads.id, seeded.threadId));
      expect(row?.readOnlyReason).toBeNull();
    },
  );

  it.each(GATED_STATUSES)('sends nothing when %s', async (status) => {
    const seeded = await seedThread(t.db);
    await setVerification(t.db, seeded.orgId, status);
    const err = await refusal(
      sendMessage(t.db, owner(seeded), seeded.threadId, {
        clientId: newId(),
        body: 'Wire the fee',
      }),
    );
    expectRefusal(err, status);
    expect(await stored(seeded.threadId)).toEqual([]);
  });

  it.each(GATED_STATUSES)('opens no attachment when %s', async (status) => {
    const seeded = await seedThread(t.db);
    const mediaId = await seedAttachment(t.db, { ownerUserId: seeded.seekerId });
    await sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
      clientId: newId(),
      body: 'My ID',
      attachmentMediaIds: [mediaId],
    });
    await setVerification(t.db, seeded.orgId, status);
    const err = await refusal(getAttachmentUrl(t.db, owner(seeded), seeded.threadId, mediaId));
    expectRefusal(err, status);
  });

  it('reads, lists and sends again once verified', async () => {
    const seeded = await seedThread(t.db);
    await setVerification(t.db, seeded.orgId, 'failed');
    await refusal(getThread(t.db, owner(seeded), seeded.threadId));
    await setVerification(t.db, seeded.orgId, 'verified');
    const view = await getThread(t.db, owner(seeded), seeded.threadId);
    expect(view).toMatchObject({ readOnly: null, canSend: true });
    const list = await listThreads(t.db, owner(seeded));
    expect(list.items.map((item) => item.threadId)).toEqual([seeded.threadId]);
    await sendMessage(t.db, owner(seeded), seeded.threadId, {
      clientId: newId(),
      body: 'Hi again',
    });
    expect(await stored(seeded.threadId)).toHaveLength(1);
  });

  it.each(GATED_STATUSES)(
    'sends no system-queued host message when %s (the not-selected message, a bulk copy)',
    async (status) => {
      const seeded = await seedThread(t.db);
      await setVerification(t.db, seeded.orgId, status);
      const id = await withTx(t.db, (tx) =>
        sendHostMessage(tx, {
          threadId: seeded.threadId,
          senderUserId: seeded.ownerId,
          body: 'Thanks for applying',
        }),
      );
      expect(id).toBeNull();
      expect(await stored(seeded.threadId)).toEqual([]);
    },
  );

  it('holds a reply that was still in the scan when the gate refused the host', async () => {
    const seeded = await seedThread(t.db);
    const { message } = await sendMessage(t.db, owner(seeded), seeded.threadId, {
      clientId: newId(),
      body: 'Can you start Monday?',
    });
    await setVerification(t.db, seeded.orgId, 'failed');
    const [row] = await t.db.select().from(messages).where(eq(messages.id, message.id));
    if (!row) throw new Error('no message');
    expect(row.scanState).toBe('pending');
    await withTx(t.db, (tx) => releaseMessage(tx, row, 'pending', { scanState: 'clear' }));
    const [after] = await t.db.select().from(messages).where(eq(messages.id, message.id));
    expect(after?.scanState).toBe('held');
    const [thread] = await t.db.select().from(threads).where(eq(threads.id, seeded.threadId));
    expect(thread?.lastToSeekerAt).toBeNull();
    const notes = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.notifications
          where user_id = ${seeded.seekerId} and type = 'messages.new'`,
    );
    expect(notes[0]?.n).toBe(0);
  });
});

describe('a bulk message from a host the gate refuses', () => {
  async function applicants(orgId: string, listingId: string, count: number) {
    const applicationIds: string[] = [];
    for (let n = 0; n < count; n += 1) {
      const seeker = await seedSeeker(t.db);
      const applicationId = newId();
      await t.db.insert(threads).values({
        id: newId(),
        orgId,
        listingId,
        seekerUserId: seeker.userId,
        applicationId,
      });
      applicationIds.push(applicationId);
    }
    return applicationIds;
  }

  /** Every bulk-send job ever queued in this database. */
  async function bulkJobs(): Promise<number> {
    const [row] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox where topic = 'messaging.bulk_send'`,
    );
    return row?.n ?? 0;
  }

  it.each(GATED_STATUSES)(
    'is refused at create when %s, storing and queuing nothing',
    async (status) => {
      const seeded = await seedThread(t.db);
      const listingId = newId();
      const applicationIds = await applicants(seeded.orgId, listingId, 2);
      await setVerification(t.db, seeded.orgId, status);
      const queuedBefore = await bulkJobs();
      const err = await refusal(
        createBulkMessage(t.db, seeded.owner, {
          listingId,
          statuses: ['new'],
          body: 'Pay the training fee',
          applicationIds,
        }),
      );
      expectRefusal(err, status);
      expect(
        await t.db.select().from(bulkMessages).where(eq(bulkMessages.orgId, seeded.orgId)),
      ).toEqual([]);
      expect(await bulkJobs()).toBe(queuedBefore);
    },
  );

  it('sends no copy, and scans nothing, when the gate refuses the host before the job runs', async () => {
    const seeded = await seedThread(t.db);
    const listingId = newId();
    const applicationIds = await applicants(seeded.orgId, listingId, 2);
    const created = await createBulkMessage(t.db, seeded.owner, {
      listingId,
      statuses: ['new'],
      body: 'Still hiring',
      applicationIds,
    });
    expect(created.recipients).toBe(2);
    await setVerification(t.db, seeded.orgId, 'needs_info');
    await runWorker(t.db, { handlers: jobHandlers });
    expect(await t.db.select().from(messages).where(eq(messages.bulkId, created.bulkId))).toEqual(
      [],
    );
    expect(scan.scanHostText).not.toHaveBeenCalledWith(
      t.db,
      expect.objectContaining({ subjectId: created.bulkId }),
    );
    const [bulk] = await t.db
      .select()
      .from(bulkMessages)
      .where(eq(bulkMessages.id, created.bulkId));
    expect(bulk).toMatchObject({ scanState: 'pending', sentCount: 0 });
  });
});

describe('the seeker, while the gate refuses the host', () => {
  it.each(GATED_STATUSES)(
    'keeps reading their own messages when %s, read-only and neutral',
    async (status) => {
      const seeded = await seedThread(t.db);
      await seekerSays(seeded, 'Is the job still open?');
      await setVerification(t.db, seeded.orgId, status);
      const view = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
      expect(view.messages).toEqual([
        expect.objectContaining({ mine: true, body: 'Is the job still open?' }),
      ]);
      expect(view).toMatchObject({ readOnly: 'unavailable', canSend: false });
      expect(JSON.stringify(view)).not.toMatch(/verif/i);
    },
  );

  it('sees an open thread once the host is verified', async () => {
    const seeded = await seedThread(t.db);
    await setVerification(t.db, seeded.orgId, 'running');
    await setVerification(t.db, seeded.orgId, 'verified');
    const view = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(view).toMatchObject({ readOnly: null, canSend: true });
  });

  it('sees the thread as read-only in their list', async () => {
    const open = await seedThread(t.db);
    const refused = await seedThread(t.db);
    await setVerification(t.db, refused.orgId, 'failed');
    const mine = await listThreads(t.db, seekerViewer(refused.seekerId));
    expect(mine.items).toEqual([
      expect.objectContaining({ threadId: refused.threadId, readOnly: true }),
    ]);
    const theirs = await listThreads(t.db, seekerViewer(open.seekerId));
    expect(theirs.items).toEqual([
      expect.objectContaining({ threadId: open.threadId, readOnly: false }),
    ]);
  });

  it('cannot write into the thread, and is told only that it is read-only', async () => {
    const seeded = await seedThread(t.db);
    await setVerification(t.db, seeded.orgId, 'failed');
    const err = await refusal(
      sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
        clientId: newId(),
        body: 'Here is my bank account',
      }),
    );
    expect(shape(err)).toEqual({
      status: 409,
      code: 'conflict',
      message: READ_ONLY,
      details: { reason: 'read_only' },
    });
    expect(await stored(seeded.threadId)).toEqual([]);
  });

  it('still sees a withdrawal, or their own block, as it was', async () => {
    const withdrawn = await seedThread(t.db);
    await withTx(t.db, (tx) => setThreadReadOnly(tx, withdrawn.threadId, 'withdrawn'));
    await setVerification(t.db, withdrawn.orgId, 'failed');
    const a = await getThread(t.db, seekerViewer(withdrawn.seekerId), withdrawn.threadId);
    expect(a).toMatchObject({ readOnly: 'withdrawn', canSend: false });

    const blocked = await seedThread(t.db);
    safetyFake.setBlocked(blocked.orgId, blocked.seekerId, 'user');
    await setVerification(t.db, blocked.orgId, 'failed');
    const b = await getThread(t.db, seekerViewer(blocked.seekerId), blocked.threadId);
    expect(b).toMatchObject({ readOnly: 'blocked', canSend: false });
  });
});
