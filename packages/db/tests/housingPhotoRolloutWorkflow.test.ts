import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../.github/workflows/db-migrate.yml", import.meta.url),
  "utf8",
);
const securityWorkflow = readFileSync(
  new URL("../../../.github/workflows/db-security.yml", import.meta.url),
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

  it("retries transient GitHub deployment and status API failures", () => {
    const waitStep = workflow.indexOf(
      "- name: Wait for this commit's Vercel production deployment",
    );
    const pushStep = workflow.indexOf("- name: Push migrations", waitStep);
    const gate = workflow.slice(waitStep, pushStep);

    expect(gate).toContain('if ! deployments="$(gh api');
    expect(gate).toContain(
      "GitHub deployments API request failed on attempt ${attempt}; treating as transient and waiting.",
    );
    expect(gate).toContain("deployments='[]'");
    expect(gate).toContain('if ! statuses="$(gh api');
    expect(gate).toContain(
      "GitHub deployment statuses API request failed for ${deployment_id} on attempt ${attempt}; treating as transient and waiting.",
    );
    expect(gate).toContain("statuses='[]'");
    expect(gate).not.toContain("continue");
    expect(gate).toContain("failure|error)");
    expect(gate).toContain(
      "Timed out waiting for Vercel production deployment of ${GITHUB_SHA}.",
    );
  });
});

describe("database security workflow hardening", () => {
  it("does not persist migration checkout credentials", () => {
    const checkout = workflow.indexOf("uses: actions/checkout@v4");
    const nextStep = workflow.indexOf("- name: Set up Supabase CLI", checkout);

    expect(workflow.slice(checkout, nextStep)).toContain("persist-credentials: false");
  });

  it("uses read-only repository access without persisted checkout credentials", () => {
    const permissions = securityWorkflow.indexOf("permissions:\n  contents: read");
    const jobs = securityWorkflow.indexOf("jobs:");
    const checkout = securityWorkflow.indexOf("uses: actions/checkout@v4", jobs);
    const nextStep = securityWorkflow.indexOf("- name: Set up Supabase CLI", checkout);

    expect(permissions).toBeGreaterThanOrEqual(0);
    expect(permissions).toBeLessThan(jobs);
    expect(securityWorkflow.slice(checkout, nextStep)).toContain(
      "persist-credentials: false",
    );
  });
});
