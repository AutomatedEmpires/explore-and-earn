import { readFileSync } from "node:fs";

// G-BILL-3: the stripe-seed live-mode hard stop must not be weakened or removed.
const file = "packages/stripe-seed/src/safety.ts";
let content;
try {
  content = readFileSync(file, "utf8");
} catch {
  console.error(`G-BILL-3: cannot read ${file}`);
  process.exit(1);
}

const required = ["evaluateSeedSafety", "LIVE MODE HARD STOP", "sk_live_", "live-write"];
const missing = required.filter((token) => !content.includes(token));

if (missing.length) {
  console.error("G-BILL-3: seed safety hard stop weakened or missing:");
  for (const token of missing) console.error(`  - missing: ${token}`);
  process.exit(1);
}

console.log("seed-safety: live-mode hard stop present in stripe-seed safety guard");
