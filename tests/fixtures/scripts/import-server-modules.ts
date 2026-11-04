// Run by tests/scripts/register-server-only.test.ts through tsx, the way package.json scripts run.
// Both module indexes start with `import 'server-only'`, which throws outside Next unless
// scripts/register-server-only.mjs is loaded first.
import { rebuildSearchProjection, seedSynthetic } from '@/modules/discovery';
import { resolveLanding } from '@/modules/landing';

console.log(
  [rebuildSearchProjection, seedSynthetic, resolveLanding].map((fn) => typeof fn).join(' '),
);
