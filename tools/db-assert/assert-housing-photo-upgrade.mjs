#!/usr/bin/env node

// Destructive, local-only upgrade rehearsal. It proves the real 071 -> 072
// sequence against a fresh Supabase database, including representative rows
// that exist before the new host library column does.

import { spawnSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../..")
const localDbEnv = {
  ...process.env,
  PGHOST: "127.0.0.1",
  PGPORT: "54322",
  PGUSER: "postgres",
  PGPASSWORD: "postgres",
  PGDATABASE: "postgres",
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8",
    ...options,
  })
  if (result.error) {
    console.error(`housing-photo-upgrade: ${command} failed - ${result.error.message}`)
    process.exit(2)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run("supabase", [
  "db",
  "reset",
  "--local",
  "--version",
  "071",
  "--no-seed",
  "--yes",
])
run("psql", [
  "-v",
  "ON_ERROR_STOP=1",
  "-f",
  join(here, "sql", "prepare_housing_photo_upgrade.sql"),
], { env: localDbEnv })
run("supabase", ["migration", "up", "--local", "--yes"])
run("psql", [
  "-v",
  "ON_ERROR_STOP=1",
  "-f",
  join(here, "sql", "assert_housing_photo_upgrade.sql"),
], { env: localDbEnv })

console.log("housing-photo-upgrade: 071 -> 072 rehearsal passed")
