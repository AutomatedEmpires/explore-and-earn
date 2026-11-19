// `pnpm backup:manifest`: writes the backup manifest of DATABASE_URL (row count and newest
// created_at per table in schema `app`, plus the applied migrations).
//
//   pnpm backup:manifest --out manifest.json
//       Manifest only. For local checks.
//   pnpm backup:manifest --out manifest.json --dump dump.pgcustom
//       The dump and its manifest from one snapshot (needs pg_dump 17 on PATH). DATABASE_URL
//       must keep its session open: Supabase's session pooler or a direct connection, never the
//       transaction pooler.
//   pnpm backup:manifest --verify manifest.json [--max-age-hours 24]
//       Compares DATABASE_URL with a manifest, one line per difference; exits 1 on any.
//
// Reads only. It needs nothing but DATABASE_URL; variables already set in the shell take
// precedence over .env.local. Runbook: docs/runbooks/backups.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { closeClient, createDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import {
  buildBackupManifest,
  parseManifest,
  takeConsistentBackup,
  verifyRestore,
} from '../src/server/ops/backup-manifest';

const USAGE =
  'usage: pnpm backup:manifest --out <manifest.json> [--dump <file>] | --verify <manifest.json> [--max-age-hours <n>]';

function option(name: string): string | undefined {
  const args = process.argv.slice(2);
  const at = args.indexOf(name);
  const value = at === -1 ? undefined : args[at + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const out = option('--out');
const dump = option('--dump');
const verify = option('--verify');
const maxAge = option('--max-age-hours');

const maxAgeHours = maxAge === undefined ? 24 : Number(maxAge);
if ((!out && !verify) || (verify && (out || dump)) || !(maxAgeHours > 0)) {
  logger.error(USAGE);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  logger.error('backup:manifest needs DATABASE_URL');
  process.exit(1);
}

try {
  if (verify) {
    const expected = parseManifest(readFileSync(verify, 'utf8'));
    const db = createDb(url);
    try {
      const { differences, restorePointAgeHours } = await verifyRestore(db, expected, {
        maxAgeHours,
      });
      for (const line of differences) logger.error(line);
      logger.info('backup manifest verified', {
        takenAt: expected.takenAt,
        restorePointAgeHours,
        differences: differences.length,
      });
      if (differences.length > 0) process.exitCode = 1;
    } finally {
      await closeClient(db);
    }
  } else if (out && dump) {
    const manifest = await takeConsistentBackup({ databaseUrl: url, dumpPath: dump });
    writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
    logger.info('backup taken', {
      takenAt: manifest.takenAt,
      tables: Object.keys(manifest.tables).length,
      migrations: manifest.migrations.length,
    });
  } else if (out) {
    const db = createDb(url);
    try {
      const manifest = await buildBackupManifest(db);
      writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
      logger.info('backup manifest written', {
        takenAt: manifest.takenAt,
        tables: Object.keys(manifest.tables).length,
        migrations: manifest.migrations.length,
      });
    } finally {
      await closeClient(db);
    }
  }
} catch (err) {
  logger.error('backup:manifest failed', { err });
  process.exitCode = 1;
}
