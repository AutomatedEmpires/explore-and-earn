// `pnpm ops:resync-clerk [--apply]`: after a restore, re-pulls every user, organization and
// membership from Clerk and passes each through the webhook sync, so the database catches up
// with the webhooks it missed. Erased users stay erased.
//
// DRY RUN BY DEFAULT. Without `--apply` it only lists and counts what Clerk holds. With
// `--apply` it updates DATABASE_URL.
//
// Needs DATABASE_URL and CLERK_SECRET_KEY (it reads Clerk and never writes to it). Variables
// already set in the shell take precedence over .env.local. Runbook: docs/runbooks/restore.md.
import { existsSync } from 'node:fs';
import { closeClient, createDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import { clerkBackendLister, resyncClerk } from '../src/server/ops/resync-clerk';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const apply = args.includes('--apply');
if (args.some((arg) => arg !== '--apply')) {
  logger.error('usage: pnpm ops:resync-clerk [--apply]');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  logger.error('ops:resync-clerk needs DATABASE_URL');
  process.exit(1);
}
if (!process.env.CLERK_SECRET_KEY) {
  logger.error('ops:resync-clerk needs CLERK_SECRET_KEY');
  process.exit(1);
}

const db = createDb(url);
try {
  const result = await resyncClerk(db, clerkBackendLister(), { apply });
  if (apply) logger.info('clerk resynced', { dryRun: false, ...result });
  else logger.info('dry run: nothing was changed; pass --apply to resync', { dryRun: true, ...result });
  if (result.rejected > 0) {
    logger.error('some Clerk objects were rejected; see the identity.clerk_webhook_rejected audit rows', {
      rejected: result.rejected,
    });
    process.exitCode = 1;
  }
} catch (err) {
  logger.error('ops:resync-clerk failed', { err });
  process.exitCode = 1;
} finally {
  await closeClient(db);
}
