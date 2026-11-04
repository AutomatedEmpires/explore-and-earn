// `pnpm ops:founding-codes --count N --note "…"`: creates N founding host codes (1-100) and
// prints each once. Only their hashes are stored, so they can never be shown again.
//
// Needs DATABASE_URL. Reads .env.local when present; variables already set in the shell take
// precedence.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { closeClient, createDb } from '../src/lib/db';
import { isAppError } from '../src/lib/errors';
import { logger } from '../src/lib/logger';
import { createFoundingCodes } from '../src/modules/billing';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { count: { type: 'string' }, note: { type: 'string' } },
});

const count = Number(values.count);
const note = values.note?.trim() ?? '';
if (!Number.isInteger(count) || note === '') {
  logger.error('usage: pnpm ops:founding-codes --count <1-100> --note "<why>"');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  logger.error('ops:founding-codes needs DATABASE_URL');
  process.exit(1);
}

const db = createDb(url);
try {
  const codes = await createFoundingCodes(db, { count, note, operatorId: null });
  process.stdout.write(`${codes.join('\n')}\nShown once. Store them now.\n`);
} catch (err) {
  logger.error('ops:founding-codes failed', {
    error: isAppError(err) ? err.message : err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
} finally {
  await closeClient(db);
}
