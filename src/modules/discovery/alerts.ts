// Saved-search matching, the alert push and the daily and weekly emails (SP3 spec 6 and 8.10,
// plan Tasks 29 and 30).
//
// discovery.alerts_match (every 15 minutes), one chunk per job:
// 1. The first chunk reads the watermark under `for update` and takes the window
//    (watermark, now − 2 min]. Without a watermark it starts one at now − 2 min and matches
//    nothing.
// 2. New listings are the active ones first active inside the window.
// 3. Saved searches are read 500 at a time in (user_id, id) order, extended to the end of the
//    last user, so a user's searches are never split.
// 4. Each search keeps at most 50 matches, through the normal filter SQL on the `alerts` surface
//    (skipped, applied and hidden-host listings left out) and only listings first active after
//    it was created. Matches are inserted with `on conflict do nothing`, so a retried chunk adds
//    none twice.
// 5. Per user, the newly inserted matches of searches with push on make one push, unless the
//    user reached discovery.alert_push_daily_cap pushes this UTC day; over the cap they wait for
//    the daily email with `pushed_at` null.
// 6. More users: the next chunk is enqueued with the same window. The last chunk moves the
//    watermark to the window's end. A chunk is one transaction, so a failure leaves nothing
//    half done.
//
// discovery.alerts_daily (14:00 UTC) and discovery.alerts_weekly (Mondays 14:00 UTC) work per
// user, 500 users a job. Each user is one transaction: it stamps every match it considers
// (daily: the unemailed matches of searches with the daily email on; weekly: those of the past
// 7 days), then emails the still-active ones, at most 10 a search, only when one is left.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryRows, type Db, type Tx } from '@/lib/db';
import {
  DEFAULT_TZ,
  serializeQuery,
  todayIn,
  type Amenity,
  type DiscoveryQuery,
  type JobCardData,
} from '@/lib/discovery';
import { getEnv } from '@/lib/env';
import { enqueue, type HandlerMap } from '@/modules/jobs';
import { notify } from '@/modules/notifications';
import { getSetting } from '@/modules/settings';
import { loadCards } from './cards';
import { uuidArray } from './filters';
import { ALERT_DAILY, ALERT_MATCH, ALERT_WEEKLY, ALERTS_PAGE } from './notification-types';
import { labelsFor } from './saved-searches';
import { alertSettings, discoverySyncState, savedSearches } from './schema';
import { filterListingIds } from './search';

const MATCH_TOPIC = 'discovery.alerts_match';
const DAILY_TOPIC = 'discovery.alerts_daily';
const WEEKLY_TOPIC = 'discovery.alerts_weekly';
const WATERMARK_KEY = 'alerts_match';

/** Saved searches per matching chunk, before it is extended to the end of its last user. */
export const SEARCH_CHUNK = 500;
/** Users per daily or weekly email chunk. */
export const USER_CHUNK = 500;
const MATCHES_PER_SEARCH = 50;
/** Listings this recent wait for the next run, so a slow sync never lands behind the window. */
const LAG_MS = 2 * 60_000;
const EMAIL_ITEMS = 10;
const WEEK_MS = 7 * 86_400_000;
const WEEKLY_NAME = 'Your saved searches';

const iso = z.iso.datetime();

/** The scheduler's `{ scheduledFor }` is ignored; follow-up chunks carry the window. */
const matchPayload = z
  .object({
    windowStart: iso.optional(),
    windowEnd: iso.optional(),
    afterUserId: z.uuid().optional(),
  })
  .refine((p) => (p.windowStart === undefined) === (p.windowEnd === undefined), {
    message: 'windowStart and windowEnd come together',
  });

const emailPayload = z.object({ runAt: iso.optional(), afterUserId: z.uuid().optional() });

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown, topic: string): T {
  const parsed = schema.safeParse(payload ?? {});
  if (!parsed.success) throw new Error(`${topic}: invalid payload`);
  return parsed.data;
}

const appUrl = () => getEnv().APP_URL.replace(/\/+$/, '');

