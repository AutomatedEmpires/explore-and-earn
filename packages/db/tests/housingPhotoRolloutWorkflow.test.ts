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
const productionLaunchAssertion = readFileSync(
  new URL(
    "../../../tools/db-assert/sql/assert_production_launch.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

function assertExactProductionDeploymentGate(source: string): void {
  const locate = (fragment: string, after = 0): number => {
    const index = source.indexOf(fragment, after);
    expect(index).toBeGreaterThanOrEqual(after);
    return index;
  };

  const waitStep = locate("- name: Wait for this commit's Vercel production deployment");
  const statusLookup = locate(
    '"repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}/status"',
    waitStep,
  );
  const vercelContext = locate(
    '(.context | ascii_downcase) == "vercel"',
    statusLookup,
  );
  const vercelState = locate('vercel_state="$(jq -r', statusLookup);
  const successBranch = locate("success)", vercelState);
  const successBreak = locate("break", successBranch);
  // Retain the GitHub Deployments lookup as a backwards-compatible fallback,
  // but the exact-SHA Vercel commit status is the current production signal.
  const shaQuery = locate('-f sha="$GITHUB_SHA"', successBreak);
  const exactShaCheck = locate(".sha == $sha", shaQuery);
  const productionCheck = locate(
    '(.environment | ascii_downcase) == "production"',
    exactShaCheck,
  );
  const vercelCheck = locate('.creator.login == "vercel[bot]"', productionCheck);
  locate("deployments/${deployment_id}/statuses", vercelCheck);
  const pushStep = locate("- name: Push migrations", successBreak);
  const dbPush = locate("run: supabase db push", pushStep);

  expect(source.indexOf("run: supabase db push")).toBe(dbPush);
  expect(source).toContain("deployments: read");
  expect(source).toContain("statuses: read");
  expect(vercelContext).toBeGreaterThan(statusLookup);
  expect(source.slice(waitStep, dbPush)).toContain("failure|error)");
  expect(source.slice(waitStep, dbPush)).toContain("exit 1");
  expect(source.slice(waitStep, dbPush)).toContain(
    "Timed out waiting for Vercel production deployment of ${GITHUB_SHA}.",
  );
}

describe("housing-photo migration deploy ordering", () => {
  it("runs the production migration job only from main", () => {
    const deployJob = workflow.indexOf("  deploy:");
    const checkout = workflow.indexOf("- name: Checkout", deployJob);

    expect(deployJob).toBeGreaterThanOrEqual(0);
    expect(workflow.slice(deployJob, checkout)).toContain(
      "if: github.ref == 'refs/heads/main'",
    );
  });

  it("gates the database push on exact-SHA Vercel Production success", () => {
    assertExactProductionDeploymentGate(workflow);
  });

  it("rejects a branch-only deployment gate", () => {
    expect(() =>
      assertExactProductionDeploymentGate(
        workflow.replace(
          '"repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}/status"',
          '"repos/${GITHUB_REPOSITORY}/commits/main/status"',
        ),
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

    expect(gate).toContain('if ! combined_status="$(gh api');
    expect(gate).toContain(
      "GitHub commit status request failed on attempt ${attempt}; treating as transient and waiting.",
    );
    expect(gate).toContain('combined_status=\'{"statuses":[]}\'');
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

  it("bounds the push and fails closed on post-migration schema and runtime proof", () => {
    const pushStep = workflow.indexOf("- name: Push migrations");
    const schemaStep = workflow.indexOf(
      "- name: Verify production schema contract",
      pushStep,
    );
    const runtimeStep = workflow.indexOf(
      "- name: Verify post-migration production runtime",
      schemaStep,
    );

    expect(workflow.slice(pushStep, schemaStep)).toContain("timeout-minutes: 20");
    expect(workflow.slice(schemaStep, runtimeStep)).toContain(
      "--file tools/db-assert/sql/assert_production_launch.sql",
    );
    for (const proof of [
      "migration_077_applied",
      "launch_functions_present",
      "launch_rpc_grants_safe",
      "direct_profile_insert_closed",
      "launch_constraints_valid",
      "launch_triggers_enabled",
      "community_bucket_listing_closed",
      "service_function_search_paths_pinned",
    ]) {
      expect(workflow.slice(schemaStep, runtimeStep)).toContain(
        `.[0].${proof} == true`,
      );
      expect(productionLaunchAssertion).toContain(`as ${proof}`);
    }
    expect(workflow.slice(runtimeStep)).toContain(
      "Post-migration production runtime and database are ready.",
    );
    expect(workflow.slice(runtimeStep)).toContain(
      "Post-migration production readiness probe failed.",
    );
  });

  it("keeps the production launch assertion read-only", () => {
    expect(productionLaunchAssertion.trimStart()).toMatch(/^select\b/);
    const withoutStringLiterals = productionLaunchAssertion.replace(
      /'(?:''|[^'])*'/g,
      "''",
    );
    expect(withoutStringLiterals).not.toMatch(
      /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/,
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
