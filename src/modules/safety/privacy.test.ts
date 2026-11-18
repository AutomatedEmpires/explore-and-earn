// The safety privacy handler and retention rule (SP4 spec 10, plan Task 26): export, erase for
// a user and an org, legal holds and the 12-month report rule. An export holds only what the
// subject did: never a block or a mute someone else made about them.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { resetSp2 } from '@tests/fakes/sp4/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedOrg, seedUser } from '@tests/helpers/sp4';
import { block, mute, privacyHandler, retentionRules } from './index';

vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);

const NOW = new Date('2026-11-18T12:00:00Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  resetSp2();
});

type World = {
  seekerId: string;
  otherSeekerId: string;
  orgId: string;
  memberId: string;
  otherOrgId: string;
  reportId: string;
  orgReportId: string;
};

async function insertReport(i: {
  reporterUserId: string;
  reporterOrgId?: string;
  subjectId: string;
  createdAt?: string;
}): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.reports (id, reporter_user_id, reporter_org_id, subject_type, subject_id,
      reason, details, created_at)
    values (${id}, ${i.reporterUserId}, ${i.reporterOrgId ?? null}, 'listing', ${i.subjectId},
      'scam', 'They asked for a deposit.', ${i.createdAt ?? '2026-10-01T00:00:00Z'}::timestamptz)
  `);
  return id;
}

/**
 * A seeker who blocked one org, was blocked by another, blocked a person, muted an org and
 * filed a report; and an org whose member blocked a different seeker and filed a report.
 */
async function world(): Promise<World> {
  const seekerId = (await seedUser(t.db, { accountType: 'seeker' })).id;
  const otherSeekerId = (await seedUser(t.db, { accountType: 'seeker' })).id;
  const { orgId } = await seedOrg(t.db);
  const { orgId: otherOrgId } = await seedOrg(t.db, { name: 'Glacier Bay Tours' });
  const memberId = (await seedUser(t.db, { accountType: 'host' })).id;

  await block(t.db, { type: 'user', id: seekerId }, { type: 'org', id: orgId }, seekerId);
  await block(t.db, { type: 'org', id: otherOrgId }, { type: 'user', id: seekerId }, memberId);
  await block(t.db, { type: 'user', id: seekerId }, { type: 'user', id: otherSeekerId }, seekerId);
  await block(t.db, { type: 'org', id: orgId }, { type: 'user', id: otherSeekerId }, memberId);
  await mute(t.db, { userId: seekerId, orgId: otherOrgId });
  await mute(t.db, { userId: otherSeekerId, orgId });

  const reportId = await insertReport({ reporterUserId: seekerId, subjectId: newId() });
  const orgReportId = await insertReport({
    reporterUserId: memberId,
    reporterOrgId: orgId,
    subjectId: newId(),
  });
  return { seekerId, otherSeekerId, orgId, memberId, otherOrgId, reportId, orgReportId };
}

function erase(s: PrivacySubject, holds: HoldScope[] = []) {
  return withTx(t.db, (tx) => privacyHandler.erase(tx, s, { requestId: newId(), now: NOW, holds }));
}

async function count(q: ReturnType<typeof sql>): Promise<number> {
  const [row] = await queryRows<{ n: number }>(t.db, q);
  return row?.n ?? 0;
}

const blocksOf = (id: string) =>
  count(sql`select count(*)::int as n from app.blocks where blocker_id = ${id} or blocked_id = ${id}`);
const mutesOf = (id: string) =>
  count(sql`select count(*)::int as n from app.mutes where seeker_user_id = ${id} or org_id = ${id}`);

async function reporterOf(reportId: string) {
  const [row] = await queryRows<{ reporter_user_id: string | null; reporter_org_id: string | null }>(
    t.db,
    sql`select reporter_user_id, reporter_org_id from app.reports where id = ${reportId}`,
  );
  return row;
}

describe('exportData', () => {
  it("exports a user's own blocks, mutes and reports, never a block made against them", async () => {
    const w = await world();
    const part = await privacyHandler.exportData(t.db, { kind: 'user', userId: w.seekerId });
    expect(part.files).toEqual([]);
    // Oldest first. The other org's block of the seeker is not the seeker's data.
    expect(part.records.blocks).toEqual([
      { targetType: 'org', targetId: w.orgId, blockedAt: expect.any(String) },
      { targetType: 'user', targetId: w.otherSeekerId, blockedAt: expect.any(String) },
    ]);
    expect(JSON.stringify(part.records.blocks)).not.toContain(w.otherOrgId);
    expect(JSON.stringify(part.records)).not.toContain(w.memberId);
    expect(part.records.mutes).toEqual([{ orgId: w.otherOrgId, mutedAt: expect.any(String) }]);
    expect(part.records.reports).toEqual([
      {
        reportId: w.reportId,
        subjectType: 'listing',
        subjectId: expect.any(String),
        reason: 'scam',
        details: 'They asked for a deposit.',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
  });

  it("exports an org's own blocks and reports, and none of the seekers' mutes of it", async () => {
    const w = await world();
    const part = await privacyHandler.exportData(t.db, { kind: 'org', orgId: w.orgId });
    expect(part.records.blocks).toEqual([
      { targetType: 'user', targetId: w.otherSeekerId, blockedAt: expect.any(String) },
    ]);
    expect(part.records.mutes).toEqual([]);
    expect((part.records.reports as { reportId: string }[]).map((r) => r.reportId)).toEqual([
      w.orgReportId,
    ]);
  });
});

describe('erase', () => {
  it('a user: deletes their blocks and mutes both ways, and keeps their report without them', async () => {
    const w = await world();
    const first = await erase({ kind: 'user', userId: w.seekerId });
    expect(await blocksOf(w.seekerId)).toBe(0);
    expect(await mutesOf(w.seekerId)).toBe(0);
    expect(await reporterOf(w.reportId)).toEqual({ reporter_user_id: null, reporter_org_id: null });
    // 3 blocks, 1 mute and 1 report unlinked.
    expect(first.erased).toBe(5);
    expect(first.retained).toEqual([
      { table: 'reports', reason: 'safety', until: '2027-10-01T00:00:00.000Z' },
    ]);
    // Other people's rows stay.
    expect(await blocksOf(w.otherSeekerId)).toBe(1);
    expect(await reporterOf(w.orgReportId)).toEqual({
      reporter_user_id: w.memberId,
      reporter_org_id: w.orgId,
    });

    const second = await erase({ kind: 'user', userId: w.seekerId });
    expect(second.erased).toBe(0);
  });

  it('an org: deletes its blocks and the mutes of it, and unlinks its reports', async () => {
    const w = await world();
    const result = await erase({ kind: 'org', orgId: w.orgId });
    expect(await blocksOf(w.orgId)).toBe(0);
    expect(await mutesOf(w.orgId)).toBe(0);
    expect(await reporterOf(w.orgReportId)).toEqual({
      reporter_user_id: w.memberId,
      reporter_org_id: null,
    });
    // The seeker's block of the org, the org's block of the other seeker, the other seeker's
    // mute, and one report unlinked.
    expect(result.erased).toBe(4);
    expect(result.retained).toEqual([
      { table: 'reports', reason: 'safety', until: '2027-10-01T00:00:00.000Z' },
    ]);
    expect(await blocksOf(w.otherOrgId)).toBe(1);
    expect((await erase({ kind: 'org', orgId: w.orgId })).erased).toBe(0);
  });

  it('a hold on reports keeps the reporter, and the blocks and mutes still go', async () => {
    const w = await world();
    const result = await erase({ kind: 'user', userId: w.seekerId }, ['reports']);
    expect(await reporterOf(w.reportId)).toEqual({
      reporter_user_id: w.seekerId,
      reporter_org_id: null,
    });
    expect(await blocksOf(w.seekerId)).toBe(0);
    expect(await mutesOf(w.seekerId)).toBe(0);
    expect(result.retained).toEqual([{ table: 'reports', reason: 'legal_hold', until: null }]);

    const org = await erase({ kind: 'org', orgId: w.orgId }, ['reports']);
    expect((await reporterOf(w.orgReportId))?.reporter_org_id).toBe(w.orgId);
    expect(org.retained).toEqual([{ table: 'reports', reason: 'legal_hold', until: null }]);
  });

  it('a hold on everything touches nothing', async () => {
    const w = await world();
    const blocksBefore = await blocksOf(w.seekerId);
    const mutesBefore = await mutesOf(w.seekerId);
    const result = await erase({ kind: 'user', userId: w.seekerId }, ['all']);
    expect(result).toEqual({
      erased: 0,
      retained: [
        { table: 'reports', reason: 'legal_hold', until: null },
        { table: 'blocks', reason: 'legal_hold', until: null },
        { table: 'mutes', reason: 'legal_hold', until: null },
      ],
    });
    expect(await blocksOf(w.seekerId)).toBe(blocksBefore);
    expect(await mutesOf(w.seekerId)).toBe(mutesBefore);
    expect((await reporterOf(w.reportId))?.reporter_user_id).toBe(w.seekerId);
  });

  it('keeps nothing for someone with no safety records', async () => {
    const nobody = (await seedUser(t.db, { accountType: 'seeker' })).id;
    expect(await erase({ kind: 'user', userId: nobody })).toEqual({ erased: 0, retained: [] });
  });
});

describe('retention', () => {
  it('safety.reports_12m deletes only reports older than 12 months', async () => {
    const rule = retentionRules.find((r) => r.key === 'safety.reports_12m');
    expect(rule).toBeDefined();
    const reporter = (await seedUser(t.db, { accountType: 'seeker' })).id;
    const old = await insertReport({
      reporterUserId: reporter,
      subjectId: newId(),
      createdAt: '2025-10-18T12:00:00Z',
    });
    const recent = await insertReport({
      reporterUserId: reporter,
      subjectId: newId(),
      createdAt: '2025-12-18T12:00:00Z',
    });
    const before = await count(sql`select count(*)::int as n from app.reports`);
    const result = await rule?.run(t.db, NOW, 100);
    expect(result?.deleted).toBeGreaterThanOrEqual(1);
    expect(await count(sql`select count(*)::int as n from app.reports where id = ${old}`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from app.reports where id = ${recent}`)).toBe(1);
    expect(await count(sql`select count(*)::int as n from app.reports`)).toBe(
      before - (result?.deleted ?? 0),
    );
    expect((await rule?.run(t.db, NOW, 100))?.deleted).toBe(0);
  });

  it('safety.reports_12m deletes at most the limit', async () => {
    const rule = retentionRules.find((r) => r.key === 'safety.reports_12m');
    const reporter = (await seedUser(t.db, { accountType: 'seeker' })).id;
    for (let i = 0; i < 3; i++) {
      await insertReport({ reporterUserId: reporter, subjectId: newId(), createdAt: '2025-01-01T00:00:00Z' });
    }
    expect((await rule?.run(t.db, NOW, 2))?.deleted).toBe(2);
    expect((await rule?.run(t.db, NOW, 2))?.deleted).toBe(1);
  });
});
