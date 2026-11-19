import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import {
  asDescribedResponses,
  candidatePoolEntries,
  candidatePoolRuns,
  invites,
  offers,
  pendingPasses,
  pipelineEntries,
} from './schema';
import { setLegalHold, type HoldScope } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedOperator } from '@tests/helpers/sp8';
import { FIXED_NOW, seedEntry, seedHostOrg, seedInvite, seedMedia, seedOffer, seedSeeker } from '@tests/helpers/sp5';
import { privacyHandler, retentionRules } from './privacy';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

describe('hiring privacy', () => {
  it('exports one seeker, erases their private rows, and keeps the pipeline', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    const listingId = newId();
    const applicationId = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      fitScore: 80,
    });
    await t.db
      .update(pipelineEntries)
      .set({ fitLines: [{ factor: 'pay', weight: 10, value: 1, text: 'Pay meets their expectations' }] })
      .where(eq(pipelineEntries.applicationId, applicationId));
    await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: other.userId, fitScore: 10 });
    await seedInvite(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      sentBy: org.owner.userId,
      note: 'Welcome',
    });
    const poolId = newId();
    await t.db.insert(candidatePoolEntries).values({
      id: poolId,
      listingId,
      orgId: org.orgId,
      seekerUserId: seeker.userId,
      eligible: true,
      computedAt: FIXED_NOW,
    });
    await t.db.insert(asDescribedResponses).values({
      id: newId(),
      applicationId,
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      eligibleVia: 'host_marked',
      asksHousing: true,
      asksMeals: false,
      housing: 'yes',
      pay: 'no',
    });
    const letter = await seedMedia(t.db, org.orgId, 'attachment');
    const offerId = await seedOffer(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId,
      threadId: newId(),
      createdBy: org.owner.userId,
    });
    await t.db.update(offers).set({ letterMediaId: letter }).where(eq(offers.id, offerId));

    const exported = await privacyHandler.exportData(t.db, { kind: 'user', userId: seeker.userId });
    expect(exported.records.fit).toEqual([
      expect.objectContaining({ applicationId, fitScore: 80 }),
    ]);
    expect(JSON.stringify(exported)).not.toContain(other.userId);
    expect(exported.files).toEqual([{ mediaId: letter, name: `offer-${offerId}.pdf` }]);

    const first = await t.db.transaction((tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: seeker.userId }, {
        requestId: 'req',
        now: FIXED_NOW,
        holds: [],
      }),
    );
    expect(first.erased).toBe(2);
    expect(first.retained).toEqual([
      { table: 'pipeline_entries', reason: 'shared_record', until: '2027-11-03' },
    ]);
    expect(await t.db.select().from(invites).where(eq(invites.seekerUserId, seeker.userId))).toHaveLength(0);
    expect(
      await t.db.select().from(candidatePoolEntries).where(eq(candidatePoolEntries.seekerUserId, seeker.userId)),
    ).toHaveLength(0);
    const [answer] = await t.db
      .select()
      .from(asDescribedResponses)
      .where(eq(asDescribedResponses.applicationId, applicationId));
    expect(answer?.seekerUserId).toBeNull();
    expect(answer?.housing).toBe('yes');
    expect(answer?.pay).toBe('no');
    const [kept] = await t.db
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, applicationId));
    expect(kept?.seekerUserId).toBe(seeker.userId);

    const second = await t.db.transaction((tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: seeker.userId }, {
        requestId: 'req-2',
        now: FIXED_NOW,
        holds: [],
      }),
    );
    expect(second).toEqual({ erased: 0, retained: first.retained });
  });

  it('deletes nothing while applications are on hold', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const listingId = newId();
    const inviteId = await seedInvite(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      sentBy: org.owner.userId,
    });
    const result = await t.db.transaction((tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: seeker.userId }, {
        requestId: 'hold',
        now: FIXED_NOW,
        holds: ['applications'],
      }),
    );
    expect(result).toEqual({
      erased: 0,
      retained: [{ table: 'pipeline_entries', reason: 'legal_hold', until: null }],
    });
    expect(await t.db.select().from(invites).where(eq(invites.id, inviteId))).toHaveLength(1);
  });

  it('nulls an invite note from 13 months ago and keeps one from 11 months ago', async () => {
    const org = await seedHostOrg(t.db);
    const older = await seedSeeker(t.db);
    const newer = await seedSeeker(t.db);
    const listingId = newId();
    const now = new Date('2027-06-15T00:00:00.000Z');
    const oldId = await seedInvite(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: older.userId,
      sentBy: org.owner.userId,
      note: 'old',
      expiresAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    const recentId = await seedInvite(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: newer.userId,
      sentBy: org.owner.userId,
      note: 'recent',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    const rule = retentionRules.find((item) => item.key === 'hiring.notes_12m');
    if (!rule) throw new Error('missing hiring.notes_12m');
    const result = await rule.run(t.db, now, 100);
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    const [oldRow] = await t.db.select().from(invites).where(eq(invites.id, oldId));
    const [recentRow] = await t.db.select().from(invites).where(eq(invites.id, recentId));
    expect(oldRow?.note).toBeNull();
    expect(recentRow?.note).toBe('recent');
  });

  it('keeps old notes whose organization or candidate is under a hold on applications or all', async () => {
    const operatorId = (await seedOperator(t.db, { role: 'owner' })).userId;
    const hold = (subject: { userId: string } | { orgId: string }, scope: HoldScope) =>
      setLegalHold(t.db, {
        ...subject,
        scope,
        reason: 'Discrimination complaint 26-77',
        reviewAt: '2099-01-01',
        operatorId,
      });
    const now = new Date('2027-06-15T00:00:00.000Z');
    const old = new Date('2026-05-01T00:00:00.000Z');
    const heldOrg = await seedHostOrg(t.db);
    await hold({ orgId: heldOrg.orgId }, 'applications');
    const org = await seedHostOrg(t.db);
    const heldSeeker = await seedSeeker(t.db);
    await hold({ userId: heldSeeker.userId }, 'all');
    const otherScope = await seedSeeker(t.db);
    await hold({ userId: otherScope.userId }, 'messages');
    const free = await seedSeeker(t.db);

    const invite = (orgId: string, sentBy: string, seekerUserId: string) =>
      seedInvite(t.db, { orgId, listingId: newId(), seekerUserId, sentBy, note: 'held?', expiresAt: old });
    /** An offer with a note on an application that closed 13 months before `now`. */
    async function offer(orgId: string, createdBy: string, seekerUserId: string): Promise<string> {
      const listingId = newId();
      const applicationId = await seedEntry(t.db, {
        orgId,
        listingId,
        seekerUserId,
        status: 'hired',
        appliedAt: old,
      });
      const id = await seedOffer(t.db, {
        orgId,
        listingId,
        applicationId,
        threadId: newId(),
        createdBy,
      });
      await t.db.update(offers).set({ note: 'held?' }).where(eq(offers.id, id));
      return id;
    }

    const keptInvites = [
      await invite(heldOrg.orgId, heldOrg.owner.userId, free.userId),
      await invite(org.orgId, org.owner.userId, heldSeeker.userId),
    ];
    const clearedInvites = [
      await invite(org.orgId, org.owner.userId, otherScope.userId),
      await invite(org.orgId, org.owner.userId, free.userId),
    ];
    const keptOffers = [
      await offer(heldOrg.orgId, heldOrg.owner.userId, free.userId),
      await offer(org.orgId, org.owner.userId, heldSeeker.userId),
    ];
    const clearedOffers = [await offer(org.orgId, org.owner.userId, free.userId)];

    const rule = retentionRules.find((item) => item.key === 'hiring.notes_12m');
    if (!rule) throw new Error('missing hiring.notes_12m');
    await rule.run(t.db, now, 100);

    const noteOf = async (table: typeof invites | typeof offers, id: string) =>
      (await t.db.select({ note: table.note }).from(table).where(eq(table.id, id)))[0]?.note;
    for (const id of keptInvites) expect(await noteOf(invites, id)).toBe('held?');
    for (const id of clearedInvites) expect(await noteOf(invites, id)).toBeNull();
    for (const id of keptOffers) expect(await noteOf(offers, id)).toBe('held?');
    for (const id of clearedOffers) expect(await noteOf(offers, id)).toBeNull();
  });

  it('erases an org pool and pending passes', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const listingId = newId();
    const applicationId = await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: seeker.userId });
    await t.db.insert(candidatePoolRuns).values({
      listingId,
      orgId: org.orgId,
      listingRevisionId: newId(),
      weightsVersion: 'fit_weights@test',
      candidateCount: 0,
      computedAt: FIXED_NOW,
    });
    await t.db.insert(candidatePoolEntries).values({
      id: newId(),
      listingId,
      orgId: org.orgId,
      seekerUserId: seeker.userId,
      eligible: true,
      computedAt: FIXED_NOW,
    });
    await t.db.insert(pendingPasses).values({
      applicationId,
      orgId: org.orgId,
      actorUserId: org.owner.userId,
      commitAt: FIXED_NOW,
    });
    const result = await t.db.transaction((tx) =>
      privacyHandler.erase(tx, { kind: 'org', orgId: org.orgId }, { requestId: 'org', now: FIXED_NOW, holds: [] }),
    );
    expect(result.erased).toBe(3);
    expect(await t.db.select().from(candidatePoolRuns).where(eq(candidatePoolRuns.orgId, org.orgId))).toHaveLength(0);
    expect(await t.db.select().from(pendingPasses).where(eq(pendingPasses.applicationId, applicationId))).toHaveLength(0);
    expect(await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId))).toHaveLength(1);
  });
});
