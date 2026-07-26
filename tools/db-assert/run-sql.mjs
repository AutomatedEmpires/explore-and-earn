// Shared psql driver for the DB-connected assertion suites.
//
// Every suite in sql/ is a single transaction that ends in ROLLBACK and reports
// a failure by RAISE, so "did it pass" is exactly "did psql exit zero". This
// module owns the connection plumbing so the individual runners stay a list of
// files and nothing else.
//
// Usage:
//   DATABASE_URL=postgres://... node ./assert-authorization.mjs
//   # or standard PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE variables
//
// Requires `psql` on PATH. No npm dependencies (keeps the lockfile untouched).

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

/**
 * A libpq key/value conninfo assembled from the standard PG* variables, for the
 * case where the caller supplied those instead of a URL.
 * @returns {string}
 */
function libpqConninfo() {
  const parts = [
    ["host", process.env.PGHOST],
    ["port", process.env.PGPORT],
    ["user", process.env.PGUSER],
    ["password", process.env.PGPASSWORD],
    ["dbname", process.env.PGDATABASE],
  ]
  return parts
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}='${String(value).replace(/'/g, "\\'")}'`)
    .join(" ")
}

/**
 * Run each SQL file in order, exiting the process on the first failure.
 * @param {string[]} sqlFiles absolute paths
 * @param {string} label prefix for diagnostics
 */
export function runSqlFiles(sqlFiles, label) {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  const hasLibpqEnvironment = Boolean(process.env.PGHOST && process.env.PGUSER)
  if (!dbUrl && !hasLibpqEnvironment) {
    console.error(
      `${label}: set DATABASE_URL, SUPABASE_DB_URL, or standard libpq PG* variables.`,
    )
    process.exit(2)
  }

  const connectionArgs = dbUrl ? [dbUrl] : []
  for (const sqlFile of sqlFiles) {
    if (!existsSync(sqlFile)) {
      console.error(`${label}: missing SQL file at ${sqlFile}`)
      process.exit(2)
    }
  }

  // A suite that has to prove something about CONCURRENCY needs a second
  // session, which means dblink, which means a connection string it can hand to
  // dblink_connect. `dbname=current_database()` is not enough: the local
  // `postgres` role is not a superuser, and a non-superuser dblink connection
  // must carry a password. Passed to every suite as :conninfo; suites that do
  // not open a second session simply never reference it.
  const conninfo = dbUrl || libpqConninfo()

  for (const sqlFile of sqlFiles) {
    const result = spawnSync(
      "psql",
      [
        ...connectionArgs,
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        `conninfo=${conninfo}`,
        "-f",
        sqlFile,
      ],
      { stdio: "inherit", encoding: "utf8" },
    )

    if (result.error) {
      console.error(`${label}: failed to run psql - ${result.error.message}`)
      process.exit(2)
    }
    if (result.status !== 0) {
      process.exit(result.status === null ? 1 : result.status)
    }
  }
}