/** The search's newest jobs on Seek, as a path with its query string. */
async function searchPath(tx: Tx, query: DiscoveryQuery): Promise<string> {
  const hostSlug = query.orgId ? (await labelsFor(tx, [query]))[0]?.host?.slug : undefined;
  return `/?${serializeQuery(query, 'newest', hostSlug ? { hostSlug } : undefined).toString()}`;
}

// --- Matching --------------------------------------------------------------------------------

type Window = { start: Date; end: Date };

type ChunkSearch = {
  id: string;
  userId: string;
  name: string;
  query: DiscoveryQuery;
  pushEnabled: boolean;
  createdAt: Date;
};

/** The first chunk's window, under the watermark's row lock; null when there is nothing to do. */
async function openWindow(tx: Tx, now: Date): Promise<Window | null> {
  const end = new Date(now.getTime() - LAG_MS);
  const [row] = await tx
    .select({ watermark: discoverySyncState.watermark })
    .from(discoverySyncState)
    .where(eq(discoverySyncState.key, WATERMARK_KEY))
    .for('update');
  if (!row) {
    await tx
      .insert(discoverySyncState)
      .values({ key: WATERMARK_KEY, watermark: end })
      .onConflictDoNothing();
    return null;
  }
  return row.watermark < end ? { start: row.watermark, end } : null;
}

async function closeWindow(tx: Tx, end: Date): Promise<void> {
  // Never backwards: a later run may have finished first.
  await tx.execute(sql`
    insert into app.discovery_sync_state (key, watermark)
    values (${WATERMARK_KEY}, ${end.toISOString()}::timestamptz)
    on conflict (key) do update
      set watermark = greatest(app.discovery_sync_state.watermark, excluded.watermark)
  `);
}

/** Active listings first active inside the window, newest first. */
async function newListingIds(tx: Tx, w: Window): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(
    tx,
    sql`select dl.listing_id::text as id from app.discovery_listings dl
      where dl.is_active
        and dl.first_active_at > ${w.start.toISOString()}::timestamptz
        and dl.first_active_at <= ${w.end.toISOString()}::timestamptz
      order by dl.first_active_at desc, dl.listing_id desc`,
  );
  return rows.map((r) => r.id);
}

/** The next users' saved searches: the first `size` after `afterUserId`, plus the rest of the last user's. */
async function searchChunk(
  tx: Tx,
  afterUserId: string | null,
  size: number,
): Promise<{ searches: ChunkSearch[]; lastUserId: string | null; more: boolean }> {
  const after = afterUserId ? sql`where s.user_id > ${afterUserId}::uuid` : sql``;
  const users = await queryRows<{ id: string }>(
    tx,
    sql`select distinct first.user_id::text as id from (
        select s.user_id from app.saved_searches s ${after}
        order by s.user_id, s.id limit ${size}
      ) first
      order by id`,
  );
  const lastUserId = users.at(-1)?.id ?? null;
  if (!lastUserId) return { searches: [], lastUserId: null, more: false };

  const rows = await tx
    .select()
    .from(savedSearches)
    .where(
      inArray(
        savedSearches.userId,
        users.map((u) => u.id),
      ),
    )
    .orderBy(asc(savedSearches.userId), asc(savedSearches.id));
  const [rest] = await queryRows<{ more: boolean }>(
    tx,
    sql`select exists (select 1 from app.saved_searches where user_id > ${lastUserId}::uuid) as more`,
  );
  return {
    searches: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      query: r.query as DiscoveryQuery,
      pushEnabled: r.pushEnabled,
      createdAt: r.createdAt,
    })),
    lastUserId,
    more: rest?.more === true,
  };
}

/** Inserts the matches, returning the listing ids that are new for this search. */
async function insertMatches(
  tx: Tx,
  searchId: string,
  listingIds: string[],
  now: Date,
): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(
    tx,
    sql`insert into app.saved_search_matches (saved_search_id, listing_id, matched_at)
      select ${searchId}::uuid, l.id, ${now.toISOString()}::timestamptz
      from unnest(${uuidArray(listingIds)}) as l(id)
      on conflict (saved_search_id, listing_id) do nothing
      returning listing_id::text as id`,
  );
  return rows.map((r) => r.id);
}

