import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * check-locale-literals.mjs (guardrail G52)
 *
 * Companion to the formatter chokepoint (packages/contracts/src/format.ts +
 * apps/web/lib/format). Display formatting must go through that single, locale-
 * ready seam so the i18n wave has ONE place to thread real locales/currencies.
 * This gate fails on NEW hardcoded locale/currency literals and inline
 * `Intl.*` / `toLocale*` calls anywhere outside the allowlisted formatter
 * modules:
 *   - a literal BCP-47 `en-US`
 *   - a quoted ISO-4217 `"USD"` / `'USD'`
 *   - `Intl.NumberFormat(` / `Intl.DateTimeFormat(` with a string-literal locale
 *   - `.toLocaleDateString(` / `.toLocaleTimeString(` / `.toLocaleString(` with
 *     a string-literal locale
 *
 * Historic call sites still exist across apps/web, so — like the color ratchets
 * — this is a RATCHET: each file's current count is baselined and CI fails only
 * when a file EXCEEDS its baseline (new drift). Migrate a file to `@/lib/format`
 * (or, in packages, to `@explore-and-earn/contracts` formatters) and then run
 * `node tools/scripts/check-locale-literals.mjs --update` to lock the lower
 * number in. This script never edits source files.
 */

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps/web", "packages"];
const ALLOWLIST = new Set([
  // The one place these literals and Intl.* constructors are allowed to live.
  "packages/contracts/src/format.ts",
  "apps/web/lib/format/index.ts",
]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  ".next",
  ".git",
  "__type-tests__",
]);
const BASELINE_PATH = "tools/scripts/locale-literal-baseline.json";
const UPDATE = process.argv.includes("--update");

const PATTERNS = [
  /\ben-US\b/g,
  /["']USD["']/g,
  /Intl\.(?:NumberFormat|DateTimeFormat)\s*\(\s*["']/g,
  /\.toLocale(?:Date|Time)?String\s*\(\s*["']/g,
];

/** @returns {string[]} */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Count locale/currency/Intl literal hits in one file. */
function countLocaleLiterals(text) {
  let n = 0;
  for (const re of PATTERNS) n += text.match(re)?.length ?? 0;
  return n;
}

const counts = {};
for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, scanRoot))) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (ALLOWLIST.has(rel)) continue;
    const n = countLocaleLiterals(readFileSync(file, "utf8"));
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
    `locale-literal baseline updated: ${Object.keys(counts).length} files, ${total} literals`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch {
  console.error(
    `G52: missing/invalid ${BASELINE_PATH} — run with --update to create it.`,
  );
  process.exit(1);
}

const violations = [];
for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (n > allowed) {
    violations.push(`${file}: ${n} locale/Intl literals (baseline ${allowed})`);
  }
}

if (violations.length > 0) {
  console.error("G52 locale-literal ratchet violations (format via the chokepoint):");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    "Import formatters from @/lib/format (apps/web) or @explore-and-earn/contracts (packages) instead of hardcoding en-US/USD or constructing Intl.* inline. If you migrated a file below its baseline, run `node tools/scripts/check-locale-literals.mjs --update`.",
  );
  process.exit(1);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(
  `G52 locale-literal ratchet OK: ${total} literals across ${Object.keys(counts).length} files (baseline respected).`,
);
