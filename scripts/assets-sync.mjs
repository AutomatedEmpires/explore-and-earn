#!/usr/bin/env node
/**
 * assets-sync.mjs — regenerate the canonical Explore&Earn asset manifest from
 * the live Cloudinary inventory. READ-ONLY: it never mutates Cloudinary.
 *
 * Why: three hand-written inventories disagree with reality (566 vs 364 vs
 * ~1009). This makes ONE generated manifest the source of truth (spec §9).
 *
 * Auth: CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET from .env.local (HTTP Basic).
 * Output: scripts/assets.manifest.v2.json  (new file — does not touch the
 *         legacy assets.manifest.json the app still reads).
 *
 * Run:  node scripts/assets-sync.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const CLOUD = "dwiwyt9vi"
const PREFIX = "explore-and-earn"

// --- load creds from .env.local (KEY=VALUE lines) ---------------------------
function loadEnv(file) {
  try {
    for (const line of readFileSync(join(ROOT, file), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch {}
}
loadEnv(".env.local")
loadEnv("apps/web/.env.local")

const KEY = process.env.CLOUDINARY_API_KEY
const SECRET = process.env.CLOUDINARY_API_SECRET
if (!KEY || !SECRET) {
  console.error("Missing CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in .env.local")
  process.exit(1)
}
const AUTH = "Basic " + Buffer.from(`${KEY}:${SECRET}`).toString("base64")
const API = `https://api.cloudinary.com/v1_1/${CLOUD}`

// --- pull every resource of a type, following pagination --------------------
async function listAll(resourceType) {
  const out = []
  let cursor = null
  do {
    const u = new URL(`${API}/resources/${resourceType}`)
    u.searchParams.set("max_results", "500")
    u.searchParams.set("tags", "true")
    u.searchParams.set("context", "true")
    u.searchParams.set("metadata", "true")
    if (cursor) u.searchParams.set("next_cursor", cursor)
    const res = await fetch(u, { headers: { Authorization: AUTH } })
    if (!res.ok) throw new Error(`${resourceType} ${res.status}: ${await res.text()}`)
    const json = await res.json()
    out.push(...(json.resources || []))
    cursor = json.next_cursor || null
  } while (cursor)
  return out
}

// --- classify an asset into a taxonomy class from its path (spec §4) --------
function classify(path) {
  const p = path.toLowerCase()
  if (p.includes("/icons/")) return "icons"
  if (p.includes("/illustrations/")) return "illustrations"
  if (p.includes("/elements/")) return "elements"
  if (p.includes("/brand/")) return "brand"
  if (p.includes("/marketing/")) return "marketing"
  if (p.includes("/encouragement")) return "photos/encouragement"
  if (p.includes("/photos/") || /\/(farm|maritime|remote|seasonal|mix)\//.test(p)) return "photos/curated"
  if (/\/(housing|meals|facilities)\//.test(p)) return "seed/listings"
  if (p.includes("profile photo") || p.includes("cover photo") || p.includes("dashboard photo")) return "seed/avatars"
  if (p.includes("/team")) return "seed/team"
  if (p.includes("/system/")) return "system"
  return "unclassified"
}

// --- main -------------------------------------------------------------------
const [images, raws, videos] = await Promise.all([
  listAll("image"), listAll("raw"), listAll("video"),
])
const all = [...images, ...raws, ...videos]

// keep only Explore&Earn assets (path-prefix OR venture tag)
const isEE = (r) => {
  const path = r.public_id || ""
  const folder = r.asset_folder || r.folder || ""
  return path.startsWith(PREFIX) || folder.startsWith(PREFIX) ||
         (r.tags || []).includes("venture:explore-and-earn")
}
const ee = all.filter(isEE)

const byClass = {}
const assets = ee.map((r) => {
  const path = r.public_id
  const cls = classify(r.asset_folder ? `${r.asset_folder}/${path}` : path)
  byClass[cls] = (byClass[cls] || 0) + 1
  return {
    public_id: path,
    asset_folder: r.asset_folder || r.folder || null,
    resource_type: r.resource_type,
    type: cls,
    format: r.format || null,
    bytes: r.bytes || 0,
    width: r.width || null,
    height: r.height || null,
    tags: r.tags || [],
    context: (r.context && r.context.custom) || null,
    created_at: r.created_at,
  }
})

const manifest = {
  generated: new Date().toISOString().slice(0, 10),
  generator: "assets-sync.mjs",
  cloud: CLOUD,
  prefix: PREFIX,
  totals: {
    explore_and_earn: assets.length,
    cloud_wide: all.length,
    by_class: byClass,
    by_resource_type: assets.reduce((a, x) => ((a[x.resource_type] = (a[x.resource_type] || 0) + 1), a), {}),
    bytes: assets.reduce((a, x) => a + x.bytes, 0),
  },
  assets,
}

writeFileSync(join(ROOT, "scripts/assets.manifest.v2.json"), JSON.stringify(manifest, null, 2))

// --- report -----------------------------------------------------------------
console.log(`\nExplore&Earn assets: ${assets.length}  (cloud-wide: ${all.length})`)
console.log(`Storage: ${(manifest.totals.bytes / 1e6).toFixed(1)} MB\n`)
console.log("By class:")
for (const [k, v] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`)
}
console.log("\nBy resource_type:", manifest.totals.by_resource_type)
console.log("\n→ wrote scripts/assets.manifest.v2.json")
