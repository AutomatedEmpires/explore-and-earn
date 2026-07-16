import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * check-tokenization.mjs (guardrail G51)
 *
 * Lands the raw-hex/rgba tokenization gate that packages/ui/src/tokens.ts has
 * long ADVERTISED ("planned raw-hex CI check") but never enforced. "Tokens are
 * law": component styles reference the semantic design tokens, never raw
 * hex/rgb(a) literals. The VALUES live in exactly two allowlisted files
 * (apps/web/styles/tokens.css + primitives.css); everything else must go
 * through a token.
 *
 * Coverage is the design-system layer that the sibling apps/web ratchet
 * (check-raw-colors.mjs / G50) does NOT reach — the shared component library in
 * packages/ui/src — plus the raw apps/web/styles stylesheets (so primitives.css
 * is a first-class allowlist entry). Like G50 this is a RATCHET, not a hard
 * wall: the DiscoveryCard match/tone accents and the OS-shell stylesheets carry
 * historic raw colors, so each file's current count is baselined and CI fails
 * only when a file EXCEEDS its baseline (new drift). When a file improves, run
 * `node tools/scripts/check-tokenization.mjs --update` to lock the lower number
 * (the ratchet only tightens). This script never edits source files.
 */

const ROOT = process.cwd();
const SCAN_ROOTS = ["packages/ui/src", "apps/web/styles"];
const EXCLUDE_FILES = new Set([
  "apps/web/styles/tokens.css", // the source of truth for color values
  "apps/web/styles/primitives.css", // primitive value layer (allowlisted)
]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next", ".git"]);
const BASELINE_PATH = "tools/scripts/tokenization-baseline.json";
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
    `tokenization baseline updated: ${Object.keys(counts).length} files, ${total} raw colors`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch {
  console.error(
    `G51: missing/invalid ${BASELINE_PATH} — run with --update to create it.`,
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
  console.error("G51 tokenization ratchet violations (tokens are law):");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    "Reference a semantic token instead of a raw hex/rgb(a). Values live only in apps/web/styles/{tokens,primitives}.css. If you tokenized a file below its baseline, run `node tools/scripts/check-tokenization.mjs --update`.",
  );
  process.exit(1);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(
  `G51 tokenization ratchet OK: ${total} raw colors across ${Object.keys(counts).length} files (baseline respected).`,
);
