#!/usr/bin/env node
/**
 * Explore & Earn — Photo Bucket Seeder (Unsplash → Cloudinary)
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds the app-managed PHOTO BUCKETS (see apps/web/lib/photoBuckets.ts) with
 * real Unsplash imagery, uploaded into our own Cloudinary under the documented
 * `ee/buckets/{bucket}[/{category}]/{slug}` folder convention. This backfills the
 * `todo()` "to populate" slots (housing, meals, extra covers) with genuine photos
 * so the pickers offer a real library on day one — without ever fabricating a URL.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────────
 *   1. For each SCENERY/OBJECT bucket, runs the curated Unsplash search queries.
 *   2. Uploads each result to Cloudinary by REMOTE URL (Cloudinary fetches it),
 *      idempotent via a deterministic public_id (overwrite=true).
 *   3. Triggers Unsplash's download endpoint per used photo (API ToS requirement).
 *   4. Records full attribution (photographer + Unsplash links) in the manifest
 *      and in each asset's Cloudinary `context` — attribution is not required by
 *      the Unsplash License but we keep it anyway (cheap goodwill, keeps us clean).
 *   5. Writes scripts/photo-buckets.manifest.json and a paste-ready TS fragment
 *      (scripts/photo-buckets.seed-fragment.ts) with the resulting BucketEntry[]
 *      so a human can wire the winners into photoBuckets.ts (the source of truth).
 *
 * ── PEOPLE SAFETY (honesty rule) ─────────────────────────────────────────────
 * The Unsplash License grants NO model or property release. A recognizable face
 * used as a seeker/host/admin identity would present a real person as something
 * they're not. So the three IDENTITY buckets are NEVER seeded here:
 *     seekerIcon · adminProfile   → real people; keep the abstract monogram fallback
 *     adminCover                  → brand-neutral gradient by design
 * They are listed in SEED_PLAN with `skip` + a reason and logged, not silently
 * dropped. Scenery/interior/food queries below are also written to avoid faces.
 *
 * ── LICENSING (answer to "do we need to upgrade Unsplash?") ──────────────────
 * No upgrade needed for these buckets. The free Unsplash License already permits
 * commercial use with NO required backlink. Unsplash+ mainly removes the
 * (already-optional) attribution ask — it does NOT add model releases, so it does
 * not unlock people-as-identities either. Released people imagery, if ever wanted,
 * must come from a licensed stock library (Getty/iStock), not Unsplash at any tier.
 *
 * ── ACCESS / RATE LIMITS ─────────────────────────────────────────────────────
 * Unsplash "Demo" apps are capped at 50 requests/hour. A full seed makes roughly
 * (searches + one download-trigger per photo) requests, which exceeds 50/hr — so
 * either request Production access (unsplash.com/oauth/applications) or let this
 * run paced across the hour. The script reads the X-Ratelimit-Remaining header and
 * backs off automatically; use --limit to cap photos per bucket for a demo run.
 *
 * ── CREDENTIALS ──────────────────────────────────────────────────────────────
 * Reads from process.env first, then .env.local (repo root). Works under Doppler:
 *     doppler run -- node scripts/seed-photo-buckets.mjs
 * or with a local .env.local containing:
 *     UNSPLASH_ACCESS_KEY=...          (Unsplash app "Access Key")
 *     CLOUDINARY_API_KEY=...           (same creds as upload-assets.mjs)
 *     CLOUDINARY_API_SECRET=...
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *   node scripts/seed-photo-buckets.mjs                 # seed all scenery buckets
 *   node scripts/seed-photo-buckets.mjs --dry-run       # search only, no uploads
 *   node scripts/seed-photo-buckets.mjs --bucket=housing
 *   node scripts/seed-photo-buckets.mjs --limit=12      # cap photos per bucket
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ── Credentials (process.env → .env.local fallback) ─────────────────────────────

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .reduce((acc, l) => {
      const eq = l.indexOf("=");
      acc[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      return acc;
    }, {});
}

const fileEnv = loadEnvFile(path.join(ROOT, ".env.local"));
const readEnv = (k) => process.env[k] ?? fileEnv[k];

const CLOUD = readEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME") || "dwiwyt9vi";
const API_KEY = readEnv("CLOUDINARY_API_KEY");
const API_SECRET = readEnv("CLOUDINARY_API_SECRET");
const UNSPLASH_KEY = readEnv("UNSPLASH_ACCESS_KEY");

// ── CLI flags ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONLY_BUCKET = (args.find((a) => a.startsWith("--bucket=")) || "").split("=")[1] || null;
const PER_BUCKET_LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || null;

// Credentials are required for a real run (dry-run only needs the Unsplash key).
const missing = [];
if (!UNSPLASH_KEY) missing.push("UNSPLASH_ACCESS_KEY");
if (!DRY_RUN && !API_KEY) missing.push("CLOUDINARY_API_KEY");
if (!DRY_RUN && !API_SECRET) missing.push("CLOUDINARY_API_SECRET");
if (missing.length) {
  console.error(
    `\n❌  Missing credential(s): ${missing.join(", ")}\n` +
      `   Add them to .env.local or provide via env (e.g. doppler run -- …).\n` +
      `   Get an Unsplash Access Key at https://unsplash.com/oauth/applications\n`,
  );
  process.exit(1);
}

// ── SEED PLAN ────────────────────────────────────────────────────────────────
// Per bucket: either scenery/object search queries (seeded) or a skip + reason.
// Queries are written to return places, interiors, and food — NOT portraits.
// `orientation` biases the crop for the surface. Counts are per SECTION.

const SEED_PLAN = [
  {
    bucket: "homepageCover",
    orientation: "landscape",
    perSection: 12,
    sections: [
      { key: "default", folderKey: null, queries: [
        "golden farm field sunrise", "rugged coastline aerial", "fishing harbor boats dawn",
        "mountain trail landscape", "vineyard rows autumn", "national park vista no people",
      ] },
    ],
  },
  {
    bucket: "hostCover",
    orientation: "landscape",
    perSection: 12,
    sections: [
      { key: "default", folderKey: null, queries: [
        "working farm barn landscape", "orchard rows fruit trees", "marina fishing vessels",
        "remote cabin wilderness", "ranch fields open sky", "greenhouse nursery rows",
      ] },
    ],
  },
  {
    bucket: "hostProfile",
    orientation: "landscape",
    perSection: 8,
    sections: [
      { key: "farm", folderKey: "farm", queries: ["farm barn tractor field", "orchard harvest crates", "dairy farm pasture"] },
      { key: "maritime", folderKey: "maritime", queries: ["fishing boat deck", "harbor pier ropes nets", "sailboat open water"] },
      { key: "remote", folderKey: "remote", queries: ["remote mountain cabin", "forest trail backcountry", "desert road horizon"] },
      { key: "seasonal", folderKey: "seasonal", queries: ["autumn pumpkin patch", "ski resort snow lodge", "summer festival grounds empty"] },
    ],
  },
  {
    bucket: "housing",
    orientation: "landscape",
    perSection: 8,
    sections: [
      { key: "bedrooms", folderKey: "bedrooms", queries: ["bunk beds dormitory room", "simple bedroom interior", "shared cabin bunkroom"] },
      { key: "bathrooms", folderKey: "bathrooms", queries: ["clean bathroom interior", "shared shower room tiled", "washroom sink mirror"] },
      { key: "exteriors", folderKey: "exteriors", queries: ["worker housing exterior", "cabin lodge exterior", "dormitory building outside"] },
      { key: "misc", folderKey: "misc", queries: ["communal common room interior", "shared kitchen living space"] },
    ],
  },
  {
    bucket: "meals",
    orientation: "landscape",
    perSection: 8,
    sections: [
      { key: "meals", folderKey: "meals", queries: ["home cooked meal plate", "hearty communal dinner spread", "healthy prepared meal bowl"] },
      { key: "kitchens", folderKey: "kitchens", queries: ["commercial kitchen interior", "rustic farmhouse kitchen", "camp cookhouse stove"] },
      { key: "dining", folderKey: "dining", queries: ["long dining table set", "mess hall dining room empty", "communal picnic table meal"] },
      { key: "misc", folderKey: "misc", queries: ["fresh produce basket", "pantry ingredients shelf"] },
    ],
  },
  {
    bucket: "seekerCover",
    orientation: "landscape",
    perSection: 10,
    sections: [
      { key: "default", folderKey: null, queries: [
        "open road journey landscape", "backpack trail overlook no people", "coastal cliff horizon",
        "golden hour fields travel", "campervan mountain view",
      ] },
    ],
  },
  // ── Identity buckets: never seeded from Unsplash (no model release). ──────────
  { bucket: "seekerIcon", skip: "Identity/avatar bucket — real faces need a model release the Unsplash License does not grant. Keep the abstract monogram fallback." },
  { bucket: "adminProfile", skip: "Admin identity icon — real faces need a model release. Keep the neutral system-mark fallback." },
  { bucket: "adminCover", skip: "Admin chrome is brand-neutral gradient by design — no photography." },
];

// ── Unsplash ──────────────────────────────────────────────────────────────────

const UNSPLASH_API = "https://api.unsplash.com";
let rateRemaining = Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function unsplash(pathname, params = {}) {
  const url = new URL(`${UNSPLASH_API}${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${UNSPLASH_KEY}`, "Accept-Version": "v1" },
  });
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (remaining != null) rateRemaining = Number(remaining);
  if (res.status === 403 && rateRemaining === 0) {
    console.warn("   ⏳  Unsplash hourly rate limit hit — sleeping 60s before retry…");
    await sleep(60_000);
    return unsplash(pathname, params);
  }
  if (!res.ok) throw new Error(`Unsplash ${res.status}: ${await res.text()}`);
  // Be a good citizen: if we're nearly out, slow down.
  if (rateRemaining <= 2) await sleep(3_000);
  return res.json();
}

/** Search a query and return normalized photo records (deduped by id upstream). */
async function searchPhotos(query, orientation, want) {
  const perPage = Math.min(30, Math.max(want, 10));
  const data = await unsplash("/search/photos", {
    query,
    per_page: perPage,
    orientation,
    content_filter: "high",
  });
  return (data.results || []).map((p) => ({
    id: p.id,
    slug: `${slugify(p.user?.name || "unsplash")}-${p.id}`.slice(0, 80),
    description: p.description || p.alt_description || query,
    photographer: p.user?.name || "Unknown",
    photographerUrl: p.user?.links?.html || "https://unsplash.com",
    unsplashUrl: p.links?.html || "https://unsplash.com",
    downloadLocation: p.links?.download_location,
    // Prefer a large but bounded source; Cloudinary re-derives sizes via t_ee-*.
    srcUrl: p.urls?.raw ? `${p.urls.raw}&w=1920&q=80&fm=jpg` : p.urls?.full || p.urls?.regular,
  }));
}

