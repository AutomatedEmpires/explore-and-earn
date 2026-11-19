// hiringItemOwners (#216): the batch owner lookup another module's retention rule uses to keep
// what a legal hold covers, without naming hiring's tables in raw SQL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import {
  seedEntry,
  seedHostOrg,
  seedInterview,
  seedInvite,
  seedMember,
  seedOffer,
  seedSeeker,
  seedThread,
} from '@tests/helpers/sp5';
import { hiringItemOwners } from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

type World = {
  orgId: string;
  staffId: string;
  seekerId: string;
  listingId: string;
  applicationId: string;
  threadId: string;
};

/** A host org with a recruiter, a seeker who applied, and the thread for that application. */
async function world(): Promise<World> {
  const org = await seedHostOrg(t.db);
  const staffId = (await seedMember(t.db, org.orgId, 'recruiter')).userId;
  const seekerId = (await seedSeeker(t.db)).userId;
  const listingId = newId();
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seekerId,
  });
  const threadId = await seedThread(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seekerId,
    applicationId,
  });
  return { orgId: org.orgId, staffId, seekerId, listingId, applicationId, threadId };
}

const sorted = (owners: { orgId: string; userIds: string[] } | undefined) =>
  owners && { orgId: owners.orgId, userIds: [...owners.userIds].sort() };

describe('hiringItemOwners', () => {
  it("names an invite's organization, the invited seeker and the person who sent it", async () => {
    const w = await world();
    const invite = await seedInvite(t.db, {
      orgId: w.orgId,
      listingId: w.listingId,
      seekerUserId: w.seekerId,
      sentBy: w.staffId,
    });

    const owners = await hiringItemOwners(t.db, 'invite', [invite]);

    expect(sorted(owners.get(invite))).toEqual({
      orgId: w.orgId,
      userIds: [w.seekerId, w.staffId].sort(),
    });
  });

  it("names an interview's organization, the candidate and the person who organized it", async () => {
    const w = await world();
    const interview = await seedInterview(t.db, {
      orgId: w.orgId,
      listingId: w.listingId,
      applicationId: w.applicationId,
      threadId: w.threadId,
      organizerUserId: w.staffId,
    });

    const owners = await hiringItemOwners(t.db, 'interview', [interview]);

    expect(sorted(owners.get(interview))).toEqual({
      orgId: w.orgId,
      userIds: [w.seekerId, w.staffId].sort(),
    });
  });

  it("names an offer's organization, the candidate and the person who made it", async () => {
    const w = await world();
    const offer = await seedOffer(t.db, {
      orgId: w.orgId,
      listingId: w.listingId,
      applicationId: w.applicationId,
      threadId: w.threadId,
      createdBy: w.staffId,
    });

    const owners = await hiringItemOwners(t.db, 'offer', [offer]);

    expect(sorted(owners.get(offer))).toEqual({
      orgId: w.orgId,
      userIds: [w.seekerId, w.staffId].sort(),
    });
  });

  it('keeps the organization and staff of an interview or offer whose application has no pipeline entry', async () => {
    const w = await world();
    const orphanApplication = newId();
    const interview = await seedInterview(t.db, {
      orgId: w.orgId,
      listingId: w.listingId,
      applicationId: orphanApplication,
      threadId: w.threadId,
      organizerUserId: w.staffId,
    });
    const offer = await seedOffer(t.db, {
      orgId: w.orgId,
      listingId: w.listingId,
      applicationId: orphanApplication,
      threadId: w.threadId,
      createdBy: w.staffId,
    });

    expect((await hiringItemOwners(t.db, 'interview', [interview])).get(interview)).toEqual({
      orgId: w.orgId,
      userIds: [w.staffId],
    });
    expect((await hiringItemOwners(t.db, 'offer', [offer])).get(offer)).toEqual({
      orgId: w.orgId,
      userIds: [w.staffId],
    });
  });

  it('answers only for the type asked, leaves out unknown and malformed ids, and reads nothing for none', async () => {
    const w = await world();
    const invite = await seedInvite(t.db, {
      orgId: w.orgId,
      listingId: w.listingId,
      seekerUserId: w.seekerId,
      sentBy: w.staffId,
    });

    expect([
      ...(await hiringItemOwners(t.db, 'invite', [invite, invite, newId(), 'x'])).keys(),
    ]).toEqual([invite]);
    expect(await hiringItemOwners(t.db, 'offer', [invite])).toEqual(new Map());
    expect(await hiringItemOwners(t.db, 'interview', [])).toEqual(new Map());
  });
});
