import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

// Import boundaries (spec section 1). ESLint replaces, not merges, a rule's options when a
// later block matches the same file, so each block below lists its complete pattern set.

/** `@/modules/<name>/...` or a relative path into `.../modules/<name>/...`. */
const deepModuleImport = {
  regex: '^(@/|(\\.\\.?/)+(.+/)?)modules/[^/]+/.+',
  message: 'Import a module only through its public index: @/modules/<name>.',
};

/** Drizzle stays inside modules, src/lib/db.ts, src/lib/migrate.ts and tests. */
const drizzleImport = {
  regex: '^drizzle-orm(/.*)?$',
  message:
    'drizzle-orm is only imported in src/modules/**, src/lib/db.ts, src/lib/migrate.ts and tests. Call a module instead.',
};

/** The design system never depends on domain modules. */
const uiModuleImport = {
  regex: '^(@/|(\\.\\.?/)+(.+/)?)modules(/|$)',
  message: 'src/ui must not import domain modules; pass data in through props.',
};

const restrict = (...patterns) => ['error', { patterns }];

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    '.pglite/**',
    '.data/**',
    '.clerk/**',
    'artifacts/**',
    // Intentionally broken inputs for tests/lint/boundaries.test.ts.
    'tests/lint/fixtures/**',
  ]),
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': restrict(deepModuleImport, drizzleImport),
    },
  },
  {
    files: [
      'src/modules/**',
      'src/lib/db.ts',
      'src/lib/migrate.ts',
      'tests/**',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
    rules: { 'no-restricted-imports': restrict(deepModuleImport) },
  },
  {
    files: ['src/ui/**'],
    rules: { 'no-restricted-imports': restrict(deepModuleImport, drizzleImport, uiModuleImport) },
  },
  {
    // The schema index re-exports every module's tables for the Db type.
    files: ['src/db/schema.ts'],
    rules: { 'no-restricted-imports': restrict(drizzleImport) },
  },
]);
