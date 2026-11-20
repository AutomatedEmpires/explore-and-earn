import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { releaseLegalHold, setLegalHold, type HoldScope } from '@/modules/privacy';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedListingRow, seedMedia } from '../../../tests/helpers/sp2';
import {
  seedEntry,
  seedInterview,
  seedInvite,
  seedOffer,
  seedThread,
} from '../../../tests/helpers/sp5';
import { seedHostOrg, seedMember, seedOperator, seedSeeker } from '../../../tests/helpers/sp8';
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
  await t.db.execute(sql`delete from app.review_notes`);
  await t.db.execute(sql`delete from app.review_actions`);
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

/** The subject types whose owner their own module looks up (#216). */
type OwnedType = 'listing_revision' | 'message' | 'bulk_message' | 'invite' | 'interview' | 'offer';

/**
 * One of each item another module owns, for `orgId`: `staffId` submitted the listing revision,
 * sent the message and the bulk message, sent the invite, organized the interview and made the
 * offer; `seekerId` is on the thread, the invite and the application.
 */
async function ownedItems(
  orgId: string,
  staffId: string,
  seekerId: string,
): Promise<{ items: Record<OwnedType, string>; threadId: string }> {
  const listingId = newId();
  const revisionId = newId();
  await t.db.execute(sql`insert into app.listings (id, org_id) values (${listingId}, ${orgId})`);
  await t.db.execute(sql`
    insert into app.listing_revisions (
      id, listing_id, org_id, revision_number, status, content, title, primary_category, genre,
      occupation_code, employment_type, schedule, openings, date_mode, weekly_hours, pay_kind,
      pay_min_cents, pay_max_cents, pay_unit, housing_provided, meals_provided, visa_sponsorship,
      min_age, timezone, submitted_by
    ) values (
      ${revisionId}, ${listingId}, ${orgId}, 1, 'screening', '{}'::jsonb, 'Lift Operator',
      'seasonal', 'ski_resorts', 'lift_operator', 'employee', 'full_time', 1, 'ongoing', 40,
      'range', 1900, 2200, 'hour', false, false, 'none', 18, 'America/Denver', ${staffId}
    )
  `);
  const applicationId = await seedEntry(t.db, { orgId, listingId, seekerUserId: seekerId });
  const threadId = await seedThread(t.db, {
    orgId,
    listingId,
    seekerUserId: seekerId,
    applicationId,
  });
  const messageId = newId();
  await t.db.execute(sql`
    insert into app.messages (id, thread_id, sender_type, sender_user_id, kind, body)
    values (${messageId}, ${threadId}, 'host', ${staffId}, 'text', 'Bring cash for the deposit.')
  `);
  const bulkId = newId();
  await t.db.execute(sql`
    insert into app.bulk_messages (id, org_id, listing_id, created_by, body, statuses,
      recipient_count, thread_ids, scan_state)
    values (${bulkId}, ${orgId}, ${listingId}, ${staffId}, 'Orientation is Monday.',
      '{shortlisted}', 1, ${`{${threadId}}`}::uuid[], 'clear')
  `);
  const items = {
    listing_revision: revisionId,
    message: messageId,
    bulk_message: bulkId,
    invite: await seedInvite(t.db, { orgId, listingId, seekerUserId: seekerId, sentBy: staffId }),
    interview: await seedInterview(t.db, {
      orgId,
      listingId,
      applicationId,
      threadId,
      organizerUserId: staffId,
    }),
    offer: await seedOffer(t.db, { orgId, listingId, applicationId, threadId, createdBy: staffId }),
  };
  return { items, threadId };
}

/**
 * A host org with a recruiter and a seeker who applied, one of each owned item, and the thread
 * the message is in.
 */
async function ownedWorld(): Promise<{
  orgId: string;
  staffId: string;
  seekerId: string;
  items: Record<OwnedType, string>;
  threadId: string;
}> {
  const { orgId } = await seedHostOrg(t.db);
  const staffId = (await seedMember(t.db, orgId, 'recruiter')).userId;
  const seekerId = (await seedSeeker(t.db)).userId;
  return { orgId, staffId, seekerId, ...(await ownedItems(orgId, staffId, seekerId)) };
}

