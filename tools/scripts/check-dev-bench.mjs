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
const MIDDLEWARE_FILE = "apps/web/middleware.ts";
const SURFACES_FILE = "apps/web/components/dev/surfaces.ts";
const DISCOVERY_DATA_FILE = "apps/web/components/discovery/data.ts";
const GATE_GUARD = `process.env.NODE_ENV !== "production"`;
const PUBLIC_ENTRY = `"/dev"`;
const FLAG = "NEXT_PUBLIC_DEV_BENCH";
const REQUIRED_REVIEW_SURFACES = [
  '"/dev/catalog"',
  '"/for-seekers"',
  '"/host/plans"',
  '"/listing/lst_sourced_kelp_farm"',
  '"/refunds"',
  '"/sourced-listings"',
  '"/team/accept"',
];

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

// --- Invariant 2: the local launcher is reachable before impersonation -------
// The launcher sets the role cookie, so middleware must not require that cookie
// before allowing /dev through. The page's NODE_ENV gate above still makes this
// route a 404 in every production/preview build.
if (!existsSync(MIDDLEWARE_FILE)) {
  violations.push(`${MIDDLEWARE_FILE}  G040: middleware is missing`);
} else {
  const middleware = readFileSync(MIDDLEWARE_FILE, "utf8");
  const matcherStart = middleware.indexOf("const isPublicRoute");
  const matcherEnd = middleware.indexOf("]);", matcherStart);
  const publicMatcher =
    matcherStart >= 0 && matcherEnd > matcherStart
      ? middleware.slice(matcherStart, matcherEnd)
      : "";

  if (!publicMatcher.includes(PUBLIC_ENTRY)) {
    violations.push(
      `${MIDDLEWARE_FILE}  G040: /dev must be public so the local role picker is reachable`,
    );
  }

  const wrapperStart = middleware.indexOf("function devBenchAwareClerkMiddleware(");
  const roleGate = middleware.indexOf(
    "request.cookies.get(DEV_ROLE_COOKIE)",
    wrapperStart,
  );
  const clerkDelegate = middleware.indexOf(
    "return configuredClerkMiddleware(request, event);",
    wrapperStart,
  );
  if (
    wrapperStart < 0 ||
    roleGate < wrapperStart ||
    clerkDelegate < roleGate
  ) {
    violations.push(
      `${MIDDLEWARE_FILE}  G040: local role impersonation must bypass Clerk before session refresh`,
    );
  }
}

// --- Invariant 3: the launcher covers deterministic review anchors ----------
if (!existsSync(SURFACES_FILE)) {
  violations.push(`${SURFACES_FILE}  G040: surface index is missing`);
} else {
  const surfaces = readFileSync(SURFACES_FILE, "utf8");
  for (const required of REQUIRED_REVIEW_SURFACES) {
    if (!surfaces.includes(required)) {
      violations.push(
        `${SURFACES_FILE}  G040: missing deterministic review surface ${required}`,
      );
    }
  }
  if (
    !surfaces.includes('import { DEMO_SURFACES }') ||
    !surfaces.includes("DEMO_SURFACES.map")
  ) {
    violations.push(
      `${SURFACES_FILE}  G040: Enterprise demo routes must derive from canonical DEMO_SURFACES`,
    );
  }
}

// --- Invariant 4: review inventory stays deterministic ----------------------
// A developer may have local Supabase credentials present while the local
// stack is stopped. The bench must still render fixtures instead of hanging or
// throwing; NEXT_PUBLIC_DEV_BENCH=0 remains the explicit live-data opt-out.
if (!existsSync(DISCOVERY_DATA_FILE)) {
  violations.push(`${DISCOVERY_DATA_FILE}  G040: discovery data seam is missing`);
} else {
  const discoveryData = readFileSync(DISCOVERY_DATA_FILE, "utf8");
  const fixtureGate = discoveryData.indexOf(
    "export function canUseDiscoveryFixtureFallback()",
  );
  const configGate = discoveryData.indexOf(
    "export function hasDiscoveryPublicDataConfig()",
  );
  if (
    fixtureGate < 0 ||
    discoveryData.indexOf("if (isDevBenchEnabled()) return true;", fixtureGate) <
      fixtureGate
  ) {
    violations.push(
      `${DISCOVERY_DATA_FILE}  G040: dev bench must force deterministic discovery fixtures`,
    );
  }
  if (
    configGate < 0 ||
    discoveryData.indexOf("if (isDevBenchEnabled()) return false;", configGate) <
      configGate
  ) {
    violations.push(
      `${DISCOVERY_DATA_FILE}  G040: dev bench must suppress configured live discovery data`,
    );
  }
}

// --- Invariant 5: committed env files never enable the bench -----------------
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

console.log(
  "dev-bench: production kill intact, launcher reachable and indexed, no committed env enables the bench OK",
);
