import { readFileSync } from "node:fs";
import { join } from "node:path";

const matchingFile = join(process.cwd(), "apps/web/services/matching/index.ts");
const content = readFileSync(matchingFile, "utf8");

const forbiddenImports = ["stripe", "billing", "boost", "featured", "entitlements"];

if (forbiddenImports.some((value) => content.includes(value))) {
  console.error("G002: matching service placeholder must not reference monetization modules");
  process.exit(1);
}

console.log("matching-check: matching scaffold is isolated from monetization modules");