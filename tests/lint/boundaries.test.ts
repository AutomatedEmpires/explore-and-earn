import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const fixture = (name: string) => path.join(root, 'tests/lint/fixtures', name);

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: root });
});

/** Lints a fixture's text as if it lived at `filePath`, so the real config globs apply. */
async function restrictedImportErrors(
  name: string,
  filePath: string,
): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(readFileSync(fixture(name), 'utf8'), {
    filePath: path.join(root, filePath),
  });
  if (!result) throw new Error('no lint result');
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports' && m.severity === 2);
}

describe('module boundaries (ESLint)', () => {
  it('rejects a deep import into a module', async () => {
    expect(
      await restrictedImportErrors('deep-import.ts', 'src/app/deep-import.ts'),
    ).not.toHaveLength(0);
  });

  it('rejects a deep import from another module too', async () => {
    expect(
      await restrictedImportErrors('deep-import.ts', 'src/modules/identity/deep-import.ts'),
    ).not.toHaveLength(0);
  });

  it("allows a module's public index", async () => {
    expect(await restrictedImportErrors('ok-import.ts', 'src/app/ok-import.ts')).toHaveLength(0);
  });

  it('rejects relative paths into module internals, except in src/db/schema.ts', async () => {
    expect(
      await restrictedImportErrors('relative-deep-import.ts', 'src/server/relative-deep-import.ts'),
    ).not.toHaveLength(0);
    expect(
      await restrictedImportErrors('relative-deep-import.ts', 'src/db/schema.ts'),
    ).toHaveLength(0);
  });

  it('rejects src/ui importing a module', async () => {
    expect(
      await restrictedImportErrors(
        'src/ui/ui-imports-module.tsx',
        'src/ui/components/ui-imports-module.tsx',
      ),
    ).not.toHaveLength(0);
  });

  it('allows drizzle-orm only in modules, db, migrate and tests', async () => {
    expect(
      await restrictedImportErrors('uses-drizzle.ts', 'src/app/uses-drizzle.ts'),
    ).not.toHaveLength(0);
    expect(
      await restrictedImportErrors('uses-drizzle.ts', 'src/server/uses-drizzle.ts'),
    ).not.toHaveLength(0);
    expect(
      await restrictedImportErrors('uses-drizzle.ts', 'src/modules/jobs/outbox.ts'),
    ).toHaveLength(0);
    expect(await restrictedImportErrors('uses-drizzle.ts', 'src/lib/db.ts')).toHaveLength(0);
    expect(await restrictedImportErrors('uses-drizzle.ts', 'src/lib/migrate.ts')).toHaveLength(0);
    expect(await restrictedImportErrors('uses-drizzle.ts', 'tests/helpers/db.ts')).toHaveLength(0);
  });
});

describe('design tokens (check-design-tokens.mjs)', () => {
  const run = (...files: string[]) =>
    spawnSync(process.execPath, [path.join(root, 'scripts/check-design-tokens.mjs'), ...files], {
      cwd: root,
      encoding: 'utf8',
    });

  it('fails on raw colors and arbitrary values, naming each line', () => {
    const result = run(fixture('raw-color.tsx'));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('raw-color.tsx:3');
    expect(result.stdout).toContain('raw-color.tsx:4');
  });

  it('passes on token classes', () => {
    const result = run(fixture('ok.tsx'));
    expect(result.stdout).toBe('');
    expect(result.status).toBe(0);
  });
});
