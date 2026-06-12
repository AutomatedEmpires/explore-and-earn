#!/usr/bin/env node
/**
 * Explore&Earn — Cloudinary Asset Upload
 *
 * Uploads all curated assets to Cloudinary:
 *   - 47 registry icons  → explore-and-earn/icons/{domain}/{name}  (raw SVG)
 *   - 129 icon library   → explore-and-earn/icons-library/{slug}   (raw SVG)
 *   - 57 illustrations   → explore-and-earn/illustrations/{slug}   (raw SVG)
 *   - 20 elements        → explore-and-earn/elements/{slug}        (raw SVG)
 *   - ~313 photos        → explore-and-earn/photos/{cat}/landscape/{slug} (image)
 *
 * Run: node scripts/upload-assets.mjs
 * Re-run safely: overwrite=true makes it idempotent.
 * Output: scripts/assets.manifest.json
 */

import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")

// ── Credentials ──────────────────────────────────────────────────────────────

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return fs.readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .reduce((acc, l) => {
      const eq = l.indexOf("=")
      const k = l.slice(0, eq).trim()
      const v = l.slice(eq + 1).trim()
      acc[k] = v
      return acc
    }, {})
}

const env = loadEnv(path.join(ROOT, ".env.local"))
const CLOUD = "dwiwyt9vi"
const API_KEY = env.CLOUDINARY_API_KEY
const API_SECRET = env.CLOUDINARY_API_SECRET

