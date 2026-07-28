#!/usr/bin/env node
/**
 * Explore & Earn — Unsplash Photography Acquisition (PRIMARY source)
 * ─────────────────────────────────────────────────────────────────────────────
 * Acquires the canonical marketing photography set from Unsplash and ships it
 * IN-REPO as optimized WebP under apps/web/public/photos/. Wikimedia Commons
 * (scripts/fetch-commons-photos.mjs) is the FALLBACK for categories Unsplash
 * cannot fill; both write the same manifest and coexist in it.
 *
 * ── TWO MODES ────────────────────────────────────────────────────────────────
 *   --discover   Runs the curated shot-list searches and writes a shortlist
 *                report (id, photographer, description, dimensions). A human
 *                reviews the shortlist AND the images, writes real alt text,
 *                and pins the winners into SELECTION below.
 *   (default)    Builds exactly the pinned SELECTION: triggers the Unsplash
 *                download endpoint per used photo, downloads, strips metadata,
 *                emits hero + card renditions, and updates the manifest.
 *
 * Pinning by photo id (not "top N of a live search") is what makes the shipped
 * set reproducible and auditable.
 *
 * ── API GUIDELINES (non-negotiable) ──────────────────────────────────────────
 *   1. Trigger `links.download_location` when a photo is actually USED — not
 *      when it is merely searched. This is how photographers get credited with
 *      a download; it is an API guideline requirement, not an optimisation.
 *   2. Attribute the photographer by name, linking to their profile and to the
 *      photo, both tagged `utm_source=explore_and_earn&utm_medium=referral`.
 *      The Unsplash License does not legally require a backlink; the API
 *      guidelines do, and our own honesty bar does. /credits renders every one.
 *   3. Hotlinking is the usual guidance, but this product deliberately ships
 *      the bytes in-repo (no third-party image host in the CSP, no runtime
 *      dependency on an external CDN for core marketing surfaces). The download
 *      trigger and full attribution are honoured exactly as if hotlinked.
 *
 * ── RATE LIMIT ───────────────────────────────────────────────────────────────
 * Demo-tier apps get 50 requests/hour. Budget ≈ 1 search per category +
 * 1 download-trigger per shipped photo. The client reads X-RateLimit-Remaining
 * and, on exhaustion, SLEEPS until the window resets and resumes — a partly
 * filled manifest is never written.
 *
 * ── PEOPLE SAFETY (honesty rule) ─────────────────────────────────────────────
 * The Unsplash License grants NO model or property release. People in these
 * frames must be incidental and not identifiable, and NOTHING in this product
 * may caption a photographed person as an Explore & Earn host, worker, staff
 * member, or named individual. Alt text describes the scene, never an identity.
 *
 * ── CREDENTIALS ──────────────────────────────────────────────────────────────
 *   doppler run --project explore-and-earn --config prd -- \
 *     node scripts/fetch-unsplash-photos.mjs
 * or export UNSPLASH_ACCESS_KEY yourself. The key is never written to disk,
 * never logged, and never committed.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *   node scripts/fetch-unsplash-photos.mjs --discover
 *   node scripts/fetch-unsplash-photos.mjs --dry-run
 *   node scripts/fetch-unsplash-photos.mjs
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  PHOTO_DIR,
  SOURCE_UNSPLASH,
  buildEntry,
  formatKB,
  loadSharp,
  processAsset,
  sleep,
  withUtm,
  writeManifest,
} from "./site-photo-pipeline.mjs";

const API = "https://api.unsplash.com";
const KEY = process.env.UNSPLASH_ACCESS_KEY;
const LICENSE = "Unsplash License";
const LICENSE_URL = "https://unsplash.com/license";

// ─── Shot list ───────────────────────────────────────────────────────────────
const SHOT_LIST = [
  { category: "lake",    query: "Coeur d'Alene Idaho lake",       label: "Coeur d'Alene lake & waterfront" },
  { category: "lodge",   query: "lake cabin lodge exterior",      label: "Lake cabins & lodge exteriors" },
  { category: "paddle",  query: "paddleboarding kayaking lake",   label: "Paddleboarding & kayaking" },
  { category: "dock",    query: "wooden dock lake morning",       label: "Docks & jetties" },
  { category: "trail",   query: "mountain hiking trail forest",   label: "Mountain trails & trail work" },
  { category: "kitchen", query: "commercial restaurant kitchen",  label: "Commercial kitchen & food service" },
  { category: "crew",    query: "outdoor work crew seasonal job", label: "Outdoor crews & hospitality work" },
  { category: "idaho",   query: "Idaho mountains landscape",      label: "Idaho mountain scenery" },
];

// ─── Rate-limited client ─────────────────────────────────────────────────────
let remaining = Infinity;

async function unsplash(pathname, params = {}, attempt = 0) {
  if (!KEY) {
    console.error(
      "UNSPLASH_ACCESS_KEY is not set. Run under `doppler run --project explore-and-earn --config prd --` or export it.",
    );
    process.exit(1);
  }
  const url = pathname.startsWith("http")
    ? new URL(pathname)
    : new URL(`${API}${pathname}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${KEY}`, "Accept-Version": "v1" },
  });
  const header = res.headers.get("x-ratelimit-remaining");
  if (header != null) remaining = Number(header);

  if (res.status === 403 || res.status === 429) {
    // Demo tier exhausted. Wait out the window rather than shipping a partial
    // set — the caller's loop resumes exactly where it left off.
    const waitMs = 5 * 60_000;
    console.warn(
      `   rate limit reached (remaining=${remaining}) — sleeping ${waitMs / 60_000}m for the window to reset…`,
    );
    await sleep(waitMs);
    return unsplash(pathname, params, attempt);
  }
  // Unsplash returns sporadic 5xx on search. Retry briefly before giving up —
  // a transient upstream blip must not abort a partly completed acquisition.
  if (res.status >= 500 && attempt < 2) {
    await sleep(2_000 * (attempt + 1));
    return unsplash(pathname, params, attempt + 1);
  }
  if (!res.ok) throw new Error(`Unsplash ${res.status} ${url.pathname}`);
  return res.json();
}

/** API guideline: ping download_location when a photo is actually used. */
async function triggerDownload(downloadLocation) {
  if (!downloadLocation) return false;
  try {
    await unsplash(downloadLocation);
    return true;
  } catch (err) {
    console.warn(`   ! download trigger failed: ${err.message}`);
    return false;
  }
}

