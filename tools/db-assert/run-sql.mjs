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
//
// THESE SUITES WRITE. THAT IS WHY THE TARGET HOST IS CHECKED.
//
// Each file inserts host profiles, seeker profiles, listings, applications and
// resume rows before it can assert anything -- an isolation refusal aimed at a
// row that does not exist passes for the wrong reason, so the fixtures are not
// optional. One suite also soft-deletes a seeker profile. Everything rolls
// back, but "it rolls back" is not a safety argument worth betting a production
// database on: the inserts fire triggers, consume sequences, take row locks,
// and sit in the same tables real people's data is in for as long as the suite
// runs. A rollback also means there is no evidence afterwards that it happened.
//
// Nothing here knew where it was pointed. DATABASE_URL is one paste away from
// being a production pooler string, and the run would have printed "PASSED" and
// exited zero. The target host is now resolved before psql is invoked and
// anything that is not loopback is refused. There is deliberately NO
// environment variable to switch this off: an override is precisely the thing
// that ends up set once in a CI secret and never looked at again.

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

/** Hostnames that can only mean "this machine". */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

/**
 * Where a psql connection made from this environment would actually go.
 * Mirrors libpq's precedence: an explicit connection string wins over the PG*
 * variables, and an absent host means a local UNIX socket.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ host: string, source: string }}
 */
export function resolveTargetHost(env) {
  const url = env.DATABASE_URL || env.SUPABASE_DB_URL
  if (url) {
    const source = env.DATABASE_URL ? "DATABASE_URL" : "SUPABASE_DB_URL"
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      // An unparseable connection string is not something to guess about.
      return { host: url, source }
    }
    return { host: decodeURIComponent(parsed.hostname), source }
  }
  return { host: env.PGHOST ?? "", source: "PGHOST" }
}

/**
 * True when a connection to this host cannot leave the machine.
 *
 * An empty host is libpq's local UNIX socket, and a host beginning with "/" or
 * "%2f" is an explicit socket directory. Everything else must be a loopback
 * literal, an address in 127.0.0.0/8, or a name in the reserved .localhost
 * domain. Note what is NOT accepted: a private-range address such as
 * 10.x or 192.168.x is another machine, and so is a hostname that merely
 * contains the word "local".
 *
 * @param {string} host
 */
export function isLocalHost(host) {
  const value = host.trim().toLowerCase()
  if (value === "") return true
  if (value.startsWith("/") || value.startsWith("%2f")) return true
  if (LOOPBACK_HOSTS.has(value)) return true
  if (value.endsWith(".localhost")) return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return true
  return false
}

/**
 * Refuse to run against anything but a local database. Returns the resolved
 * host on success and throws a readable message otherwise.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function assertLocalTarget(env) {
  const { host, source } = resolveTargetHost(env)
  if (!isLocalHost(host)) {
    throw new Error(
      `refusing to run against a non-local database: ${source} points at ` +
        `"${host}". These suites write fixture rows and soft-delete a seeker ` +
        `profile before rolling back, so they may only target a local ` +
        `database -- 127.0.0.0/8, ::1, localhost, a *.localhost name, or a ` +
        `UNIX socket path.`,
    )
  }
  return host
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

  try {
    assertLocalTarget(process.env)
  } catch (error) {
    console.error(`${label}: ${error instanceof Error ? error.message : error}`)
    process.exit(2)
  }

  const connectionArgs = dbUrl ? [dbUrl] : []
  for (const sqlFile of sqlFiles) {
    if (!existsSync(sqlFile)) {
      console.error(`${label}: missing SQL file at ${sqlFile}`)
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
      console.error(`${label}: failed to run psql - ${result.error.message}`)
      process.exit(2)
    }
    if (result.status !== 0) {
      process.exit(result.status === null ? 1 : result.status)
    }
  }
}