/** ToS: ping the download endpoint when a photo is actually used. */
async function triggerDownload(downloadLocation) {
  if (!downloadLocation) return;
  try {
    await unsplash(downloadLocation.replace(UNSPLASH_API, ""));
  } catch {
    /* non-fatal — attribution + upload already succeeded */
  }
}

// ── Cloudinary (remote-URL upload, signed — mirrors upload-assets.mjs) ──────────

function sign(params) {
  const str =
    Object.keys(params)
      .sort()
      .filter((k) => !["file", "api_key"].includes(k))
      .map((k) => `${k}=${Array.isArray(params[k]) ? params[k].join(",") : params[k]}`)
      .join("&") + API_SECRET;
  return crypto.createHash("sha1").update(str).digest("hex");
}

async function cloudinaryUploadRemote(srcUrl, publicId, context, tags) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp, overwrite: true, context, tags: tags.join(",") };
  params.signature = sign(params);

  const form = new FormData();
  form.append("file", srcUrl); // Cloudinary fetches the remote URL server-side
  form.append("api_key", API_KEY);
  for (const [k, v] of Object.entries(params)) form.append(k, String(v));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
  return data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function bucketFolder(bucket, folderKey) {
  return folderKey ? `ee/buckets/${bucket}/${folderKey}` : `ee/buckets/${bucket}`;
}

