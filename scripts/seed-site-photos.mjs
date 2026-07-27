#!/usr/bin/env node
/**
 * Explore & Earn — Site Photo Seeder (Unsplash → Supabase Storage)
 * ─────────────────────────────────────────────────────────────────────────────
 * Populates the app-managed PHOTO BUCKETS (see apps/web/lib/photoBuckets.ts)
 * with real Unsplash imagery, uploaded into the PUBLIC Supabase Storage bucket
 * `site-photos` under the documented folder convention:
 *
 *     buckets/{bucket}[/{category}]/{slug}.jpg
 *
 * Every bucket ships EMPTY today: the previous library lived on an image CDN
 * this product no longer uses, and we do not fabricate a URL to an object that
 * is not there. This script is how photography comes back — it is complete and
 * runnable, and it is inert until the founder supplies an Unsplash key.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────────
 *   1. For each SCENERY/OBJECT bucket, runs the curated Unsplash search queries.
 *   2. Downloads each result and uploads the bytes to Supabase Storage,
 *      idempotent via a deterministic object path (upsert=true).
 *   3. Triggers Unsplash's download endpoint per used photo (API ToS requirement).
 *   4. Records full attribution (photographer + Unsplash links) in a manifest
 *      that is ALSO uploaded next to the images at `buckets/manifest.json`, so
 *      the credit for an object always travels with the object.
 *   5. Writes scripts/site-photos.manifest.json plus two paste-ready fragments:
 *        scripts/site-photos.entries.ts   → BucketEntry[] for photoBuckets.ts
 *        scripts/site-photos.credits.ts   → PhotoCredit[] for photoBucketCredits.ts
 *      A human reviews and wires them in; those two files stay the source of
 *      truth, and a photo is only ever listed once it really exists.
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
 * ── LICENSING ────────────────────────────────────────────────────────────────
 * No paid tier needed for these buckets. The free Unsplash License already
 * permits commercial use with NO required backlink. Unsplash+ mainly removes the
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
 *     doppler run -- node scripts/seed-site-photos.mjs
 * or with a local .env.local containing:
 *     UNSPLASH_ACCESS_KEY=...          (Unsplash app "Access Key")
 *     NEXT_PUBLIC_SUPABASE_URL=...     (the project the bucket lives in)
 *     SUPABASE_SERVICE_ROLE_KEY=...    (write access to Storage)
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *   node scripts/seed-site-photos.mjs                 # seed all scenery buckets
 *   node scripts/seed-site-photos.mjs --dry-run       # search only, no uploads
 *   node scripts/seed-site-photos.mjs --bucket=housing
 *   node scripts/seed-site-photos.mjs --limit=12      # cap photos per bucket
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const STORAGE_BUCKET = "site-photos";
/** Where the attribution manifest lands INSIDE the storage bucket. */
const MANIFEST_OBJECT = "buckets/manifest.json";

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

const SUPABASE_URL = (readEnv("NEXT_PUBLIC_SUPABASE_URL") || "").replace(/\/+$/, "");
const SERVICE_ROLE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const UNSPLASH_KEY = readEnv("UNSPLASH_ACCESS_KEY");

// ── CLI flags ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONLY_BUCKET = (args.find((a) => a.startsWith("--bucket=")) || "").split("=")[1] || null;
const PER_BUCKET_LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || null;

