import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../.github/workflows/db-migrate.yml", import.meta.url),
  "utf8",
);

function assertExactProductionDeploymentGate(source: string): void {
  const locate = (fragment: string, after = 0): number => {
    const index = source.indexOf(fragment, after);
    expect(index).toBeGreaterThanOrEqual(after);
    return index;
  };

  const waitStep = locate("- name: Wait for this commit's Vercel production deployment");
  const shaQuery = locate('-f sha="$GITHUB_SHA"', waitStep);
  const exactShaCheck = locate(".sha == $sha", shaQuery);
  const productionCheck = locate('.environment == "Production"', exactShaCheck);
  const vercelCheck = locate('.creator.login == "vercel[bot]"', productionCheck);
  const statusLookup = locate("deployments/${deployment_id}/statuses", vercelCheck);
  const successBranch = locate("success)", statusLookup);
  const successBreak = locate("break", successBranch);
  const pushStep = locate("- name: Push migrations", successBreak);
  const dbPush = locate("run: supabase db push", pushStep);

  expect(source.indexOf("run: supabase db push")).toBe(dbPush);
  expect(source).toContain("deployments: read");
  expect(source.slice(waitStep, dbPush)).toContain("failure|error)");
  expect(source.slice(waitStep, dbPush)).toContain("exit 1");
  expect(source.slice(waitStep, dbPush)).toContain(
    "Timed out waiting for Vercel production deployment of ${GITHUB_SHA}.",
  );
}

describe("housing-photo migration deploy ordering", () => {
  it("gates the database push on exact-SHA Vercel Production success", () => {
    assertExactProductionDeploymentGate(workflow);
  });

  it("rejects a branch-only deployment gate", () => {
    expect(() =>
      assertExactProductionDeploymentGate(
        workflow.replace(".sha == $sha", '.ref == "main"'),
      ),
    ).toThrow();
  });

  it("rejects a gate that does not wait for success", () => {
    expect(() =>
      assertExactProductionDeploymentGate(workflow.replace("success)", "pending)")),
    ).toThrow();
  });
});
