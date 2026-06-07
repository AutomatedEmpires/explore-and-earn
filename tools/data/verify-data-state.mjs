#!/usr/bin/env node
// tools/data/verify-data-state.mjs
//
// Read-only Explore&Earn data-state verification.
//
// Prints the live row count for every reference and business-critical table and
// classifies the database as "empty / partially seeded / populated". This script
// performs ONLY count queries (head:true) and never writes. It is safe to run
// against any environment, including production.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     pnpm --filter @explore-and-earn/web exec node ../../tools/data/verify-data-state.mjs
//
// Flags:
//   --expect-business-empty   exit 1 if ANY business-critical table has rows
//                             (use as a pre-seed prod safety gate)
//   --json                    emit a machine-readable JSON report only
//
// Requires "@supabase/supabase-js" (already a dependency of @explore-and-earn/web),
// so run it through the web workspace as shown above, or from any context where
// that package resolves.

import process from "node:process";
import { createClient } from "@supabase/supabase-js";

// Reference / configuration tables. These are platform-managed, not user data.
// `seededByMigration` rows are expected to be present on a healthy database;
// `founderConfigured` rows may legitimately be empty before launch.
const REFERENCE_TABLES = [
  { table: "lifecycle_transition", kind: "seededByMigration" },
  { table: "event_types", kind: "seededByMigration" },
  { table: "attestation_policy", kind: "founderConfigured" },
];

// Business-critical tables. These hold user-generated data and are expected to
// be empty on a fresh environment and to fill via product usage or seeding.
const BUSINESS_TABLES = [
  "users_profile_shadow",
  "seeker_profiles",
  "host_profiles",
  "host_attestations",
  "team_memberships",
  "seeker_resume_experiences",
  "seeker_resume_educations",
  "seeker_certifications",
  "media_buckets",
  "media_assets",
  "listings",
  "listing_relevance_extensions",
  "listing_media_overrides",
  "applications",
  "invites",
  "offers",
  "saved_listings",
  "host_seeker_dispositions",
  "events",
  "notifications",
  "notification_preferences",
  "conversations",
  "messages",
];

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const expectBusinessEmpty = args.has("--expect-business-empty");

function requireEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  console.error(`Missing required env var (one of): ${names.join(", ")}`);
  process.exit(2);
  return "";
}

const supabaseUrl = requireEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
const serviceRoleKey = requireEnv(["SUPABASE_SERVICE_ROLE_KEY"]);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function countRows(table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) return { table, count: null, error: error.message };
  return { table, count: count ?? 0, error: null };
}

async function main() {
  const reference = await Promise.all(
    REFERENCE_TABLES.map(async ({ table, kind }) => ({
      kind,
      ...(await countRows(table)),
    })),
  );
  const business = await Promise.all(BUSINESS_TABLES.map(countRows));

  const errored = [...reference, ...business].filter((row) => row.error);
  const populatedBusiness = business.filter((row) => (row.count ?? 0) > 0);
  const missingSeededReference = reference.filter(
    (row) => row.kind === "seededByMigration" && (row.count ?? 0) === 0,
  );

  const report = {
    supabaseUrl,
    checkedAt: new Date().toISOString(),
    reference,
    business,
    summary: {
      businessTablesPopulated: populatedBusiness.length,
      businessTablesTotal: business.length,
      seededReferenceMissing: missingSeededReference.map((r) => r.table),
      queryErrors: errored.map((r) => `${r.table}: ${r.error}`),
    },
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const fmt = (row) =>
      `  ${row.table.padEnd(28)} ${
        row.error ? `ERROR: ${row.error}` : String(row.count).padStart(8)
      }`;
    console.log(`Data-state verification @ ${report.checkedAt}`);
    console.log(`Target: ${supabaseUrl}`);
    console.log("\nReference / config tables:");
    reference.forEach((row) => console.log(fmt(row)));
    console.log("\nBusiness-critical tables:");
    business.forEach((row) => console.log(fmt(row)));
    console.log(
      `\nBusiness tables populated: ${populatedBusiness.length}/${business.length}`,
    );
    if (missingSeededReference.length > 0) {
      console.log(
        `WARNING: migration-seeded reference tables are empty: ${missingSeededReference
          .map((r) => r.table)
          .join(", ")}`,
      );
    }
  }

  if (errored.length > 0) {
    console.error(`\n${errored.length} table(s) could not be queried.`);
    process.exit(2);
  }
  if (missingSeededReference.length > 0) {
    console.error(
      "\nFAIL: expected migration-seeded reference data is missing. Run migrations.",
    );
    process.exit(1);
  }
  if (expectBusinessEmpty && populatedBusiness.length > 0) {
    console.error(
      `\nFAIL: --expect-business-empty set but ${populatedBusiness.length} business table(s) have rows.`,
    );
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
