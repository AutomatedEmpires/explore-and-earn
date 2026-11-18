import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { applyLaunchDate } from '@/modules/billing';
import '@/modules/billing';
import { countActiveListings } from '@/modules/listings';
import { getOrgStatus, getOwnershipSummary, setOrgStatus } from '@/modules/orgs';
import { decide, openReviewItem } from '@/modules/trust';
import { seedOperator } from '../helpers/sp8';
import { createTestDb, type TestDb } from '../../tests/helpers/db';
import { seedHostOrg, seedListingRow, seedMember } from '../../tests/helpers/sp2';
import * as billing from '@/modules/billing';
import * as entitlements from '@/modules/entitlements';
import * as hostpages from '@/modules/hostpages';
import * as listings from '@/modules/listings';
import * as locations from '@/modules/locations';
import * as orgs from '@/modules/orgs';
import * as verification from '@/modules/verification';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`
    truncate app.review_actions, app.review_notes, app.review_items, app.business_verifications,
      app.listings, app.subscriptions, app.org_memberships, app.organizations, app.operators,
      app.users, app.outbox cascade
  `);
});

const statusEvents = () =>
  queryRows<{
    topic: string;
    dedupe_key: string | null;
    payload: { eventId: string; data: { reviewItemId: string | null; reason: string | null; endsAt: string | null; status: string } };
  }>(
    t.db,
    sql`select topic, dedupe_key, payload from app.outbox
        where payload->>'event' = 'org.status_changed' and topic = 'listings.close_for_org'
        order by id`,
  );

describe('organization sanctions', () => {
  it('suspends with the decision meta, and a second item emits again', async () => {
    const org = await seedHostOrg(t.db);
    const operator = await seedOperator(t.db, { role: 'owner' });
    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const first = await openReviewItem(t.db, {
      queue: 'reports',
      subjectType: 'organization',
      subjectId: org.orgId,
      reason: 'scam',
      assigneeOperatorId: operator.userId,
    });
    await decide(t.db, first.id, operator.userId, 'suspend', {
      reason: 'Scam or fraud',
      endsAt,
    });
    expect(await getOrgStatus(t.db, org.orgId)).toBe('suspended');
    const [event] = await statusEvents();
    expect(event?.payload.data).toMatchObject({
      reviewItemId: first.id,
      reason: 'Scam or fraud',
      status: 'suspended',
      endsAt: endsAt.toISOString(),
    });

    const second = await openReviewItem(t.db, {
      queue: 'reports',
      subjectType: 'organization',
      subjectId: org.orgId,
      reason: 'again',
      assigneeOperatorId: operator.userId,
    });
    await decide(t.db, second.id, operator.userId, 'suspend', { reason: 'Scam or fraud', endsAt: null });
    expect(await getOrgStatus(t.db, org.orgId)).toBe('suspended');
    const events = await statusEvents();
    expect(events).toHaveLength(2);
    expect(events[1]?.payload.data).toMatchObject({
      reviewItemId: second.id,
      endsAt: null,
      status: 'suspended',
    });

    await setOrgStatus(t.db, org.orgId, 'suspended', { type: 'operator', id: operator.userId });
    expect(await statusEvents()).toHaveLength(2);
  });

  it('bans with a null end and a cancel job, and approve restores only a sanctioned org', async () => {
    const org = await seedHostOrg(t.db);
    const operator = await seedOperator(t.db, { role: 'owner' });
    const ban = await openReviewItem(t.db, {
      queue: 'reports',
      subjectType: 'organization',
      subjectId: org.orgId,
      reason: 'ban',
      assigneeOperatorId: operator.userId,
    });
    await decide(t.db, ban.id, operator.userId, 'ban', { reason: 'Scam or fraud' });
    expect(await getOrgStatus(t.db, org.orgId)).toBe('banned');
    const [event] = await statusEvents();
    expect(event?.payload.data.endsAt).toBeNull();
    const cancels = await queryRows<{ dedupe_key: string }>(
      t.db,
      sql`select dedupe_key from app.outbox where topic = 'billing.cancel_subscription'`,
    );
    expect(cancels.map((row) => row.dedupe_key)).toContain(`cancel:${org.orgId}:ban`);

    const restore = await openReviewItem(t.db, {
      queue: 'reports',
      subjectType: 'organization',
      subjectId: org.orgId,
      reason: 'restore',
      assigneeOperatorId: operator.userId,
    });
    await decide(t.db, restore.id, operator.userId, 'approve');
    expect(await getOrgStatus(t.db, org.orgId)).toBe('active');

    const quiet = await openReviewItem(t.db, {
      queue: 'reports',
      subjectType: 'organization',
      subjectId: org.orgId,
      reason: 'already active',
      assigneeOperatorId: operator.userId,
    });
    const before = (await statusEvents()).length;
    await decide(t.db, quiet.id, operator.userId, 'approve');
    expect(await statusEvents()).toHaveLength(before);
  });
});