function normalize(photo, category, query) {
  return {
    id: photo.id,
    category,
    query,
    author: photo.user?.name || "Unknown",
    authorUrl: withUtm(photo.user?.links?.html || "https://unsplash.com"),
    sourceUrl: withUtm(photo.links?.html || "https://unsplash.com"),
    downloadLocation: photo.links?.download_location,
    description: photo.description || photo.alt_description || "",
    width: photo.width,
    height: photo.height,
    // Ask Unsplash's own resizer for a bounded source; we re-encode locally.
    srcUrl: photo.urls?.raw
      ? `${photo.urls.raw}&w=2000&q=85&fm=jpg`
      : photo.urls?.full || photo.urls?.regular,
  };
}

async function discover(onlyCategory, perCategory) {
  const shortlist = [];
  for (const shot of SHOT_LIST) {
    if (onlyCategory && shot.category !== onlyCategory) continue;
    let data;
    try {
      data = await unsplash("/search/photos", {
        query: shot.query,
        per_page: 30,
        orientation: "landscape",
        content_filter: "high",
      });
    } catch (err) {
      // Report the gap rather than silently shipping a thin category.
      console.error(`${shot.category.padEnd(8)} SEARCH FAILED: ${err.message}`);
      continue;
    }
    const rows = (data.results ?? []).map((p) =>
      normalize(p, shot.category, shot.query),
    );
    console.log(
      `${shot.category.padEnd(8)} ${String(rows.length).padStart(3)} results  (${shot.label})  [api left: ${remaining}]`,
    );
    shortlist.push(...rows.slice(0, perCategory));
  }
  return shortlist;
}

// ─── The shipped set ─────────────────────────────────────────────────────────
/**
 * Each entry pins an exact Unsplash photo id, the slug its assets are written
 * under, and HUMAN-WRITTEN alt text describing what is actually in the frame.
 * Alt text is authored by a person who looked at the image; it is never derived
 * from the provider's own description, and it never presents a person in the
 * photograph as a host, worker, or staff member of this product.
 */
