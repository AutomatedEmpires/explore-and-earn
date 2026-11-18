import { readdirSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { queryRows } from '@/lib/db';
import { PRIVACY_EXEMPT_TABLES } from '@/modules/privacy';
import type { PrivacyRegistry } from '@/server/privacy-registry';

/** The 32 modules the enforcing coverage test (D2) expects, once every sub-project has registered. */
export const EXPECTED_PRIVACY_MODULES = [
  'identity',
  'orgs',
  'media',
  'notifications',
  'trust',
  'jobs',
  'audit',
  'settings',
  'operator',
  'entitlements',
  'billing',
  'locations',
  'listings',
  'hostpages',
  'verification',
  'discovery',
  'landing',
  'profiles',
  'applications',
  'safety',
  'hiring',
  'messaging',
  'analytics',
  'addons',
  'boosts',
  'announcements',
  'promote',
  'community',
  'privacy',
  'support',
  'content',
  'launch',
] as const;

export type CoverageReport = {
  unclaimed: string[];
  claimedButMissing: string[];
  exemptButMissing: string[];
  claimedAndExempt: string[];
  undeclaredMediaColumns: string[];
  declaredMediaColumnsMissing: string[];
  missingModules: string[];
  unregisteredModuleDirs: string[];
};

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

/**
 * Report-only until W1. Tables are base tables in schema `app`. Media-id columns are any
 * column whose name contains `media_id`, except columns of `app.media` itself.
 */
export async function computeCoverage(
  db: DbOrTx,
  reg: PrivacyRegistry,
  exempt: Readonly<Record<string, string>> = PRIVACY_EXEMPT_TABLES,
): Promise<CoverageReport> {
  const tables = await queryRows<{ table_name: string }>(
    db,
    sql`select table_name from information_schema.tables
        where table_schema = 'app' and table_type = 'BASE TABLE'`,
  );
  const columns = await queryRows<{ table_name: string; column_name: string }>(
    db,
    sql`select table_name, column_name from information_schema.columns
        where table_schema = 'app'`,
  );

  const dbTables = new Set(tables.map((row) => row.table_name));
  const claimed = new Set(reg.handlers.flatMap((handler) => handler.tables));
  const exemptNames = new Set(Object.keys(exempt));
  const registered = new Set(reg.handlers.map((handler) => handler.module));

  const declared = new Set(
    reg.handlers.flatMap((handler) =>
      (handler.mediaColumns ?? []).map((column) => `${column.table}.${column.column}`),
    ),
  );
  const existingColumns = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
  const mediaIdColumns = columns
    .filter((row) => row.table_name !== 'media' && row.column_name.includes('media_id'))
    .map((row) => `${row.table_name}.${row.column_name}`);

  const moduleDirs = readdirSync(path.resolve('src/modules'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  return {
    unclaimed: sorted([...dbTables].filter((table) => !claimed.has(table) && !exemptNames.has(table))),
    claimedButMissing: sorted([...claimed].filter((table) => !dbTables.has(table))),
    exemptButMissing: sorted([...exemptNames].filter((table) => !dbTables.has(table))),
    claimedAndExempt: sorted([...claimed].filter((table) => exemptNames.has(table))),
    undeclaredMediaColumns: sorted(mediaIdColumns.filter((name) => !declared.has(name))),
    declaredMediaColumnsMissing: sorted([...declared].filter((name) => !existingColumns.has(name))),
    missingModules: sorted(EXPECTED_PRIVACY_MODULES.filter((name) => !registered.has(name))),
    unregisteredModuleDirs: sorted(moduleDirs.filter((name) => !registered.has(name))),
  };
}
