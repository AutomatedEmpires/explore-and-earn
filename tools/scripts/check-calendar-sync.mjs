import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["apps", "packages"];
const filePattern = /\.(ts|tsx|js|mjs|cjs)$/;
const forbiddenPatterns = [
  /google calendar/i,
  /microsoft graph/i,
  /teams calendar/i,
  /calendar sync/i
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
      files.push(fullPath);
    }
  }

  return files;
}

let hasFailure = false;

for (const root of roots) {
  for (const file of walk(root)) {
    const content = readFileSync(file, "utf8");

    if (forbiddenPatterns.some((pattern) => pattern.test(content))) {
      hasFailure = true;
      console.error(`G014: forbidden external calendar sync reference found in ${file}`);
    }
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log("calendar-check: no forbidden external calendar sync references found");