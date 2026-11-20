// Media's privacy handler. It runs in the last erase wave, after every other module, so it can
// see which files the records those modules kept still use. A file is deleted, with every
// stored copy, unless it is child-safety evidence (`blocked`) or a kept record still points at
// it through a registered media column.
//
// While the person or organization has a legal hold of any scope, nothing is deleted (lead
// decision 2026-11-18, the same rule as `media.orphans`). A held record can show a file that
// no registered column names: a held application keeps its photo ids inside its snapshot
// JSON. Releasing the hold queues the erasure again, and that run removes the files.
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { enqueue } from '@/modules/jobs';
import type {
  EraseResult,
  HoldScope,
  MediaColumnRef,
  PrivacyHandler,
  PrivacySubject,
} from '@/modules/privacy';
import { exportFileName } from './export';
import { CLEANUP_TOPIC } from './scan';
import { media } from './schema';
import type { ObjectRef } from './storage';

const ownedBy = (s: PrivacySubject) =>
  s.kind === 'user' ? eq(media.ownerUserId, s.userId) : eq(media.ownerOrgId, s.orgId);

/** Every registered column that holds media ids (the same list the orphan sweep reads). */
async function registeredMediaColumns(): Promise<MediaColumnRef[]> {
  const { privacyRegistry } = await import('@/server/privacy-registry');
  return privacyRegistry.handlers.flatMap((handler) => [...(handler.mediaColumns ?? [])]);
}

/** Which of `ids` a registered column still references. Columns not in this database are skipped. */
async function stillReferenced(
  db: DbOrTx,
  ids: string[],
  columns: readonly MediaColumnRef[],
): Promise<Set<string>> {
  const found = new Set<string>();
  if (ids.length === 0 || columns.length === 0) return found;
  const existing = new Set(
    (
      await queryRows<{ name: string }>(
        db,
        sql`select table_name || '.' || column_name as name
            from information_schema.columns where table_schema = 'app'`,
      )
    ).map((row) => row.name),
  );
  const wanted = sql`array[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
  for (const ref of columns) {
    if (ref.table === 'media' || !existing.has(`${ref.table}.${ref.column}`)) continue;
    const table = sql`app.${sql.identifier(ref.table)}`;
    const column = sql.identifier(ref.column);
    const rows = await queryRows<{ id: string }>(
      db,
      ref.array
        ? sql`select distinct ref::text as id
              from ${table} t, unnest(t.${column}) as ref
              where t.${column} && ${wanted} and ref = any(${wanted})`
        : sql`select distinct t.${column}::text as id from ${table} t
              where t.${column} = any(${wanted})`,
    );
    for (const row of rows) found.add(row.id);
  }
  return found;
}

/** Every stored copy of a file: its objects in its bucket, and any left in quarantine. */
function objectsOf(row: typeof media.$inferSelect): ObjectRef[] {
  const paths = new Set([row.path, ...Object.values(row.variants ?? {})]);
  const objects: ObjectRef[] = [];
  for (const path of paths) {
    objects.push({ bucket: row.bucket, path });
    if (row.bucket !== 'quarantine') objects.push({ bucket: 'quarantine', path });
  }
  return objects;
}

/** The eraser. `columns` replaces the registered media columns (tests). */
export async function eraseMedia(
  tx: DbOrTx,
  s: PrivacySubject,
  ctx: { holds: HoldScope[] },
  columns?: readonly MediaColumnRef[],
): Promise<EraseResult> {
  const rows = await tx.select().from(media).where(ownedBy(s)).orderBy(asc(media.id)).for('update');
  if (rows.length === 0) return { erased: 0, retained: [] };
  if (ctx.holds.length > 0) {
    return { erased: 0, retained: [{ table: 'media', reason: 'legal_hold', until: null }] };
  }

  const blocked = rows.filter((row) => row.status === 'blocked');
  const rest = rows.filter((row) => row.status !== 'blocked');
  const referenced = await stillReferenced(
    tx,
    rest.map((row) => row.id),
    columns ?? (await registeredMediaColumns()),
  );
  const doomed = rest.filter((row) => !referenced.has(row.id));

  for (const row of doomed) {
    // The job runs after this transaction commits; with the row gone it removes every copy.
    await enqueue(tx, { topic: CLEANUP_TOPIC, payload: { mediaId: row.id, objects: objectsOf(row) } });
  }
  if (doomed.length > 0) {
    await tx.delete(media).where(
      inArray(
        media.id,
        doomed.map((row) => row.id),
      ),
    );
  }

  const retained: EraseResult['retained'] = [];
  if (blocked.length > 0) retained.push({ table: 'media', reason: 'safety', until: null });
  if (referenced.size > 0) {
    // A record someone else keeps still uses the file.
    retained.push({ table: 'media', reason: 'shared_record', until: null });
  }
  return { erased: doomed.length, retained };
}

export const privacyHandler: PrivacyHandler = {
  module: 'media',
  tables: ['media'],

  /** The approved files the person uploaded, and what we record about each. */
  async exportData(db, s) {
    if (s.kind !== 'user') return { records: { uploads: [] }, files: [] };
    const rows = await db
      .select({
        id: media.id,
        kind: media.kind,
        status: media.status,
        altText: media.altText,
        variants: media.variants,
        createdAt: media.createdAt,
      })
      .from(media)
      .where(eq(media.ownerUserId, s.userId))
      .orderBy(asc(media.id));
    const approved = rows.filter((row) => row.status === 'approved');
    return {
      records: {
        uploads: approved.map((row) => ({
          file: exportFileName(row),
          kind: row.kind,
          altText: row.altText,
          uploadedAt: row.createdAt,
        })),
      },
      files: approved.map((row) => ({ mediaId: row.id, name: exportFileName(row) })),
    };
  },

  erase: (tx, s, ctx) => eraseMedia(tx, s, ctx),
};