if (!API_KEY || !API_SECRET) {
  console.error("❌  Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET in .env.local")
  process.exit(1)
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const WIN = "/mnt/c/Users/autom/projects/automated_empires/explore&earn"
const PHOTOS_DIR   = `${WIN}/photos`
const ALL_ICONS    = `${WIN}/icons/icons/all-icons`
const ILLUSTRATIONS= `${WIN}/icons/illustrations/all_illustrations`
const ELEMENTS     = `${WIN}/icons/elements/all-elements`

// ── Cloudinary helpers ────────────────────────────────────────────────────────

function sign(params) {
  const str =
    Object.keys(params)
      .sort()
      .filter((k) => !["file", "api_key"].includes(k))
      .map((k) => `${k}=${Array.isArray(params[k]) ? params[k].join(",") : params[k]}`)
      .join("&") + API_SECRET
  return crypto.createHash("sha1").update(str).digest("hex")
}

async function cloudinaryUpload(filePath, publicId, resourceType = "image", opts = {}) {
  const buf = fs.readFileSync(filePath)
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mime =
    resourceType === "raw"
      ? "image/svg+xml"
      : ext === "png"
      ? "image/png"
      : "image/jpeg"
  const file = `data:${mime};base64,${buf.toString("base64")}`

  const timestamp = Math.floor(Date.now() / 1000)
  const params = {
    public_id: publicId,
    timestamp,
    overwrite: true,
    ...opts,
  }
  if (params.tags && Array.isArray(params.tags)) {
    params.tags = params.tags.join(",")
  }
  params.signature = sign(params)

  const form = new FormData()
  form.append("file", file)
  form.append("api_key", API_KEY)
  for (const [k, v] of Object.entries(params)) {
    form.append(k, String(v))
  }

  const url = `https://api.cloudinary.com/v1_1/${CLOUD}/${resourceType}/upload`
  const res = await fetch(url, { method: "POST", body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data))
  return data
}

// ── SVG hygiene ───────────────────────────────────────────────────────────────

function hygieneSvg(filePath) {
  let svg = fs.readFileSync(filePath, "utf-8")

  // Replace black fills/strokes with currentColor
  svg = svg
    .replace(/fill="#000000"/gi, 'fill="currentColor"')
    .replace(/fill="#000"/gi, 'fill="currentColor"')
    .replace(/fill="black"/gi, 'fill="currentColor"')
    .replace(/stroke="#000000"/gi, 'stroke="currentColor"')
    .replace(/stroke="#000"/gi, 'stroke="currentColor"')
    .replace(/stroke="black"/gi, 'stroke="currentColor"')

  // Strip height/width from root <svg> tag only
  svg = svg.replace(/<svg([^>]*)>/, (match, attrs) => {
    const cleaned = attrs
      .replace(/\s*height="[^"]*"/g, "")
      .replace(/\s*width="[^"]*"/g, "")
    return `<svg${cleaned}>`
  })

  // Remove <desc> blocks
  svg = svg.replace(/<desc>[\s\S]*?<\/desc>/g, "")

  return svg
}

function writeTmp(content, ext = "svg") {
  const tmp = `/tmp/ee-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  fs.writeFileSync(tmp, content, "utf-8")
  return tmp
}

// ── Batch runner ──────────────────────────────────────────────────────────────

async function runBatch(items, fn, concurrency = 4) {
  const results = []
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)
    const settled = await Promise.allSettled(chunk.map(fn))
    results.push(...settled)
  }
  return results
}

// ── Slug helpers ──────────────────────────────────────────────────────────────

function photoSlug(filename) {
  return filename
    .replace(/\.jpe?g$/i, "")
    .replace(/\.png$/i, "")
    .replace(/-unsplash$/i, "")
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .slice(0, 80)
}

function svgSlug(filename) {
  return filename
    .replace(/--Streamline-[^.]+\.svg$/i, "")
    .replace(/\.svg$/i, "")
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
}

// ── Icon registry map ─────────────────────────────────────────────────────────
// key → filename in all-icons folder

const REGISTRY_MAP = {
  "category.farm":      "Plant-Decoration-Cactus-Desert-Greenhouse--Streamline-Freehand.svg",
  "category.maritime":  "Various-Building-Anchor--Streamline-Freehand.svg",
  "category.remote":    "Laptop-Computer--Streamline-Freehand.svg",
  "category.seasonal":  "Season-Spring--Streamline-Freehand.svg",
  "category.mix":       "Compass--Streamline-Freehand.svg",

  "benefit.housing":    "Home-2--Streamline-Freehand.svg",
  "benefit.meals":      "Fast-Food-Double-Burger--Streamline-Freehand.svg",
  "benefit.pay":        "Currency-Dollar-Symbol--Streamline-Freehand.svg",
  "benefit.transport":  "Truck-Van-3--Streamline-Freehand.svg",
  "benefit.wifi":       "Wifi-On--Streamline-Freehand.svg",

  // all 5 category pins share one SVG (tinted via CSS color)
  "mappin.farm":        "Maps-Pin-4--Streamline-Freehand.svg",
  "mappin.maritime":    "Maps-Pin-4--Streamline-Freehand.svg",
  "mappin.remote":      "Maps-Pin-4--Streamline-Freehand.svg",
  "mappin.seasonal":    "Maps-Pin-4--Streamline-Freehand.svg",
  "mappin.mix":         "Maps-Pin-4--Streamline-Freehand.svg",
  "mappin.cluster":     "Layers-Stacked-1--Streamline-Freehand.svg",

  "trust.verified_host":    "Form-Validation-Check-Badge--Streamline-Freehand.svg",
  "trust.founding_host":    "Security-Shield-Check--Streamline-Freehand.svg",
  "trust.featured_employer":"Rating-Number-One-Badge--Streamline-Freehand.svg",

  "status.open":            "Form-Validation-Check-Circle--Streamline-Freehand.svg",
  "status.partially_filled":"Time-Hourglass-Triangle--Streamline-Freehand.svg",
  "status.filled":          "Form-Validation-Check-Square-1--Streamline-Freehand.svg",
  "status.boosted":         "Connect-Flash--Streamline-Freehand.svg",
  "status.match":           "Match-Fire--Streamline-Freehand.svg",

  "action.apply":    "Form-Edition-Clipboard--Streamline-Freehand.svg",
  "action.save":     "Love-It-Download--Streamline-Freehand.svg",
  "action.share":    "Share-Megaphone-1--Streamline-Freehand.svg",
  "action.report":   "Flag-Plain-Wave-2--Streamline-Freehand.svg",
  "action.message":  "Chat-Meeting-Application-Facebook-Messenger--Streamline-Freehand.svg",
  "action.filter":   "Filter-1--Streamline-Freehand.svg",
  "action.sort":     "Lists-Bullets--Streamline-Freehand.svg",
  "action.back":     "Keyboard-Arrow-Left-1--Streamline-Freehand.svg",
  "action.forward":  "Keyboard-Arrow-Right-1--Streamline-Freehand.svg",
  "action.close":    "Keyboard-Arrow-Down-1--Streamline-Freehand.svg",
  "action.more":     "Menu-Navigation-Horizontal--Streamline-Freehand.svg",

  "nav.seek":      "Search-Magnifier--Streamline-Freehand.svg",
  "nav.swipe":     "Synchronize-Arrows-1--Streamline-Freehand.svg",
  "nav.map":       "Gps-Location-Rectangle--Streamline-Freehand.svg",
  "nav.saved":     "Tags-1--Streamline-Freehand.svg",
  "nav.messages":  "Social-Profile-Bubble--Streamline-Freehand.svg",
  "nav.dashboard": "Grid-Artboard--Streamline-Freehand.svg",
  "nav.profile":   "Single-Neutral--Streamline-Freehand.svg",
  "nav.admin":     "Settings-Cog--Streamline-Freehand.svg",

  "analytics.meter":  "Car-Dashboard-Speed--Streamline-Freehand.svg",
  "analytics.funnel": "View-Binocular--Streamline-Freehand.svg",
  "analytics.trend":  "Performance-Graph-Increase--Streamline-Freehand.svg",
  "analytics.donut":  "Gaming-100-Bubble--Streamline-Freehand.svg",
  "analytics.source": "Website-Development-Browser-Page-Account--Streamline-Freehand.svg",

  "system.info":    "Alerts-Information-Circle--Streamline-Freehand.svg",
  "system.success": "Form-Validation-Check-1--Streamline-Freehand.svg",
  "system.warning": "Road-Sign-Warning--Streamline-Freehand.svg",
  "system.error":   "Server-Error-404-Not-Found--Streamline-Freehand.svg",
  "system.lock":    "Lock-Square--Streamline-Freehand.svg",
  "system.loading": "Synchronize-Arrows-1--Streamline-Freehand.svg",
}

// ── Main ──────────────────────────────────────────────────────────────────────

const manifest = {
  generated: new Date().toISOString().split("T")[0],
  cloud: CLOUD,
  icons: {},
  photos: {},
  illustrations: {},
  elements: {},
  errors: [],
}

let uploaded = 0
let failed = 0

function ok(label) {
  uploaded++
  process.stdout.write(`  ✓  ${label}\n`)
}

function err(label, e) {
  failed++
  const msg = e?.message || String(e)
  process.stdout.write(`  ✗  ${label}: ${msg}\n`)
  manifest.errors.push({ label, error: msg })
}

// ── 1. Registry icons ─────────────────────────────────────────────────────────

console.log("\n── Registry icons (47) ──────────────────────────────────────────")

const tmpFiles = []

const iconItems = Object.entries(REGISTRY_MAP).map(([key, filename]) => ({
  key,
  srcPath: path.join(ALL_ICONS, filename),
  publicId: `explore-and-earn/icons/${key.replace(".", "/")}`,
}))

for (const item of iconItems) {
  const { key, srcPath, publicId } = item
  if (!fs.existsSync(srcPath)) {
    err(key, new Error(`SVG not found: ${path.basename(srcPath)}`))
    continue
  }
  try {
    const cleaned = hygieneSvg(srcPath)
    const tmp = writeTmp(cleaned)
    tmpFiles.push(tmp)
    await cloudinaryUpload(tmp, publicId, "raw", {
      tags: ["icon", "registry", key.split(".")[0]],
      context: `registry_key=${key}`,
    })
    manifest.icons[key] = {
      status: "uploaded",
      cloudinaryId: publicId,
      url: `https://res.cloudinary.com/${CLOUD}/raw/upload/${publicId}`,
      source: path.basename(srcPath),
    }
    ok(`${key}`)
  } catch (e) {
    err(key, e)
    manifest.icons[key] = { status: "failed", error: e.message }
  }
}