// ── Run ─────────────────────────────────────────────────────────────────────

const manifest = {
  generated: null, // stamped after the run (Date.now is fine outside a workflow)
  cloud: CLOUD,
  dryRun: DRY_RUN,
  buckets: {},
  skipped: {},
  errors: [],
};

let uploaded = 0;
let failed = 0;
const seenIds = new Set(); // dedupe a photo across queries within a bucket

async function seedSection(bucket, orientation, perSection, section) {
  const want = PER_BUCKET_LIMIT ?? perSection;
  const folder = bucketFolder(bucket, section.folderKey);
  const entries = [];

  for (const query of section.queries) {
    if (entries.length >= want) break;
    let results;
    try {
      results = await searchPhotos(query, orientation, want);
    } catch (e) {
      manifest.errors.push({ bucket, section: section.key, query, error: e.message });
      process.stdout.write(`   ✗  search "${query}": ${e.message}\n`);
      continue;
    }
    for (const photo of results) {
      if (entries.length >= want) break;
      if (seenIds.has(photo.id)) continue;
      seenIds.add(photo.id);

      const publicId = `${folder}/${photo.slug}`;
      const label = titleCase(query);
      const context =
        `source=unsplash|unsplash_id=${photo.id}|photographer=${photo.photographer}` +
        `|photographer_url=${photo.photographerUrl}|unsplash_url=${photo.unsplashUrl}`;
      const tags = ["bucket", bucket, section.key, "unsplash"];

      if (DRY_RUN) {
        process.stdout.write(`   ·  [dry] ${publicId}  ← ${photo.photographer}\n`);
        entries.push({ id: photo.slug, label, publicId, attribution: attributionOf(photo) });
        continue;
      }

      try {
        await cloudinaryUploadRemote(photo.srcUrl, publicId, context, tags);
        await triggerDownload(photo.downloadLocation);
        uploaded++;
        process.stdout.write(`   ✓  ${publicId}  ← ${photo.photographer}\n`);
        entries.push({ id: photo.slug, label, publicId, attribution: attributionOf(photo) });
      } catch (e) {
        failed++;
        manifest.errors.push({ bucket, publicId, error: e.message });
        process.stdout.write(`   ✗  ${publicId}: ${e.message}\n`);
      }
    }
  }
  return { key: section.key, folderKey: section.folderKey, entries };
}

