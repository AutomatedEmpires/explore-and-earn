import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const GUARD_PATH = join(REPO_ROOT, "tools/scripts/check-build-runtime.mjs");
const RUNNER_PATH = join(REPO_ROOT, "tools/scripts/run-web-next-build.mjs");
const PACKAGE_PATH = join(REPO_ROOT, "apps/web/package.json");
const VALID_RUNNER = readFileSync(RUNNER_PATH, "utf8");
const VALID_BUILD = (
  JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as {
    scripts: { build: string };
  }
).scripts.build;
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { force: true, recursive: true });
  }
});

function runGuard(options: { build?: string; runner?: string } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), "ee-build-runtime-"));
  fixtures.push(fixture);
  const packageFile = join(fixture, "apps/web/package.json");
  const runnerFile = join(fixture, "tools/scripts/run-web-next-build.mjs");
  mkdirSync(dirname(packageFile), { recursive: true });
  mkdirSync(dirname(runnerFile), { recursive: true });
  writeFileSync(
    packageFile,
    JSON.stringify({ scripts: { build: options.build ?? VALID_BUILD } }),
  );
  writeFileSync(runnerFile, options.runner ?? VALID_RUNNER);

  return spawnSync(process.execPath, [GUARD_PATH], {
    cwd: fixture,
    encoding: "utf8",
  });
}

describe("build runtime guard", () => {
  it("accepts the repository's current build contract", () => {
    const result = runGuard();

    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    "node ../../tools/scripts/run-web-next-build.mjs || true",
    "true || node ../../tools/scripts/run-web-next-build.mjs",
    "node ../tools/scripts/run-web-next-build.mjs",
  ])("rejects a runner that does not control build success: %s", (build) => {
    const result = runGuard({ build });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bounded-memory Next runner");
  });

  it("rejects a constant heap-limit detector", () => {
    const runner = VALID_RUNNER.replace(
      /const hasExplicitHeapLimit =[\s\S]*?\);\nconst nodeOptions/,
      "const hasExplicitHeapLimit = false;\nconst nodeOptions",
    );
    const result = runGuard({ runner });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("explicit heap-limit detection");
  });

  it("rejects a declared but unused default heap", () => {
    const runner = VALID_RUNNER.replace(
      "${DEFAULT_BUILD_HEAP_MB}",
      "4096",
    );
    const result = runGuard({ runner });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("apply its 4096 MB heap floor");
  });

  it("rejects swapped package-manager argument branches", () => {
    const runner = VALID_RUNNER.replace(
      /const args = packageManagerEntry[\s\S]*?\["exec", "next", "build"\];/,
      'const args = packageManagerEntry\n  ? ["exec", "next", "build"]\n  : [packageManagerEntry, "exec", "next", "build"];',
    );
    const result = runGuard({ runner });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("portable Next build arguments");
  });

  it("rejects a spawn that bypasses the validated arguments or heap options", () => {
    const runner = VALID_RUNNER.replace(
      "spawnSync(command, args, {",
      'spawnSync(command, ["exec", "next", "build"], {',
    ).replace("NODE_OPTIONS: nodeOptions", "NODE_OPTIONS: existingNodeOptions");
    const result = runGuard({ runner });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pass its arguments and heap options");
  });
});