// Credentials are required for a real run (dry-run only needs the Unsplash key).
const missing = [];
if (!UNSPLASH_KEY) missing.push("UNSPLASH_ACCESS_KEY");
if (!DRY_RUN && !SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!DRY_RUN && !SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (missing.length) {
  console.error(
    `\nMissing credential(s): ${missing.join(", ")}\n` +
      `   Add them to .env.local or provide via env (e.g. doppler run -- ...).\n` +
      `   Get an Unsplash Access Key at https://unsplash.com/oauth/applications\n` +
      `   The service-role key is Supabase project settings -> API -> service_role.\n`,
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
    console.warn("   Unsplash hourly rate limit hit — sleeping 60s before retry...");
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
    // A large but bounded source; Supabase Storage re-derives sizes on read via
    // the render/image endpoint (see lib/photoBuckets.ts bucketPhotoUrl).
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

// ── Supabase Storage (service-role upload) ────────────────────────────────────

async function storageUpload(objectPath, body, contentType) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${objectPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": contentType,
        // Idempotent: a re-run overwrites the same deterministic path.
        "x-upsert": "true",
        "cache-control": "public, max-age=31536000, immutable",
      },
      body,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storage ${res.status}: ${text}`);
  }
  return res.json().catch(() => ({}));
}

/** Fetch the Unsplash bytes, then push them into Storage. */
async function uploadRemote(srcUrl, objectPath) {
  const src = await fetch(srcUrl);
  if (!src.ok) throw new Error(`source fetch ${src.status}`);
  const contentType = src.headers.get("content-type") || "image/jpeg";
  const bytes = Buffer.from(await src.arrayBuffer());
  return storageUpload(objectPath, bytes, contentType);
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
  return folderKey ? `buckets/${bucket}/${folderKey}` : `buckets/${bucket}`;
}

function titleCase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

const attributionOf = (p) => ({
  photographer: p.photographer,
  photographerUrl: p.photographerUrl,
  unsplashUrl: p.unsplashUrl,
});

// ── Run ─────────────────────────────────────────────────────────────────────

const manifest = {
  generated: null, // stamped after the run
  storageBucket: STORAGE_BUCKET,
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
      process.stdout.write(`   x  search "${query}": ${e.message}\n`);
      continue;
    }
    for (const photo of results) {
      if (entries.length >= want) break;
      if (seenIds.has(photo.id)) continue;
      seenIds.add(photo.id);

      const objectPath = `${folder}/${photo.slug}.jpg`;
      const entry = {
        id: photo.slug,
        label: titleCase(query),
        // `path` is exactly what a BucketEntry stores (relative to the bucket).
        path: objectPath,
        srcUrl: photo.srcUrl,
        downloadLocation: photo.downloadLocation,
        attribution: attributionOf(photo),
      };

      if (DRY_RUN) {
        process.stdout.write(`   .  [dry] ${objectPath}  <- ${photo.photographer}\n`);
        entries.push(entry);
        continue;
      }

      try {
        await uploadRemote(photo.srcUrl, objectPath);
        await triggerDownload(photo.downloadLocation);
        uploaded++;
        process.stdout.write(`   +  ${objectPath}  <- ${photo.photographer}\n`);
        entries.push(entry);
      } catch (e) {
        failed++;
        manifest.errors.push({ bucket, objectPath, error: e.message });
        process.stdout.write(`   x  ${objectPath}: ${e.message}\n`);
      }
    }
  }
  return { key: section.key, folderKey: section.folderKey, entries };
}

for (const plan of SEED_PLAN) {
  if (ONLY_BUCKET && plan.bucket !== ONLY_BUCKET) continue;

  if (plan.skip) {
    manifest.skipped[plan.bucket] = plan.skip;
    console.log(`\n-  ${plan.bucket} — SKIPPED: ${plan.skip}`);
    continue;
  }

  console.log(`\n-- ${plan.bucket} ${"-".repeat(Math.max(2, 56 - plan.bucket.length))}`);
  seenIds.clear();
  const sections = [];
  for (const section of plan.sections) {
    const seeded = await seedSection(plan.bucket, plan.orientation, plan.perSection, section);
    sections.push(seeded);
  }
  manifest.buckets[plan.bucket] = { sections };
}

// ── Emit manifest + paste-ready fragments ─────────────────────────────────────

manifest.generated = new Date().toISOString().split("T")[0];

fs.writeFileSync(
  path.join(__dirname, "site-photos.manifest.json"),
  JSON.stringify(manifest, null, 2),
);
fs.writeFileSync(path.join(__dirname, "site-photos.entries.ts"), buildEntriesFragment(manifest));
fs.writeFileSync(path.join(__dirname, "site-photos.credits.ts"), buildCreditsFragment(manifest));

// Attribution travels WITH the objects: the same manifest is uploaded next to
// them, so a credit can never drift away from the photo it belongs to.
if (!DRY_RUN) {
  try {
    await storageUpload(
      MANIFEST_OBJECT,
      Buffer.from(JSON.stringify(manifest, null, 2)),
      "application/json",
    );
    console.log(`\nAttribution manifest uploaded -> ${STORAGE_BUCKET}/${MANIFEST_OBJECT}`);
  } catch (e) {
    console.warn(`\nCould not upload the attribution manifest: ${e.message}`);
  }
}

console.log(`
--------------------------------------------
 ${DRY_RUN ? "DRY RUN — no uploads" : `${uploaded} uploaded   ${failed} failed`}
 Rate remaining (Unsplash, approx): ${Number.isFinite(rateRemaining) ? rateRemaining : "n/a"}
--------------------------------------------
 Manifest → scripts/site-photos.manifest.json
 Entries  → scripts/site-photos.entries.ts    (review, then wire into
            apps/web/lib/photoBuckets.ts — the source of truth)
 Credits  → scripts/site-photos.credits.ts    (review, then wire into
            apps/web/lib/photoBucketCredits.ts)
`);
if (manifest.errors.length) {
  console.log("Failures:");
  manifest.errors.slice(0, 20).forEach((e) => console.log(`  - ${e.objectPath || e.query}: ${e.error}`));
}

/** Build a human-reviewable TS fragment of BucketEntry[] per bucket/section. */
function buildEntriesFragment(m) {
  const lines = [
    "// GENERATED by scripts/seed-site-photos.mjs — review, then paste the",
    "// relevant entries into apps/web/lib/photoBuckets.ts (the source of truth).",
    "// Each `path` is a real, uploaded object in the public `site-photos` bucket.",
    "",
  ];
  for (const [bucket, data] of Object.entries(m.buckets)) {
    lines.push(`// -- ${bucket} --`);
    for (const section of data.sections) {
      lines.push(`//   section: ${section.key}`);
      for (const e of section.entries) {
        lines.push(`{ id: ${JSON.stringify(e.id)}, label: ${JSON.stringify(e.label)}, path: ${JSON.stringify(e.path)} },`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Build a human-reviewable TS fragment of PhotoCredit[] for every seeded photo. */
function buildCreditsFragment(m) {
  const lines = [
    "// GENERATED by scripts/seed-site-photos.mjs — review, then paste into",
    "// apps/web/lib/photoBucketCredits.ts. A credit must only ever exist for a",
    "// photo we actually show, so add these in the SAME change that adds the",
    "// matching entries to photoBuckets.ts.",
    "",
  ];
  for (const data of Object.values(m.buckets)) {
    for (const section of data.sections) {
      for (const e of section.entries) {
        lines.push(
          `{ path: ${JSON.stringify(e.path)}, photographer: ${JSON.stringify(e.attribution.photographer)}, ` +
            `photographerUrl: ${JSON.stringify(e.attribution.photographerUrl)}, ` +
            `unsplashUrl: ${JSON.stringify(e.attribution.unsplashUrl)}, source: "unsplash" },`,
        );
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}
