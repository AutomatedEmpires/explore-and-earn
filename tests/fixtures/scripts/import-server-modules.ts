// Run by tests/scripts/register-server-only.test.ts through tsx, the way package.json scripts run.
// Both module indexes start with `import 'server-only'`, which throws outside Next unless
// scripts/register-server-only.mjs is loaded first.
//
// Identity loads first because of an SP2 evaluation-order cycle, unrelated to `server-only`:
// orgs/sync.ts imports @/modules/identity, whose onboarding.ts reads orgs' organizationNameSchema
// while it loads. Under plain tsx, anything that reaches orgs before identity (discovery does,
// through listings) stops with "Cannot read properties of undefined". Drop this line once that
// cycle is broken.
import '@/modules/identity';
import { rebuildSearchProjection, seedSynthetic } from '@/modules/discovery';
import { resolveLanding } from '@/modules/landing';

console.log(
  [rebuildSearchProjection, seedSynthetic, resolveLanding].map((fn) => typeof fn).join(' '),
);
