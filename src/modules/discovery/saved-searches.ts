// Saved searches (job alerts) and alert settings (SP3 spec 5 and 8.10, plan Task 28).
//
// - A search is the user's query without map bounds or a location; `query_hash` is the hex
//   sha256 of canonicalQuery, so the same filters in any order are the same alert, and saving
//   them again returns the existing search with `created: false`.
// - At most `discovery.saved_searches_per_user` per user. Creates of one user are serialized,
//   so two tabs cannot both take the last place.
// - The default name is the filter summary (at most 80 characters, cut with "…"); a given name
//   is trimmed and must be 1–80 characters. `summary` is computed again on every read.
// - Only the owner can see, change or delete a search; anyone else gets not_found. Deleting a
//   search deletes its matches (on delete cascade).
// - Alert settings default to `{ weeklyDigest: false }`; setting them upserts the user's row
//   and leaves the push counters alone.
import { createHash } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { type Db, type DbOrTx } from '@/lib/db';
import {
  canonicalQuery,
  discoveryQuerySchema,
  summarizeQuery,
  type DiscoveryQuery,
  type QueryLabels,
} from '@/lib/discovery';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { getSetting } from '@/modules/settings';
import { getQueryLabels } from './query-context';
import { alertSettings, savedSearches } from './schema';

export type SavedSearchItem = {
  id: string;
  name: string;
  query: DiscoveryQuery;
  /** The filter summary, computed on every read. */
  summary: string;
  pushEnabled: boolean;
  emailDaily: boolean;
  createdAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_MAX = 80;
const NOT_FOUND = 'This job alert no longer exists.';

type Row = typeof savedSearches.$inferSelect;

/** The query an alert keeps: map bounds and a location are views, not filters. */
export function alertQuery(q: DiscoveryQuery): DiscoveryQuery {
  const { bbox: _bbox, locationId: _locationId, ...rest } = q;
  return rest;
}

/** The hex sha256 of the query's canonical form. */
export function queryHash(q: DiscoveryQuery): string {
  return createHash('sha256').update(canonicalQuery(q)).digest('hex');
}

function validQuery(q: DiscoveryQuery): DiscoveryQuery {
  const parsed = discoveryQuerySchema.safeParse(q);
  if (!parsed.success) throw badRequest('Invalid search', parsed.error.issues);
  return alertQuery(parsed.data);
}

function validName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > NAME_MAX) {
    throw badRequest(`A job alert's name is 1 to ${NAME_MAX} characters.`);
  }
  return trimmed;
}

/** Labels for many queries: genres and destinations once, a host only where a query names one. */
export async function labelsFor(db: DbOrTx, queries: DiscoveryQuery[]): Promise<QueryLabels[]> {
  if (queries.length === 0) return [];
  const base = await getQueryLabels(db, {});
  return Promise.all(
    queries.map(async (q) =>
      q.orgId ? { ...base, host: (await getQueryLabels(db, q)).host } : base,
    ),
  );
}

function toItem(row: Row, labels: QueryLabels): SavedSearchItem {
  const query = row.query as DiscoveryQuery;
  return {
    id: row.id,
    name: row.name,
    query,
    summary: summarizeQuery(query, labels, NAME_MAX),
    pushEnabled: row.pushEnabled,
    emailDaily: row.emailDaily,
    createdAt: row.createdAt.toISOString(),
  };
}

async function oneItem(db: DbOrTx, row: Row): Promise<SavedSearchItem> {
  const [labels] = await labelsFor(db, [row.query as DiscoveryQuery]);
  return toItem(row, labels as QueryLabels);
}

