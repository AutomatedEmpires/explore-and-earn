// `pnpm ops:bootstrap-owner <email>`: emails a Clerk invitation that makes the recipient the
// first operator Owner when they sign up. Refuses once an Owner exists (after that, Owners invite
// operators from the console).
//
// Needs DATABASE_URL and a Clerk secret key. Reads .env.local when present; variables already
// set in the shell take precedence. In keyless development (no CLERK_SECRET_KEY), it uses the
// key Clerk saved in .clerk/.tmp/keyless.json when `pnpm dev` first ran.
import { existsSync, readFileSync } from 'node:fs';
import { closeClient, createDb } from '../src/lib/db';
import { isAppError } from '../src/lib/errors';
import { logger } from '../src/lib/logger';
import { bootstrapOwnerInvite, clerkAdmin } from '../src/modules/identity';

const KEYLESS_FILE = '.clerk/.tmp/keyless.json';

function keylessSecretKey(): string | undefined {
  if (!existsSync(KEYLESS_FILE)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(KEYLESS_FILE, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'secretKey' in parsed) {
      return typeof parsed.secretKey === 'string' ? parsed.secretKey : undefined;
    }
  } catch {
    // Unreadable file: fall through to the missing-key error.
  }
  return undefined;
}

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const email = process.argv.slice(2).find((arg) => arg !== '--');
if (!email) {
  logger.error('usage: pnpm ops:bootstrap-owner <email>');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  logger.error('ops:bootstrap-owner needs DATABASE_URL');
  process.exit(1);
}

// The Clerk SDK reads CLERK_SECRET_KEY when it is first loaded, which clerkAdmin() defers until
// its first call, so setting it here is early enough.
if (!process.env.CLERK_SECRET_KEY) {
  const key = keylessSecretKey();
  if (key) process.env.CLERK_SECRET_KEY = key;
}
if (!process.env.CLERK_SECRET_KEY) {
  logger.error(
    `ops:bootstrap-owner needs CLERK_SECRET_KEY (or run \`pnpm dev\` once so Clerk writes ${KEYLESS_FILE})`,
  );
  process.exit(1);
}

const db = createDb(url);
try {
  const invited = await bootstrapOwnerInvite(db, clerkAdmin(), email);
  logger.info('operator owner invited', invited);
} catch (err) {
  if (isAppError(err))
    logger.error(`ops:bootstrap-owner refused: ${err.message}`, { code: err.code });
  else logger.error('ops:bootstrap-owner failed', { err });
  process.exitCode = 1;
} finally {
  await closeClient(db);
}
