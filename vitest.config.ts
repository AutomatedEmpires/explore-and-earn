import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// Tests get the dev defaults from .env.local.example for any key the shell has not set,
// so `getEnv()` works everywhere and CI can still override (for example DATABASE_URL).
function exampleEnv(): Record<string, string> {
  const parsed = parseEnv(
    readFileSync(path.resolve(import.meta.dirname, '.env.local.example'), 'utf8'),
  );
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value && process.env[key] === undefined) env[key] = value;
  }
  return env;
}

// Two projects:
// - unit: everything that runs locally on PGlite and stubs (`pnpm test`).
//   Component tests (*.test.tsx) opt into a DOM with a `// @vitest-environment jsdom` docblock.
// - integration: *.int.test.ts, which need a real Postgres (`pnpm test:integration`, CI only).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // `import 'server-only'` throws outside Next's server bundles; tests run server code.
      'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    env: exampleEnv(),
    setupFiles: ['./tests/setup.ts'],
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          globalSetup: ['./tests/global-setup.ts'],
          include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
          exclude: [
            '**/*.int.test.{ts,tsx}',
            'tests/lint/fixtures/**',
            'tests/e2e/**',
            'node_modules/**',
          ],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['**/*.int.test.{ts,tsx}'],
          exclude: ['node_modules/**', '.next/**'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
