import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * check-raw-colors.mjs (guardrail G50)
 *
 * "Tokens are law" (visual-system.md §0.1): feature code references semantic
 * tokens, never raw hex/rgb(a) literals. Historic drift left hundreds of raw
 * colors in apps/web, so this gate is a RATCHET, not a hard wall:
 *
 *   - every file's current raw-color count is recorded in
 *     tools/scripts/raw-color-baseline.json
 *   - CI fails when any file EXCEEDS its baseline (new drift)
 *   - when a file improves, run `node tools/scripts/check-raw-colors.mjs
 *     --update` to lock in the lower number (the ratchet only tightens)
 *
 * tokens.css is the one place values live — it is excluded by design.
 * This script never edits source files. It exits non-zero on a violation.
 */

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps/web/app", "apps/web/components", "apps/web/styles"];
const EXCLUDE_FILES = new Set([
  "apps/web/styles/tokens.css", // the source of truth for values
]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next", ".git"]);
const BASELINE_PATH = "tools/scripts/raw-color-baseline.json";
const UPDATE = process.argv.includes("--update");

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGBA_RE = /\brgba?\(/g;

/** @returns {string[]} */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(css|tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

/** Count raw color literals in one file. */
function countRawColors(text) {
  const hex = text.match(HEX_RE)?.length ?? 0;
  const rgba = text.match(RGBA_RE)?.length ?? 0;
  return hex + rgba;
}

const counts = {};
for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, scanRoot))) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (EXCLUDE_FILES.has(rel)) continue;
    const n = countRawColors(readFileSync(file, "utf8"));
    if (n > 0) counts[rel] = n;
  }
}

if (UPDATE) {
  const sorted = Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(
    `raw-color baseline updated: ${Object.keys(counts).length} files, ${total} raw colors`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch {
  console.error(
    `G50: missing/invalid ${BASELINE_PATH} — run with --update to create it.`,
  );
  process.exit(1);
}

const violations = [];
for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (n > allowed) {
    violations.push(`${file}: ${n} raw colors (baseline ${allowed})`);
  }
}

if (violations.length > 0) {
  console.error("G50 raw-color ratchet violations (tokens are law):");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    "Use semantic tokens from apps/web/styles/tokens.css. If you tokenized a file below its baseline, run `node tools/scripts/check-raw-colors.mjs --update`.",
  );
  process.exit(1);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(
  `G50 raw-color ratchet OK: ${total} raw colors across ${Object.keys(counts).length} files (baseline respected).`,
);
