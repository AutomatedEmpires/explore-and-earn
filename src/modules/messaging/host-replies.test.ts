// Host replies per application (legal review 7.3; issue 199). Messaging counts what a host's team
// sent each applicant, and registers that count with the silent-host check, so a new host that
// opens applications and answers by message is not reported as silent.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { checkSilentHost } from '@/modules/applications';
import { record } from '@/modules/audit';
import { SILENT_HOST_OPENED } from '@/modules/verification';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { safetyFake } from '@tests/fakes/sp5/sp4';
import './notification-types';
import { messages, threads } from './schema';
import { sendMessage } from './send';
import { seedSeeker, seedThread, type SeededThread } from './test-fixtures';
import { hostRepliesByApplication } from './threads';

vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));

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
});

type Sent = {
  senderType: 'host' | 'seeker' | 'system';
  kind?: 'text' | 'card' | 'event';
  scanState?: 'pending' | 'clear' | 'warn' | 'held' | 'removed';
};

async function post(threadId: string, senderUserId: string | null, rows: Sent[]): Promise<void> {
  for (const row of rows) {
    const kind = row.kind ?? 'text';
    await t.db.insert(messages).values({
      id: newId(),
      threadId,
      senderType: row.senderType,
      senderUserId: row.senderType === 'system' ? null : senderUserId,
      kind,
      body: kind === 'text' ? 'Hello' : null,
      cardType: kind === 'card' ? 'interview' : null,
      cardRefId: kind === 'card' ? newId() : null,
      eventCode: kind === 'event' ? 'application_submitted' : null,
      scanState: row.scanState ?? 'clear',
    });
  }
}

/** A thread for a new application of the seeded org. */
async function applicationThread(
  seeded: SeededThread,
): Promise<{ applicationId: string; threadId: string }> {
  const seeker = await seedSeeker(t.db);
  const applicationId = newId();
  const threadId = newId();
  await t.db.insert(threads).values({
    id: threadId,
    orgId: seeded.orgId,
    listingId: seeded.listingId,
    seekerUserId: seeker.userId,
    applicationId,
  });
  return { applicationId, threadId };
}

describe('hostRepliesByApplication', () => {
  it("counts what the org's team sent in each application's thread", async () => {
    const seeded = await seedThread(t.db);
    const answered = await applicationThread(seeded);
    const quiet = await applicationThread(seeded);
    await post(answered.threadId, seeded.ownerId, [
      { senderType: 'host' },
      { senderType: 'host', scanState: 'pending' },
      { senderType: 'host', scanState: 'warn' },
      { senderType: 'host', kind: 'card' },
      // Never reached the applicant.
      { senderType: 'host', scanState: 'held' },
      { senderType: 'host', scanState: 'removed' },
      // Not the host.
      { senderType: 'seeker' },
      { senderType: 'system', kind: 'event' },
    ]);
    await post(quiet.threadId, seeded.ownerId, [{ senderType: 'seeker' }]);
    // An invite thread with no application, and another org's application.
    await post(seeded.threadId, seeded.ownerId, [{ senderType: 'host' }]);
    const other = await seedThread(t.db);
    const theirs = await applicationThread(other);
    await post(theirs.threadId, other.ownerId, [{ senderType: 'host' }]);

    const asked = await hostRepliesByApplication(t.db, seeded.orgId, [
      answered.applicationId,
      quiet.applicationId,
      theirs.applicationId,
    ]);
    expect(Object.fromEntries(asked)).toEqual({
      [answered.applicationId]: 4,
      [quiet.applicationId]: 0,
      [theirs.applicationId]: 0,
    });

    const all = await hostRepliesByApplication(t.db, seeded.orgId);
    expect(Object.fromEntries(all)).toEqual({ [answered.applicationId]: 4 });
  });

  it('answers an empty map for no applications', async () => {
    const seeded = await seedThread(t.db);
    expect((await hostRepliesByApplication(t.db, seeded.orgId, [])).size).toBe(0);
  });
});

describe('the silent-host check, with messaging loaded', () => {
  const silentItems = (orgId: string) =>
    queryRows<{ reason: string }>(
      t.db,
      sql`select reason from app.review_items
          where subject_type = 'business_verification' and subject_id = ${orgId}
            and status in ('open', 'assigned', 'escalated')`,
    );

  async function opened(seeded: SeededThread, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await record(t.db, {
        actorType: 'user',
        actorId: seeded.ownerId,
        orgId: seeded.orgId,
        action: 'applications.snapshot_viewed',
        subjectType: 'application',
        subjectId: newId(),
      });
    }
  }

  it('raises no alert for a new host that opened 10 applications and replied', async () => {
    const seeded = await seedThread(t.db);
    const { threadId } = await applicationThread(seeded);
    await sendMessage(t.db, { kind: 'host', ctx: seeded.owner }, threadId, {
      clientId: newId(),
      body: 'Thanks for applying. Can you start Monday?',
    });
    await opened(seeded, SILENT_HOST_OPENED);
    await checkSilentHost(t.db, seeded.orgId);
    expect(await silentItems(seeded.orgId)).toEqual([]);
  });

  it('still alerts on a new host whose only reply the scan held', async () => {
    const seeded = await seedThread(t.db);
    const { threadId } = await applicationThread(seeded);
    await post(threadId, seeded.ownerId, [{ senderType: 'host', scanState: 'held' }]);
    await opened(seeded, SILENT_HOST_OPENED);
    await checkSilentHost(t.db, seeded.orgId);
    expect(await silentItems(seeded.orgId)).toEqual([{ reason: 'silent_host' }]);
  });
});
