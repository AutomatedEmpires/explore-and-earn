// axe-core in jsdom for the W7 component tests, as flow D's tests run it
// (src/app/host/applicants/_components/ApplicantsScreen.test.tsx). Test-only: no app code imports
// this file. jsdom has no layout, so color contrast is left to src/ui/tokens.test.ts and the
// Playwright run (tests/e2e/w7-shared-ui.spec.ts).
import { createRequire } from 'node:module';

type Violation = { id: string; impact: string | null; nodes: { target: string[] }[] };
type Axe = { run(context: Element, options: object): Promise<{ violations: Violation[] }> };

// axe-core ships with @axe-core/playwright; load it from there rather than add a dependency.
const local = createRequire(import.meta.url);
const axe = createRequire(local.resolve('@axe-core/playwright'))('axe-core') as Axe;

/** Serious and critical WCAG 2.2 A and AA violations under `container`, as readable lines. */
export async function seriousOrCritical(container: Element): Promise<string[]> {
  const { violations } = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
