import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { releaseLegalHold, setLegalHold, type HoldScope } from '@/modules/privacy';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedMedia } from '../../../tests/helpers/sp2';
import { seedHostOrg, seedOperator, seedSeeker } from '../../../tests/helpers/sp8';
import { retentionRules } from './index';

const NOW = new Date('2026-11-03T17:00:00.000Z');
/** Exactly 12 calendar months before NOW. */
const LIMIT = new Date('2025-11-03T17:00:00.000Z');
const before = (ms: number) => new Date(LIMIT.getTime() - ms);

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.business_verifications`);
  await t.db.execute(sql`delete from app.review_items`);
  await t.db.execute(sql`delete from app.trust_checks`);
});

async function seedCheck(
  createdAt: Date,
  subject: { type: string; id: string } = { type: 'listing', id: newId() },
): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.trust_checks (id, kind, subject_type, subject_id, provider, model,
      prompt_version, reason, decision, latency_ms, created_at)
    values (${id}, 'text_safety', ${subject.type}, ${subject.id}, 'stub', 'stub', 'v1', 'ok',
      'approved', 5, ${createdAt.toISOString()}::timestamptz)
  `);
  return id;
}

async function seedItem(
  checkId: string,
  status: 'open' | 'resolved',
  subject: { type: string; id: string } = { type: 'listing', id: newId() },
): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.review_items (id, queue, status, subject_type, subject_id, check_id, reason,
      sla_due_at, resolution, resolved_at)
    values (${id}, 'moderation', ${status}, ${subject.type}, ${subject.id}, ${checkId}, 'flagged',
      ${NOW.toISOString()}::timestamptz,
      ${status === 'resolved' ? 'approve' : null},
      ${status === 'resolved' ? NOW.toISOString() : null}::timestamptz)
  `);
  return id;
}

async function checks(): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(t.db, sql`select id from app.trust_checks`);
  return rows.map((row) => row.id).sort();
}

const [rule] = retentionRules;
if (!rule) throw new Error('trust registers no retention rule');

describe('trust.checks_12m', () => {
  it('is the only trust rule, with the exact description', () => {
    expect(retentionRules.map((r) => r.key)).toEqual(['trust.checks_12m']);
    expect(rule.description).toBe(
      'Records of automatic safety checks are deleted after 12 months.',
    );
  });

  it('keeps a check exactly 12 months old and deletes one 1 ms older', async () => {
    const atLimit = await seedCheck(LIMIT);
    await seedCheck(before(1));

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await checks()).toEqual([atLimit]);
  });

  it('deletes at most `limit` rows', async () => {
    for (let i = 0; i < 3; i++) await seedCheck(before(1000 + i));

    expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    expect(await checks()).toHaveLength(1);
  });

  it('keeps an old check that an unresolved review item still references', async () => {
    const held = await seedCheck(before(5000));
    await seedItem(held, 'open');

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 0 });
    expect(await checks()).toEqual([held]);
  });

  it('deletes an old check whose review item is resolved, and keeps the item', async () => {
    const done = await seedCheck(before(5000));
    const itemId = await seedItem(done, 'resolved');

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await checks()).toEqual([]);
    const [item] = await queryRows<{ check_id: string | null; reason: string }>(
      t.db,
      sql`select check_id, reason from app.review_items where id = ${itemId}`,
    );
    expect(item).toEqual({ check_id: null, reason: 'flagged' });
  });

  it("keeps an old check another module's row still points at", async () => {
    const referenced = await seedCheck(before(5000));
    const unreferenced = await seedCheck(before(5000));
    const orgId = newId();
    await t.db.execute(
      sql`insert into app.organizations (id, clerk_org_id, name, slug)
          values (${orgId}, ${orgId}, 'Org', ${orgId})`,
    );
    await t.db.execute(sql`
      insert into app.business_verifications (id, org_id, check_id)
      values (${newId()}, ${orgId}, ${referenced})
    `);

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await checks()).toEqual([referenced]);
    expect(await checks()).not.toContain(unreferenced);
  });

  describe('legal holds (lead decision 2026-11-18)', () => {
    let operatorId: string;

    beforeAll(async () => {
      operatorId = (await seedOperator(t.db, { role: 'owner' })).userId;
    });

    const hold = async (subject: { userId: string } | { orgId: string }, scope: HoldScope) =>
      (
        await setLegalHold(
          t.db,
          {
            ...subject,
            scope,
            reason: 'Fraud investigation 26-311',
            reviewAt: '2026-12-01',
            operatorId,
          },
          NOW,
        )
      ).holdId;

    it('keeps a check about a held person or organization, or about what they own, and deletes the rest', async () => {
      const old = before(5000);
      const heldOrg = await seedHostOrg(t.db);
      await hold({ orgId: heldOrg.orgId }, 'reports');
      const heldSeeker = (await seedSeeker(t.db)).userId;
      await hold({ userId: heldSeeker }, 'messages');
      const freeOrg = await seedHostOrg(t.db);
      const freeSeeker = (await seedSeeker(t.db)).userId;

      const kept = [
        await seedCheck(old, { type: 'seeker_profile', id: heldSeeker }),
        await seedCheck(old, { type: 'user', id: heldSeeker }),
        await seedCheck(old, { type: 'organization', id: heldOrg.orgId }),
        await seedCheck(old, { type: 'host_page', id: heldOrg.orgId }),
        await seedCheck(old, { type: 'business_verification', id: heldOrg.orgId }),
        await seedCheck(old, {
          type: 'media',
          id: await seedMedia(t.db, heldOrg.orgId, 'listing_photo'),
        }),
      ];
      // The review's case: the check behind a resolved review item about a held host.
      const behindItem = await seedCheck(old);
      const itemId = await seedItem(behindItem, 'resolved', {
        type: 'organization',
        id: heldOrg.orgId,
      });

      const gone = [
        await seedCheck(old, { type: 'seeker_profile', id: freeSeeker }),
        await seedCheck(old, { type: 'host_page', id: freeOrg.orgId }),
        await seedCheck(old, {
          type: 'media',
          id: await seedMedia(t.db, freeOrg.orgId, 'listing_photo'),
        }),
        await seedCheck(old),
      ];

      expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: gone.length });
      expect(await checks()).toEqual([...kept, behindItem].sort());
      const [item] = await queryRows<{ check_id: string | null }>(
        t.db,
        sql`select check_id from app.review_items where id = ${itemId}`,
      );
      expect(item?.check_id).toBe(behindItem);
    });

    it('reaches the checks behind more held ones than one batch holds', async () => {
      const held = await seedHostOrg(t.db);
      await hold({ orgId: held.orgId }, 'all');
      const free = await seedHostOrg(t.db);
      const heldFiles = [];
      for (let i = 0; i < 3; i++) {
        heldFiles.push(
          await seedCheck(before(9000 - i), {
            type: 'media',
            id: await seedMedia(t.db, held.orgId, 'listing_photo'),
          }),
        );
      }
      // Newer than every held check, so a single batch of 2 would only see held ones.
      const behind = await seedCheck(before(1000), {
        type: 'media',
        id: await seedMedia(t.db, free.orgId, 'listing_photo'),
      });

      expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 1 });
      expect(await checks()).toEqual([...heldFiles].sort());
      expect(await checks()).not.toContain(behind);
    });

    it('deletes the held checks on the next run once the hold is released', async () => {
      const seeker = (await seedSeeker(t.db)).userId;
      const holdId = await hold({ userId: seeker }, 'all');
      await seedCheck(before(5000), { type: 'user', id: seeker });

      expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 0 });
      await releaseLegalHold(t.db, { holdId, operatorId }, NOW);
      expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
      expect(await checks()).toEqual([]);
    });
  });
});
