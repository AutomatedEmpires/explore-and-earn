import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["apps", "packages", "supabase", "tools"];
const filePattern = /\.(ts|tsx|js|mjs|cjs|json|sql)$/;
const forbiddenPatterns = [
  { code: "G013", pattern: /starter[^\n]{0,40}(250|2500)/i },
  { code: "G013", pattern: /professional[^\n]{0,40}(500|5000)/i },
  { code: "G013", pattern: /enterprise[^\n]{0,40}(750|7500)/i }
];

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (filePattern.test(fullPath)) {
      if (fullPath.endsWith("tools/scripts/check-pricing.mjs")) {
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