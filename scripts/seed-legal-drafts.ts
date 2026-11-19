// `pnpm content:seed-legal`: saves version 1 of each legal document that has no version yet, as
// a draft for counsel, from src/modules/content/drafts/<slug>.md (SP8 plan Task 25). Running it
// again changes nothing. It never sends a draft to counsel, approves or publishes one: counsel
// approval and publishing stay with the Owner in the console.
//
// Needs DATABASE_URL. Reads .env.local when present; variables already set in the shell take
// precedence. Run it from the repository root.
import { existsSync } from 'node:fs';
import { closeClient, createDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import { ensureLegalDrafts } from '../src/modules/content';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const url = process.env.DATABASE_URL;
if (!url) {
  logger.error('content:seed-legal needs DATABASE_URL');
  process.exit(1);
}

const db = createDb(url);
try {
  const { created } = await ensureLegalDrafts(db);
  process.stdout.write(
    created.length > 0
      ? `Saved as drafts for counsel: ${created.join(', ')}\n`
      : 'Every legal document already has a version. Nothing changed.\n',
  );
} catch (err) {
  logger.error('content:seed-legal failed', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
} finally {
  await closeClient(db);
}
