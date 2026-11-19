// Reports and the report subject registry (SP4 spec 8.7, plan Task 24): routing into the trust
// queues, the 7-day escalation, the 24-hour repeat window, the reason text, the reporter's
// notification and the audit row.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { fakeHost, fakeListing, resetSp2 } from '@tests/fakes/sp4/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedOrg, seedUser } from '@tests/helpers/sp4';
import { listReportsAbout, registerReportSubject, report } from './index';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp4/sp2')).listingsModule,
}));
vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);

let t: TestDb;
let orgId: string;
let listingId: string;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  resetSp2();
  ({ orgId } = await seedOrg(t.db));
  fakeHost(orgId, { name: 'Kettle Ridge Lodge' });
  ({ listingId } = fakeListing({ orgId, title: 'Deckhand' }));
});

async function seeker(): Promise<string> {
  return (await seedUser(t.db, { accountType: 'seeker' })).id;
}

type ItemRow = { queue: string; subject_type: string; subject_id: string; priority: number; reason: string };

async function item(reportId: string): Promise<ItemRow | undefined> {
  const [row] = await queryRows<ItemRow>(
    t.db,
    sql`select ri.queue, ri.subject_type, ri.subject_id, ri.priority, ri.reason
        from app.reports r join app.review_items ri on ri.id = r.review_item_id
        where r.id = ${reportId}`,
  );
  return row;
}

async function count(q: ReturnType<typeof sql>): Promise<number> {
  const [row] = await queryRows<{ n: number }>(t.db, q);
  return row?.n ?? 0;
}

