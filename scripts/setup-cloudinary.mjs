#!/usr/bin/env node
/**
 * Explore&Earn — Cloudinary Account Setup
 *
 * One-time (idempotent) script that establishes the asset management system:
 *   - 5 custom structured-metadata fields  (asset_type, category, scope, registry_key, source)
 *   - 5 named transformations              (ee-thumb, ee-card, ee-hero, ee-full, ee-og)
 *   - 3 upload presets                     (ee-photos, ee-icons, ee-illustrations)
 *
 * Run once: node scripts/setup-cloudinary.mjs
 * Safe to re-run — each call is idempotent (creates or skips).
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")

// ── Credentials ───────────────────────────────────────────────────────────────

function loadEnv(file) {
  if (!fs.existsSync(file)) return {}
  return fs.readFileSync(file, "utf-8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .reduce((a, l) => { const eq = l.indexOf("="); a[l.slice(0,eq).trim()] = l.slice(eq+1).trim(); return a }, {})
}

const env = loadEnv(path.join(ROOT, ".env.local"))
const CLOUD = "dwiwyt9vi"
const API_KEY = env.CLOUDINARY_API_KEY
const API_SECRET = env.CLOUDINARY_API_SECRET

if (!API_KEY || !API_SECRET) {
  console.error("❌  Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET in .env.local")
  process.exit(1)
}

const AUTH = "Basic " + Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64")
const BASE = `https://api.cloudinary.com/v1_1/${CLOUD}`

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok && res.status !== 409) { // 409 = already exists, treat as ok
    throw new Error(data.error?.message || JSON.stringify(data))
  }
  return { ok: res.ok, status: res.status, data }
}

let created = 0
let skipped = 0

function ok(label) { created++; console.log(`  ✓  ${label}`) }
function skip(label) { skipped++; console.log(`  –  ${label} (already exists)`) }
function fail(label, e) { console.log(`  ✗  ${label}: ${e.message}`) }

// ── 1. Structured Metadata Fields ────────────────────────────────────────────
//
// These appear as filterable columns in the Cloudinary console Media Library.
// Every asset uploaded via upload-assets.mjs has these fields set via `context`.
// Structured metadata (metadata_fields) unlocks richer UI + API filtering.

console.log("\n── Structured Metadata Fields ───────────────────────────────────")

const METADATA_FIELDS = [
  {
    external_id: "ee_asset_type",
    label: "Asset Type",
    type: "enum",
    mandatory: false,
    default_value: null,
    datasource: {
      values: [
        { value: "icon",         label: "Icon (registry)" },
        { value: "icon_library", label: "Icon (library)"  },
        { value: "photo",        label: "Photo"           },
        { value: "illustration", label: "Illustration"    },
        { value: "element",      label: "Element"         },
      ],
    },
  },
  {
    external_id: "ee_category",
    label: "Category",
    type: "enum",
    mandatory: false,
    default_value: null,
    datasource: {
      values: [
        { value: "farm",          label: "Farm / Orchard"    },
        { value: "maritime",      label: "Maritime / Fishery" },
        { value: "remote",        label: "Remote"            },
        { value: "seasonal",      label: "Seasonal"          },
        { value: "mix",           label: "Mix"               },
        { value: "encouragement", label: "Encouragement"     },
        { value: "system",        label: "System / Global"   },
      ],
    },
  },
  {
    external_id: "ee_scope",
    label: "Scope",
    type: "enum",
    mandatory: false,
    default_value: null,
    datasource: {
      values: [
        { value: "registry",    label: "Registry icon"    },
        { value: "library",     label: "Library icon"     },
        { value: "landscape",   label: "Landscape photo"  },
        { value: "decoration",  label: "Decoration"       },
      ],
    },
  },
  {
    external_id: "ee_registry_key",
    label: "Registry Key",
    type: "string",
    mandatory: false,
    default_value: null,
  },
  {
    external_id: "ee_source",
    label: "Source",
    type: "enum",
    mandatory: false,
    default_value: null,
    datasource: {
      values: [
        { value: "streamline_freehand", label: "Streamline Freehand" },
        { value: "streamline_milano",   label: "Streamline Milano"   },
        { value: "unsplash",            label: "Unsplash"            },
        { value: "generated",           label: "AI / Generated"      },
      ],
    },
  },
]

for (const field of METADATA_FIELDS) {
  try {
    const { status } = await api("POST", "/metadata_fields", field)
    if (status === 409) skip(field.label)
    else ok(field.label)
  } catch (e) {
    fail(field.label, e)
  }
}

// ── 2. Named Transformations ──────────────────────────────────────────────────
//
// Use in delivery URLs as `t_ee-card` etc. — no SDK or JS needed.
// Photos are 3:2 ratio (2400×1600 master). OG is 1200×630.
//
// Pattern: c_fill,g_auto = smart crop to subject. f_auto = AVIF/WebP/JPEG.
// q_auto:good = better fidelity than default q_auto for lifestyle photos.

console.log("\n── Named Transformations ────────────────────────────────────────")

const NAMED_TRANSFORMS = [
  // Photo sizes — all 3:2, auto-crop to subject
  { name: "ee-thumb",  tx: "c_fill,g_auto,h_213,w_320/f_auto/q_auto:good"  }, // 320×213  card row
  { name: "ee-card",   tx: "c_fill,g_auto,h_427,w_640/f_auto/q_auto:good"  }, // 640×427  discovery card
  { name: "ee-hero",   tx: "c_fill,g_auto,h_854,w_1280/f_auto/q_auto:good" }, // 1280×854 listing hero
  { name: "ee-full",   tx: "c_fill,g_auto,h_1280,w_1920/f_auto/q_auto:best"}, // 1920×1280 full-bleed
  // Open Graph / social sharing
  { name: "ee-og",     tx: "c_fill,g_auto,h_630,w_1200/f_auto/q_auto:good" }, // 1200×630 OG image
  // Square crops for avatars / map pins
  { name: "ee-sq-sm",  tx: "c_fill,g_auto,h_96,w_96/r_max/f_auto/q_auto"  }, // 96×96   avatar sm
  { name: "ee-sq-md",  tx: "c_fill,g_auto,h_192,w_192/r_max/f_auto/q_auto" }, // 192×192  avatar md
]

for (const { name, tx } of NAMED_TRANSFORMS) {
  try {
    const { status } = await api("POST", `/transformations/${name}`, {
      transformation: tx,
      allowed_for_strict: true,
    })
    if (status === 409) skip(`t_${name}`)
    else ok(`t_${name}  →  ${tx}`)
  } catch (e) {
    // Already exists often comes as 409
    if (e.message?.includes("already exists")) skip(`t_${name}`)
    else fail(`t_${name}`, e)
  }
}

// ── 3. Upload Presets ─────────────────────────────────────────────────────────
//
// Presets capture the right defaults so future uploads are one-liner.
// Run: node scripts/upload-assets.mjs (it references these preset names)

console.log("\n── Upload Presets ───────────────────────────────────────────────")

const PRESETS = [
  {
    name: "ee-photos",
    unsigned: false,
    tags: "photo,curated",
    resource_type: "image",
    quality: "auto:good",
    format: "auto",
    overwrite: true,
    invalidate: true,
  },
  {
    name: "ee-icons",
    unsigned: false,
    tags: "icon",
    resource_type: "raw",
    overwrite: true,
    invalidate: true,
  },
  {
    name: "ee-illustrations",
    unsigned: false,
    tags: "illustration",
    resource_type: "raw",
    overwrite: true,
    invalidate: true,
  },
]

for (const preset of PRESETS) {
  try {
    const { status } = await api("POST", "/upload_presets", preset)
    if (status === 409) skip(`preset:${preset.name}`)
    else ok(`preset:${preset.name}`)
  } catch (e) {
    if (e.message?.includes("already exists")) skip(`preset:${preset.name}`)
    else fail(`preset:${preset.name}`, e)
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`
────────────────────────────────────────────
 ✓  ${created} created
 –  ${skipped} already existed (skipped)
────────────────────────────────────────────

Transformations available in delivery URLs:
  t_ee-thumb  → 320×213  (card row)
  t_ee-card   → 640×427  (discovery card)
  t_ee-hero   → 1280×854 (listing hero)
  t_ee-full   → 1920×1280 (full-bleed)
  t_ee-og     → 1200×630 (Open Graph)
  t_ee-sq-sm  → 96×96 round (avatar sm)
  t_ee-sq-md  → 192×192 round (avatar md)

Example photo delivery URL:
  https://res.cloudinary.com/dwiwyt9vi/image/upload/t_ee-card/explore-and-earn/photos/farm/landscape/{slug}

`)
