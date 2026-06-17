#!/usr/bin/env node
/**
 * assets-verify.mjs — drift-proofing guardrail for the Explore&Earn asset system.
 *
 * Offline integrity check over scripts/assets.manifest.v2.json (spec §9). Run in
 * CI or locally; exits non-zero on any ERROR so drift can't sneak back in.
 *
 *   node scripts/assets-verify.mjs
 *
 * Checks every Explore&Earn asset for:
 *   - the venture isolation tag           (ERROR if missing)
 *   - required ee_* metadata fields       (ERROR if missing)
 *   - per-type field sanity               (WARN on soft issues)
 */
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const VENTURE_TAG = "venture:explore-and-earn"
const REQUIRED = ["ee_type", "ee_source", "ee_status", "ee_license"]
const TYPES = new Set(["brand", "icon", "illustration", "element", "photo", "seed", "marketing", "system"])
const CATEGORIES = new Set(["farm", "maritime", "remote", "seasonal", "mix", "encouragement", "system", "na"])
const FAMILIES = new Set(["freehand", "plumpline", "duotone", "na"])

const manifest = JSON.parse(fs.readFileSync(join(ROOT, "scripts/assets.manifest.v2.json"), "utf8"))
const errors = []
const warns = []

for (const a of manifest.assets) {
  const id = a.public_id
  const ctx = a.context || {}
  if (!(a.tags || []).includes(VENTURE_TAG)) errors.push(`${id}: missing ${VENTURE_TAG}`)
  for (const f of REQUIRED) if (!ctx[f]) errors.push(`${id}: missing ${f}`)
  if (ctx.ee_type && !TYPES.has(ctx.ee_type)) errors.push(`${id}: bad ee_type=${ctx.ee_type}`)
  if (ctx.ee_category && !CATEGORIES.has(ctx.ee_category)) errors.push(`${id}: bad ee_category=${ctx.ee_category}`)
  if (ctx.ee_family && !FAMILIES.has(ctx.ee_family)) errors.push(`${id}: bad ee_family=${ctx.ee_family}`)
  // soft checks
  if (ctx.ee_type === "icon" && (!ctx.ee_family || ctx.ee_family === "na")) warns.push(`${id}: icon without a family`)
  if (ctx.ee_type === "photo" && (!ctx.ee_scope || ctx.ee_scope === "na")) warns.push(`${id}: photo without a scope`)
}

// freshness: manifest should be regenerated after asset changes
const age = manifest.generated ? `generated ${manifest.generated}` : "no generated date"

console.log(`Asset verify — ${manifest.assets.length} assets (${age})`)
console.log(`  errors: ${errors.length}   warnings: ${warns.length}`)
if (warns.length) { console.log("\nWARN (first 10):"); warns.slice(0, 10).forEach((w) => console.log("  " + w)) }
if (errors.length) {
  console.log("\nERROR (first 20):"); errors.slice(0, 20).forEach((e) => console.log("  " + e))
  console.log(`\n✗ ${errors.length} errors — run assets-sync.mjs then assets-backfill.mjs --apply`)
  process.exit(1)
}
console.log("\n✓ all assets isolated + schema-complete")
