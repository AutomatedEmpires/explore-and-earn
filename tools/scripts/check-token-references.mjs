import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * check-token-references.mjs (guardrail G54)
 *
 * Catches the CONSUMED-BUT-UNDEFINED custom property: a stylesheet that says
 * `color: var(--ee-text-strong)` when nothing anywhere declares
 * `--ee-text-strong`. CSS does not error on this — the declaration is simply
 * dropped, so the element inherits, and the failure shows up as invisible text
 * or a collapsed box on ONE surface that nobody rendered before shipping. It
 * broke the $199 activation page once, and a manual sweep during the V2
 * redesign found six more of the same shape. Type-checking cannot see it (CSS
 * is not typed), the raw-color ratchets cannot see it (there is no color
 * literal to count), and a build cannot see it (the CSS compiles fine).
 *
 * WHAT IT DOES
 *   1. Collects every custom-property DEFINITION reachable at runtime:
 *      - `--x: value` in any CSS file under the scan roots (tokens.css,
 *        palettes.css, primitives.css, the OS stylesheets, and every CSS
 *        module — a module-scoped `:root`/`.cls { --x: … }` is a real
 *        definition and must count).
 *      - `@property --x` registrations.
 *      - Inline definitions from TS/TSX: `"--x": value` inside a style object
 *        and `style.setProperty("--x", …)`. Components legitimately hand
 *        values down this way (AdminShell passes `--adminos-rail-w`), so a
 *        CSS-only scan would report false violations.
 *   2. Collects every REFERENCE: `var(--x)` in CSS and in TS/TSX.
 *   3. Fails when a reference has no definition and no fallback.
 *
 * FALLBACKS ARE NOT VIOLATIONS. `var(--x, 12px)` renders 12px when --x is
 * undefined, which is the defined behaviour a fallback exists to provide. Only
 * a BARE `var(--x)` with nothing to fall back to can silently drop. Bare
 * references to undefined properties are the entire bug class; they fail.
 *
 * PREFIX ALLOWLIST — properties whose values are injected at runtime by
 * something outside the stylesheets, so no CSS file declares them:
 *   --font-*   next/font (app/layout.tsx `variable: "--font-manrope"`)
 * These are matched by PREFIX because next/font names them, not us.
 *
 * This is a HARD gate, not a ratchet. There is no defensible baseline for a
 * declaration that does nothing, and the population is small enough to fix.
 * This script never edits source files.
 */

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps/web", "packages/ui/src"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  ".turbo",
  ".git",
  "coverage",
  "playwright-report",
  "test-results",
]);

/**
 * Custom properties supplied at runtime from outside the stylesheets. Matched
 * as PREFIXES because the injector, not this repo, chooses the full name.
 */
const ALLOWED_PREFIXES = ["--font-"];

const CSS_RE = /\.css$/;
const CODE_RE = /\.(tsx|ts)$/;