describe('report', () => {
  it('opens one reports-queue item on the listing (E7)', async () => {
    const before = await count(
      sql`select count(*)::int as n from app.review_items where subject_id = ${listingId}`,
    );
    const r = await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'not_as_described',
      details: 'The pay is lower than the listing says.',
    });
    expect(r.created).toBe(true);
    expect(
      await count(
        sql`select count(*)::int as n from app.review_items where subject_id = ${listingId}`,
      ),
    ).toBe(before + 1);
    expect(await item(r.reportId)).toMatchObject({
      queue: 'reports',
      subject_type: 'listing',
      subject_id: listingId,
      priority: 0,
    });
  });

  it('routes a host report to the organization trust subject', async () => {
    const r = await report(t.db, { userId: await seeker() }, {
      subjectType: 'org',
      subjectId: orgId,
      reason: 'harassment',
    });
    expect(await item(r.reportId)).toMatchObject({
      queue: 'reports',
      subject_type: 'organization',
      subject_id: orgId,
    });
  });

  it('sends child safety to its own queue at priority 1000', async () => {
    const r = await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'child_safety',
    });
    expect(await item(r.reportId)).toMatchObject({ queue: 'child_safety', priority: 1000 });
  });

  it('raises the priority when a third distinct reporter reports within 7 days', async () => {
    const first = await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'scam',
    });
    const second = await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'scam',
    });
    const third = await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'spam',
    });
    expect((await item(first.reportId))?.priority).toBe(0);
    expect((await item(second.reportId))?.priority).toBe(0);
    expect((await item(third.reportId))?.priority).toBe(50);
  });

  it('does not count reports older than 7 days, or one reporter twice', async () => {
    const old = await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'scam',
    });
    await t.db.execute(
      sql`update app.reports set created_at = now() - interval '8 days' where id = ${old.reportId}`,
    );
    const repeat = await seeker();
    await report(t.db, { userId: repeat }, { subjectType: 'listing', subjectId: listingId, reason: 'scam' });
    const again = await report(t.db, { userId: repeat }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'spam',
    });
    expect(again.created).toBe(false);
    const latest = await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'scam',
    });
    expect((await item(latest.reportId))?.priority).toBe(0);
  });

  it('returns the first report for a repeat within 24 hours, and a new one after', async () => {
    const userId = await seeker();
    const input = { subjectType: 'listing', subjectId: listingId, reason: 'scam' } as const;
    const first = await report(t.db, { userId }, input);
    const repeat = await report(t.db, { userId }, { ...input, reason: 'spam' });
    expect(repeat).toEqual({ reportId: first.reportId, created: false });
    expect(
      await count(sql`select count(*)::int as n from app.reports where reporter_user_id = ${userId}`),
    ).toBe(1);

    await t.db.execute(
      sql`update app.reports set created_at = now() - interval '25 hours' where id = ${first.reportId}`,
    );
    const later = await report(t.db, { userId }, input);
    expect(later.created).toBe(true);
    expect(later.reportId).not.toBe(first.reportId);
  });

  it('refuses a subject type nobody registered, and an unknown subject', async () => {
    const userId = await seeker();
    await expect(
      report(t.db, { userId }, { subjectType: 'announcement', subjectId: newId(), reason: 'spam' }),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'unknown_subject_type' } });
    await expect(
      report(t.db, { userId }, { subjectType: 'listing', subjectId: newId(), reason: 'spam' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      report(t.db, { userId }, { subjectType: 'org', subjectId: newId(), reason: 'spam' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      await count(sql`select count(*)::int as n from app.reports where reporter_user_id = ${userId}`),
    ).toBe(0);
  });

  it('asks the reporter check once the subject exists, and refuses as for an unknown subject', async () => {
    const allowed = await seeker();
    const refused = await seeker();
    const subjectId = newId();
    const asked: { id: string; reporter: unknown }[] = [];
    registerReportSubject('community_post', {
      trustSubjectType: 'community_post',
      exists: async (_db, id) => id === subjectId,
      mayReport: async (_db, id, reporter) => {
        asked.push({ id, reporter });
        return reporter.userId === allowed;
      },
    });
    const input = { subjectType: 'community_post', subjectId, reason: 'spam' } as const;
    const refusal = async (p: Promise<unknown>) => {
      const err = (await p.then(
        () => ({}),
        (e: unknown) => e,
      )) as Record<string, unknown>;
      return { code: err.code, status: err.status, message: err.message, details: err.details };
    };

    const turnedDown = await refusal(report(t.db, { userId: refused, orgId }, input));
    const unknown = await refusal(report(t.db, { userId: refused }, { ...input, subjectId: newId() }));
    expect(turnedDown).toMatchObject({ code: 'not_found' });
    expect(turnedDown).toEqual(unknown);
    expect(
      await count(sql`select count(*)::int as n from app.reports where reporter_user_id = ${refused}`),
    ).toBe(0);

    const r = await report(t.db, { userId: allowed }, input);
    expect(r.created).toBe(true);
    expect(await item(r.reportId)).toMatchObject({
      subject_type: 'community_post',
      subject_id: subjectId,
    });
    // Asked with the reporter as given, and never about a subject that doesn't exist.
    expect(asked).toEqual([
      { id: subjectId, reporter: { userId: refused, orgId } },
      { id: subjectId, reporter: { userId: allowed } },
    ]);
  });

  it('quotes at most 500 characters of the details in the review reason', async () => {
    const details = 'x'.repeat(600);
    const r = await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'scam',
      details,
    });
    const reason = (await item(r.reportId))?.reason ?? '';
    expect(reason.startsWith('Report (Scam or fraud): "')).toBe(true);
    expect(reason.endsWith(`${'x'.repeat(500)}"`)).toBe(true);
    expect(reason).toBe(`Report (Scam or fraud): "${'x'.repeat(500)}"`);
    const [row] = await queryRows<{ details: string }>(
      t.db,
      sql`select details from app.reports where id = ${r.reportId}`,
    );
    expect(row?.details).toBe(details);
  });

  it('notifies the reporter once and audits only the subject type and reason', async () => {
    const userId = await seeker();
    const r = await report(t.db, { userId }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'asks_for_money',
      details: 'They asked me to pay for my uniform.',
    });
    await report(t.db, { userId }, { subjectType: 'listing', subjectId: listingId, reason: 'scam' });
    expect(
      await count(
        sql`select count(*)::int as n from app.notifications
            where user_id = ${userId} and type = 'safety.report_received'`,
      ),
    ).toBe(1);
    const audits = await queryRows<{ actor_id: string; data: unknown }>(
      t.db,
      sql`select actor_id, data from app.audit_events
          where action = 'safety.report_created' and subject_id = ${r.reportId}`,
    );
    expect(audits).toEqual([
      { actor_id: userId, data: { subjectType: 'listing', reason: 'asks_for_money' } },
    ]);
  });

  it('stores the org a host member reported for', async () => {
    const host = await seedUser(t.db, { accountType: 'host' });
    const target = await seeker();
    registerReportSubject('seeker_profile', {
      trustSubjectType: 'seeker_profile',
      exists: async (_db, id) => id === target,
    });
    const r = await report(t.db, { userId: host.id, orgId }, {
      subjectType: 'seeker_profile',
      subjectId: target,
      reason: 'harassment',
    });
    const [row] = await queryRows<{ reporter_user_id: string; reporter_org_id: string }>(
      t.db,
      sql`select reporter_user_id, reporter_org_id from app.reports where id = ${r.reportId}`,
    );
    expect(row).toEqual({ reporter_user_id: host.id, reporter_org_id: orgId });
    expect(await item(r.reportId)).toMatchObject({
      subject_type: 'seeker_profile',
      subject_id: target,
    });
  });
});

describe('listReportsAbout', () => {
  it('lists the reports on one subject, newest first, with their review items', async () => {
    const a = await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'scam',
      details: 'first',
    });
    await t.db.execute(
      sql`update app.reports set created_at = now() - interval '1 hour' where id = ${a.reportId}`,
    );
    const b = await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'spam',
    });
    const other = fakeListing({ orgId });
    await report(t.db, { userId: await seeker() }, {
      subjectType: 'listing',
      subjectId: other.listingId,
      reason: 'spam',
    });

    const rows = await listReportsAbout(t.db, { subjectType: 'listing', subjectId: listingId });
    expect(rows.map((r) => r.reportId)).toEqual([b.reportId, a.reportId]);
    expect(rows[1]).toMatchObject({
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'scam',
      details: 'first',
      reviewItemId: expect.any(String),
      createdAt: expect.any(Date),
    });
  });
});
