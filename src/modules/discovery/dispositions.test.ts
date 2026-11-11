// Saved and skipped jobs (SP3 plan Task 23): mutual exclusion, the expectedState 409, the saved
// limit, one save event ever, closed listings, paging with totals, and unsave and restore.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { seedSeeker } from '../../../tests/helpers/sp2';
import { queryRows } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import {
  clearDisposition,
  listSavedJobs,
  listSkippedJobs,
  restoreSkippedJob,
  setDisposition,
  unsaveJob,
} from './dispositions';
import { noopHook, setPlacementHookForTests } from './hooks';

let t: TestDb;
let userId: string;
let otherId: string;
let listing: string;

beforeAll(async () => {
  t = await createTestDb();
  setPlacementHookForTests(noopHook);
});

afterAll(async () => {
  setPlacementHookForTests(null);
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.listing_events`);
  await t.db.execute(sql`delete from app.listing_dispositions`);
  await t.db.execute(sql`delete from app.discovery_listings`);
  await t.db.execute(sql`delete from app.settings`);
  userId = (await seedSeeker(t.db)).userId;
  otherId = (await seedSeeker(t.db)).userId;
  [listing] = (await insertProjectionRows(t.db, [{}])) as [string];
});

/** The AppError a promise rejects with. */
async function rejection(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error('expected a rejection');
}

const rowsOf = (user: string) =>
  queryRows<{ listingId: string; state: string; source: string; firstSaved: boolean }>(
    t.db,
    sql`select listing_id::text as "listingId", state, source,
      first_saved_at is not null as "firstSaved"
      from app.listing_dispositions where user_id = ${user}::uuid order by listing_id`,
  );

const saveEvents = () =>
  queryRows<{ listingId: string; source: string }>(
    t.db,
    sql`select listing_id::text as "listingId", source from app.listing_events where type = 'save'`,
  );

const save = (id: string, user = userId) =>
  setDisposition(t.db, { userId: user, listingId: id, state: 'saved', source: 'seek' });

describe('setDisposition', () => {
  it('keeps save and skip mutually exclusive, reporting the previous state', async () => {
    expect(await save(listing)).toEqual({ state: 'saved', previous: null });
    expect(
      await setDisposition(t.db, { userId, listingId: listing, state: 'skipped', source: 'swipe' }),
    ).toEqual({ state: 'skipped', previous: 'saved' });
    expect(await rowsOf(userId)).toEqual([
      { listingId: listing, state: 'skipped', source: 'swipe', firstSaved: true },
    ]);
  });

  it('returns 409 with the current state when expectedState does not match', async () => {
    await setDisposition(t.db, { userId, listingId: listing, state: 'skipped', source: 'swipe' });
    const err = await rejection(
      setDisposition(t.db, {
        userId,
        listingId: listing,
        state: 'skipped',
        source: 'seek',
        expectedState: 'saved',
      }),
    );
    expect(err.code).toBe('conflict');
    expect(err.message).toBe('This job changed in another tab.');
    expect(err.details).toEqual({ current: 'skipped' });
  });

  it('treats expectedState null as "no disposition yet"', async () => {
    expect(
      await setDisposition(t.db, {
        userId,
        listingId: listing,
        state: 'saved',
        source: 'seek',
        expectedState: null,
      }),
    ).toEqual({ state: 'saved', previous: null });
    const err = await rejection(
      setDisposition(t.db, {
        userId,
        listingId: listing,
        state: 'skipped',
        source: 'seek',
        expectedState: null,
      }),
    );
    expect(err.details).toEqual({ current: 'saved' });
  });

  it('refuses a save past the saved-jobs setting, with the formatted limit', async () => {
    await t.db.execute(
      sql`insert into app.settings (key, value) values ('discovery.saved_jobs_per_user', '3'::jsonb)`,
    );
    const ids = await insertProjectionRows(t.db, [{}, {}, {}]);
    for (const id of ids) await save(id);
    const err = await rejection(save(listing));
    expect(err.code).toBe('conflict');
    expect(err.message).toBe("You've saved 3 jobs. Remove some to save more.");
    expect(err.details).toEqual({ reason: 'saved_limit' });
    // Skipping has no limit, re-saving a saved listing is not a new save, and the limit is per
    // user.
    await expect(
      setDisposition(t.db, { userId, listingId: listing, state: 'skipped', source: 'seek' }),
    ).resolves.toEqual({ state: 'skipped', previous: null });
    await expect(save(ids[0] ?? '')).resolves.toEqual({ state: 'saved', previous: 'saved' });
    await expect(save(listing, otherId)).resolves.toEqual({ state: 'saved', previous: null });
  });

  it('formats the default limit with a thousands separator', async () => {
    await t.db.execute(
      sql`insert into app.settings (key, value) values ('discovery.saved_jobs_per_user', '1000'::jsonb)`,
    );
    const ids = Array.from({ length: 1000 }, () => newId());
    await t.db.execute(sql`
      insert into app.listing_dispositions (user_id, listing_id, state, source, acted_at)
      select ${userId}::uuid, id, 'saved', 'seek', now()
      from unnest(${`{${ids.join(',')}}`}::uuid[]) as id
    `);
    const err = await rejection(save(listing));
    expect(err.message).toBe("You've saved 1,000 jobs. Remove some to save more.");
  });

  it('records one save event ever: save, skip and save again leaves one', async () => {
    await save(listing);
    await setDisposition(t.db, { userId, listingId: listing, state: 'skipped', source: 'swipe' });
    await setDisposition(t.db, { userId, listingId: listing, state: 'saved', source: 'map' });
    expect(await saveEvents()).toEqual([{ listingId: listing, source: 'seek' }]);
    expect((await rowsOf(userId))[0]).toMatchObject({ state: 'saved', source: 'map' });
  });

  it('records no save event for a skip', async () => {
    await setDisposition(t.db, { userId, listingId: listing, state: 'skipped', source: 'swipe' });
    expect(await saveEvents()).toEqual([]);
    expect((await rowsOf(userId))[0]).toMatchObject({ firstSaved: false });
  });

  it('returns 404 "This job just closed." for an inactive, removed or malformed listing', async () => {
    await t.db.execute(
      sql`update app.discovery_listings set is_active = false, closed_at = now()
        where listing_id = ${listing}::uuid`,
    );
    for (const id of [listing, newId(), 'not-a-uuid']) {
      const err = await rejection(save(id));
      expect(err.code).toBe('not_found');
      expect(err.message).toBe('This job just closed.');
    }
    const skip = await rejection(
      setDisposition(t.db, { userId, listingId: listing, state: 'skipped', source: 'seek' }),
    );
    expect(skip.code).toBe('not_found');
    expect(await rowsOf(userId)).toEqual([]);
  });

  it('commits or rolls back with the caller transaction', async () => {
    await expect(
      t.db.transaction(async (tx) => {
        await setDisposition(tx, { userId, listingId: listing, state: 'saved', source: 'seek' });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await rowsOf(userId)).toEqual([]);
    expect(await saveEvents()).toEqual([]);
  });
});

describe('clearDisposition', () => {
  it('deletes the row and returns the previous state', async () => {
    await save(listing);
    expect(await clearDisposition(t.db, { userId, listingId: listing })).toEqual({
      previous: 'saved',
    });
    expect(await rowsOf(userId)).toEqual([]);
    expect(await clearDisposition(t.db, { userId, listingId: listing })).toEqual({
      previous: null,
    });
  });

  it('checks expectedState the same way', async () => {
    await save(listing);
    const err = await rejection(
      clearDisposition(t.db, { userId, listingId: listing, expectedState: 'skipped' }),
    );
    expect(err.code).toBe('conflict');
    expect(err.details).toEqual({ current: 'saved' });
    expect(await rowsOf(userId)).toHaveLength(1);
  });

  it('clears a closed listing too', async () => {
    await save(listing);
    await t.db.execute(
      sql`update app.discovery_listings set is_active = false, closed_at = now()
        where listing_id = ${listing}::uuid`,
    );
    expect(
      await clearDisposition(t.db, { userId, listingId: listing, expectedState: 'saved' }),
    ).toEqual({ previous: 'saved' });
  });
});

describe('unsaveJob and restoreSkippedJob', () => {
  it('unsave refuses a skipped listing, and restore clears a skip', async () => {
    await setDisposition(t.db, { userId, listingId: listing, state: 'skipped', source: 'swipe' });
    const err = await rejection(unsaveJob(t.db, userId, listing));
    expect(err.code).toBe('conflict');
    expect(err.details).toEqual({ current: 'skipped' });
    await restoreSkippedJob(t.db, userId, listing);
    expect(await rowsOf(userId)).toEqual([]);
  });

  it('unsave removes a save, and restore refuses a saved listing', async () => {
    await save(listing);
    expect((await rejection(restoreSkippedJob(t.db, userId, listing))).code).toBe('conflict');
    await unsaveJob(t.db, userId, listing);
    expect(await rowsOf(userId)).toEqual([]);
  });
});

describe('listSavedJobs and listSkippedJobs', () => {
  it('pages 25 saved listings 10 at a time, newest first, with closed cards', async () => {
    const ids = await insertProjectionRows(
      t.db,
      Array.from({ length: 25 }, () => ({})),
    );
    // Distinct acted_at values, the oldest first, plus two ties broken by listing id.
    for (const [n, id] of ids.entries()) {
      const at = new Date(Date.UTC(2026, 10, 1) + Math.min(n, 22) * 60_000).toISOString();
      await t.db.execute(sql`
        insert into app.listing_dispositions (user_id, listing_id, state, source, first_saved_at, acted_at)
        values (${userId}::uuid, ${id}::uuid, 'saved', 'seek', now(), ${at}::timestamptz)
      `);
    }
    const closed = [ids[3] ?? '', ids[17] ?? ''];
    await t.db.execute(sql`
      update app.discovery_listings set is_active = false, closed_at = now()
      where listing_id in (${closed[0]}::uuid, ${closed[1]}::uuid)
    `);
    // Another user's save and this user's skip never show.
    await save(listing, otherId);
    await setDisposition(t.db, { userId, listingId: listing, state: 'skipped', source: 'seek' });

    const pages: string[][] = [];
    let before: string | undefined;
    for (;;) {
      const page = await listSavedJobs(t.db, userId, { limit: 10, before });
      expect(page.total).toBe(25);
      pages.push(page.items.map((c) => c.listingId));
      if (!page.nextBefore) break;
      before = page.nextBefore;
    }
    expect(pages.map((p) => p.length)).toEqual([10, 10, 5]);

    const expected = await queryRows<{ id: string }>(
      t.db,
      sql`select listing_id::text as id from app.listing_dispositions
        where user_id = ${userId}::uuid and state = 'saved'
        order by acted_at desc, listing_id desc`,
    );
    expect(pages.flat()).toEqual(expected.map((r) => r.id));

    const first = await listSavedJobs(t.db, userId, { limit: 50 });
    const byId = new Map(first.items.map((c) => [c.listingId, c]));
    for (const id of closed) expect(byId.get(id)?.status).toBe('closed');
    expect(byId.get(ids[0] ?? '')).toMatchObject({
      status: 'active',
      href: expect.stringMatching(/\?source=other$/),
      viewer: { disposition: 'saved', applied: false },
    });
  });

  it('lists skipped jobs the same way', async () => {
    await setDisposition(t.db, { userId, listingId: listing, state: 'skipped', source: 'swipe' });
    const page = await listSkippedJobs(t.db, userId, { limit: 20 });
    expect(page).toMatchObject({ total: 1, nextBefore: null });
    expect(page.items.map((c) => [c.listingId, c.viewer?.disposition])).toEqual([
      [listing, 'skipped'],
    ]);
    expect(await listSavedJobs(t.db, userId, { limit: 20 })).toEqual({
      items: [],
      nextBefore: null,
      total: 0,
    });
  });

  it('rejects a malformed before cursor with 400', async () => {
    const bad = [
      'not base64!',
      Buffer.from('yesterday|x').toString('base64url'),
      Buffer.from(`2026-11-01T00:00:00Z|${listing}|extra`).toString('base64url'),
      'a'.repeat(300),
    ];
    for (const before of bad) {
      expect((await rejection(listSavedJobs(t.db, userId, { limit: 10, before }))).code).toBe(
        'bad_request',
      );
    }
  });
});
