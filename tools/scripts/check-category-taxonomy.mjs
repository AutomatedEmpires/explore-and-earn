import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, sep } from "node:path";

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
 *
 * Ownership note (keep main green / no cross-PR edits): files owned by other
 * in-flight PRs are listed in NOTE_ONLY_PATHS. Pre-existing references inside
 * those files are downgraded to non-fatal `note:` lines instead of hard
 * failures, so this guardrail does not force edits into another PR's surface.
 * Any violation in any other file still fails the build.
 *
 * Resilience: target files that are absent on the current ref are skipped with
 * a note and pass (mirrors check-canon-contracts.mjs), so the guardrail can
 * land independently of the PRs that introduce the contracts/UI sources.
 */

const CATEGORY_LANES = ["farm", "maritime", "remote", "seasonal", "mix"];
const LANE_SET = new Set(CATEGORY_LANES);

const ROOTS = ["apps", "packages", "docs"];
const FILE_PATTERN = /\.(ts|tsx|js|mjs|cjs|md)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next", "build"]);

// This guardrail's own implementation and its doc intentionally contain the
// banned token to describe the rule, so they must never trip it.
const SELF_EXCLUDE = /check-category-taxonomy|category-taxonomy-guardrail/;

// Paths owned by other open PRs (#16 icon registry, #18 lodge-purge docs). We
// must not edit these from this PR, so pre-existing references are reported as
// notes rather than hard failures.
const NOTE_ONLY_PATHS = new Set([
  "packages/ui/src/icons/registry.ts",
  "docs/design/visual-language.md",
  "docs/product/discovery-card-v1.md",
  "docs/product/product-principles.md"
]);

const CATEGORY_TYPE_NAMES = ["CategoryKey", "OpportunityCategory", "MarketplaceCategory"];
const LANE_ARRAY_NAMES = [
  "MARKETPLACE_CATEGORIES",
  "CATEGORY_LANES",
  "CATEGORIES",
  "categoryLanes",
  "marketplaceCategories"
];

const CONTRACTS_ENUM_PATH = "packages/contracts/src/enums.ts";
const UI_REGISTRY_PATH = "packages/ui/src/icons/registry.ts";

const violations = [];
const notes = [];

function toPosix(path) {
  return path.split(sep).join("/");
}

function report(path, message) {
  const posix = toPosix(path);
  const line = `${posix}  ${message}`;
  if (NOTE_ONLY_PATHS.has(posix)) {
    notes.push(`${line} (owned by another open PR -- note only)`);
  } else {
    violations.push(line);
  }
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

function quotedTokens(block) {
  return [...block.matchAll(/["']([a-z_]+)["']/g)].map((match) => match[1]);
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

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

// ---------------------------------------------------------------------------
// Pass 1: scan source + docs for `lodge`-as-category shapes.
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

    // (B) `"lodge"` as a member of a category union/type.
    if (CATEGORY_TYPE_NAMES.some((name) => content.includes(name))) {
      lines.forEach((line, i) => {
        const match = line.match(/\|\s*["']lodge["']/);
        if (match && !isDocumentationContext(line, match.index)) {
          report(file, `G031: '"lodge"' present as a category union member (line ${i + 1})`);
        }
      });
    }

    // (C) a category-lane array literal that lists lodge.
    for (const name of LANE_ARRAY_NAMES) {
      const re = new RegExp(`\\b${name}\\s*(?::[^=]*)?=\\s*\\[([\\s\\S]*?)\\]`, "g");
      let match;
      while ((match = re.exec(content)) !== null) {
        if (/["']lodge["']/.test(match[1])) {
          report(file, `G031: lane array '${name}' must not include 'lodge' (line ${lineNumberAt(content, match.index)})`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 2: the locked set must match across canon sources (set comparison is
// order-independent). Contracts is the source of truth and is enforced hard;
// the UI registry is owned by PR #16, so divergence there is a note only.
// ---------------------------------------------------------------------------
if (existsSync(CONTRACTS_ENUM_PATH)) {
  const source = readFileSync(CONTRACTS_ENUM_PATH, "utf8");
  const match = source.match(/MARKETPLACE_CATEGORIES\s*(?::[^=]*)?=\s*\[([\s\S]*?)\]/);
  if (match) {
    const found = new Set(quotedTokens(match[1]));
    if (found.has("lodge")) {
      violations.push(`${CONTRACTS_ENUM_PATH}  G031: MARKETPLACE_CATEGORIES must not include 'lodge'`);
    }
    if (!sameSet(found, LANE_SET)) {
      violations.push(
        `${CONTRACTS_ENUM_PATH}  G031: MARKETPLACE_CATEGORIES {${[...found].join(", ")}} diverges from locked lanes {${CATEGORY_LANES.join(", ")}}`
      );
    }
  } else {
    notes.push(`${CONTRACTS_ENUM_PATH}: MARKETPLACE_CATEGORIES array not found -- skipped`);
  }
} else {
  notes.push(`${CONTRACTS_ENUM_PATH}: absent on this ref -- skipped (will enforce once present)`);
}

if (existsSync(UI_REGISTRY_PATH)) {
  const source = readFileSync(UI_REGISTRY_PATH, "utf8");
  const keys = new Set([...source.matchAll(/["']category\.([a-z_]+)["']/g)].map((match) => match[1]));
  if (keys.size > 0 && !sameSet(keys, LANE_SET)) {
    notes.push(
      `${UI_REGISTRY_PATH}: category.* icon keys {${[...keys].join(", ")}} diverge from locked lanes {${CATEGORY_LANES.join(", ")}} (owned by PR #16 -- note only)`
    );
  }
} else {
  notes.push(`${UI_REGISTRY_PATH}: absent on this ref -- skipped`);
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
for (const note of notes) {
  console.warn(`note: ${note}`);
}

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

console.log("category-taxonomy: locked lane set OK");