/** Every custom property DEFINED in a CSS declaration: `--x: value`. */
const CSS_DEFINE_RE = /(--[A-Za-z0-9_-]+)\s*:/g;
/** `@property --x { … }` registration. */
const AT_PROPERTY_RE = /@property\s+(--[A-Za-z0-9_-]+)/g;
/** Definition inside a JS style object: `"--x":` or `'--x':`. */
const JS_DEFINE_RE = /["'](--[A-Za-z0-9_-]+)["']\s*:/g;
/** `setProperty("--x", …)`. */
const SET_PROPERTY_RE = /setProperty\(\s*["'](--[A-Za-z0-9_-]+)["']/g;
/**
 * A `var()` reference. Group 1 is the property; group 2 is non-empty when the
 * reference carries a fallback (`var(--x, …)`), which cannot silently drop.
 */
const VAR_RE = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,)?/g;
/** A numeric spacing rung reference: `var(--space-12)`. */
const SPACE_RUNG_RE = /var\(\s*--space-(\d+)\s*[,)]/g;

/* ===================================================================== */
/* FOREIGN-SCALE HEURISTIC                                                */
/*                                                                        */
/* The second failure mode of this token family, and the one that does    */
/* NOT produce an undefined reference: a stylesheet authored against      */
/* Tailwind's step-indexed scale, where `4` means 16px. Here the number   */
/* IS the pixel value, so `padding: var(--space-4)` compiles perfectly    */
/* and renders a 4px card. Five files shipped that way — including the    */
/* $199 activation page, whose checkout button had 3px of vertical        */
/* padding — and no existing gate could see it, because every token they  */
/* referenced was defined.                                                */
/*                                                                        */
/* THE SIGNAL: a file whose ENTIRE numeric spacing vocabulary sits at or  */
/* below 6px, across enough declarations to be a layout rather than a     */
/* detail. Nobody designs a whole component in ≤6px increments; a file    */
/* that appears to is a file whose author meant 16px and 24px.            */
/*                                                                        */
/* WHAT IT CANNOT CATCH: a MIXED file, where a correct px-literal pass    */
/* and a Tailwind-scale pass are interleaved (host/billing is exactly     */
/* this — rungs 1-4 alongside 10/12/14). Raising the max rung to catch    */
/* those would fire on every legitimately fine-grained stylesheet, so the */
/* heuristic deliberately stays narrow: it catches the wholesale case     */
/* cleanly and says nothing about the mixed one. A narrow check that      */
/* nobody silences beats a broad one everyone allowlists.                 */
/*                                                                        */
/* This is a HARD gate with an EMPTY allowlist, which it can be only      */
/* because the population is currently zero. Adding an entry here means   */
/* claiming a file really is all-hairlines — say why.                     */
/* ===================================================================== */
const SCALE_MAX_RUNG = 6;
const SCALE_MIN_REFS = 4;
/** @type {Map<string, string>} file → justification */
const SCALE_ALLOWLIST = new Map();

/** Strip comments so a commented-out reference is not counted as live code. */
function stripComments(text, isCss) {
  // Block comments cover /* … */ in both CSS and TS.
  let out = text.replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!isCss) {
    // Line comments only exist in TS/TSX. In CSS, `//` is not a comment and a
    // URL like https://… must not be truncated.
    out = out.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  }
  return out;
}

/** @returns {string[]} every scannable file under `dir`. */
function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // broken symlink — nothing to scan
    }
    if (st.isDirectory()) out.push(...walk(full));
    else if (CSS_RE.test(name) || CODE_RE.test(name)) out.push(full);
  }
  return out;
}

/** Line number of `index` within `text` (1-based). */
function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

const defined = new Set();
/** @type {{file: string, line: number, name: string}[]} */
const bareRefs = [];
/** @type {{file: string, line: number, name: string}[]} */
const fallbackRefs = [];
/** CSS file → every numeric --space-N rung it references. @type {Map<string, number[]>} */
const spaceRungs = new Map();

const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));

for (const file of files) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const isCss = CSS_RE.test(file);
  const raw = readFileSync(file, "utf8");
  const text = stripComments(raw, isCss);

  if (isCss) {
    for (const m of text.matchAll(CSS_DEFINE_RE)) {
      // `var(--x` also matches `--x` followed by whitespace then `:`? No — the
      // regex requires a colon directly after the name, which a var() reference
      // never has. But a fallback like `var(--a, var(--b))` is safe for the same
      // reason. Definitions only.
      defined.add(m[1]);
    }
    for (const m of text.matchAll(AT_PROPERTY_RE)) defined.add(m[1]);
  } else {
    for (const m of text.matchAll(JS_DEFINE_RE)) defined.add(m[1]);
    for (const m of text.matchAll(SET_PROPERTY_RE)) defined.add(m[1]);
  }

  for (const m of text.matchAll(VAR_RE)) {
    const entry = { file: rel, line: lineOf(text, m.index ?? 0), name: m[1] };
    if (m[2]) fallbackRefs.push(entry);
    else bareRefs.push(entry);
  }

  if (isCss) {
    const rungs = [...text.matchAll(SPACE_RUNG_RE)].map((m) => Number(m[1]));
    if (rungs.length > 0) spaceRungs.set(rel, rungs);
  }
}

