// CI Postgres (the integration job). Locally, typecheck this file; do not run it.
import { afterAll, describe, expect, it } from 'vitest';
import { closeClient, createDb } from '@/lib/db';
import { privacyRegistry } from '@/server/privacy-registry';
import { computeCoverage } from './coverage-report';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

afterAll(async () => {
  await closeClient(db);
});

describe('privacy coverage (postgres)', () => {
  it('prints the report and refuses a table that is both claimed and exempt', async () => {
    const report = await computeCoverage(db, privacyRegistry);
    console.info('privacy coverage', report);
    expect(report.claimedAndExempt).toEqual([]);
  });
});
