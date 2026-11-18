// The privacy module's own retention rules (SP8 spec 8.3): rate-limit windows and expired data
// downloads. Every rule compares with `<`, so a row exactly at its limit is kept.
import { sql } from 'drizzle-orm';
import { queryRows } from '@/lib/db';
import type { RetentionRule } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_KEEP_DAYS = 2;

/** The one storage call the exports rule makes. */
export type ExportStore = { remove(bucket: 'privacy-exports', path: string): Promise<void> };

const rateLimitWindows: RetentionRule = {
  key: 'privacy.rate_limit_windows_2d',
  description: 'Rate-limit counters are deleted after 2 days.',
  async run(db, now, limit) {
    // The ratelimit module owns the table. Loaded on first use, like every module this one calls.
    const { purgeRateLimitWindows } = await import('@/modules/ratelimit');
    const cutoff = new Date(now.getTime() - RATE_LIMIT_KEEP_DAYS * DAY_MS);
    return { deleted: await purgeRateLimitWindows(db, cutoff, limit) };
  },
};

/**
 * Deletes the zip of each export whose `export_expires_at` has passed, then clears its path, so
 * the download answers "expired" and the file is gone. The request row stays as the record that
 * the export was made. The 7 days are set when the export completes (`privacy.export_ttl_days`).
 *
 * The object is removed before the path is cleared: if the run stops in between, the next run
 * finds the path again and removing a missing object is not an error.
 */
export function createExportsRule(getStore: () => Promise<ExportStore>): RetentionRule {
  return {
    key: 'privacy.exports_7d',
    description: "Your data downloads are deleted 7 days after they're ready.",
    async run(db, now, limit) {
      const expired = await queryRows<{ id: string; export_path: string }>(
        db,
        sql`
          select id, export_path from app.privacy_requests
          where kind = 'export'
            and export_path is not null
            and export_expires_at < ${now.toISOString()}::timestamptz
          order by export_expires_at
          limit ${limit}
        `,
      );
      if (expired.length === 0) return { deleted: 0 };
      const store = await getStore();
      let deleted = 0;
      for (const row of expired) {
        await store.remove('privacy-exports', row.export_path);
        await db.execute(
          sql`update app.privacy_requests set export_path = null where id = ${row.id}::uuid`,
        );
        deleted += 1;
      }
      return { deleted };
    },
  };
}

/** The configured storage. Loaded on first use: media's barrel imports this module. */
async function configuredStore(): Promise<ExportStore> {
  const { getStorage } = await import('@/modules/media');
  return getStorage();
}

export const coreRetentionRules: RetentionRule[] = [
  rateLimitWindows,
  createExportsRule(configuredStore),
];
