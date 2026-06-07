import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url)
const migrationFiles = readdirSync(migrationsDir).filter((file) =>
  file.endsWith(".sql"),
)

const checks = [
  {
    code: "G004",
    pattern: /accepted_roles/i,
    message: "accepted_roles table or enum is not allowed in V1.",
  },
  {
    code: "G005",
    pattern: /search_documents/i,
    message: "search_documents table is not allowed in V1.",
  },
  {
    code: "G006",
    pattern: /(farm_listings|maritime_listings|remote_listings|seasonal_listings)/i,
    message: "category-specific listing tables are not allowed in V1.",
  },
]

let hasFailure = false
const fileContents = new Map()

for (const file of migrationFiles) {
  const content = readFileSync(join(migrationsDir.pathname, file), "utf8")
  fileContents.set(file, content)

  for (const check of checks) {
    if (check.pattern.test(content)) {
      hasFailure = true
      console.error(`${check.code}: ${file} ${check.message}`)
    }
  }
}

// ---------------------------------------------------------------------------
// G-SEC-RPC - Lane A static guardrail for SECURITY DEFINER RPC execute grants.
// The 8 SECURITY DEFINER functions in `public` must never be granted EXECUTE to
// the anon role in any migration, and the final 023 migration must explicitly
// revoke the default-privilege re-arm and the per-function grants. This catches
// regressions in source before they reach a database; the authoritative live
// check is the DB-connected assert-grants.mjs / sql/assert_rpc_grants.sql.
// ---------------------------------------------------------------------------
const LOCKED_FUNCTIONS = [
  "set_host_attestation",
  "get_clerk_user_id",
  "current_seeker_profile_ids",
  "current_host_profile_ids",
  "current_host_listing_ids",
  "current_conversation_ids",
  "enforce_listing_cover_asset",
  "enforce_listing_media_override",
]

for (const [file, content] of fileContents) {
  const lower = content.toLowerCase()
  for (const fn of LOCKED_FUNCTIONS) {
    const grantRe = new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${fn}\\s*\\([^)]*\\)\\s+to\\s+([^;]*);`,
      "g",
    )
    let m
    while ((m = grantRe.exec(lower)) !== null) {
      if (/\banon\b/.test(m[1])) {
        hasFailure = true
        console.error(
          `G-SEC-RPC: ${file} grants EXECUTE on ${fn} to anon (forbidden).`,
        )
      }
    }
  }
}

const securityMigration = migrationFiles.find((f) => /^023_.*\.sql$/.test(f))
if (!securityMigration) {
  hasFailure = true
  console.error(
    "G-SEC-RPC: expected the Lane A security migration 023_*.sql to be present.",
  )
} else {
  const sql = fileContents.get(securityMigration).toLowerCase()
  if (
    !/alter\s+default\s+privileges[\s\S]*revoke\s+execute\s+on\s+functions\s+from[\s\S]*anon/.test(
      sql,
    )
  ) {
    hasFailure = true
    console.error(
      `G-SEC-RPC: ${securityMigration} must revoke the anon/authenticated default-privilege grant on functions.`,
    )
  }
  for (const fn of LOCKED_FUNCTIONS) {
    const revokeRe = new RegExp(
      `revoke\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${fn}\\s*\\([^)]*\\)\\s+from\\s+([^;]*);`,
      "i",
    )
    const rm = sql.match(revokeRe)
    if (!rm) {
      hasFailure = true
      console.error(
        `G-SEC-RPC: ${securityMigration} must REVOKE EXECUTE on ${fn} from anon/authenticated/public.`,
      )
    } else if (!/anon/.test(rm[1]) || !/public/.test(rm[1])) {
      hasFailure = true
      console.error(
        `G-SEC-RPC: ${securityMigration} REVOKE on ${fn} must include anon and public.`,
      )
    }
  }
}

if (hasFailure) {
  process.exit(1)
}

console.log(`db-assert: checked ${migrationFiles.length} migration file(s)`)
