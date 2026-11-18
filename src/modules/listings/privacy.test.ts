import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedListingRow } from '@tests/helpers/sp2';
import { seedHostOrg, seedMember } from '@tests/helpers/sp8';
import { privacyHandler } from './privacy';

const NOW = new Date('2026-11-18T12:00:00Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const erase = (s: PrivacySubject, holds: HoldScope[] = []) =>
  withTx(t.db, (tx) => privacyHandler.erase(tx, s, { requestId: newId(), now: NOW, holds }));

async function seedListing(o: {
  orgId: string;
  state?: 'draft' | 'active';
  title?: string;
  createdBy?: string;
  editedBy?: string;
}): Promise<string> {
  const id = await seedListingRow(t.db, { orgId: o.orgId });
  await t.db.execute(sql`
    update app.listings
    set state = ${o.state ?? 'draft'}, title = ${o.title ?? 'Lift Operator'},
      draft = '{"title":"Lift Operator","notes":"call Sam"}'::jsonb,
      created_by = ${o.createdBy ?? null}, last_edited_by = ${o.editedBy ?? null}
    where id = ${id}
  `);
  return id;
}

async function listing(id: string) {
  const [row] = await queryRows<{
    state: string;
    close_reason: string | null;
    draft: unknown;
    created_by: string | null;
    last_edited_by: string | null;
  }>(
    t.db,
    sql`select state, close_reason, draft, created_by::text, last_edited_by::text
        from app.listings where id = ${id}`,
  );
  if (!row) throw new Error('listing not found');
  return row;
}

describe('listings privacy handler', () => {
  it('declares every column that holds media ids', () => {
    expect(privacyHandler.mediaColumns).toEqual([
      { table: 'listings', column: 'draft_media_ids', array: true },
      { table: 'listing_revisions', column: 'content_media_ids', array: true },
      { table: 'listing_revisions', column: 'cover_media_id', array: false },
      { table: 'photo_slot_checks', column: 'media_id', array: false },
    ]);
  });

  it('forgets who wrote and edited a listing, and keeps the listing', async () => {
    const org = await seedHostOrg(t.db);
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const written = await seedListing({ orgId: org.orgId, createdBy: admin.userId });
    const edited = await seedListing({
      orgId: org.orgId,
      createdBy: org.owner.userId,
      editedBy: admin.userId,
    });
    const subject = { kind: 'user' as const, userId: admin.userId };

    expect(await erase(subject)).toEqual({ erased: 2, retained: [] });
    expect(await listing(written)).toMatchObject({ created_by: null, state: 'draft' });
    expect(await listing(edited)).toMatchObject({
      created_by: org.owner.userId,
      last_edited_by: null,
    });
    expect((await listing(written)).draft).toEqual({ title: 'Lift Operator', notes: 'call Sam' });
    expect(await erase(subject)).toEqual({ erased: 0, retained: [] });
  });

  it('keeps the trace under a hold on everything', async () => {
    const org = await seedHostOrg(t.db);
    const id = await seedListing({ orgId: org.orgId, createdBy: org.owner.userId });
    expect(await erase({ kind: 'user', userId: org.owner.userId }, ['all'])).toEqual({
      erased: 0,
      retained: [{ table: 'listings', reason: 'legal_hold', until: null }],
    });
    expect((await listing(id)).created_by).toBe(org.owner.userId);
  });

  it("closes a closing organization's listings and empties its drafts", async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Untouched Outfitters' });
    const first = await seedListing({ orgId: org.orgId, state: 'active' });
    const second = await seedListing({ orgId: org.orgId, state: 'active' });
    const draft = await seedListing({ orgId: org.orgId });
    const theirs = await seedListing({ orgId: other.orgId, state: 'active' });
    const subject = { kind: 'org' as const, orgId: org.orgId };

    const result = await erase(subject);
    expect(result.retained).toEqual([{ table: 'listings', reason: 'shared_record', until: null }]);
    // Two listings closed, three drafts emptied.
    expect(result.erased).toBe(5);
    for (const id of [first, second]) {
      expect(await listing(id)).toMatchObject({ state: 'closed', close_reason: 'host', draft: {} });
    }
    expect(await listing(draft)).toMatchObject({ state: 'draft', draft: {} });
    expect(await listing(theirs)).toMatchObject({
      state: 'active',
      draft: { title: 'Lift Operator', notes: 'call Sam' },
    });

    expect(await erase(subject)).toEqual({ erased: 0, retained: result.retained });
  });

  it('leaves an organization open under a hold on everything', async () => {
    const org = await seedHostOrg(t.db);
    const id = await seedListing({ orgId: org.orgId, state: 'active' });
    expect(await erase({ kind: 'org', orgId: org.orgId }, ['all'])).toEqual({
      erased: 0,
      retained: [{ table: 'listings', reason: 'legal_hold', until: null }],
    });
    expect(await listing(id)).toMatchObject({ state: 'active' });
  });

  it('exports only the listings the person created', async () => {
    const org = await seedHostOrg(t.db);
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const mine = await seedListing({ orgId: org.orgId, createdBy: admin.userId, title: 'Line Cook' });
    await seedListing({ orgId: org.orgId, createdBy: org.owner.userId, title: 'Wrangler' });

    const part = await privacyHandler.exportData(t.db, { kind: 'user', userId: admin.userId });
    expect(part.records.listings).toEqual([
      expect.objectContaining({ id: mine, title: 'Line Cook', state: 'draft' }),
    ]);
    expect(JSON.stringify(part)).not.toContain('Wrangler');
    expect(
      await privacyHandler.exportData(t.db, { kind: 'org', orgId: org.orgId }),
    ).toEqual({ records: { listings: [] }, files: [] });
  });
});
