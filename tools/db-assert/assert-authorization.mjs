#!/usr/bin/env node
// Lane A - DB-connected authorization coverage.
//
// Runs sql/assert_authorization_matrix.sql against a live database. The suite
// assumes the anon and authenticated roles with Clerk-shaped JWT claims and
// asserts, as refusals with an exact SQLSTATE and message, that:
//   * a seeker reaches no other seeker's profile or resume
//   * a host reaches no seeker at all through the client roles
//   * the internal host_profiles columns closed by 080 stay closed, to
//     non-owners and owners alike, and clerk_user_id / deleted_at stay closed
//     to anon
//   * a host cannot write another host's listing, nor any listing column
//     outside the 071 grant
//   * an application cannot be filed on another account's behalf
//   * the server-only tables are empty for anon and authenticated and refuse
//     their writes
//   * no SECURITY DEFINER function in `public` is executable by anon or PUBLIC,
//     apart from the two public read surfaces
//
// Every refusal is paired with a positive control, so the suite fails both when
// a guard is removed and when a guard is widened.
//
// Usage:
//   DATABASE_URL=postgres://... node ./assert-authorization.mjs
//   # or standard PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE variables
//
// Requires `psql` on PATH.

import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { runSqlFiles } from "./run-sql.mjs"

const here = dirname(fileURLToPath(import.meta.url))

runSqlFiles(
  [
    join(here, "sql", "assert_authorization_matrix.sql"),
    join(here, "sql", "assert_application_submission_authority.sql"),
    join(here, "sql", "assert_listing_media_ownership.sql"),
    join(here, "sql", "assert_resume_experience_identity.sql"),
  ],
  "assert-authorization",
)
