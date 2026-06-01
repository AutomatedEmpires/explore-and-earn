import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// G-BILL-2: no committed Stripe secrets. Patterns require a key BODY after the
// prefix, so prefix mentions in code/docs (e.g. "sk_live_") are intentionally ignored.
const roots = ["apps", "packages", "supabase", "tools", "docs"];
const filePattern = /\.(ts|tsx|js|mjs|cjs|json|sql|md|env|yml|yaml)$/;
const skipDirs = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo"]);
const secretPatterns = [
  /sk_live_[0-9a-zA-Z]{16,}/,
  /sk_test_[0-9a-zA-Z]{16,}/,
  /rk_live_[0-9a-zA-Z]{16,}/,
  /whsec_[0-9a-zA-Z]{16,}/
];

function walk(directory, files = []) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (skipDirs.has(entry)) continue;
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (filePattern.test(fullPath)) files.push(fullPath);
  }
  return files;
}

let hasFailure = false;
for (const root of roots) {
  for (const file of walk(root)) {
    if (file.endsWith("check-no-secrets.mjs")) continue;
    const content = readFileSync(file, "utf8");
    if (secretPatterns.some((pattern) => pattern.test(content))) {
      hasFailure = true;
      console.error(`G-BILL-2: possible committed secret in ${file}`);
    }
  }
}

if (hasFailure) process.exit(1);
console.log("no-secrets: no committed Stripe secret keys detected");
