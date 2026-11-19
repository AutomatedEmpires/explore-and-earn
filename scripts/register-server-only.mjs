// Lets server code run outside Next: `tsx --import ./scripts/register-server-only.mjs <script>`.
// package.json loads it for every tsx script, and playwright.config.ts imports it for the e2e
// helpers and fixtures.
//
// `server-only` resolves to its empty entry only under Next's `react-server` export condition; its
// default entry throws. This hook adds that condition for the one specifier. It deliberately
// avoids a global `--conditions=react-server`, which would also switch react and react-dom to
// their server builds. (Vitest aliases the package to tests/stubs/server-only.ts instead.)
import module from 'node:module';

const HOOKS = `export function resolve(specifier, context, nextResolve) {
  if (specifier !== 'server-only') return nextResolve(specifier, context);
  return nextResolve(specifier, { ...context, conditions: [...context.conditions, 'react-server'] });
}`;
const hooksUrl = `data:text/javascript,${encodeURIComponent(HOOKS)}`;

if (typeof module.registerHooks === 'function') {
  // Node 22.15 and later: synchronous hooks, which cover both `import` and `require`.
  const { resolve } = await import(hooksUrl);
  module.registerHooks({ resolve });
} else {
  // Node 22.12 to 22.14: asynchronous hooks, which cover `import` (all the scripts use ESM).
  module.register(hooksUrl);
}
