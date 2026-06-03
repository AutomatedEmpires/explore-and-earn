import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, sep } from "node:path";
import { MARKETPLACE_CATEGORIES } from "../../packages/contracts/src/enums.ts";
import { ICON_REGISTRY } from "../../packages/ui/src/icons/registry.ts";

/**
 * check-category-taxonomy.mjs (guardrail G031)
 *
 * Founder-locked canon (resolved 2026-06-01, see root AGENTS.md and
 * packages/contracts/src/enums.ts -> MARKETPLACE_CATEGORIES):
 *
 *   The category lanes are EXACTLY: farm / maritime / remote / seasonal / mix.
 *
 * "Lodge" is NOT a top-level category. It is (a) a host-type noun and (b) a
 * setting/environment that lives under the `seasonal` lane. Both of those uses
 * are explicitly ALLOWED. What is banned is treating `lodge` as a category --
 * e.g. a `category.lodge` icon/key, a `CategoryKey`/`OpportunityCategory`
 * union member equal to "lodge", or a category-lane list literal that includes
 * "lodge".
 *
 * This script is READ-ONLY. It never edits files. It exits non-zero when it
 * finds a NEW violation so CI / `pnpm guardrails` blocks the drift.
 */

const CATEGORY_LANES = [...MARKETPLACE_CATEGORIES];
const EXPECTED_CATEGORY_ICON_KEYS = new Set(CATEGORY_LANES.map((lane) => `category.${lane}`));

const ROOTS = ["apps", "packages", "docs"];
const FILE_PATTERN = /\.(ts|tsx|js|mjs|cjs|md)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next", "build"]);

// This guardrail's own implementation and its doc intentionally contain the
// banned token to describe the rule, so they must never trip it.
const SELF_EXCLUDE = /check-category-taxonomy|category-taxonomy-guardrail/;

const violations = [];

function toPosix(path) {
  return path.split(sep).join("/");
}

function report(path, message) {
  const posix = toPosix(path);
  violations.push(`${posix}  ${message}`);
}

function walk(directory, files = []) {
  if (!existsSync(directory)) {
    return files;
  }
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (FILE_PATTERN.test(fullPath) && !SELF_EXCLUDE.test(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

// A match is treated as documentation (allowed) when it sits in a code comment
// or inside markdown inline code. This lets canon docs and registry comments
// say "there is no `category.lodge` key" without tripping the guardrail.
function isDocumentationContext(line, index) {
  const trimmed = line.trimStart();
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("<!--")
  ) {
    return true;
  }
  const before = line.slice(0, index);
  if (before.includes("//")) {
    return true;
  }
  const backticks = (before.match(/`/g) || []).length;
  return backticks % 2 === 1;
}

function sameSet(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pass 1: static grep gate -- block executable `category.lodge` anywhere in
// source (comments/docs are allowed).
// ---------------------------------------------------------------------------
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");

    // (A) `category.lodge` dot-key usage.
    lines.forEach((line, i) => {
      let idx = line.indexOf("category.lodge");
      while (idx !== -1) {
        if (!isDocumentationContext(line, idx)) {
          report(file, `G031: 'category.lodge' used as a top-level category key (line ${i + 1})`);
        }
        idx = line.indexOf("category.lodge", idx + 1);
      }
    });

  }
}

// ---------------------------------------------------------------------------
// Pass 2: drift check -- `category.*` icon keys must match
// `MARKETPLACE_CATEGORIES` exactly (no extras, no missing).
// ---------------------------------------------------------------------------
const categoryIconKeys = new Set(
  Object.keys(ICON_REGISTRY).filter((key) => key.startsWith("category.")),
);

if (!sameSet(categoryIconKeys, EXPECTED_CATEGORY_ICON_KEYS)) {
  const missing = [...EXPECTED_CATEGORY_ICON_KEYS].filter((key) => !categoryIconKeys.has(key));
  const extra = [...categoryIconKeys].filter((key) => !EXPECTED_CATEGORY_ICON_KEYS.has(key));

  violations.push(
    [
      "packages/ui/src/icons/registry.ts  G031: category.* icon keys must equal MARKETPLACE_CATEGORIES exactly",
      missing.length > 0 ? `missing={${missing.join(", ")}}` : "missing={}",
      extra.length > 0 ? `extra={${extra.join(", ")}}` : "extra={}"
    ].join(" "),
  );
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  console.error(
    `\ncategory-taxonomy: FAILED with ${violations.length} violation(s). ` +
      `Locked lanes: ${CATEGORY_LANES.join(", ")}. 'lodge' is a setting under seasonal, never a top-level category.`
  );
  process.exit(1);
}

console.log("category-taxonomy: category.* keys match MARKETPLACE_CATEGORIES and lodge grep gate is clean");
