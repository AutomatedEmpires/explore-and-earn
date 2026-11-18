// CI Postgres (the integration job). Locally, typecheck this file; do not run it.
import { afterAll, describe, expect, it } from 'vitest';
import { closeClient, createDb } from '@/lib/db';
import { privacyRegistry } from '@/server/privacy-registry';
import {
  computeCoverage,
  PENDING_CLAIMED_TABLES,
  type CoverageReport,
} from './coverage-report';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

afterAll(async () => {
  await closeClient(db);
});

/**
 * The report without the claims whose table has not merged yet (PENDING_CLAIMED_TABLES). A
 * table or a media column with no handler is never excused.
 */
function gaps(report: CoverageReport): CoverageReport {
  const pending = (table: string) => Object.hasOwn(PENDING_CLAIMED_TABLES, table);
  return {
    ...report,
    claimedButMissing: report.claimedButMissing.filter((table) => !pending(table)),
    declaredMediaColumnsMissing: report.declaredMediaColumnsMissing.filter(
      (name) => !pending(name.split('.')[0] ?? ''),
    ),
  };
}

describe('privacy coverage (postgres)', () => {
  it('finds a handler for every table, media column and module', async () => {
    const report = await computeCoverage(db, privacyRegistry);
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
});
