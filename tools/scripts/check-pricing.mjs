import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["apps", "packages", "supabase", "tools"];
const filePattern = /\.(ts|tsx|js|mjs|cjs|json|sql)$/;

// Build artifacts and dependency copies are not source code — scanning them
// produces false positives (compiled bundles + node_modules copies of the
// canonical pricing module). Never walk into these.
const ignoredDirs = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  "coverage",
  ".vercel",
]);

// The canonical home for host-plan pricing. This is the ONE place the literals
// are allowed to live — every other file must import from it. Whitelist it so
// the guard checks for *leaks* of these literals, not their definition.
const allowedFiles = [
  "tools/scripts/check-pricing.mjs",
  "packages/contracts/src/pricing.ts",
];

// Digit-boundary lookarounds keep e.g. `professional: 7500` (the add-on price)
// from matching the professional `500` rule via substring — the number must
// stand alone, not be a fragment of a longer figure.
const forbiddenPatterns = [
  { code: "G013", pattern: /starter[^\n]{0,40}(?<!\d)(250|2500)(?!\d)/i },
  { code: "G013", pattern: /professional[^\n]{0,40}(?<!\d)(500|5000)(?!\d)/i },
  { code: "G013", pattern: /enterprise[^\n]{0,40}(?<!\d)(750|7500)(?!\d)/i }
];

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirs.has(entry)) {
      continue;
    }

    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (filePattern.test(fullPath)) {
      if (allowedFiles.some((allowed) => fullPath.endsWith(allowed))) {
        continue;
      }

      files.push(fullPath);
    }
  }

  return files;
}

let hasFailure = false;

for (const root of roots) {
  for (const file of walk(root)) {
    const content = readFileSync(file, "utf8");

    for (const rule of forbiddenPatterns) {
      if (rule.pattern.test(content)) {
        hasFailure = true;
        console.error(`${rule.code}: forbidden pricing literal found in ${file}`);
      }
    }
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log("pricing-check: no forbidden host plan literals found");