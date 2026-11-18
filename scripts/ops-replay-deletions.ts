// `pnpm ops:replay-deletions --since <ISO time> [--apply] [--summary <file>]`: after a restore,
// erases again every user whose erasure was mirrored to the backup project since `--since` (the
// backup's `takenAt`).
//
// DRY RUN BY DEFAULT. Without `--apply` it changes nothing and reports how many erasures it
// would replay. With `--apply` it erases those users in DATABASE_URL, which cannot be undone.
//
// Needs DATABASE_URL and the backup project keys (BACKUP_SUPABASE_URL and
// BACKUP_SUPABASE_SERVICE_ROLE_KEY) to read the ledger. Variables already set in the shell
// take precedence over .env.local. Exits 1 if any erasure could not be replayed.
// Runbook: docs/runbooks/restore.md.
import { existsSync, writeFileSync } from 'node:fs';
import { closeClient, createDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import { engineLedgerMirror, replayDeletions } from '../src/server/ops/replay-deletions';

const USAGE = 'usage: pnpm ops:replay-deletions --since <ISO time> [--apply] [--summary <file>]';

function option(name: string): string | undefined {
  const args = process.argv.slice(2);
  const at = args.indexOf(name);
  const value = at === -1 ? undefined : args[at + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const sinceText = option('--since');
const since = sinceText ? new Date(sinceText) : undefined;
const apply = process.argv.slice(2).includes('--apply');
const summary = option('--summary');

if (!since || Number.isNaN(since.getTime())) {
  logger.error(USAGE);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  logger.error('ops:replay-deletions needs DATABASE_URL');
  process.exit(1);
}

const db = createDb(url);
try {
  const mirror = await engineLedgerMirror();
  const result = await replayDeletions(db, mirror, since, { apply });
  const report = {
    dryRun: !apply,
    since: since.toISOString(),
    replayed: result.replayed,
    skipped: result.skipped,
    pending: result.pending,
    failed: result.failed.length,
  };
  if (summary) writeFileSync(summary, `${JSON.stringify(report, null, 2)}\n`);
  if (apply) logger.info('deletions replayed', report);
  else logger.info('dry run: nothing was changed; pass --apply to replay', report);
  if (result.failed.length > 0) {
    logger.error('some erasures could not be replayed; the restore is not finished', {
      ledgerIds: result.failed,
    });
    process.exitCode = 1;
  }
} catch (err) {
  logger.error('ops:replay-deletions failed', { err });
  process.exitCode = 1;
} finally {
  await closeClient(db);
}
