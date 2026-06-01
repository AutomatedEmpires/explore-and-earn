/**
 * check-category-taxonomy.mjs
 *
 * Static CI guardrail that enforces the locked top-level category taxonomy.
 *
 * LOCKED LANE SET (order-independent): farm, maritime, remote, seasonal, mix
 * Decision date: 2026-06-01. Source of truth: docs/product/discovery-card-v1.md,
 * docs/design/visual-language.md, docs/product/product-principles.md.
 *
 * WHAT THIS SCRIPT DOES
 * ---------------------
 * 1. Scans .ts/.tsx/.mjs/.md files under apps/, packages/, docs/ and FAILS
 *    (exit 1) if "lodge" is used as a top-level category. Top-level usage means:
 *      - a "category.lodge" key (category domain key)
 *      - a TypeScript union member equal to "lodge"
 *      - a category-lane list (slash- or comma-separated) that includes lodge
 *
 * 2. Compares category-lane set declarations found in packages/contracts and
 *    packages/ui against the locked CATEGORY_LANES set (order-independent).
 *    FAILS if any divergence is found.
 *
 * ALLOWED LODGE USES (not violations):
 *   (a) Host-type noun: e.g., "farms, lodges, maritime operators" -- lodge here
 *       is a class of hospitality venue, not a product category lane.
 *   (b) Setting descriptor under seasonal: e.g., "seasonal lodge" or
 *       "Lodge / Outdoor" as a label value within a seasonal-context entry.
 *
 * NOTE-ONLY PATHS (owned by unmerged PRs -- do NOT hard-fail these):
 *   - packages/ui/src/icons/registry.ts      (owned by PR #16)
 *   - docs/product/discovery-card-v1.md      (owned by PR #18)
 *   - docs/design/figma-ai-prompts.md        (old-taxonomy artefact; fix in PR #18 scope)
 *   Hard-failing these paths would break main before the owning PRs land.
 *   Instead, violations in these paths are emitted as "note:" lines and do
 *   NOT contribute to exit 1. All other paths are hard-failed as normal.
 *
 * SKIP-WITH-NOTE-AND-PASS: if a scan root or set-check target file is absent
 * (e.g., because an owning PR has not yet been merged), the check is skipped
 * with a "note:" line and the overall result is still passing. This ensures
 * order-independence across open PRs.
 *
 * Exit 0 → prints "category-taxonomy: locked lane set OK"
 * Exit 1 → one or more hard-fail violations found
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

// Locked top-level category lane set (order does not matter for validation).
const CATEGORY_LANES = ["farm", "maritime", "remote", "seasonal", "mix"];
const CATEGORY_LANES_SET = new Set(CATEGORY_LANES);

// File extensions to scan.
const FILE_PATTERN = /\.(ts|tsx|mjs|md)$/;

// Roots to walk for top-level category violations.
const SCAN_ROOTS = ["apps", "packages", "docs"];

// Paths with known violations that are owned by unmerged PRs.
// Violations here are emitted as "note:" lines and do NOT cause exit 1.
// See file header for rationale.
const NOTE_ONLY_PATHS = new Set([
  "packages/ui/src/icons/registry.ts", // PR #16 -- icon registry overhaul
  "docs/product/discovery-card-v1.md", // PR #18 -- fix/purge-lodge-top-level-category
  "docs/design/figma-ai-prompts.md", // old-taxonomy design artefact; fix in PR #18 scope
]);

// ─── Violation patterns ────────────────────────────────────────────────────
// Match lines where lodge is used as a top-level product category.

const VIOLATION_PATTERNS = [
  {
    // "category.lodge" or 'category.lodge' -- lodge as a domain-prefixed category key
    code: "G015",
    pattern: /["']category\.lodge["']/,
    description: 'lodge used as a category key (e.g. "category.lodge")',
  },
  {
    // | "lodge" or | 'lodge' -- lodge as a TypeScript union literal member
    code: "G015",
    pattern: /\|\s*["']lodge["'](?!\w)/,
    description: "lodge as a TypeScript type-union literal member",
  },
  {
    // lodge adjacent to other category names in a slash- or comma-separated list
    // e.g. "farm/lodge/maritime", "farm, lodge, remote"
    code: "G015",
    pattern:
      /(?:farm|maritime|remote|seasonal|mix)[/,]\s*lodge\b|\blodge\b\s*[/,]\s*(?:farm|maritime|remote|seasonal|mix)/i,
    description: "lodge in a category-lane list adjacent to a locked lane name",
  },
];

// ─── Allow patterns ────────────────────────────────────────────────────────
// Lines matching ANY allow pattern are exempt even if a violation pattern fires.
//
// Allowed (a): host-type noun list -- lodge as a venue/operator class.
//   Examples: "farms, lodges, maritime operators"  "farms / lodges / remote"
// Allowed (b): seasonal-setting descriptor -- lodge as an environment sub-type.
//   Examples: "seasonal lodge"  "Lodge / Outdoor" (as a label value)

const ALLOW_PATTERNS = [
  // (a) host-type noun: farms … lodges or lodges … maritime/remote/employers
  /farms?\s*[,\/]\s*lodges?/i,
  /lodges?\s*[,\/]\s*(?:maritime|remote|employers?|operators?)/i,
  // (b) seasonal setting or label context -- lodge as environment sub-type under seasonal
  //     Covers: "seasonal lodge", "Seasonal/Lodge", "SEASONAL LODGE/OUTDOOR"
  /seasonal\s*[\/\s]\s*lodge/i,
  /[Ll]odge\s*\/\s*[Oo]utdoor/,
];

// ─── Set-comparison check targets ─────────────────────────────────────────
// Known files that contain a canonical category-lane array. If absent, emit
// note: and pass (order-independence). Add entries here as new sources of
// truth are added to contracts or ui packages.

const SET_CHECK_FILES = [
  "packages/contracts/src/enums.ts",
];

// ─── Walk helper ──────────────────────────────────────────────────────────

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (FILE_PATTERN.test(fullPath)) {
      // Skip self and the companion documentation file (contains intentional examples).
      if (fullPath.endsWith("tools/scripts/check-category-taxonomy.mjs")) continue;
      if (fullPath.endsWith("docs/ci/category-taxonomy-guardrail.md")) continue;
      files.push(fullPath);
    }
  }
  return files;
}

// ─── Main ─────────────────────────────────────────────────────────────────

let hasFailure = false;

// 1. Scan for top-level lodge violations.
for (const root of SCAN_ROOTS) {
  if (!existsSync(root)) {
    console.log(`note: scan root "${root}" is absent -- skipping (order-independent pass)`);
    continue;
  }
  for (const file of walk(root)) {
    const isNoteOnly = NOTE_ONLY_PATHS.has(file);
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rule of VIOLATION_PATTERNS) {
        if (!rule.pattern.test(line)) continue;
        // Exempt allowed usages (host-type noun, seasonal setting).
        if (ALLOW_PATTERNS.some((allow) => allow.test(line))) continue;
        const location = `${file}:${i + 1}`;
        if (isNoteOnly) {
          console.log(
            `note: ${rule.code}: ${rule.description} in ${location} -- fix in owning PR, not here`,
          );
        } else {
          console.error(`${rule.code}: ${rule.description} in ${location}`);
          hasFailure = true;
        }
      }
    }
  }
}

// 2. Set-comparison check: category-lane arrays must match CATEGORY_LANES exactly.
for (const filePath of SET_CHECK_FILES) {
  if (!existsSync(filePath)) {
    console.log(
      `note: set-check target "${filePath}" is absent -- skipping (order-independent pass)`,
    );
    continue;
  }
  const content = readFileSync(filePath, "utf8");
  // Match array literals whose string elements are drawn from known lane names (+ lodge).
  const laneWords = [...CATEGORY_LANES, "lodge"];
  const arrayRe = new RegExp(
    `\\[\\s*(?:["'](?:${laneWords.join("|")})["']\\s*,?\\s*){2,}\\]`,
    "g",
  );
  let match;
  while ((match = arrayRe.exec(content)) !== null) {
    const raw = match[0];
    const foundLanes = Array.from(raw.matchAll(/["']([^"']+)["']/g)).map((m) => m[1]);
    const foundSet = new Set(foundLanes);
    const extra = foundLanes.filter((c) => !CATEGORY_LANES_SET.has(c));
    const missing = CATEGORY_LANES.filter((c) => !foundSet.has(c));
    if (extra.length > 0 || missing.length > 0) {
      const lineNum = content.slice(0, match.index).split("\n").length;
      console.error(
        `G015: category-lane set in ${filePath}:${lineNum} diverges from locked set -- extra=[${extra.join(",")}] missing=[${missing.join(",")}]`,
      );
      hasFailure = true;
    }
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log("category-taxonomy: locked lane set OK");
