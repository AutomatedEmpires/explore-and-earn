// `pnpm discovery:seed-synthetic --count 50000 --seed 42`: writes deterministic synthetic rows
// into the search projection, for the performance gate (SP3 plan Tasks 11 and 47). They are
// projection rows only, with no listing, host or location behind them, so `pnpm discovery:rebuild`
// removes them again. Refused when APP_ENV=prod. The seed defaults to 42.
//
// Needs the app environment, since getDb() validates it. Reads .env.local when present;
// variables already set in the shell take precedence.
//
// Identity loads first because of the orgs↔identity evaluation-order cycle: discovery reaches orgs
// through listings, and under plain tsx orgs must not load before identity (see
// tests/fixtures/scripts/import-server-modules.ts). Drop this line once that cycle is broken.
import '../src/modules/identity';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { closeDb, getDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import { seedSynthetic } from '../src/modules/discovery';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { count: { type: 'string' }, seed: { type: 'string', default: '42' } },
});

const count = Number(values.count);
const seed = Number(values.seed);
if (!Number.isInteger(count) || count < 1 || !Number.isInteger(seed)) {
  logger.error('usage: pnpm discovery:seed-synthetic --count <n> [--seed <integer>]');
  process.exit(1);
}

try {
  await seedSynthetic(getDb(), { count, seed });
  logger.info('synthetic listings seeded', { count, seed });
} catch (err) {
  // The error itself, not its message: the logger drops a failed query's parameter values.
  logger.error('discovery:seed-synthetic failed', { err });
  process.exitCode = 1;
} finally {
  await closeDb();
}