/** A check on each owned item, by subject type. */
async function checkEach(
  createdAt: Date,
  items: Record<OwnedType, string>,
): Promise<Record<OwnedType, string>> {
  const out = {} as Record<OwnedType, string>;
  for (const [type, id] of Object.entries(items) as [OwnedType, string][]) {
    out[type] = await seedCheck(createdAt, { type, id });
  }
  return out;
}

const [rule, itemRule] = retentionRules;
if (!rule) throw new Error('trust registers no retention rule');
if (!itemRule) throw new Error('trust registers no retention rule for review items (issue 233)');

describe('trust.checks_12m', () => {
  it('is the first of the two trust rules, with the exact description', () => {
    expect(retentionRules.map((r) => r.key)).toEqual([
      'trust.checks_12m',
      'trust.review_items_12m',
    ]);
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

    it('keeps a check on a listing revision, message, bulk message, invite, interview or offer that a held organization owns', async () => {
      const old = before(5000);
      const held = await ownedWorld();
      await hold({ orgId: held.orgId }, 'reports');
      const free = await ownedWorld();

      const kept = await checkEach(old, held.items);
      const gone = await checkEach(old, free.items);

      expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: Object.keys(gone).length });
      expect(await checks()).toEqual(Object.values(kept).sort());
    });

    it('keeps a check on an item a held person sent, made or submitted, of any hold scope', async () => {
      const old = before(5000);
      const world = await ownedWorld();
      await hold({ userId: world.staffId }, 'applications');

      const kept = await checkEach(old, world.items);

      expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 0 });
      expect(await checks()).toEqual(Object.values(kept).sort());
    });

    it('keeps a check on an item a held seeker is on; a revision names no seeker and goes', async () => {
      const old = before(5000);
      const world = await ownedWorld();
      await hold({ userId: world.seekerId }, 'messages');

      const { listing_revision: revision, ...onSeeker } = await checkEach(old, world.items);

      expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
      expect(await checks()).toEqual(Object.values(onSeeker).sort());
      expect(await checks()).not.toContain(revision);
    });

    it('keeps a check whose review item is about an item a held organization owns', async () => {
      const old = before(5000);
      const held = await ownedWorld();
      await hold({ orgId: held.orgId }, 'all');
      const free = await ownedWorld();

      const behindHeld = await seedCheck(old);
      await seedItem(behindHeld, 'resolved', { type: 'message', id: held.items.message });
      const behindFree = await seedCheck(old);
      await seedItem(behindFree, 'resolved', { type: 'offer', id: free.items.offer });

      expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
      expect(await checks()).toEqual([behindHeld]);
    });

    it('reaches the checks behind more held owned items than one batch holds', async () => {
      const held = await ownedWorld();
      await hold({ orgId: held.orgId }, 'all');
      const free = await ownedWorld();
      const heldChecks = [
        await seedCheck(before(9000), { type: 'message', id: held.items.message }),
        await seedCheck(before(8999), { type: 'invite', id: held.items.invite }),
        await seedCheck(before(8998), {
          type: 'listing_revision',
          id: held.items.listing_revision,
        }),
      ];
      // Newer than every held check, so a single batch of 2 would only see held ones.
      const behind = await seedCheck(before(1000), { type: 'offer', id: free.items.offer });

      expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 1 });
      expect(await checks()).toEqual([...heldChecks].sort());
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
describe('trust.review_items_12m', () => {
  let operatorId: string;

  beforeAll(async () => {
    operatorId = (await seedOperator(t.db, { role: 'owner' })).userId;
  });

  /** A review item: resolved at `resolvedAt`, or still open when that is null. */
  async function seedReview(
    resolvedAt: Date | null,
    o: {
      subject?: { type: string; id: string };
      checkId?: string;
      originalItemId?: string;
    } = {},
  ): Promise<string> {
    const id = newId();
    const subject = o.subject ?? { type: 'listing', id: newId() };
    const at = resolvedAt ? resolvedAt.toISOString() : null;
    await t.db.execute(sql`
      insert into app.review_items (id, queue, status, subject_type, subject_id, check_id, reason,
        sla_due_at, original_item_id, resolution, resolved_at, created_at)
      values (${id}, 'reports', ${at ? 'resolved' : 'open'}, ${subject.type}, ${subject.id},
        ${o.checkId ?? null}, 'Asked for a deposit by wire', ${NOW.toISOString()}::timestamptz,
        ${o.originalItemId ?? null}, ${at ? 'remove' : null}, ${at}::timestamptz,
        ${before(90 * 86_400_000).toISOString()}::timestamptz)
    `);
    return id;
  }

  /** One note and one decision on the item. */
  async function seedNoteAndDecision(itemId: string): Promise<void> {
    await t.db.execute(sql`
      insert into app.review_notes (id, item_id, author_operator_id, body)
      values (${newId()}, ${itemId}, ${operatorId}, 'Called the host. The deposit story holds.')
    `);
    await t.db.execute(sql`
      insert into app.review_actions (id, item_id, action, actor_operator_id, status)
      values (${newId()}, ${itemId}, 'remove', ${operatorId}, 'applied')
    `);
  }

  async function reviews(): Promise<string[]> {
    const rows = await queryRows<{ id: string }>(t.db, sql`select id from app.review_items`);
    return rows.map((row) => row.id).sort();
  }

  /** The items that still have a note, and those that still have a decision. */
  async function children(): Promise<{ notes: string[]; decisions: string[] }> {
    const notes = await queryRows<{ item_id: string }>(
      t.db,
      sql`select distinct item_id from app.review_notes`,
    );
    const decisions = await queryRows<{ item_id: string }>(
      t.db,
      sql`select distinct item_id from app.review_actions`,
    );
    return {
      notes: notes.map((row) => row.item_id).sort(),
      decisions: decisions.map((row) => row.item_id).sort(),
    };
  }

  it('is registered with the exact description', () => {
    expect(itemRule.key).toBe('trust.review_items_12m');
    expect(itemRule.description).toBe(
      'Review items, with their notes and decisions, are deleted 12 months after their final resolution.',
    );
  });

  it('keeps an item resolved exactly 12 months ago and deletes one resolved 1 ms earlier, with its notes and decisions', async () => {
    const atLimit = await seedReview(LIMIT);
    await seedNoteAndDecision(atLimit);
    const older = await seedReview(before(1));
    await seedNoteAndDecision(older);

    expect(await itemRule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await reviews()).toEqual([atLimit]);
    expect(await children()).toEqual({ notes: [atLimit], decisions: [atLimit] });
  });

  it('keeps an item that is still open, however old', async () => {
    const open = await seedReview(null);
    await seedNoteAndDecision(open);

    expect(await itemRule.run(t.db, NOW, 100)).toEqual({ deleted: 0 });
    expect(await reviews()).toEqual([open]);
    expect(await children()).toEqual({ notes: [open], decisions: [open] });
  });

  it('counts the 12 months from the last resolution about the same subject', async () => {
    const reported = { type: 'user', id: (await seedSeeker(t.db)).userId };
    const first = await seedReview(before(5000), { subject: reported });
    const last = await seedReview(new Date(LIMIT.getTime() + 1000), { subject: reported });
    const reopened = { type: 'user', id: (await seedSeeker(t.db)).userId };
    const closed = await seedReview(before(5000), { subject: reopened });
    const open = await seedReview(null, { subject: reopened });
    const done = { type: 'user', id: (await seedSeeker(t.db)).userId };
    await seedReview(before(5000), { subject: done });
    await seedReview(before(1), { subject: done });

    expect(await itemRule.run(t.db, NOW, 100)).toEqual({ deleted: 2 });
    expect(await reviews()).toEqual([first, last, closed, open].sort());
  });

  it('keeps a decision while its appeal is open or was resolved in the last 12 months', async () => {
    const appealed = await seedReview(before(5000));
    const openAppeal = await seedReview(null, { originalItemId: appealed });
    const settled = await seedReview(before(5000));
    const lateAppeal = await seedReview(new Date(LIMIT.getTime() + 1000), {
      originalItemId: settled,
    });
    const old = await seedReview(before(5000));
    await seedReview(before(4000), { originalItemId: old });

    expect(await itemRule.run(t.db, NOW, 100)).toEqual({ deleted: 2 });
    expect(await reviews()).toEqual([appealed, openAppeal, settled, lateAppeal].sort());
  });

  it('deletes at most `limit` items, oldest resolution first; a kept appeal loses only its link', async () => {
    const original = await seedReview(before(9000));
    const appeal = await seedReview(before(1000), { originalItemId: original });
    await seedNoteAndDecision(original);
    await seedNoteAndDecision(appeal);

    expect(await itemRule.run(t.db, NOW, 1)).toEqual({ deleted: 1 });
    expect(await reviews()).toEqual([appeal]);
    expect(await children()).toEqual({ notes: [appeal], decisions: [appeal] });
    const [row] = await queryRows<{ original_item_id: string | null; reason: string }>(
      t.db,
      sql`select original_item_id, reason from app.review_items where id = ${appeal}`,
    );
    expect(row).toEqual({ original_item_id: null, reason: 'Asked for a deposit by wire' });

    expect(await itemRule.run(t.db, NOW, 1)).toEqual({ deleted: 1 });
    expect(await reviews()).toEqual([]);
  });

  it('deletes an item and leaves its check to the checks rule', async () => {
    const check = await seedCheck(new Date(LIMIT.getTime() + 1000));
    await seedReview(before(5000), { checkId: check });

    expect(await itemRule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await reviews()).toEqual([]);
    expect(await checks()).toEqual([check]);
  });

  it("keeps an old item another module's row still points at", async () => {
    const { orgId } = await seedHostOrg(t.db);
    const referenced = await seedReview(before(5000), {
      subject: { type: 'business_verification', id: orgId },
    });
    await seedReview(before(5000));
    await t.db.execute(sql`
      insert into app.business_verifications (id, org_id, review_item_id)
      values (${newId()}, ${orgId}, ${referenced})
    `);

    expect(await itemRule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await reviews()).toEqual([referenced]);
  });

  describe('legal holds (lead decision 2026-11-18)', () => {
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

    it('keeps an item about a held person or organization, with its notes and decisions, and deletes the rest', async () => {
      const old = before(5000);
      const heldOrg = await seedHostOrg(t.db);
      await hold({ orgId: heldOrg.orgId }, 'reports');
      const heldSeeker = (await seedSeeker(t.db)).userId;
      await hold({ userId: heldSeeker }, 'messages');
      const freeOrg = await seedHostOrg(t.db);
      const freeSeeker = (await seedSeeker(t.db)).userId;

      const kept = [
        await seedReview(old, { subject: { type: 'user', id: heldSeeker } }),
        await seedReview(old, { subject: { type: 'seeker_profile', id: heldSeeker } }),
        await seedReview(old, { subject: { type: 'organization', id: heldOrg.orgId } }),
        await seedReview(old, { subject: { type: 'host_page', id: heldOrg.orgId } }),
        await seedReview(old, { subject: { type: 'business_verification', id: heldOrg.orgId } }),
        await seedReview(old, { subject: { type: 'billing_account', id: heldOrg.orgId } }),
        await seedReview(old, {
          subject: { type: 'media', id: await seedMedia(t.db, heldOrg.orgId, 'listing_photo') },
        }),
        await seedReview(old, {
          subject: { type: 'listing', id: await seedListingRow(t.db, { orgId: heldOrg.orgId }) },
        }),
        // The item names nobody, but the check it was opened on is about the held host.
        await seedReview(old, {
          checkId: await seedCheck(old, { type: 'organization', id: heldOrg.orgId }),
        }),
      ];
      for (const id of kept) await seedNoteAndDecision(id);

      const gone = [
        await seedReview(old, { subject: { type: 'user', id: freeSeeker } }),
        await seedReview(old, { subject: { type: 'organization', id: freeOrg.orgId } }),
        await seedReview(old, { subject: { type: 'billing_account', id: freeOrg.orgId } }),
        await seedReview(old, {
          subject: { type: 'listing', id: await seedListingRow(t.db, { orgId: freeOrg.orgId }) },
        }),
        await seedReview(old),
      ];
      for (const id of gone) await seedNoteAndDecision(id);

      expect(await itemRule.run(t.db, NOW, 100)).toEqual({ deleted: gone.length });
      expect(await reviews()).toEqual([...kept].sort());
      expect(await children()).toEqual({ notes: [...kept].sort(), decisions: [...kept].sort() });
    });

    it('keeps an item about a revision, message, bulk message, invite, interview, offer or thread that a held organization owns', async () => {
      const old = before(5000);
      const held = await ownedWorld();
      await hold({ orgId: held.orgId }, 'billing');
      const free = await ownedWorld();

      const kept: string[] = [];
      for (const [type, id] of Object.entries(held.items)) {
        kept.push(await seedReview(old, { subject: { type, id } }));
      }
      kept.push(await seedReview(old, { subject: { type: 'thread', id: held.threadId } }));
      // Through the check: the item is about nothing owned, its check is on a held message.
      kept.push(
        await seedReview(old, {
          checkId: await seedCheck(old, { type: 'message', id: held.items.message }),
        }),
      );
      for (const [type, id] of Object.entries(free.items)) {
        await seedReview(old, { subject: { type, id } });
      }
      await seedReview(old, { subject: { type: 'thread', id: free.threadId } });

      expect(await itemRule.run(t.db, NOW, 100)).toEqual({
        deleted: Object.keys(free.items).length + 1,
      });
      expect(await reviews()).toEqual([...kept].sort());
    });

    it('keeps an item about something a held person sent or is on', async () => {
      const old = before(5000);
      const world = await ownedWorld();
      await hold({ userId: world.seekerId }, 'applications');

      const onSeeker = await seedReview(old, {
        subject: { type: 'thread', id: world.threadId },
      });
      const message = await seedReview(old, {
        subject: { type: 'message', id: world.items.message },
      });
      // A listing revision names no seeker.
      await seedReview(old, {
        subject: { type: 'listing_revision', id: world.items.listing_revision },
      });

      expect(await itemRule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
      expect(await reviews()).toEqual([onSeeker, message].sort());
    });

    it('reaches the items behind more held ones than one batch holds', async () => {
      const held = await seedHostOrg(t.db);
      await hold({ orgId: held.orgId }, 'all');
      const free = await seedHostOrg(t.db);
      const heldItems = [];
      for (let i = 0; i < 3; i++) {
        heldItems.push(
          await seedReview(before(9000 - i), {
            subject: { type: 'media', id: await seedMedia(t.db, held.orgId, 'listing_photo') },
          }),
        );
      }
      // Resolved after every held item, so a single batch of 2 would only see held ones.
      const behind = await seedReview(before(1000), {
        subject: { type: 'media', id: await seedMedia(t.db, free.orgId, 'listing_photo') },
      });

      expect(await itemRule.run(t.db, NOW, 2)).toEqual({ deleted: 1 });
      expect(await reviews()).toEqual([...heldItems].sort());
      expect(await reviews()).not.toContain(behind);
    });

    it('deletes the held items on the next run once the hold is released', async () => {
      const seeker = (await seedSeeker(t.db)).userId;
      const holdId = await hold({ userId: seeker }, 'all');
      const item = await seedReview(before(5000), { subject: { type: 'user', id: seeker } });
      await seedNoteAndDecision(item);

      expect(await itemRule.run(t.db, NOW, 100)).toEqual({ deleted: 0 });
      await releaseLegalHold(t.db, { holdId, operatorId }, NOW);
      expect(await itemRule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
      expect(await reviews()).toEqual([]);
      expect(await children()).toEqual({ notes: [], decisions: [] });
    });
  });
});
