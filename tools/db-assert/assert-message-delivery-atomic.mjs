#!/usr/bin/env node
// Connected proof for migration 090's atomic message + event boundary.
//
// Runs as real anon/authenticated/service_role identities against a database
// rebuilt from migrations. Static tests cannot prove that a trigger failure
// rolls its message back or that the Clerk JWT resolves the correct sender.

import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { runSqlFiles } from "./run-sql.mjs"

const here = dirname(fileURLToPath(import.meta.url))

runSqlFiles(
  [join(here, "sql", "assert_message_delivery_atomic.sql")],
  "assert-message-delivery-atomic",
)
