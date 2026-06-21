import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, sep, basename } from "node:path";

/**
 * check-dev-bench.mjs (guardrail G040)
 *
 * The Dev Mock Bench (apps/web/lib/devBench) is REVIEW TOOLING ONLY. It must be
 * impossible to enable in a deployed (production or Vercel preview) build. Two
 * invariants protect that, and this read-only guardrail enforces both so CI /
 * `pnpm guardrails` blocks any drift:
 *
 *   1. The gate keeps its production kill: isDevBenchEnabled() must short-circuit
 *      on `process.env.NODE_ENV !== "production"`. Production and preview both
 *      build with NODE_ENV=production, so the bench is structurally off there.
 *
 *   2. No COMMITTED env file enables the opt-out flag. `NEXT_PUBLIC_DEV_BENCH`
 *      only ever turns the bench OFF (value "0"); it must never be committed set
 *      to anything else. (Local, git-ignored `.env.local` files are not scanned.)
 *
 * This script never edits files. It exits non-zero on a violation.
 */

const GATE_FILE = "apps/web/lib/devBench/index.ts";
const GATE_GUARD = `process.env.NODE_ENV !== "production"`;
const FLAG = "NEXT_PUBLIC_DEV_BENCH";

const ROOTS = ["apps", "packages", "tools", "docs", "."];
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next", "build", ".git"]);

const violations = [];

// --- Invariant 1: the production kill-switch is intact -----------------------
if (!existsSync(GATE_FILE)) {
  violations.push(`${GATE_FILE}  G040: dev-bench gate module is missing`);
} else {
  const source = readFileSync(GATE_FILE, "utf8");
  const hasGuard =
    source.includes("isDevBenchEnabled") && source.includes(GATE_GUARD);
  if (!hasGuard) {
    violations.push(
      `${GATE_FILE}  G040: isDevBenchEnabled() must gate on \`${GATE_GUARD}\` (production kill removed?)`,
    );
  }
}

// --- Invariant 2: committed env files never enable the bench -----------------
// A committed env file may set the flag only to "0" (force-off). Local
// `*.local` env files are git-ignored, so they are not scanned.
function isScannableEnvFile(name) {
  if (name.endsWith(".local")) return false;
  return name === ".env.example" || name === ".env" || name.startsWith(".env.");
}

function walkEnvFiles(directory, out = []) {
  if (!existsSync(directory)) return out;
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(directory, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walkEnvFiles(full, out);
    } else if (isScannableEnvFile(basename(full))) {
      out.push(full);
    }
  }
  return out;
}

const seen = new Set();
for (const root of ROOTS) {
  for (const file of walkEnvFiles(root)) {
    const posix = file.split(sep).join("/").replace(/^\.\//, "");
    if (seen.has(posix)) continue;
    seen.add(posix);

    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return; // commented example — allowed
      const match = trimmed.match(new RegExp(`^${FLAG}\\s*=\\s*(.*)$`));
      if (!match) return;
      const value = match[1].trim().replace(/^["']|["']$/g, "");
      if (value !== "" && value !== "0") {
        violations.push(
          `${posix}:${i + 1}  G040: ${FLAG} must never be committed enabled (found "${value}"; only "0"/unset allowed)`,
        );
      }
    });
  }
}

// --- Report ------------------------------------------------------------------
if (violations.length > 0) {
  for (const violation of violations) console.error(violation);
  console.error(
    `\ndev-bench: FAILED with ${violations.length} violation(s). The mock bench is ` +
      `dev-only tooling and must never be enable-able in a deployed build.`,
  );
  process.exit(1);
}

console.log("dev-bench: production kill intact, no committed env enables the bench OK");
