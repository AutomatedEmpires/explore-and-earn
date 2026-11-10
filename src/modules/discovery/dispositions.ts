// Saved and skipped jobs (SP3 spec 8.8, plan Task 23): mutually exclusive per user and listing,
// one row holding the current state, with optimistic concurrency through `expectedState`.
//
// - Saving or skipping needs an active listing; clearing works on any (SP4 removes closed ones).
// - At most `discovery.saved_jobs_per_user` saved; skipped has no limit.
// - The first save ever sets `first_saved_at` and records one `save` event, deduped per user
//   and listing, so save, skip and save again still counts one save.
// - Writes lock the (user, listing) pair, so two tabs never interleave, and share the listing's
//   sync lock, so a disposition never outlives a listing that sync is removing.
import { sql } from 'drizzle-orm';
import { queryRows, type Db, type DbOrTx, type Tx } from '@/lib/db';
import {
  DEFAULT_TZ,
  type DiscoverySource,
  type DispositionState,
  type JobCardData,
} from '@/lib/discovery';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { getSetting } from '@/modules/settings';
import { hmacKey } from '@/server/viewer';
import { loadCards } from './cards';
import { recordListingEvent } from './events';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_MICROS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const MAX_LIMIT = 50;
const MAX_BEFORE_LENGTH = 200;

const CLOSED_MESSAGE = 'This job just closed.';
const CHANGED_MESSAGE = 'This job changed in another tab.';

/** A new transaction on a Db, or a savepoint inside the caller's transaction. */
function transact<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as Db).transaction(fn);
}

/** The pair lock every disposition write takes, before reading the row. */
async function lockPair(tx: Tx, userId: string, listingId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('discovery.disposition'), hashtext(${`${userId}:${listingId}`}))::text`,
  );
}

async function currentRow(
  tx: Tx,
  userId: string,
  listingId: string,
): Promise<{ state: DispositionState; firstSaved: boolean } | null> {
  const rows = await queryRows<{ state: DispositionState; firstSaved: boolean }>(
    tx,
    sql`select state, first_saved_at is not null as "firstSaved" from app.listing_dispositions
      where user_id = ${userId}::uuid and listing_id = ${listingId}::uuid`,
  );
  return rows[0] ?? null;
}

function checkExpected(
  expected: DispositionState | null | undefined,
  current: DispositionState | null,
): void {
  if (expected !== undefined && expected !== current) {
    throw conflict(CHANGED_MESSAGE, { current });
  }
}

export async function setDisposition(
  db: DbOrTx,
  i: {
    userId: string;
    listingId: string;
    state: DispositionState;
    source: DiscoverySource;
    expectedState?: DispositionState | null;
  },
): Promise<{ state: DispositionState; previous: DispositionState | null }> {
  if (!UUID.test(i.listingId)) throw notFound(CLOSED_MESSAGE);
  return transact(db, async (tx) => {
    // Sync holds this key exclusively while it upserts or removes the row (sync.ts), so a
    // removal either sees this disposition and deletes it, or finishes before we read the row.
    await tx.execute(
      sql`select pg_advisory_xact_lock_shared(hashtext(${`discovery:${i.listingId}`}))::text`,
    );
    await lockPair(tx, i.userId, i.listingId);

    const listing = await queryRows<{ active: boolean }>(
      tx,
      sql`select is_active as active from app.discovery_listings
        where listing_id = ${i.listingId}::uuid`,
    );
    if (!listing[0]?.active) throw notFound(CLOSED_MESSAGE);

    const current = await currentRow(tx, i.userId, i.listingId);
    const previous = current?.state ?? null;
    checkExpected(i.expectedState, previous);

    if (i.state === 'saved' && previous !== 'saved') {
      // Serializes one user's saves, so two tabs cannot both take the last place.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('discovery.saved_limit'), hashtext(${i.userId}))::text`,
      );
      const limit = await getSetting(tx, 'discovery.saved_jobs_per_user');
      const [saved] = await queryRows<{ n: number }>(
        tx,
        sql`select count(*)::int as n from app.listing_dispositions
          where user_id = ${i.userId}::uuid and state = 'saved'`,
      );
      if (Number(saved?.n ?? 0) >= limit) {
        throw conflict(
          `You've saved ${limit.toLocaleString('en-US')} jobs. Remove some to save more.`,
          { reason: 'saved_limit' },
        );
      }
    }

    const firstSave = i.state === 'saved' && !current?.firstSaved;
    await tx.execute(sql`
      insert into app.listing_dispositions
        (user_id, listing_id, state, source, first_saved_at, acted_at)
      values (${i.userId}::uuid, ${i.listingId}::uuid, ${i.state}, ${i.source},
        ${firstSave ? sql`now()` : sql`null`}, now())
      on conflict (user_id, listing_id) do update set
        state = excluded.state,
        source = excluded.source,
        acted_at = excluded.acted_at,
        first_saved_at = coalesce(app.listing_dispositions.first_saved_at, excluded.first_saved_at)
    `);
    if (firstSave) {
      await recordListingEvent(tx, {
        listingId: i.listingId,
        type: 'save',
        source: i.source,
        dedupeKey: `save:${hmacKey(i.userId)}:${i.listingId}`,
      });
    }
    return { state: i.state, previous };
  });
}

