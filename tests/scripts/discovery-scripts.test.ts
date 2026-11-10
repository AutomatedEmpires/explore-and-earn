// scripts/seed-synthetic.ts and scripts/discovery-rebuild.ts, run as `pnpm discovery:*` runs them
// (the tsx command read from package.json, with the server-only shim), each against its own
// throwaway in-memory PGlite served on a free local port. DATABASE_URL always names that server,
// so the scripts never reach a hosted database, whatever the shell or .env.local says.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { createTestDb } from '../helpers/db';
import { insertProjectionRows } from '../helpers/discovery-rows';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TSX_CLI = createRequire(import.meta.url).resolve('tsx/cli');
const SCRIPTS = (
  JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

interface LocalDb {
  db: Db;
  url: string;
  stop(): Promise<void>;
}

const started: LocalDb[] = [];

afterEach(async () => {
  await Promise.all(started.splice(0).map((local) => local.stop()));
});

/** A migrated in-memory PGlite (the unit tests' template), served on a free 127.0.0.1 port. */
async function localDb(): Promise<LocalDb> {
  const test = await createTestDb();
  const client: unknown = '$client' in test.db ? test.db.$client : undefined;
  if (!(client instanceof PGlite)) throw new Error('createTestDb: expected a PGlite client');
  const server = new PGLiteSocketServer({
    db: client,
    host: '127.0.0.1',
    port: 0,
    maxConnections: 20,
  });
  await server.start();
  const local: LocalDb = {
    db: test.db,
    url: `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
    stop: async () => {
      await server.stop();
      await test.close();
    },
  };
  started.push(local);
  return local;
}

/** Runs the package.json script `name` (`tsx --import <shim> scripts/<file>.ts`) with `args`. */
async function runScript(name: string, args: string[], databaseUrl: string): Promise<Run> {
  const command = SCRIPTS[name];
  if (!command?.startsWith('tsx ')) throw new Error(`${name} is not a tsx script`);
  const tsxArgs = command.split(/\s+/).slice(1);
  try {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [TSX_CLI, ...tsxArgs, ...args],
      { cwd: ROOT, env: { ...process.env, DATABASE_URL: databaseUrl } },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: unknown; stdout?: string; stderr?: string };
    return {
      code: typeof failed.code === 'number' ? failed.code : 1,
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
    };
  }
}

/** The JSON lines the logger wrote. */
function logLines(output: string): Record<string, unknown>[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function projectionCount(db: Db): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from app.discovery_listings`,
  );
  return row?.n ?? -1;
}

describe('pnpm discovery:seed-synthetic', () => {
  it('writes the rows asked for into the database DATABASE_URL names', async () => {
    const local = await localDb();
    const run = await runScript(
      'discovery:seed-synthetic',
      ['--count', '30', '--seed', '7'],
      local.url,
    );
    expect(run.code, run.stderr).toBe(0);
    expect(logLines(run.stdout)).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'synthetic listings seeded',
        count: 30,
        seed: 7,
      }),
    );
    expect(await projectionCount(local.db)).toBe(30);
  }, 60_000);

  it('refuses a missing or invalid --count or --seed and writes nothing', async () => {
    const local = await localDb();
    const runs = await Promise.all(
      [[], ['--count', '0'], ['--count', '5', '--seed', 'x']].map((args) =>
        runScript('discovery:seed-synthetic', args, local.url),
      ),
    );
    for (const run of runs) {
      expect(run.code).toBe(1);
      expect(logLines(run.stderr)).toContainEqual(
        expect.objectContaining({
          level: 'error',
          msg: 'usage: pnpm discovery:seed-synthetic --count <n> [--seed <integer>]',
        }),
      );
    }
    expect(await projectionCount(local.db)).toBe(0);
  }, 120_000);
});

describe('pnpm discovery:rebuild', () => {
  it('removes rows with no listing behind them and records the rebuild', async () => {
    const local = await localDb();
    await insertProjectionRows(local.db, [{}, {}, { isActive: false, closedAt: new Date() }]);

    const run = await runScript('discovery:rebuild', [], local.url);
    expect(run.code, run.stderr).toBe(0);
    expect(logLines(run.stdout)).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'search projection rebuilt',
        upserted: 0,
        removed: 3,
      }),
    );
    expect(await projectionCount(local.db)).toBe(0);
    const [audit] = await queryRows<{ n: number }>(
      local.db,
      sql`select count(*)::int as n from app.audit_events
        where action = 'discovery.projection_rebuilt'`,
    );
    expect(audit?.n).toBe(1);
  }, 60_000);

  it('exits 1 and logs the failure when the database is unreachable', async () => {
    const local = await localDb();
    const url = local.url;
    await started.splice(started.indexOf(local), 1)[0]?.stop();

    const run = await runScript('discovery:rebuild', [], url);
    expect(run.code).toBe(1);
    expect(logLines(run.stderr)).toContainEqual(
      expect.objectContaining({ level: 'error', msg: 'discovery:rebuild failed' }),
    );
  }, 60_000);
});
