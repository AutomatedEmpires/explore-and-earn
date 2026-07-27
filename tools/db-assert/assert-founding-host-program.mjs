#!/usr/bin/env node
// DB-connected proof for the founding-host program (migration 087).
//
// Runs sql/assert_founding_host_program.sql against a live database and asserts,
// as refusals with an exact SQLSTATE and message, that:
//   * anon and authenticated read exactly capacity / claimed /
//     enrollment_deadline / status on public.founding_host_program and nothing
//     else on it
//   * neither role can write the program, read the claim ledger or the
//     discrepancy log, or execute either service-role function
//   * a seat is consumed once per identity however many times the claim runs,
//     refused beyond capacity, refused past the enrolment deadline, refused
//     while the program is draft or ended, and refused entirely when no program
//     row exists — which is the state production ships in
//   * the last seat flips the program to 'full'
//   * a paid checkout whose claim was refused is recorded once per Stripe
//     Checkout Session
//
// Kept as its own runner so a failure reads as "the scarcity claim stopped being
// true" rather than as general authorization drift.
//
// Usage:
//   DATABASE_URL=postgres://... node ./assert-founding-host-program.mjs
//   # or standard PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE variables
//
// Requires `psql` on PATH.

import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { runSqlFiles } from "./run-sql.mjs"

const here = dirname(fileURLToPath(import.meta.url))

runSqlFiles(
  [join(here, "sql", "assert_founding_host_program.sql")],
  "assert-founding-host-program",
)
