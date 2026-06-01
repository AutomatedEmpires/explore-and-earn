import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// G-BILL-1: contracts + stripe-seed must remain free of any Stripe SDK import.
const roots = ["packages/contracts/src", "packages/stripe-seed/src"];
const filePattern = /\.(ts|tsx|js|mjs|cjs)$/;
const sdkPatterns = [
  /from\s+["']stripe["']/,
  /require\(\s*["']stripe["']\s*\)/,
  /import\(\s*["']stripe["']\s*\)/
];

function walk(directory, files = []) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return files;
  }
  for (const entry of entries) {
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
    const content = readFileSync(file, "utf8");
    if (sdkPatterns.some((pattern) => pattern.test(content))) {
      hasFailure = true;
      console.error(`G-BILL-1: Stripe SDK import found in ${file} (contracts/seed must stay SDK-free)`);
    }
  }
}

if (hasFailure) process.exit(1);
console.log("no-stripe-sdk: contracts + stripe-seed are free of Stripe SDK imports");
