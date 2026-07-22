#!/usr/bin/env node

// Destructive, local-only upgrade rehearsal. It proves the real 071 -> current
// migration sequence against a fresh Supabase database, including
// representative rows that exist before the new host library column does.

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../..")
const supabaseConfig = readFileSync(join(repoRoot, "supabase", "config.toml"), "utf8")
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(supabaseConfig)?.[1]

if (!projectId) {
  console.error("housing-photo-upgrade: supabase project_id is missing")
  process.exit(2)
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

function runSqlFile(path) {
  run(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${projectId}`,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: readFileSync(path),
      stdio: ["pipe", "inherit", "inherit"],
    },
  )
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
runSqlFile(join(here, "sql", "prepare_housing_photo_upgrade.sql"))
run("supabase", ["migration", "up", "--local", "--yes"])
runSqlFile(join(here, "sql", "assert_housing_photo_upgrade.sql"))

console.log("housing-photo-upgrade: 071 -> current rehearsal passed")
