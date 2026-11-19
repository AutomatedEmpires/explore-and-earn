// messagingItemOwners (#216): the batch owner lookup another module's retention rule uses to
// keep what a legal hold covers, without naming messaging's tables in raw SQL.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedMember, seedSeeker, seedThread } from '@tests/helpers/sp5';
import { messagingItemOwners } from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

type World = {
  orgId: string;
  ownerId: string;
  staffId: string;
  seekerId: string;
  threadId: string;
};

/** A host org with an owner and a second member, a seeker, and one thread between them. */
async function world(): Promise<World> {
  const org = await seedHostOrg(t.db);
  const staffId = (await seedMember(t.db, org.orgId, 'recruiter')).userId;
  const seekerId = (await seedSeeker(t.db)).userId;
  const threadId = await seedThread(t.db, {
    orgId: org.orgId,
    listingId: newId(),
    seekerUserId: seekerId,
  });
  return { orgId: org.orgId, ownerId: org.owner.userId, staffId, seekerId, threadId };
}

async function seedMessage(
  threadId: string,
  sender: { type: 'seeker' | 'host' | 'system'; userId: string | null },
): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.messages (id, thread_id, sender_type, sender_user_id, kind, body)
    values (${id}, ${threadId}, ${sender.type}, ${sender.userId}, 'text', 'Hello')
  `);
  return id;
}

async function seedBulk(orgId: string, createdBy: string, threadIds: string[]): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.bulk_messages (id, org_id, listing_id, created_by, body, statuses,
      recipient_count, thread_ids, scan_state)
    values (${id}, ${orgId}, ${newId()}, ${createdBy}, 'Orientation is Monday at 9.',
      '{shortlisted}', ${threadIds.length},
      ${`{${threadIds.join(',')}}`}::uuid[], 'clear')
  `);
  return id;
}

describe('messagingItemOwners', () => {
  it("names a thread's organization and seeker", async () => {
    const w = await world();
    const other = await world();

    const owners = await messagingItemOwners(t.db, 'thread', [w.threadId, other.threadId]);

    expect(owners).toEqual(
      new Map([
        [w.threadId, { orgId: w.orgId, userIds: [w.seekerId] }],
        [other.threadId, { orgId: other.orgId, userIds: [other.seekerId] }],
      ]),
    );
  });

  it("names a message's thread organization and seeker, and the person who sent it", async () => {
    const w = await world();
    const fromHost = await seedMessage(w.threadId, { type: 'host', userId: w.staffId });
    const fromSeeker = await seedMessage(w.threadId, { type: 'seeker', userId: w.seekerId });
    const fromSystem = await seedMessage(w.threadId, { type: 'system', userId: null });

    const owners = await messagingItemOwners(t.db, 'message', [fromHost, fromSeeker, fromSystem]);

    expect(owners.get(fromHost)?.orgId).toBe(w.orgId);
    expect(owners.get(fromHost)?.userIds.sort()).toEqual([w.seekerId, w.staffId].sort());
    expect(owners.get(fromSeeker)).toEqual({ orgId: w.orgId, userIds: [w.seekerId] });
    expect(owners.get(fromSystem)).toEqual({ orgId: w.orgId, userIds: [w.seekerId] });
  });

  it("names a bulk message's organization, its sender and the seekers it went to", async () => {
    const w = await world();
    const secondSeeker = (await seedSeeker(t.db)).userId;
    const secondThread = await seedThread(t.db, {
      orgId: w.orgId,
      listingId: newId(),
      seekerUserId: secondSeeker,
    });
    const bulk = await seedBulk(w.orgId, w.staffId, [w.threadId, secondThread]);
    const unsent = await seedBulk(w.orgId, w.ownerId, []);

    const owners = await messagingItemOwners(t.db, 'bulk_message', [bulk, unsent]);

    expect(owners.get(bulk)?.orgId).toBe(w.orgId);
    expect(owners.get(bulk)?.userIds.sort()).toEqual([w.staffId, w.seekerId, secondSeeker].sort());
    expect(owners.get(unsent)).toEqual({ orgId: w.orgId, userIds: [w.ownerId] });
  });

  it('answers only for the type asked, leaves out unknown and malformed ids, and reads nothing for none', async () => {
    const w = await world();
    const message = await seedMessage(w.threadId, { type: 'seeker', userId: w.seekerId });

    expect([...(await messagingItemOwners(t.db, 'thread', [w.threadId, message])).keys()]).toEqual([
      w.threadId,
    ]);
    expect([
      ...(await messagingItemOwners(t.db, 'message', [message, newId(), 'not-a-uuid'])).keys(),
    ]).toEqual([message]);
    expect(await messagingItemOwners(t.db, 'bulk_message', [])).toEqual(new Map());
    expect(await messagingItemOwners(t.db, 'thread', ['not-a-uuid'])).toEqual(new Map());
  });
});
