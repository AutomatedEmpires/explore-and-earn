import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import type { Db } from '@/lib/db';
import { runMigrations } from '@/lib/migrate';

export interface TestDb {
  db: Db;
  close(): Promise<void>;
}

const MIGRATIONS_DIR = path.resolve('drizzle');
const CACHE_DIR = path.resolve('.data/test-db');

/** An in-memory PGlite with the postgis extension loaded and no migrations applied. */
export async function createEmptyTestDb(): Promise<TestDb> {
  const client = await PGlite.create({ extensions: { postgis } });
  const db: Db = drizzle({ client, schema });
  return { db, close: () => client.close() };
}

function packageVersion(name: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.resolve('node_modules', name, 'package.json'), 'utf8'),
    ) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Changes whenever a migration file or the PGlite/PostGIS version changes. */
function templateKey(): string {
  const hash = createHash('sha256');
  hash.update(`pglite@${packageVersion('@electric-sql/pglite')}\n`);
  hash.update(`pglite-postgis@${packageVersion('@electric-sql/pglite-postgis')}\n`);
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    hash.update(`${file}\n`);
    hash.update(readFileSync(path.join(MIGRATIONS_DIR, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Builds (once) a dump of a fully migrated database and returns its path. Creating the PostGIS
 * extension is the slow part of a fresh database (several seconds), so every createTestDb()
 * restores this dump instead. Vitest's global setup calls this before any worker starts.
 */
export async function ensureTemplate(): Promise<string> {
  const file = path.join(CACHE_DIR, `template-${templateKey()}.tar`);
  if (existsSync(file)) return file;

  mkdirSync(CACHE_DIR, { recursive: true });
  const client = await PGlite.create({ extensions: { postgis } });
  try {
    await runMigrations(drizzle({ client, schema }));
    const dump = await client.dumpDataDir('none');
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, Buffer.from(await dump.arrayBuffer()));
    try {
      renameSync(tmp, file);
    } catch (err) {
      rmSync(tmp, { force: true });
      if (!existsSync(file)) throw err;
    }
  } finally {
    await client.close();
  }

  for (const old of readdirSync(CACHE_DIR)) {
    if (old.startsWith('template-') && old.endsWith('.tar') && path.join(CACHE_DIR, old) !== file) {
      rmSync(path.join(CACHE_DIR, old), { force: true });
    }
  }
  return file;
}

/** An isolated in-memory PGlite with postgis and every migration in `drizzle/` applied. */
export async function createTestDb(): Promise<TestDb> {
  const template = await ensureTemplate();
  const client = await PGlite.create({
    loadDataDir: new Blob([readFileSync(template)]),
    extensions: { postgis },
  });
  const db: Db = drizzle({ client, schema });
  try {
    // A no-op unless a migration was added after the template was built.
    await runMigrations(db);
  } catch (err) {
    await client.close();
    throw err;
  }
  return { db, close: () => client.close() };
}
