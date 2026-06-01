import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// G5: only the refund-review service may call refunds.create(). Comments/contracts
// (which write "create (G5)" with a space) are not matched by the call pattern.
// This guard scans tools/ as well, so it must skip its OWN file: it necessarily
// names the refunds.create() sentinel in this header and would otherwise flag
// itself (false positive), since its path does not contain "refund-review".
// See SELF_FILE below.
const roots = ["apps", "packages", "supabase", "tools"];
const filePattern = /\.(ts|tsx|js|mjs|cjs)$/;
const callPattern = /\brefunds\.create\(/;
const SELF_FILE = "check-refund-isolation.mjs";

function walk(directory, files = []) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue;
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
    if (file.endsWith(SELF_FILE)) continue;
    const content = readFileSync(file, "utf8");
    if (callPattern.test(content) && !file.includes("refund-review")) {
      hasFailure = true;
      console.error(`G5: refunds.create() found outside services/refund-review in ${file}`);
    }
  }
}

if (hasFailure) process.exit(1);
console.log("refund-isolation: refunds.create() confined to the refund-review service");