type Hit = { search: ChunkSearch; listingIds: string[] };

/** One push for this run's new matches, unless the user reached today's cap. */
async function pushAlert(tx: Tx, userId: string, hits: Hit[], now: Date, cap: number) {
  const day = now.toISOString().slice(0, 10);
  await tx.insert(alertSettings).values({ userId }).onConflictDoNothing();
  const [row] = await tx
    .select({ pushDay: alertSettings.pushDay, pushCount: alertSettings.pushCount })
    .from(alertSettings)
    .where(eq(alertSettings.userId, userId))
    .for('update');
  const sentToday = row?.pushDay === day ? row.pushCount : 0;
  if (sentToday >= cap) return;

  const count = new Set(hits.flatMap((h) => h.listingIds)).size;
  const [only] = hits;
  const data =
    hits.length === 1 && only
      ? {
          count,
          name: only.search.name,
          url: await searchPath(tx, only.search.query),
          savedSearchIds: [only.search.id],
        }
      : { count, url: ALERTS_PAGE, savedSearchIds: hits.map((h) => h.search.id) };
  await notify(tx, userId, ALERT_MATCH, data);
  await tx
    .update(alertSettings)
    .set({ pushDay: day, pushCount: sentToday + 1 })
    .where(eq(alertSettings.userId, userId));
  for (const h of hits) {
    await tx.execute(sql`update app.saved_search_matches set pushed_at = ${now.toISOString()}::timestamptz
      where saved_search_id = ${h.search.id}::uuid and listing_id = any(${uuidArray(h.listingIds)})`);
  }
}

/** One chunk of discovery.alerts_match. Exported for tests that run a chunk directly. */
export async function runAlertMatch(
  db: Db,
  payload: unknown,
  now: Date,
  chunkSize = SEARCH_CHUNK,
): Promise<void> {
  const p = parsePayload(matchPayload, payload, MATCH_TOPIC);
  await db.transaction(async (tx) => {
    const window =
      p.windowStart && p.windowEnd
        ? { start: new Date(p.windowStart), end: new Date(p.windowEnd) }
        : await openWindow(tx, now);
    if (!window) return;

    const newIds = await newListingIds(tx, window);
    if (newIds.length === 0) {
      await closeWindow(tx, window.end);
      return;
    }

    const { searches, lastUserId, more } = await searchChunk(tx, p.afterUserId ?? null, chunkSize);
    const today = todayIn(DEFAULT_TZ, now);
    const hitsByUser = new Map<string, Hit[]>();
    for (const search of searches) {
      const matched = await filterListingIds(tx, {
        listingIds: newIds,
        query: search.query,
        viewerUserId: search.userId,
        surface: 'alerts',
        today,
        firstActiveAfter: search.createdAt,
        limit: MATCHES_PER_SEARCH,
      });
      if (matched.length === 0) continue;
      const inserted = await insertMatches(tx, search.id, matched, now);
      if (inserted.length === 0 || !search.pushEnabled) continue;
      const hits = hitsByUser.get(search.userId) ?? [];
      hits.push({ search, listingIds: inserted });
      hitsByUser.set(search.userId, hits);
    }

    if (hitsByUser.size > 0) {
      const cap = await getSetting(tx, 'discovery.alert_push_daily_cap');
      for (const [userId, hits] of hitsByUser) await pushAlert(tx, userId, hits, now, cap);
    }

    if (more && lastUserId) {
      const windowEnd = window.end.toISOString();
      await enqueue(tx, {
        topic: MATCH_TOPIC,
        payload: { windowStart: window.start.toISOString(), windowEnd, afterUserId: lastUserId },
        dedupeKey: `alerts_match:${windowEnd}:${lastUserId}`,
      });
    } else {
      await closeWindow(tx, window.end);
    }
  });
}

// --- Daily and weekly emails -----------------------------------------------------------------

/** One job in an alert email; every URL is absolute. */
export type JobAlertItem = {
  title: string;
  host: string;
  location: string;
  pay: string;
  housing: string;
  meals: string;
  href: string;
};

