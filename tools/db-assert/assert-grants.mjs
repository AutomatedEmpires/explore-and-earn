#!/usr/bin/env node
// Lane A - DB-connected RPC/storage/server-only-table security guardrail.
// Runs sql/assert_rpc_grants.sql against a live database and fails (non-zero
// exit) if any of the 8 SECURITY DEFINER functions are executable by anon /
// PUBLIC (or authenticated where forbidden), if the two storage buckets still
// allow anon enumeration, or if a server-only table is missing RLS / exposes a
// client policy.
//
// Row-level and column-level authorization coverage lives in its own runner,
// ./assert-authorization.mjs, so a failure there names the right thing.
//
// Usage:
//   DATABASE_URL=postgres://... node ./assert-grants.mjs
//   # or standard PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE variables
//
// Requires `psql` on PATH. No npm dependencies (keeps the lockfile untouched).

import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { runSqlFiles } from "./run-sql.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const sqlFiles = [
  join(here, "sql", "assert_rpc_grants.sql"),
  join(here, "sql", "assert_profile_onboarding.sql"),
  join(here, "sql", "assert_housing_photo_library.sql"),
  join(here, "sql", "assert_listing_coordinates.sql"),
  join(here, "sql", "assert_seeker_application_conversations.sql"),
  join(here, "sql", "assert_listing_host_status_transitions.sql"),
  join(here, "sql", "assert_listing_allowance_enforcement.sql"),
]

runSqlFiles(sqlFiles, "assert-grants")