const SELECTION = [
  // ── Coeur d'Alene lake & waterfront ───────────────────────────────────────
  {
    slug: "cda-lake-01",
    category: "lake",
    id: "51M2HQZXHc8",
    alt: "The Coeur d'Alene Resort tower rising above a marina full of moored boats, with a pine-covered shoreline and calm blue water in the foreground.",
  },
  {
    slug: "cda-lake-02",
    category: "lake",
    id: "zXH-zoE6pcY",
    alt: "The Coeur d'Alene Resort tower lit from within at dusk, silhouetted against a pink and violet sunset over the lake and distant mountains.",
  },
  {
    slug: "cda-lake-03",
    category: "lake",
    id: "1H6B3hXS2Bg",
    alt: "A tall fountain jet catching low golden light on a calm lake, framed by dark silhouetted evergreens and reeds at sunset.",
  },
  // ── Lake cabins & lodge exteriors ─────────────────────────────────────────
  {
    slug: "lodge-01",
    category: "lodge",
    id: "xI3fdzznkWg",
    alt: "An aerial view of a large timber lodge with a steep green roof and warmly lit windows, ringed by pine forest at dusk.",
  },
  {
    slug: "lodge-02",
    category: "lodge",
    id: "bbJ6C5tjtN8",
    alt: "A small island of tall conifers holding a cluster of lodge buildings, mirrored in a still lake under low mist and cloud.",
  },
  {
    slug: "lodge-03",
    category: "lodge",
    id: "9yGzlTVkJjc",
    alt: "A small log boathouse on the shore of a turquoise glacial lake, backed by a dense wall of evergreen forest.",
  },
  // ── Paddleboarding & kayaking ─────────────────────────────────────────────
  {
    slug: "paddle-01",
    category: "paddle",
    id: "419YqYd2d3U",
    alt: "Paddleboarders and kayakers silhouetted on calm water at dusk, seen from a rocky, tree-framed shoreline.",
  },
  {
    slug: "paddle-02",
    category: "paddle",
    id: "Z-nL0ZaOD6M",
    alt: "Two paddleboarders seen from behind, gliding across a shallow turquoise lake toward snow-covered mountain peaks.",
  },
  {
    slug: "paddle-03",
    category: "paddle",
    id: "CQz1BoXIdYA",
    alt: "A group of paddleboarders in wetsuits and life vests spread across a misty lake below forested hills.",
  },
  // ── Docks & jetties ───────────────────────────────────────────────────────
  {
    slug: "dock-01",
    category: "dock",
    id: "OyiSf0nVz7U",
    alt: "A floating swim dock with a steel ladder sitting on glassy water at dawn, with low hills and pale cloud reflected around it.",
  },
  {
    slug: "dock-02",
    category: "dock",
    id: "IexvtXE2GU8",
    alt: "Sunrise bursting between weathered dock pilings, its light scattering in gold streaks across still marina water.",
  },
  {
    slug: "dock-03",
    category: "dock",
    id: "14qSkO1m4tY",
    alt: "A wooden dock running out to two empty chairs at its end, backlit by golden mist rising off a calm lake at sunrise.",
  },
  // ── Mountain trails ───────────────────────────────────────────────────────
  {
    slug: "trail-01",
    category: "trail",
    id: "rOjL1qsJ9vE",
    alt: "A gravel forest road curving past a White Mountain National Forest sign, hemmed in by maples and birches at peak autumn colour.",
  },
  {
    slug: "trail-02",
    category: "trail",
    id: "mKHj3wJLetc",
    alt: "A dirt track climbing through a stand of aspens and dark conifers under a deep blue sky.",
  },
  {
    slug: "trail-03",
    category: "trail",
    id: "2VKSQQJdmQw",
    alt: "A narrow gravel footpath climbing through dense forest, with tall conifers overhead and ferns crowding both banks.",
  },
  // ── Commercial kitchen & food service ─────────────────────────────────────
  {
    slug: "kitchen-01",
    category: "kitchen",
    id: "rO6709B116E",
    alt: "An empty commercial kitchen in stainless steel, with a pass-through dishwasher, deep sinks, prep tables and sheet-pan racks under bright ceiling lights.",
  },
  {
    slug: "kitchen-02",
    category: "kitchen",
    id: "moN8l2jGBhc",
    alt: "A row of ladles hanging above a restaurant service pass, with stacked white plates, bowls and prep containers on the line behind.",
  },
  {
    slug: "kitchen-03",
    category: "kitchen",
    id: "0EkWTSFXwCc",
    alt: "Steam rising off a wok on a dark restaurant cook line, with utensils and a strainer hanging along a stainless steel wall.",
  },
  // ── Idaho mountain scenery ────────────────────────────────────────────────
  {
    slug: "idaho-01",
    category: "idaho",
    id: "B9VIOO7R4GQ",
    alt: "The granite spires of Idaho's Sawtooth Range rising above a broad slope of dense evergreen forest under scattered cloud.",
  },
  {
    slug: "idaho-02",
    category: "idaho",
    id: "3X2-ZIJ6_7o",
    alt: "The snow-covered Teton range at first light seen across open Idaho farmland, with a barn and bare trees in the foreground.",
  },
  {
    slug: "idaho-03",
    category: "idaho",
    id: "0_zd7CCl1bY",
    alt: "A dirt road curving through sagebrush meadow and scattered pines toward a sunlit granite peak.",
  },
];