/** The JobAlertDaily and JobAlertWeekly templates read this from the notification's data. */
export type JobAlertEmailData = {
  count: number;
  searches: { name: string; url: string; items: JobAlertItem[] }[];
};

/** "Housing provided · $150/week · deducted from pay", or "No housing". */
function amenityLine(a: Amenity, word: 'Housing' | 'Meals'): string {
  if (!a.provided) return `No ${word.toLowerCase()}`;
  return a.costLine ? `${word} provided · ${a.costLine}` : `${word} provided`;
}

function toItem(card: JobCardData, base: string): JobAlertItem {
  return {
    title: card.title,
    host: card.host.name,
    location: card.locationLabel,
    pay: card.pay.full,
    housing: amenityLine(card.housing, 'Housing'),
    meals: amenityLine(card.meals, 'Meals'),
    href: `${base}${card.href}`,
  };
}

/** The ids still active and not skipped, applied to or hidden for this user, in input order. */
async function stillShown(tx: Tx, userId: string, ids: string[], now: Date): Promise<string[]> {
  return filterListingIds(tx, {
    listingIds: ids,
    query: {},
    viewerUserId: userId,
    surface: 'alerts',
    today: todayIn(DEFAULT_TZ, now),
  });
}

async function itemsFor(tx: Tx, userId: string, ids: string[], now: Date) {
  const cards = await loadCards(tx, ids, {
    viewerUserId: userId,
    tz: DEFAULT_TZ,
    source: 'other',
    now,
  });
  const base = appUrl();
  return new Map(cards.map((c) => [c.listingId, toItem(c, base)]));
}

async function sendDaily(tx: Tx, userId: string, runAt: Date): Promise<void> {
  // Claim every unemailed match of the user's daily searches, newest first.
  const claimed = await queryRows<{ searchId: string; listingId: string }>(
    tx,
    sql`with claimed as (
        update app.saved_search_matches m set daily_emailed_at = ${runAt.toISOString()}::timestamptz
        from app.saved_searches s
        where s.id = m.saved_search_id and s.user_id = ${userId}::uuid and s.email_daily
          and m.daily_emailed_at is null
        returning m.saved_search_id, m.listing_id, m.matched_at
      )
      select c.saved_search_id::text as "searchId", c.listing_id::text as "listingId"
      from claimed c left join app.discovery_listings dl on dl.listing_id = c.listing_id
      order by c.matched_at desc, dl.published_at desc nulls last, c.listing_id desc`,
  );
  if (claimed.length === 0) return;

  const shown = new Set(
    await stillShown(tx, userId, [...new Set(claimed.map((c) => c.listingId))], runAt),
  );
  if (shown.size === 0) return;

  const searches = await tx
    .select()
    .from(savedSearches)
    .where(and(eq(savedSearches.userId, userId), eq(savedSearches.emailDaily, true)))
    .orderBy(asc(savedSearches.createdAt), asc(savedSearches.id));
  const picked = searches
    .map((s) => ({
      search: s,
      ids: claimed
        .filter((c) => c.searchId === s.id && shown.has(c.listingId))
        .map((c) => c.listingId)
        .slice(0, EMAIL_ITEMS),
    }))
    .filter((x) => x.ids.length > 0);
  if (picked.length === 0) return;

  const items = await itemsFor(
    tx,
    userId,
    picked.flatMap((x) => x.ids),
    runAt,
  );
  const base = appUrl();
  const data: JobAlertEmailData = { count: shown.size, searches: [] };
  for (const { search, ids } of picked) {
    const list = ids.flatMap((id) => {
      const item = items.get(id);
      return item ? [item] : [];
    });
    if (list.length === 0) continue;
    const url = `${base}${await searchPath(tx, search.query as DiscoveryQuery)}`;
    data.searches.push({ name: search.name, url, items: list });
  }
  if (data.searches.length > 0) await notify(tx, userId, ALERT_DAILY, data);
}

