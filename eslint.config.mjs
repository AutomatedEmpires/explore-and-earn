import path from 'node:path';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

// Import boundaries (spec section 1). ESLint replaces, not merges, a rule's options when a
// later block matches the same file, so each block below lists its complete pattern set.

/**
 * `local/module-boundaries`: inside src/modules/<a>/, a relative import that resolves into
 * another module <b> may only name <b>'s root (its index). A specifier like '../trust/internal'
 * never spells out `modules/`, so the no-restricted-imports patterns below cannot see it; this
 * rule resolves the path against the importing file instead, at any folder depth.
 */
const moduleBoundaries = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      deep: "Import the {{module}} module only through its public index: @/modules/{{module}}.",
    },
  },
  create(context) {
    const modulesRoot = path.join(context.cwd, 'src', 'modules');
    const own = path.relative(modulesRoot, context.filename).split(/[\\/]/);
    if (own.length < 2 || own[0] === '..' || path.isAbsolute(own[0] ?? '')) return {};
    const ownModule = own[0];

    const check = (source) => {
      if (!source || typeof source.value !== 'string' || !source.value.startsWith('.')) return;
      const target = path.relative(
        modulesRoot,
        path.resolve(path.dirname(context.filename), source.value),
      );
      const [module, ...rest] = target.split(/[\\/]/);
      if (!module || module === '..' || path.isAbsolute(target) || module === ownModule) return;
      const isIndex = rest.length === 0 || (rest.length === 1 && /^index(\.tsx?)?$/.test(rest[0]));
      if (!isIndex) context.report({ node: source, messageId: 'deep', data: { module } });
    };

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source.type === 'Literal' ? node.source : null),
    };
  },
};

const localPlugin = { rules: { 'module-boundaries': moduleBoundaries } };

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
    // Local agent settings and the git worktrees agents check out inside the repo folder.
    '.claude/**',
    // Intentionally broken inputs for tests/lint/boundaries.test.ts.
    'tests/lint/fixtures/**',
  ]),
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strict,
  {
    plugins: { local: localPlugin },
    rules: {
      'local/module-boundaries': 'error',
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
