import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

// Scripts run server modules under plain tsx, outside Next's `react-server` export condition,
// where `import 'server-only'` throws. scripts/register-server-only.mjs makes it resolve to the
// package's empty entry, as it does in Next's server bundles.

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SHIM = './scripts/register-server-only.mjs';
const FIXTURE = 'tests/fixtures/scripts/import-server-modules.ts';
const TSX_CLI = createRequire(import.meta.url).resolve('tsx/cli');

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function tsx(args: string[]): Promise<Run> {
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [TSX_CLI, ...args], {
      cwd: ROOT,
      env: process.env,
    });
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

describe('scripts/register-server-only.mjs', () => {
  it('lets tsx import @/modules/discovery and @/modules/landing', async () => {
    const run = await tsx(['--import', SHIM, FIXTURE]);
    expect(run.stderr).not.toMatch(/cannot be imported from a Client Component/);
    expect(run.code).toBe(0);
    expect(run.stdout.trim()).toBe('function function function');
  }, 60_000);

  it('is what makes the import work: plain tsx still fails on server-only', async () => {
    const run = await tsx([FIXTURE]);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toMatch(/cannot be imported from a Client Component/);
  }, 60_000);
});

describe('package.json scripts', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const tsxScripts = Object.entries(pkg.scripts).filter(([, command]) => /^tsx\s/.test(command));

  it('include the discovery and e2e seed scripts', () => {
    const names = tsxScripts.map(([name]) => name);
    expect(names).toEqual(
      expect.arrayContaining(['discovery:seed-synthetic', 'discovery:rebuild', 'e2e:seed']),
    );
  });

  it.each(tsxScripts)('%s loads the server-only shim before its script', (_name, command) => {
    expect(command.startsWith(`tsx --import ${SHIM} `)).toBe(true);
  });
});

describe('playwright.config.ts', () => {
  it('loads the server-only shim, so e2e helpers and fixtures can seed through modules', () => {
    const config = readFileSync(path.join(ROOT, 'playwright.config.ts'), 'utf8');
    expect(config).toMatch(/^import '\.\/scripts\/register-server-only\.mjs';$/m);
  });
});
