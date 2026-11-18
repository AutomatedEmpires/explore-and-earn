// Retention for uploaded files (SP8 spec 8.3):
// - an upload that never finished, or never passed scanning, goes after 7 days;
// - an approved file that nothing uses anymore goes after 30 days.
//
// "Nothing uses" means: no column a module declared in its privacy handler's `mediaColumns`
// holds the file's id. A module that forgets to declare a column would lose files that are
// still shown, so the registered rules refuse to run while any `*media_id*` column in schema
// `app` is undeclared (Review Focus 1 and 2). They fail closed: the run is recorded as failed,
// an Owner is alerted, and no file is deleted.
//
// Rows are deleted in one transaction together with the `media.cleanup` job that removes their
// stored objects, so a crash never leaves stored objects without their cleanup.
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, type Db, type DbOrTx } from '@/lib/db';
import { enqueue } from '@/modules/jobs';
import type { MediaColumnRef, RetentionRule } from '@/modules/privacy';
import type { Bucket } from './kinds';
import { CLEANUP_TOPIC } from './scan';

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_UPLOAD_DAYS = 7;
const ORPHAN_DAYS = 30;

/** The columns that may hold a media id, for one run. */
export type MediaColumnsLoader = (db: DbOrTx) => Promise<readonly MediaColumnRef[]>;

const NAME = /^[a-z_][a-z0-9_]*$/;

/**
 * Throws unless every `*media_id*` column in schema `app` (outside the media table itself) is
 * in `declared`, and every declared column exists. The message holds table and column names
 * only.
 */
export async function assertMediaColumnsDeclared(
  db: DbOrTx,
  declared: readonly MediaColumnRef[],
): Promise<void> {
  const rows = await queryRows<{ table_name: string; column_name: string }>(
    db,
    sql`
      select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'app' and t.table_type = 'BASE TABLE'
    `,
  );
  const existing = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const declaredNames = new Set(declared.map((ref) => `${ref.table}.${ref.column}`));

  const undeclared = rows
    .filter((row) => row.table_name !== 'media' && row.column_name.includes('media_id'))
    .map((row) => `${row.table_name}.${row.column_name}`)
    .filter((name) => !declaredNames.has(name))
    .sort();
  if (undeclared.length > 0) {
    throw new Error(
      `Media retention refused: no privacy handler declares ${undeclared.join(', ')} in mediaColumns`,
    );
  }
  const missing = [...declaredNames].filter((name) => !existing.has(name)).sort();
  if (missing.length > 0) {
    throw new Error(
      `Media retention refused: declared media columns do not exist: ${missing.join(', ')}`,
    );
  }
}

/** Every registered module's `mediaColumns`, after checking that none is missing. */
export const registeredMediaColumns: MediaColumnsLoader = async (db) => {
  // Loaded on first use: the privacy barrel is still loading when this file is first imported.
  const { loadPrivacyRegistry } = await import('@/modules/privacy');
  const registry = await loadPrivacyRegistry();
  const declared = registry.handlers.flatMap((handler) => [...(handler.mediaColumns ?? [])]);
  await assertMediaColumnsDeclared(db, declared);
  return declared;
};

/** `and not exists (...)` per column: true for a file (`m`) that none of the columns holds. */
function unreferenced(columns: readonly MediaColumnRef[]): SQL {
  const clauses = columns.map((ref) => {
    if (!NAME.test(ref.table) || !NAME.test(ref.column)) {
      throw new Error(`Media retention refused: bad media column ${ref.table}.${ref.column}`);
    }
    const table = sql`${sql.identifier('app')}.${sql.identifier(ref.table)}`;
    const column = sql`r.${sql.identifier(ref.column)}`;
    return ref.array
      ? sql`and not exists (select 1 from ${table} r where m.id = any(${column}))`
      : sql`and not exists (select 1 from ${table} r where ${column} = m.id)`;
  });
  return sql.join(clauses, sql` `);
}

type DeletedRow = {
  id: string;
  bucket: Bucket;
  path: string;
  variants: Record<string, string> | null;
};

/** Deletes the matching rows and queues the removal of their stored objects. */
async function deleteWithObjects(
  db: Db,
  where: SQL,
  columns: readonly MediaColumnRef[],
  limit: number,
): Promise<{ deleted: number }> {
  return db.transaction(async (tx) => {
    const rows = await queryRows<DeletedRow>(
      tx,
      sql`
        delete from app.media
        where id in (
          select m.id from app.media m
          where ${where} ${unreferenced(columns)}
          order by m.updated_at
          limit ${limit}
          for update of m skip locked
        )
        returning id, bucket, path, variants
      `,
    );
    for (const row of rows) {
      const paths = new Set([row.path, ...Object.values(row.variants ?? {})]);
      const objects = [...paths].flatMap((path) =>
        // An upload starts in quarantine under the same path; remove that copy as well.
        row.bucket === 'quarantine'
          ? [{ bucket: row.bucket, path }]
          : [
              { bucket: row.bucket, path },
              { bucket: 'quarantine' as const, path },
            ],
      );
      await enqueue(tx, { topic: CLEANUP_TOPIC, payload: { mediaId: row.id, objects } });
    }
    return { deleted: rows.length };
  });
}

/** The two media rules over `loadColumns` (tests pass their own column list). */
export function createMediaRetentionRules(loadColumns: MediaColumnsLoader): RetentionRule[] {
  return [
    {
      key: 'media.uploads_stale',
      description: 'Uploads that never finished or never passed scanning are deleted after 7 days.',
      async run(db, now, limit) {
        const cutoff = new Date(now.getTime() - STALE_UPLOAD_DAYS * DAY_MS).toISOString();
        return deleteWithObjects(
          db,
          sql`m.status in ('uploaded', 'scanning') and m.created_at < ${cutoff}::timestamptz`,
          await loadColumns(db),
          limit,
        );
      },
    },
    {
      key: 'media.orphans',
      description: 'Uploaded files that nothing uses anymore are deleted after 30 days.',
      async run(db, now, limit) {
        const cutoff = new Date(now.getTime() - ORPHAN_DAYS * DAY_MS).toISOString();
        return deleteWithObjects(
          db,
          sql`m.status = 'approved' and m.updated_at < ${cutoff}::timestamptz`,
          await loadColumns(db),
          limit,
        );
      },
    },
  ];
}

export const retentionRules: RetentionRule[] = createMediaRetentionRules(registeredMediaColumns);
