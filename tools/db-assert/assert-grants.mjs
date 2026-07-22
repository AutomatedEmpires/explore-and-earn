#!/usr/bin/env node
// Lane A - DB-connected RPC/storage/server-only-table security guardrail.
// Runs sql/assert_rpc_grants.sql against a live database and fails (non-zero
// exit) if any of the 8 SECURITY DEFINER functions are executable by anon /
// PUBLIC (or authenticated where forbidden), if the two storage buckets still
// allow anon enumeration, or if a server-only table is missing RLS / exposes a
// client policy.
//
// Usage:
//   DATABASE_URL=postgres://... node ./assert-grants.mjs
//   # or standard PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE variables
//
// Requires `psql` on PATH. No npm dependencies (keeps the lockfile untouched).

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { existsSync } from "node:fs"

const here = dirname(fileURLToPath(import.meta.url))
const sqlFiles = [
  join(here, "sql", "assert_rpc_grants.sql"),
  join(here, "sql", "assert_profile_onboarding.sql"),
  join(here, "sql", "assert_housing_photo_library.sql"),
  join(here, "sql", "assert_listing_coordinates.sql"),
]

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
const hasLibpqEnvironment = Boolean(process.env.PGHOST && process.env.PGUSER)
if (!dbUrl && !hasLibpqEnvironment) {
  console.error(
    "assert-grants: set DATABASE_URL, SUPABASE_DB_URL, or standard libpq PG* variables.",
  )
  process.exit(2)
}
const connectionArgs = dbUrl ? [dbUrl] : []
for (const sqlFile of sqlFiles) {
  if (!existsSync(sqlFile)) {
    console.error(`assert-grants: missing SQL file at ${sqlFile}`)
    process.exit(2)
  }
}

for (const sqlFile of sqlFiles) {
  const result = spawnSync(
    "psql",
    [...connectionArgs, "-v", "ON_ERROR_STOP=1", "-f", sqlFile],
    { stdio: "inherit", encoding: "utf8" },
  )

  if (result.error) {
    console.error(`assert-grants: failed to run psql - ${result.error.message}`)
    process.exit(2)
  }
  if (result.status !== 0) process.exit(result.status === null ? 1 : result.status)
}