/** The same query (by hash) returns the user's existing search with `created: false`. */
export async function createSavedSearch(
  db: Db,
  userId: string,
  i: { query: DiscoveryQuery; name?: string },
): Promise<{ item: SavedSearchItem; created: boolean }> {
  const query = validQuery(i.query);
  const hash = queryHash(query);
  const given = i.name === undefined ? null : validName(i.name);

  const out = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('discovery.saved_searches'), hashtext(${userId}))::text`,
    );
    const [existing] = await tx
      .select()
      .from(savedSearches)
      .where(and(eq(savedSearches.userId, userId), eq(savedSearches.queryHash, hash)));
    if (existing) return { row: existing, created: false };

    const limit = await getSetting(tx, 'discovery.saved_searches_per_user');
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(savedSearches)
      .where(eq(savedSearches.userId, userId));
    if (Number(count?.n ?? 0) >= limit) {
      throw conflict(
        `You can have up to ${limit} job alert${limit === 1 ? '' : 's'}. Remove one to add another.`,
        { reason: 'saved_search_limit' },
      );
    }

    const name = given ?? summarizeQuery(query, (await labelsFor(tx, [query]))[0] as QueryLabels);
    const [row] = await tx
      .insert(savedSearches)
      .values({ id: newId(), userId, name, query, queryHash: hash })
      .returning();
    if (!row) throw new Error('createSavedSearch: the insert returned no row');
    return { row, created: true };
  });
  return { item: await oneItem(db, out.row), created: out.created };
}

export async function updateSavedSearch(
  db: Db,
  userId: string,
  id: string,
  i: { name?: string; pushEnabled?: boolean; emailDaily?: boolean },
): Promise<SavedSearchItem> {
  if (!UUID.test(id)) throw notFound(NOT_FOUND);
  const set: Partial<Pick<Row, 'name' | 'pushEnabled' | 'emailDaily'>> = {};
  if (i.name !== undefined) set.name = validName(i.name);
  if (i.pushEnabled !== undefined) set.pushEnabled = i.pushEnabled;
  if (i.emailDaily !== undefined) set.emailDaily = i.emailDaily;

  const mine = and(eq(savedSearches.id, id), eq(savedSearches.userId, userId));
  const [row] =
    Object.keys(set).length > 0
      ? await db.update(savedSearches).set(set).where(mine).returning()
      : await db.select().from(savedSearches).where(mine);
  if (!row) throw notFound(NOT_FOUND);
  return oneItem(db, row);
}

export async function deleteSavedSearch(db: Db, userId: string, id: string): Promise<void> {
  if (!UUID.test(id)) throw notFound(NOT_FOUND);
  const deleted = await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)))
    .returning({ id: savedSearches.id });
  if (deleted.length === 0) throw notFound(NOT_FOUND);
}

/** The user's searches, oldest first. */
export async function listSavedSearches(db: DbOrTx, userId: string): Promise<SavedSearchItem[]> {
  if (!UUID.test(userId)) return [];
  const rows = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(asc(savedSearches.createdAt), asc(savedSearches.id));
  const labels = await labelsFor(
    db,
    rows.map((r) => r.query as DiscoveryQuery),
  );
  return rows.map((row, n) => toItem(row, labels[n] as QueryLabels));
}

export async function getAlertSettings(
  db: DbOrTx,
  userId: string,
): Promise<{ weeklyDigest: boolean }> {
  if (!UUID.test(userId)) return { weeklyDigest: false };
  const [row] = await db
    .select({ weeklyDigest: alertSettings.weeklyDigest })
    .from(alertSettings)
    .where(eq(alertSettings.userId, userId));
  return { weeklyDigest: row?.weeklyDigest ?? false };
}

export async function setAlertSettings(
  db: DbOrTx,
  userId: string,
  i: { weeklyDigest: boolean },
): Promise<{ weeklyDigest: boolean }> {
  const [row] = await db
    .insert(alertSettings)
    .values({ userId, weeklyDigest: i.weeklyDigest })
    .onConflictDoUpdate({ target: alertSettings.userId, set: { weeklyDigest: i.weeklyDigest } })
    .returning({ weeklyDigest: alertSettings.weeklyDigest });
  return { weeklyDigest: row?.weeklyDigest ?? i.weeklyDigest };
}