// ── 2. Icon library (all 129 SVGs) ───────────────────────────────────────────

console.log("\n── Icon library (all-icons) ─────────────────────────────────────")

const allIconFiles = fs.readdirSync(ALL_ICONS).filter((f) => f.endsWith(".svg"))
console.log(`   ${allIconFiles.length} SVGs found`)

await runBatch(allIconFiles, async (filename) => {
  const slug = svgSlug(filename)
  const publicId = `explore-and-earn/icons-library/${slug}`
  const srcPath = path.join(ALL_ICONS, filename)
  try {
    const cleaned = hygieneSvg(srcPath)
    const tmp = writeTmp(cleaned)
    tmpFiles.push(tmp)
    await cloudinaryUpload(tmp, publicId, "raw", {
      tags: ["icon", "library"],
    })
    ok(`library/${slug}`)
  } catch (e) {
    err(`library/${slug}`, e)
  }
}, 5)

// ── 3. Illustrations ──────────────────────────────────────────────────────────

console.log("\n── Illustrations ────────────────────────────────────────────────")

const illFiles = fs.readdirSync(ILLUSTRATIONS).filter((f) => f.endsWith(".svg"))
console.log(`   ${illFiles.length} SVGs found`)

await runBatch(illFiles, async (filename) => {
  const slug = svgSlug(filename)
  const publicId = `explore-and-earn/illustrations/${slug}`
  try {
    await cloudinaryUpload(path.join(ILLUSTRATIONS, filename), publicId, "raw", {
      tags: ["illustration"],
    })
    manifest.illustrations[slug] = { cloudinaryId: publicId }
    ok(`illustration/${slug}`)
  } catch (e) {
    err(`illustration/${slug}`, e)
    manifest.illustrations[slug] = { status: "failed" }
  }
}, 5)

