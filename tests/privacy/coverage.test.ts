import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { PrivacyHandler } from '@/modules/privacy';
import { buildPrivacyRegistry, privacyRegistry } from '@/server/privacy-registry';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import {
  computeCoverage,
  EXPECTED_PRIVACY_MODULES,
  PENDING_CLAIMED_TABLES,
  type CoverageReport,
} from './coverage-report';

function handler(module: string, tables: readonly string[], mediaColumns?: PrivacyHandler['mediaColumns']): PrivacyHandler {
  return {
    module,
    tables,
    mediaColumns,
    async exportData() {
      return { records: {}, files: [] };
    },
    async erase() {
      return { erased: 0, retained: [] };
    },
  };
}

/**
 * The report without the claims whose table has not merged yet (PENDING_CLAIMED_TABLES). A
 * table or a media column with no handler is never excused, and neither is a declared media
 * column that does not exist: the media retention rules refuse to run on either.
 */
function gaps(report: CoverageReport): CoverageReport {
  const pending = (table: string) => Object.hasOwn(PENDING_CLAIMED_TABLES, table);
  return {
    ...report,
    claimedButMissing: report.claimedButMissing.filter((table) => !pending(table)),
  };
}

describe('computeCoverage', () => {
  let t: TestDb | undefined;

  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  it('reports unclaimed tables, missing claims and undeclared media columns', async () => {
    t = await createTestDb();
    const onlyUsers = buildPrivacyRegistry([
      { handler: handler('identity', ['users']), rules: [] },
    ]);
    const first = await computeCoverage(t.db, onlyUsers);
    expect(first.unclaimed).toContain('media');
    expect(first.unclaimed).not.toContain('users');
    expect(first.unclaimed).not.toContain('schema_migrations');

    const ghost = buildPrivacyRegistry([
      { handler: handler('identity', ['users', 'ghost']), rules: [] },
    ]);
    expect((await computeCoverage(t.db, ghost)).claimedButMissing).toEqual(['ghost']);

    await t.db.execute(
      sql`create table app.zz_cov (id uuid primary key, cover_media_id uuid)`,
    );
    const undeclared = await computeCoverage(t.db, onlyUsers);
    expect(undeclared.undeclaredMediaColumns).toContain('zz_cov.cover_media_id');

    const declared = buildPrivacyRegistry([
      {
        handler: handler('identity', ['users'], [
          { table: 'zz_cov', column: 'cover_media_id', array: false },
        ]),
        rules: [],
      },
    ]);
    expect((await computeCoverage(t.db, declared)).undeclaredMediaColumns).not.toContain(
      'zz_cov.cover_media_id',
    );
  });

  // D2, enforcing: a table, a media column or a module with no handler fails the build.
  it('finds a handler for every table, media column and module', async () => {
    t = await createTestDb();
    const report = await computeCoverage(t.db, privacyRegistry);
    expect(gaps(report)).toEqual({
      unclaimed: [],
      claimedButMissing: [],
      exemptButMissing: [],
      claimedAndExempt: [],
      undeclaredMediaColumns: [],
      declaredMediaColumnsMissing: [],
      missingModules: [],
      unregisteredModuleDirs: [],
    });
  });

  // The media retention rules (media.orphans and its sibling) refuse to run, and alert every
  // day, while either list is non-empty. Nothing is excused here, pending or not.
  it('declares every *media_id* column, and none that does not exist', async () => {
    t = await createTestDb();
    const report = await computeCoverage(t.db, privacyRegistry);
    expect(report.undeclaredMediaColumns).toEqual([]);
    expect(report.declaredMediaColumnsMissing).toEqual([]);
  });

  it('registers exactly the expected modules, and every rule under a registered module', () => {
    const modules = privacyRegistry.handlers.map((h) => h.module);
    expect([...modules].sort()).toEqual([...EXPECTED_PRIVACY_MODULES].sort());
    for (const rule of privacyRegistry.rules) {
      expect(modules, rule.key).toContain(rule.key.split('.')[0]);
    }
  });
});