const attributionOf = (p) => ({
  photographer: p.photographer,
  photographerUrl: p.photographerUrl,
  unsplashUrl: p.unsplashUrl,
});

function titleCase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

for (const plan of SEED_PLAN) {
  if (ONLY_BUCKET && plan.bucket !== ONLY_BUCKET) continue;

  if (plan.skip) {
    manifest.skipped[plan.bucket] = plan.skip;
    console.log(`\n⊘  ${plan.bucket} — SKIPPED: ${plan.skip}`);
    continue;
  }

  console.log(`\n── ${plan.bucket} ${"─".repeat(Math.max(2, 56 - plan.bucket.length))}`);
  seenIds.clear();
  const sections = [];
  for (const section of plan.sections) {
    const seeded = await seedSection(plan.bucket, plan.orientation, plan.perSection, section);
    sections.push(seeded);
  }
  manifest.buckets[plan.bucket] = { sections };
}

// ── Emit manifest + paste-ready TS fragment ───────────────────────────────────

manifest.generated = new Date().toISOString().split("T")[0];

const manifestPath = path.join(__dirname, "photo-buckets.manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const fragment = buildTsFragment(manifest);
const fragmentPath = path.join(__dirname, "photo-buckets.seed-fragment.ts");
fs.writeFileSync(fragmentPath, fragment);

console.log(`
────────────────────────────────────────────
 ${DRY_RUN ? "DRY RUN — no uploads" : `✓  ${uploaded} uploaded   ✗  ${failed} failed`}
 Rate remaining (Unsplash, approx): ${Number.isFinite(rateRemaining) ? rateRemaining : "n/a"}
────────────────────────────────────────────
 Manifest → scripts/photo-buckets.manifest.json
 Fragment → scripts/photo-buckets.seed-fragment.ts   (review, then wire into
            apps/web/lib/photoBuckets.ts — the source of truth)
`);
if (manifest.errors.length) {
  console.log("Failures:");
  manifest.errors.slice(0, 20).forEach((e) => console.log(`  • ${e.publicId || e.query}: ${e.error}`));
}

/** Build a human-reviewable TS fragment of BucketEntry[] per bucket/section. */
function buildTsFragment(m) {
  const lines = [
    "// GENERATED by scripts/seed-photo-buckets.mjs — review, then paste the",
    "// relevant entries into apps/web/lib/photoBuckets.ts (the source of truth).",
    "// Each entry is a real, uploaded Cloudinary public ID. Attribution is kept",
    "// in the manifest + Cloudinary context; surface it on a /credits page.",
    "",
  ];
  for (const [bucket, data] of Object.entries(m.buckets)) {
    lines.push(`// ── ${bucket} ──`);
    for (const section of data.sections) {
      lines.push(`//   section: ${section.key}`);
      for (const e of section.entries) {
        lines.push(`{ id: "${e.id}", label: "${e.label}", publicId: "${e.publicId}" },`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
