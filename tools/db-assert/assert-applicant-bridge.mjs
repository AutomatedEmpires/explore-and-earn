#!/usr/bin/env node
// Lane A - DB-connected proof of migration 084's host applicant bridge.
//
// Runs sql/assert_host_applicant_bridge.sql against a live database, as the
// anon and authenticated roles with Clerk-shaped JWT claims, and asserts that:
//   * each entitled arm works -- application, invite, existing conversation
//   * an unrelated seeker is invisible through every projection, not just the
//     profile one
//   * a second real host reaches neither the applicant's profile nor resume
//   * a seeker cannot use the bridge at all, not even on their own row
//   * anon may execute no bridge function, and no client role may execute the
//     entitlement predicate
//   * a soft-deleted seeker (079) disappears from every projection
//   * an over-sized batch RAISES rather than returning zero rows
//
// It is a separate step from the authorization matrix so that a failure here
// reads as "the applicant bridge stopped refusing" rather than as general
// authorization drift.
//
// Usage:
//   DATABASE_URL=postgres://... node ./assert-applicant-bridge.mjs
//   # or standard PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE variables
//
// Requires `psql` on PATH.

import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { runSqlFiles } from "./run-sql.mjs"

const here = dirname(fileURLToPath(import.meta.url))

runSqlFiles(
  [join(here, "sql", "assert_host_applicant_bridge.sql")],
  "assert-applicant-bridge",
)
