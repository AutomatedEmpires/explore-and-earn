import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const fixture = (name: string) => path.join(root, 'tests/lint/fixtures', name);

let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({ cwd: root });
  // The first lint loads the config, its plugins and parsers. Under the full suite's parallel
  // load that can outlast a test's 30 s, so it happens here, within the 60 s hook timeout.
  await eslint.lintText('export {};', { filePath: path.join(root, 'src/app/warm-up.ts') });
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

  it("rejects a relative path from one module into another module's internals", async () => {
    const [result] = await eslint.lintText(readFileSync(fixture('sibling-deep-import.ts'), 'utf8'), {
      filePath: path.join(root, 'src/modules/media/x.ts'),
    });
    const lines = (result?.messages ?? [])
      .filter((m) => m.ruleId === 'local/module-boundaries' && m.severity === 2)
      .map((m) => m.line);
    // The import, the re-export and the dynamic import.
    expect(lines).toEqual([2, 3, 6]);
  });

  it('resolves relative paths from any depth inside a module', async () => {
    const code = [
      "import { transact } from '../../trust/internal';",
      "import { jobKey } from '../notify';",
      "import { reviewItems } from '../../../modules/trust/schema';",
      'export const all = [transact, jobKey, reviewItems];',
      '',
    ].join('\n');
    const [result] = await eslint.lintText(code, {
      filePath: path.join(root, 'src/modules/notifications/email/x.ts'),
    });
    const lines = (result?.messages ?? [])
      .filter((m) => m.ruleId === 'local/module-boundaries' && m.severity === 2)
      .map((m) => m.line);
    expect(lines).toEqual([1, 3]);
  });

  it("allows another module's index and the module's own files by relative path", async () => {
    const [result] = await eslint.lintText(
      readFileSync(fixture('sibling-index-import.ts'), 'utf8'),
      { filePath: path.join(root, 'src/modules/media/x.ts') },
    );
    expect(
      (result?.messages ?? []).filter(
        (m) => m.ruleId === 'local/module-boundaries' || m.ruleId === 'no-restricted-imports',
      ),
    ).toEqual([]);
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
    // No other src/lib file, the rate limiter included (it lives in src/modules/ratelimit).
    for (const file of ['src/lib/rate-limit.ts', 'src/lib/logger.ts']) {
      expect(await restrictedImportErrors('uses-drizzle.ts', file), file).not.toHaveLength(0);
    }
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