/**
 * Resolve one photo's attribution metadata.
 *
 * The API is authoritative and is used by default. On the demo tier the hourly
 * ceiling is 50 requests, and a full build needs one download-trigger per photo
 * on top of this lookup — so `--metadata-cache=<shortlist.json>` lets a build
 * reuse the metadata captured minutes earlier by `--discover` instead of
 * spending a second request per photo. The cached fields are the same fields
 * the API would return (photographer, profile link, photo link, download
 * location); they are recorded at pin time, not invented.
 */
async function resolveMeta(pick, cache) {
  const cached = cache?.get(pick.id);
  if (cached) return { ...cached, category: pick.category };
  const photo = await unsplash(`/photos/${pick.id}`);
  return normalize(photo, pick.category, "");
}

async function loadCache(file) {
  if (!file) return null;
  const raw = JSON.parse(await fs.readFile(file, "utf8"));
  return new Map((raw.shortlist ?? []).map((p) => [p.id, p]));
}

async function build({ dryRun, cacheFile, noTrigger }) {
  if (SELECTION.length === 0) {
    console.error(
      "SELECTION is empty — run `--discover` first, review the shortlist, and pin the winners.",
    );
    process.exit(1);
  }
  await fs.mkdir(PHOTO_DIR, { recursive: true });
  const sharp = await loadSharp();
  const cache = await loadCache(cacheFile);

  const entries = [];
  const failures = [];
  let totalBytes = 0;

  for (const pick of SELECTION) {
    if (!pick.alt?.trim()) {
      failures.push(`${pick.slug}: missing alt text`);
      continue;
    }
    let meta;
    try {
      meta = await resolveMeta(pick, cache);
    } catch (err) {
      failures.push(`${pick.slug}: metadata ${err.message}`);
      continue;
    }

    const res = await fetch(meta.srcUrl);
    if (!res.ok) {
      failures.push(`${pick.slug}: download ${res.status}`);
      continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const outputs = await processAsset(sharp, bytes, pick.slug, { dryRun });

    // Only AFTER the photo is genuinely used.
    if (!dryRun && !noTrigger) await triggerDownload(meta.downloadLocation);

    const sum = outputs.reduce((n, o) => n + o.bytes, 0);
    totalBytes += sum;
    entries.push(
      buildEntry({
        slug: pick.slug,
        category: pick.category,
        alt: pick.alt,
        outputs,
        author: meta.author,
        authorUrl: meta.authorUrl,
        license: LICENSE,
        licenseUrl: LICENSE_URL,
        sourceUrl: meta.sourceUrl,
        source: SOURCE_UNSPLASH,
        sourceRef: pick.id,
      }),
    );
    console.log(
      `+ ${pick.slug.padEnd(16)} ${formatKB(sum)}  ${meta.author}  [api left: ${remaining}]`,
    );
  }

  if (failures.length > 0) {
    console.error("\nFAILED — refusing to write a partial manifest:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  await writeManifest(SOURCE_UNSPLASH, entries, { dryRun });
  console.log(
    `\n${dryRun ? "[dry-run] " : ""}${entries.length} Unsplash photos, ${formatKB(totalBytes)} total`,
  );
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const value = (n, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : fallback;
};

if (flag("discover")) {
  const shortlist = await discover(value("category"), Number(value("per-category", 14)));
  const out = value("out") ?? path.join(os.tmpdir(), "unsplash-shortlist.json");
  await fs.writeFile(out, `${JSON.stringify({ shortlist }, null, 2)}\n`);
  console.log(`\nshortlist: ${shortlist.length}  →  ${out}  [api left: ${remaining}]`);
} else {
  // --no-trigger: for RE-ENCODE runs of an already-acquired set (e.g. changing
  // the size budget). The download endpoint registers that a photo was USED;
  // re-compressing bytes we already pulled is not a second use, and firing it
  // again would inflate the photographer's download count with a fiction.
  // Never pass it on a first acquisition.
  await build({
    dryRun: flag("dry-run"),
    cacheFile: value("metadata-cache"),
    noTrigger: flag("no-trigger"),
  });
}
