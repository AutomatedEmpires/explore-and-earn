import { existsSync, readFileSync } from "node:fs";

const PACKAGE_FILE = "apps/web/package.json";
const RUNNER_FILE = "tools/scripts/run-web-next-build.mjs";
const violations = [];

if (!existsSync(PACKAGE_FILE) || !existsSync(RUNNER_FILE)) {
  violations.push("web build runner or package contract is missing");
} else {
  const pkg = JSON.parse(readFileSync(PACKAGE_FILE, "utf8"));
  const runner = readFileSync(RUNNER_FILE, "utf8");
  if (!pkg.scripts?.build?.includes("run-web-next-build.mjs")) {
    violations.push("apps/web build must execute the bounded-memory Next runner");
  }
  for (const required of [
    "DEFAULT_BUILD_HEAP_MB = 4096",
    '"exec", "next", "build"',
    "hasExplicitHeapLimit",
  ]) {
    if (!runner.includes(required)) {
      violations.push(`web build runner is missing ${required}`);
    }
  }
}

if (violations.length > 0) {
  for (const violation of violations) console.error(`build-runtime: ${violation}`);
  process.exit(1);
}

console.log("build-runtime: Next build has a portable 4 GB heap floor OK");
