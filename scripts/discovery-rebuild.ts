// `pnpm discovery:rebuild`: brings the whole search projection back in line with SP2's listings,
// with the drift check's two passes, and records `discovery.projection_rebuilt` (SP3 plan Task 9).
// Run it after a database restore. It removes every row with no live listing behind it, synthetic
// rows included.
//
// Needs the app environment, since getDb() validates it. Reads .env.local when present;
// variables already set in the shell take precedence.
//
// Identity loads first because of the orgs↔identity evaluation-order cycle: discovery reaches orgs
// through listings, and under plain tsx orgs must not load before identity (see
// tests/fixtures/scripts/import-server-modules.ts). Drop this line once that cycle is broken.
import '../src/modules/identity';
import { existsSync } from 'node:fs';
import { closeDb, getDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import { rebuildSearchProjection } from '../src/modules/discovery';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

try {
  const counts = await rebuildSearchProjection(getDb());
  logger.info('search projection rebuilt', counts);
} catch (err) {
  logger.error('discovery:rebuild failed', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
} finally {
  await closeDb();
}