async function sendWeekly(tx: Tx, userId: string, runAt: Date): Promise<void> {
  const since = new Date(runAt.getTime() - WEEK_MS);
  // Claim the week's matches; a listing two searches matched counts once, at its newest match.
  const claimed = await queryRows<{ listingId: string }>(
    tx,
    sql`with claimed as (
        update app.saved_search_matches m set weekly_emailed_at = ${runAt.toISOString()}::timestamptz
        from app.saved_searches s
        where s.id = m.saved_search_id and s.user_id = ${userId}::uuid
          and m.weekly_emailed_at is null and m.matched_at >= ${since.toISOString()}::timestamptz
        returning m.listing_id, m.matched_at
      )
      select c.listing_id::text as "listingId"
      from claimed c left join app.discovery_listings dl on dl.listing_id = c.listing_id
      group by c.listing_id, dl.published_at
      order by max(c.matched_at) desc, dl.published_at desc nulls last, c.listing_id desc`,
  );
  if (claimed.length === 0) return;

  const shown = await stillShown(
    tx,
    userId,
    claimed.map((c) => c.listingId),
    runAt,
  );
  const ids = shown.slice(0, EMAIL_ITEMS);
  if (ids.length === 0) return;
  const items = await itemsFor(tx, userId, ids, runAt);
  const list = ids.flatMap((id) => {
    const item = items.get(id);
    return item ? [item] : [];
  });
  if (list.length === 0) return;
  const data: JobAlertEmailData = {
    count: shown.length,
    searches: [{ name: WEEKLY_NAME, url: `${appUrl()}${ALERTS_PAGE}`, items: list }],
  };
  await notify(tx, userId, ALERT_WEEKLY, data);
}

/** The next users to email: those with something pending, after `afterUserId`. */
async function emailUsers(
  db: Db,
  kind: 'daily' | 'weekly',
  afterUserId: string | null,
  limit: number,
): Promise<string[]> {
  const after = afterUserId ? sql`and s.user_id > ${afterUserId}::uuid` : sql``;
  const rows =
    kind === 'daily'
      ? await queryRows<{ id: string }>(
          db,
          sql`select distinct s.user_id::text as id from app.saved_searches s
            where s.email_daily ${after}
              and exists (select 1 from app.saved_search_matches m
                where m.saved_search_id = s.id and m.daily_emailed_at is null)
            order by id limit ${limit}`,
        )
      : await queryRows<{ id: string }>(
          db,
          sql`select s.user_id::text as id from app.alert_settings s
            where s.weekly_digest ${after}
            order by s.user_id limit ${limit}`,
        );
  return rows.map((r) => r.id);
}

/**
 * One chunk of discovery.alerts_daily or discovery.alerts_weekly. Exported for tests, which
 * pass a small chunk size.
 */
export async function runAlertEmails(
  db: Db,
  kind: 'daily' | 'weekly',
  payload: unknown,
  now: Date,
  chunkSize = USER_CHUNK,
): Promise<void> {
  const topic = kind === 'daily' ? DAILY_TOPIC : WEEKLY_TOPIC;
  const p = parsePayload(emailPayload, payload, topic);
  const runAt = p.runAt ? new Date(p.runAt) : now;
  const users = await emailUsers(db, kind, p.afterUserId ?? null, chunkSize + 1);
  const chunk = users.slice(0, chunkSize);
  for (const userId of chunk) {
    await db.transaction((tx) =>
      kind === 'daily' ? sendDaily(tx, userId, runAt) : sendWeekly(tx, userId, runAt),
    );
  }
  const last = chunk.at(-1);
  if (users.length > chunkSize && last) {
    const at = runAt.toISOString();
    await enqueue(db, {
      topic,
      payload: { runAt: at, afterUserId: last },
      dedupeKey: `alerts_${kind}:${at}:${last}`,
    });
  }
}

export const alertHandlers: HandlerMap = {
  [MATCH_TOPIC]: (payload, { db, now }) => runAlertMatch(db, payload, now),
  [DAILY_TOPIC]: (payload, { db, now }) => runAlertEmails(db, 'daily', payload, now),
  [WEEKLY_TOPIC]: (payload, { db, now }) => runAlertEmails(db, 'weekly', payload, now),
};
