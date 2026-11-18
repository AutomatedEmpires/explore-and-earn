import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { PrivacyHandler } from '@/modules/privacy';
import { buildPrivacyRegistry, privacyRegistry } from '@/server/privacy-registry';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { computeCoverage } from './coverage-report';

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

  it('prints the live report and refuses a table that is both claimed and exempt', async () => {
    t = await createTestDb();
    const report = await computeCoverage(t.db, privacyRegistry);
    console.info('privacy coverage', report);
    expect(report.claimedAndExempt).toEqual([]);
  });
});