function isAllowed(name) {
  return ALLOWED_PREFIXES.some((p) => name.startsWith(p));
}

const violations = bareRefs.filter(
  (r) => !defined.has(r.name) && !isAllowed(r.name),
);

// Reported for visibility only — a fallback renders, so these do not fail.
const softMisses = fallbackRefs.filter(
  (r) => !defined.has(r.name) && !isAllowed(r.name),
);

if (process.argv.includes("--report")) {
  const byName = new Map();
  for (const v of [...violations, ...softMisses]) {
    if (!byName.has(v.name)) byName.set(v.name, []);
    byName.get(v.name).push(v);
  }
  for (const [name, rows] of [...byName].sort()) {
    console.log(`${name}`);
    for (const r of rows) console.log(`    ${r.file}:${r.line}`);
  }
}

if (violations.length > 0) {
  const byName = new Map();
  for (const v of violations) {
    if (!byName.has(v.name)) byName.set(v.name, []);
    byName.get(v.name).push(`${v.file}:${v.line}`);
  }
  console.error(
    "G54 undefined token references (a bare var() with no definition silently drops the whole declaration):",
  );
  for (const [name, sites] of [...byName].sort()) {
    console.error(`  - ${name}`);
    for (const site of sites.slice(0, 8)) console.error(`      ${site}`);
    if (sites.length > 8) console.error(`      …and ${sites.length - 8} more`);
  }
  console.error(
    "Fix each by DEFINING the property (apps/web/styles/tokens.css or the owning stylesheet) or REPOINTING the reference at the token that already carries the value. A fallback — var(--x, <value>) — is also acceptable when the property is genuinely optional.",
  );
  process.exit(1);
}

const suffix =
  softMisses.length > 0
    ? ` (${softMisses.length} undefined-with-fallback reference${softMisses.length === 1 ? "" : "s"} tolerated)`
    : "";
console.log(
  `G54 token references OK: ${bareRefs.length + fallbackRefs.length} var() references across ${files.length} files resolve against ${defined.size} defined properties${suffix}.`,
);

/* ---- G54b: foreign-scale stylesheets -------------------------------- */

const scaleSuspects = [];
for (const [file, rungs] of spaceRungs) {
  if (SCALE_ALLOWLIST.has(file)) continue;
  if (rungs.length < SCALE_MIN_REFS) continue;
  const max = Math.max(...rungs);
  if (max <= SCALE_MAX_RUNG) {
    scaleSuspects.push({ file, max, count: rungs.length });
  }
}

if (scaleSuspects.length > 0) {
  console.error(
    "G54b foreign spacing scale — these stylesheets lay out entirely in <=6px increments, which is the signature of a file written against a STEP-indexed scale (Tailwind's, where 4 means 16px). Here the number IS the pixel value:",
  );
  for (const s of scaleSuspects.sort((a, b) => a.file.localeCompare(b.file))) {
    console.error(
      `  - ${s.file}: ${s.count} spacing references, largest is --space-${s.max} (${s.max}px)`,
    );
  }
  console.error(
    "Re-map each reference onto the rung the author MEANT: 1→--space-4, 2→--space-8, 3→--space-12, 4→--space-16, 5→--space-20, 6→--space-24. Fix whole files — a half-fix inverts the file's own ordering, making --space-1 (4px) larger than the --space-2 (2px) beside it. If a file really is all hairlines, add it to SCALE_ALLOWLIST with a reason.",
  );
  process.exit(1);
}

console.log(
  `G54b spacing scale OK: no stylesheet lays out entirely in <=${SCALE_MAX_RUNG}px increments (${spaceRungs.size} stylesheets reference the spacing scale).`,
);
