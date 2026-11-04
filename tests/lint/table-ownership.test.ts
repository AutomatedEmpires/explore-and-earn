// Module boundaries for raw SQL (spec section 1: only modules touch their own tables). Drizzle's
// query builder can only reach another module's table through a deep import, which ESLint
// rejects; raw SQL can name any table as `app.<table>`, which no type check or lint rule sees.
// This test does: outside its owning module (the one whose schema.ts declares the table), no
// source file may name an app table. Other code calls the owning module's index instead.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const src = path.join(root, 'src');
const modulesDir = path.join(src, 'modules');

/** Test code may set up any table it needs. */
const TEST_FILE = /(\.test\.tsx?|[\\/]test-fixtures\.ts)$/;

/**
 * The operator console joins trust, identity and media for its screens, and updates the
 * operator rows identity owns. Each file says why it uses SQL instead of a deep schema import.
 * Writes that change a review still go through the trust module. Do not add files here.
 */
const DOCUMENTED_CROSS_MODULE_SQL = new Set([
  'src/modules/operator/items.ts',
  'src/modules/operator/operators.ts',
  'src/modules/operator/stats.ts',
  'src/modules/operator/test-items.ts',
  // SP2 reads another module's table where importing that module would cycle or the public
  // API does not carry the joined columns. Each file says why.
  'src/modules/billing/webhook.ts',
  'src/modules/hostpages/public.ts',
  'src/modules/hostpages/subjects.ts',
  'src/modules/locations/jobs.ts',
  'src/modules/locations/service.ts',
  'src/modules/orgs/people.ts',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !TEST_FILE.test(full) ? [full] : [];
  });
}

/** Table name -> the module whose schema.ts declares it with `app.table('<name>', ...)`. */
function tableOwners(): Map<string, string> {
  const owners = new Map<string, string>();
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const schema = readFileSync(path.join(modulesDir, entry.name, 'schema.ts'), 'utf8');
    for (const [, table] of schema.matchAll(/app\.table\(\s*'([a-z_][a-z0-9_]*)'/g)) {
      if (table) owners.set(table, entry.name);
    }
  }
  return owners;
}

/** The code without comments, which may mention other tables freely. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** `<file>:<line> app.<table> (owned by <module>)` for every reference outside the owner. */
function violations(): string[] {
  const owners = tableOwners();
  const found: string[] = [];
  for (const file of sourceFiles(src)) {
    const repoPath = path.relative(root, file).replaceAll('\\', '/');
    if (DOCUMENTED_CROSS_MODULE_SQL.has(repoPath)) continue;
    const rel = path.relative(modulesDir, file).split(/[\\/]/);
    const ownModule = rel[0] !== '..' && rel.length > 1 ? rel[0] : null;
    const lines = code(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const [, table] of line.matchAll(/\bapp\.([a-z_][a-z0-9_]*)\b/g)) {
        const owner = table ? owners.get(table) : undefined;
        if (owner && owner !== ownModule) {
          found.push(`${repoPath}:${i + 1} app.${table} (owned by ${owner})`);
        }
      }
    });
  }
  return found;
}

describe('raw SQL table ownership', () => {
  it('knows every module table', () => {
    const owners = tableOwners();
    expect(owners.get('users')).toBe('identity');
    expect(owners.get('operators')).toBe('identity');
    expect(owners.get('review_items')).toBe('trust');
    expect(owners.get('rate_limits')).toBe('ratelimit');
  });

  it('reads table names in code, not in comments', () => {
    const sample = code("sql`select 1 from app.users` // app.outbox in a comment is fine");
    expect(sample).toContain('app.users');
    expect(sample).not.toContain('app.outbox');
  });

  it('never names a module table outside the module that owns it', () => {
    expect(violations()).toEqual([]);
  });
});