describe('SP2 privacy registration and media ids', () => {
  it('moves linked verification items and extracts uuid strings', async () => {
    const org = await seedHostOrg(t.db);
    const linked = newId();
    const appeal = newId();
    const plain = newId();
    const runId = newId();
    await t.db.execute(sql`
      insert into app.review_items (id, queue, status, subject_type, subject_id, reason, sla_due_at)
      values
        (${linked}, 'fraud', 'open', 'organization', ${org.orgId}, 'verify', now()),
        (${appeal}, 'appeals', 'open', 'organization', ${org.orgId}, 'appeal', now()),
        (${plain}, 'reports', 'open', 'organization', ${org.orgId}, 'other', now())
    `);
    await t.db.execute(sql`
      update app.review_items set original_item_id = ${linked} where id = ${appeal}
    `);
    await t.db.execute(sql`
      insert into app.business_verifications (id, org_id, review_item_id)
      values (${runId}, ${org.orgId}, ${linked})
    `);
    await t.db.execute(sql`
      update app.review_items
      set subject_type = 'business_verification'
      where subject_type = 'organization'
        and (
          id in (select review_item_id from app.business_verifications where review_item_id is not null)
          or original_item_id in (
            select review_item_id from app.business_verifications where review_item_id is not null
          )
        )
    `);
    const rows = await queryRows<{ id: string; subject_type: string }>(
      t.db,
      sql`select id, subject_type from app.review_items order by reason`,
    );
    const byId = new Map(rows.map((row) => [row.id, row.subject_type]));
    expect(byId.get(linked)).toBe('business_verification');
    expect(byId.get(appeal)).toBe('business_verification');
    expect(byId.get(plain)).toBe('organization');

    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '22222222-2222-4222-8222-222222222222';
    const [ids] = await queryRows<{ ids: string[] }>(
      t.db,
      sql`select app.jsonb_uuid_strings(${JSON.stringify({ a: { mediaId: u1 }, b: [u1, u2, 'x'] })}::jsonb) as ids`,
    );
    expect(ids?.ids.slice().sort()).toEqual([u1, u2].sort());

    const listingId = await seedListingRow(t.db, { orgId: org.orgId });
    await t.db.execute(sql`
      update app.listings set draft = ${JSON.stringify({ gallery: [u1] })}::jsonb where id = ${listingId}
    `);
    const [listing] = await queryRows<{ draft_media_ids: string[] }>(
      t.db,
      sql`select draft_media_ids from app.listings where id = ${listingId}`,
    );
    expect(listing?.draft_media_ids).toEqual([u1]);
  });

  it('counts other live members and active listings, and registers one handler per module', async () => {
    const org = await seedHostOrg(t.db);
    expect(await getOwnershipSummary(t.db, org.owner.userId)).toEqual([
      expect.objectContaining({ orgId: org.orgId, role: 'owner', otherMembers: 0 }),
    ]);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    expect((await getOwnershipSummary(t.db, org.owner.userId))[0]?.otherMembers).toBe(1);
    await t.db.execute(sql`
      update app.org_memberships set deleted_at = now() where user_id = ${recruiter.userId}
    `);
    expect((await getOwnershipSummary(t.db, org.owner.userId))[0]?.otherMembers).toBe(0);
    await t.db.execute(sql`update app.organizations set deleted_at = now() where id = ${org.orgId}`);
    expect(await getOwnershipSummary(t.db, org.owner.userId)).toEqual([]);

    const live = await seedHostOrg(t.db);
    await seedListingRow(t.db, { orgId: live.orgId });
    const second = await seedListingRow(t.db, { orgId: live.orgId });
    const third = await seedListingRow(t.db, { orgId: live.orgId });
    await t.db.execute(sql`
      update app.listings set state = 'active' where id in (${second}, ${third})
    `);
    expect(await countActiveListings(t.db)).toBe(2);

    for (const mod of [billing, entitlements, hostpages, listings, locations, orgs, verification]) {
      expect(mod.privacyHandler.module).toBeTypeOf('string');
      expect(Array.isArray(mod.retentionRules)).toBe(true);
      expect(mod).not.toHaveProperty('privacyHandlers');
    }
    expect(billing.privacyHandler.module).toBe('billing');
    expect(listings.privacyHandler.module).toBe('listings');
    expect(orgs.privacyHandler.module).toBe('orgs');
    expect(verification.privacyHandler.module).toBe('verification');
  });

  it('leaves founding trials where FD-7 put them', async () => {
    expect(await applyLaunchDate()).toEqual({ updated: 0, skipped: 0, failed: 0 });
  });
});
