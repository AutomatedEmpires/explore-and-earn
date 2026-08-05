#!/usr/bin/env node
// Always-on, DB-connected proof of migration 088's private interview scheduler.
// The SQL suite exercises real Postgres roles and rolls every fixture back.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runSqlFiles } from "./run-sql.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const schedulingActions = readFileSync(
  join(here, "..", "..", "apps", "web", "app", "actions", "scheduling.ts"),
  "utf8",
)

if (/\brecordEvent\b/.test(schedulingActions)) {
  throw new Error(
    "assert-interview-scheduling: scheduling actions must not duplicate the migration 088 transactional event trigger",
  )
}

runSqlFiles(
  [join(here, "sql", "assert_interview_scheduling.sql")],
  "assert-interview-scheduling",
)
