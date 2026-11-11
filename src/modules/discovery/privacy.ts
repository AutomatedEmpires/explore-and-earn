// A seeker's discovery data for export and erasure, and the SP8 registration (SP3 spec 10;
// SP8 section 3; plan Task 26).
//
// The personal data is the seeker's dispositions, saved searches (with their matches) and alert
// settings. The projection holds public listing data, and the event tables hold no user id, so
// neither is exported or erased for a person: an org's projection rows leave through sync when
// SP2 closes or removes its listings.
import { asc, eq, sql } from 'drizzle-orm';
import { queryRows, withTx, type Db, type DbOrTx, type Tx } from '@/lib/db';
import type { DiscoveryExport, DiscoveryQuery } from '@/lib/discovery';
import type { EraseResult, ExportPart, PrivacyHandler, RetentionRule } from '@/modules/privacy';
import { deleteRawEventsBefore, RAW_EVENT_RETENTION_DAYS } from './events';
import { alertSettings, listingDispositions, savedSearches } from './schema';

const DAY_MS = 86_400_000;

/** The user's tables, in the order they are erased. */
const USER_TABLES = ['listing_dispositions', 'saved_searches', 'alert_settings'] as const;

export async function exportUserData(db: DbOrTx, userId: string): Promise<DiscoveryExport> {
  const dispositions = await db
    .select({
      listingId: listingDispositions.listingId,
      state: listingDispositions.state,
      actedAt: listingDispositions.actedAt,
    })
    .from(listingDispositions)
    .where(eq(listingDispositions.userId, userId))
    .orderBy(asc(listingDispositions.actedAt), asc(listingDispositions.listingId));
  const searches = await db
    .select({
      name: savedSearches.name,
      query: savedSearches.query,
      createdAt: savedSearches.createdAt,
    })
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(asc(savedSearches.createdAt), asc(savedSearches.id));
  const [settings] = await db
    .select({ weeklyDigest: alertSettings.weeklyDigest })
    .from(alertSettings)
    .where(eq(alertSettings.userId, userId));

  const inState = (state: 'saved' | 'skipped') =>
    dispositions
      .filter((d) => d.state === state)
      .map((d) => ({ listingId: d.listingId, at: d.actedAt.toISOString() }));
  return {
    saved: inState('saved'),
    skipped: inState('skipped'),
    savedSearches: searches.map((s) => ({
      name: s.name,
      query: s.query as DiscoveryQuery,
      createdAt: s.createdAt.toISOString(),
    })),
    alertSettings: { weeklyDigest: settings?.weeklyDigest ?? false },
  };
}

/** Hard-deletes the user's rows (saved-search matches cascade) and returns how many went. */
async function deleteUserRows(tx: Tx, userId: string): Promise<number> {
  const dispositions = await tx
    .delete(listingDispositions)
    .where(eq(listingDispositions.userId, userId))
    .returning({ id: listingDispositions.listingId });
  const searches = await tx
    .delete(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .returning({ id: savedSearches.id });
  const settings = await tx
    .delete(alertSettings)
    .where(eq(alertSettings.userId, userId))
    .returning({ id: alertSettings.userId });
  return dispositions.length + searches.length + settings.length;
}

export async function eraseUserData(db: Db, userId: string): Promise<void> {
  await withTx(db, (tx) => deleteUserRows(tx, userId));
}

/** The user's tables that hold rows, for a legal hold. */
async function tablesWithRows(tx: Tx, userId: string): Promise<string[]> {
  const [row] = await queryRows<Record<(typeof USER_TABLES)[number], boolean>>(
    tx,
    sql`select
      exists (select 1 from app.listing_dispositions where user_id = ${userId}::uuid)
        as listing_dispositions,
      exists (select 1 from app.saved_searches where user_id = ${userId}::uuid) as saved_searches,
      exists (select 1 from app.alert_settings where user_id = ${userId}::uuid) as alert_settings`,
  );
  return USER_TABLES.filter((table) => row?.[table] === true);
}

export const privacyHandler: PrivacyHandler = {
  module: 'discovery',
  tables: [
    'discovery_listings',
    'discovery_sync_state',
    'listing_dispositions',
    'listing_events',
    'listing_event_daily',
    'saved_searches',
    'saved_search_matches',
    'alert_settings',
  ],
  // `cover` holds media URLs, not media ids, so there is nothing for the orphan sweep.

  async exportData(db, s): Promise<ExportPart> {
    if (s.kind !== 'user') return { records: {}, files: [] };
    const data = await exportUserData(db, s.userId);
    return {
      records: {
        saved_jobs: data.saved,
        skipped_jobs: data.skipped,
        saved_searches: data.savedSearches,
        alert_settings: [data.alertSettings],
      },
      files: [],
    };
  },

  async erase(tx, s, ctx): Promise<EraseResult> {
    if (s.kind !== 'user') return { erased: 0, retained: [] };
    if (ctx.holds.includes('all')) {
      const held = await tablesWithRows(tx, s.userId);
      return {
        erased: 0,
        retained: held.map((table) => ({ table, reason: 'legal_hold', until: null })),
      };
    }
    return { erased: await deleteUserRows(tx, s.userId), retained: [] };
  },
};

export const retentionRules: RetentionRule[] = [
  {
    key: 'discovery.listing_events_raw',
    description:
      'Raw listing events (views, saves, shares and applies) are deleted after 90 days. Daily counts are kept.',
    async run(db, now, limit) {
      const cutoff = new Date(now.getTime() - RAW_EVENT_RETENTION_DAYS * DAY_MS);
      return { deleted: await deleteRawEventsBefore(db, cutoff, limit) };
    },
  },
];