export async function clearDisposition(
  db: DbOrTx,
  i: { userId: string; listingId: string; expectedState?: DispositionState },
): Promise<{ previous: DispositionState | null }> {
  if (!UUID.test(i.listingId)) {
    checkExpected(i.expectedState, null);
    return { previous: null };
  }
  return transact(db, async (tx) => {
    await lockPair(tx, i.userId, i.listingId);
    const previous = (await currentRow(tx, i.userId, i.listingId))?.state ?? null;
    checkExpected(i.expectedState, previous);
    if (previous !== null) {
      await tx.execute(sql`delete from app.listing_dispositions
        where user_id = ${i.userId}::uuid and listing_id = ${i.listingId}::uuid`);
    }
    return { previous };
  });
}

/** base64url of `<actedAt ISO>|<listingId>`. */
function encodeBefore(at: string, listingId: string): string {
  return Buffer.from(`${at}|${listingId}`, 'utf8').toString('base64url');
}

/** The keyset position in `before`; a malformed cursor is a 400. */
function decodeBefore(before: string): { at: string; listingId: string } {
  if (before.length > MAX_BEFORE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(before)) {
    throw badRequest('Invalid before cursor');
  }
  const [at, listingId, ...rest] = Buffer.from(before, 'base64url').toString('utf8').split('|');
  if (
    rest.length > 0 ||
    at === undefined ||
    listingId === undefined ||
    !ISO_MICROS.test(at) ||
    !Number.isFinite(Date.parse(at)) ||
    !UUID.test(listingId)
  ) {
    throw badRequest('Invalid before cursor');
  }
  return { at, listingId };
}

async function listByState(
  db: DbOrTx,
  userId: string,
  state: DispositionState,
  i: { limit: number; before?: string; tz?: string },
): Promise<{ items: JobCardData[]; nextBefore: string | null; total: number }> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(i.limit) || 1));
  const after = i.before ? decodeBefore(i.before) : null;
  // Microseconds, so the cursor matches the stored acted_at exactly.
  const rows = await queryRows<{ id: string; at: string }>(
    db,
    sql`
      select listing_id::text as id,
        to_char(acted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at
      from app.listing_dispositions
      where user_id = ${userId}::uuid and state = ${state}
        ${after ? sql`and (acted_at, listing_id) < (${after.at}::timestamptz, ${after.listingId}::uuid)` : sql``}
      order by acted_at desc, listing_id desc
      limit ${limit + 1}
    `,
  );
  const [count] = await queryRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from app.listing_dispositions
      where user_id = ${userId}::uuid and state = ${state}`,
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const items = await loadCards(
    db,
    page.map((r) => r.id),
    { viewerUserId: userId, tz: i.tz ?? DEFAULT_TZ, source: 'other', includeClosed: true },
  );
  return {
    items,
    nextBefore: rows.length > limit && last ? encodeBefore(last.at, last.id) : null,
    total: Number(count?.n ?? 0),
  };
}

/**
 * Active and closed cards, newest first (SP4 My jobs). `tz` is the viewer's zone for the date
 * line (default America/Chicago).
 */
export async function listSavedJobs(
  db: DbOrTx,
  userId: string,
  i: { limit: number; before?: string; tz?: string },
): Promise<{ items: JobCardData[]; nextBefore: string | null; total: number }> {
  return listByState(db, userId, 'saved', i);
}

export async function listSkippedJobs(
  db: DbOrTx,
  userId: string,
  i: { limit: number; before?: string; tz?: string },
): Promise<{ items: JobCardData[]; nextBefore: string | null; total: number }> {
  return listByState(db, userId, 'skipped', i);
}

/** Removes a save; a 409 when the listing is not saved. */
export async function unsaveJob(db: DbOrTx, userId: string, listingId: string): Promise<void> {
  await clearDisposition(db, { userId, listingId, expectedState: 'saved' });
}

/** Brings a skipped listing back; a 409 when it is not skipped. */
export async function restoreSkippedJob(
  db: DbOrTx,
  userId: string,
  listingId: string,
): Promise<void> {
  await clearDisposition(db, { userId, listingId, expectedState: 'skipped' });
}