// ── 4. Elements ───────────────────────────────────────────────────────────────

console.log("\n── Elements ─────────────────────────────────────────────────────")

const elemFiles = fs.readdirSync(ELEMENTS).filter((f) => f.endsWith(".svg"))
console.log(`   ${elemFiles.length} SVGs found`)

await runBatch(elemFiles, async (filename) => {
  const slug = svgSlug(filename)
  const publicId = `explore-and-earn/elements/${slug}`
  try {
    await cloudinaryUpload(path.join(ELEMENTS, filename), publicId, "raw", {
      tags: ["element"],
    })
    manifest.elements[slug] = { cloudinaryId: publicId }
    ok(`element/${slug}`)
  } catch (e) {
    err(`element/${slug}`, e)
    manifest.elements[slug] = { status: "failed" }
  }
}, 5)

// ── 5. Photos ─────────────────────────────────────────────────────────────────

const PHOTO_CATS = [
  { dir: "farm photos",       category: "farm",         cloudFolder: "farm/landscape" },
  { dir: "maritime photos",   category: "maritime",     cloudFolder: "maritime/landscape" },
  { dir: "remote photos",     category: "remote",       cloudFolder: "remote/landscape" },
  { dir: "seasonal photos",   category: "seasonal",     cloudFolder: "seasonal/landscape" },
  { dir: "encouragement",     category: "encouragement",cloudFolder: "encouragement" },
]

for (const { dir, category, cloudFolder } of PHOTO_CATS) {
  const dirPath = path.join(PHOTOS_DIR, dir)
  if (!fs.existsSync(dirPath)) {
    console.log(`\n── Photos: ${category} — SKIPPED (folder not found)`)
    continue
  }
  const files = fs.readdirSync(dirPath).filter((f) => /\.(jpe?g|png)$/i.test(f))
  console.log(`\n── Photos: ${category} (${files.length}) ──────────────────────────────`)
  if (!manifest.photos[category]) manifest.photos[category] = {}

  await runBatch(files, async (filename) => {
    const slug = photoSlug(filename)
    const publicId = `explore-and-earn/photos/${cloudFolder}/${slug}`
    try {
      const result = await cloudinaryUpload(path.join(dirPath, filename), publicId, "image", {
        tags: ["photo", "curated", category],
        context: `category=${category}|scope=landscape|source=unsplash`,
      })
      manifest.photos[category][slug] = {
        cloudinaryId: publicId,
        url: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
      }
      ok(`${category}/${slug}`)
    } catch (e) {
      err(`${category}/${slug}`, e)
      manifest.photos[category][slug] = { status: "failed" }
    }
  }, 4)
}

// ── Cleanup tmp files ─────────────────────────────────────────────────────────

for (const f of tmpFiles) {
  try { fs.unlinkSync(f) } catch { /* ignore cleanup errors */ }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const manifestPath = path.join(__dirname, "assets.manifest.json")
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

console.log(`
────────────────────────────────────────────
 ✓  ${uploaded} uploaded
 ✗  ${failed} failed
────────────────────────────────────────────
 Manifest → scripts/assets.manifest.json
`)

if (manifest.errors.length) {
  console.log("Failures:")
  manifest.errors.forEach((e) => console.log(`  • ${e.label}: ${e.error}`))
}
