import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
const migrationFiles = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));

const checks = [
  {
    code: "G004",
    pattern: /accepted_roles/i,
    message: "accepted_roles table or enum is not allowed in V1."
  },
  {
    code: "G005",
    pattern: /search_documents/i,
    message: "search_documents table is not allowed in V1."
  },
  {
    code: "G006",
    pattern: /(farm_listings|maritime_listings|remote_listings|seasonal_listings)/i,
    message: "category-specific listing tables are not allowed in V1."
  }
];

let hasFailure = false;

for (const file of migrationFiles) {
  const content = readFileSync(join(migrationsDir.pathname, file), "utf8");

  for (const check of checks) {
    if (check.pattern.test(content)) {
      hasFailure = true;
      console.error(`${check.code}: ${file} ${check.message}`);
    }
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log(`db-assert: checked ${migrationFiles.length} migration file(s)`);