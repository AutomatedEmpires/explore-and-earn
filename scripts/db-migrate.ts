// `pnpm db:migrate`: applies drizzle/*.sql to DATABASE_URL.
// Reads .env.local when present; variables already set in the shell (CI) take precedence.
// Only DATABASE_URL is needed, so CI and release jobs need no other app secrets.
import { existsSync } from 'node:fs';
import { closeClient, createDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import { runMigrations } from '../src/lib/migrate';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const url = process.env.DATABASE_URL;
if (!url) {
  logger.error('db:migrate needs DATABASE_URL');
  process.exit(1);
}

// Same client as getDb(), but without validating the whole app environment.
const db = createDb(url);
try {
  const applied = await runMigrations(db);
  logger.info('migrations applied', { count: applied.length, applied });
} catch (err) {
  logger.error('migration failed', { err });
  process.exitCode = 1;
} finally {
  await closeClient(db);
}
