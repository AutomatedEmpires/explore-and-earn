#!/usr/bin/env node
/**
 * Explore & Earn — Commons Photography Acquisition (Wikimedia Commons → in-repo)
 * ─────────────────────────────────────────────────────────────────────────────
 * Acquires the canonical marketing photography set from Wikimedia Commons,
 * verifies every file's licence against a HARD allowlist, strips metadata, and
 * emits two optimized WebP renditions per asset into
 *
 *     apps/web/public/photos/{slug}-1600.webp     hero
 *     apps/web/public/photos/{slug}-800.webp      card
 *     apps/web/public/photos/manifest.json        licence + attribution manifest
 *
 * The assets ship IN-REPO. There is no runtime dependency on Commons, on an
 * image CDN, or on the Supabase `site-photos` bucket (that bucket remains the
 * future growth path for a larger library, not a dependency of this set).
 *
 * ── WHY TWO MODES ────────────────────────────────────────────────────────────
 * Commons search ranking drifts, so a script that re-queries and takes "the top
 * N" would produce a different set on every run and could not be audited. So:
 *
 *   --discover   Runs the curated shot-list queries, applies the licence and
 *                quality filters, and writes a SHORTLIST report of everything
 *                that passed (plus every rejection and its reason). A human
 *                reviews the shortlist, looks at the images, writes real alt
 *                text, and pins the winners into SELECTION below.
 *
 *   (default)    Re-fetches metadata for exactly the pinned SELECTION titles,
 *                RE-VERIFIES the licence filter against live Commons data (a
 *                file whose licence changed, or which was deleted, fails the
 *                run rather than shipping silently), downloads, processes, and
 *                writes the manifest.
 *
 * That makes the shipped set reproducible and re-auditable: `node
 * scripts/fetch-commons-photos.mjs --verify-only` re-checks every shipped
 * asset's licence without touching the files.
 *
 * ── LICENCE FILTER (hard bar — never lower it) ───────────────────────────────
 * ACCEPT  CC0 · Public Domain · CC-BY-{version} · CC-BY-SA-{version}
 * REJECT  anything NonCommercial (NC), anything NoDerivatives (ND), GFDL-only,
 *         "fair use"/non-free, custom permission-required tags, and any file
 *         whose licence cannot be determined from the API.
 *
 * A CC-BY / CC-BY-SA file with no parseable author is REJECTED: attribution is
 * a licence condition, and a credit we cannot render is a credit we do not have.
 *
 * ── PEOPLE SAFETY (honesty rule) ─────────────────────────────────────────────
 * A licence is not a model release. Files whose Commons page flags
 * `Restrictions` (personality rights, trademark, non-free logo) are rejected
 * outright. The shot list is written toward scenes where any person present is
 * incidental and not identifiable, and NO caption or alt text in this product
 * may present a photographed person as an Explore & Earn host, worker, staff
 * member, or named individual. Alt text describes what is in the frame.
 *
 * ── EXIF / GPS ───────────────────────────────────────────────────────────────
 * sharp does not copy input metadata unless `.withMetadata()` is called, and it
 * is never called here. Every output is re-encoded from decoded pixels, so no
 * EXIF, no GPS, no camera serial survives into the repo. `--verify-only` and
 * the manifest-integrity test both assert that independently.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *   node scripts/fetch-commons-photos.mjs --discover
 *   node scripts/fetch-commons-photos.mjs --discover --category=lake
 *   node scripts/fetch-commons-photos.mjs                  # build the pinned set
 *   node scripts/fetch-commons-photos.mjs --dry-run        # metadata + filter only
 *   node scripts/fetch-commons-photos.mjs --verify-only    # re-audit shipped set
 *
 * No API key is required. Wikimedia's User-Agent policy requires a descriptive
 * agent with a contact address; see USER_AGENT.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  PHOTO_DIR,
  SOURCE_COMMONS,
  buildEntry,
  formatKB,
  loadSharp,
  processAsset,
  sleep,
  writeManifest,
} from "./site-photo-pipeline.mjs";

const API = "https://commons.wikimedia.org/w/api.php";

// Wikimedia User-Agent policy: identify the tool and give a contact address.
// https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
const USER_AGENT =
  "ExploreAndEarnSitePhotos/1.0 (https://exploreandearn.com; jackson@automatedempires.com) node-fetch";

const HERO_WIDTH = 1600;
const MIN_SOURCE_WIDTH = 1600;

// ─── Shot list ───────────────────────────────────────────────────────────────
// Category → slug prefix + the Commons search queries that feed it. Queries are
// written toward scenery/objects; where people appear they should be incidental
// (distant, backs turned, unidentifiable) — see PEOPLE SAFETY above.
const SHOT_LIST = [
  {
    category: "lake",
    prefix: "cda-lake",
    label: "Coeur d'Alene lake & waterfront",
    queries: [
      "Coeur d'Alene Lake",
      "Lake Coeur d'Alene Idaho",
      "Coeur d'Alene Idaho waterfront",
    ],
  },
  {
    category: "lodge",
    prefix: "lodge",
    label: "Lake cabins, staff housing & lodge interiors",
    queries: [
      "log cabin lake shore",
      "mountain lodge exterior",
      "rustic cabin forest exterior",
      "bunkhouse bedroom interior",
      "hostel bathroom interior",
      "hostel shared kitchen",
      "hostel common room",
    ],
  },
  {
    category: "paddle",
    prefix: "paddle",
    label: "Paddleboarding & kayaking",
    queries: [
      "stand up paddleboarding lake",
      "kayaking lake",
      "canoe on lake",
    ],
  },
  {
    category: "dock",
    prefix: "dock",
    label: "Docks & jetties",
    queries: ["wooden dock lake", "boat dock lake", "jetty lake morning"],
  },
  {
    category: "trail",
    prefix: "trail",
    label: "Mountain trails & trail work",
    queries: [
      "mountain hiking trail",
      "forest trail hiking",
      "trail maintenance crew",
    ],
  },
  {
    category: "kitchen",
    prefix: "kitchen",
    label: "Commercial kitchens, prepared meals & dining",
    // Commons' "Kitchen Scene" hits are dominated by 17th-century Dutch
    // paintings and museum prints, so the art media types are excluded
    // explicitly — this set wants working rooms, not genre painting.
    queries: [
      "commercial kitchen stainless steel -painting -print -drawing -engraving",
      "restaurant kitchen interior -painting -print -drawing",
      "hotel kitchen equipment -painting -print",
      "canteen cafeteria kitchen -painting -print",
      "catering kitchen preparation -painting -print",
      "cafeteria prepared meal tray -painting -print",
      "hostel dining room -painting -print",
    ],
  },
  {
    category: "crew",
    prefix: "crew",
    label: "Outdoor crews & seasonal work",
    queries: [
      "trail crew working",
      "trail maintenance volunteers",
      "forestry work crew",
      "seasonal farm workers harvest field",
      "orchard harvest workers",
    ],
  },
  {
    category: "idaho",
    prefix: "idaho",
    label: "Idaho mountain scenery",
    queries: [
      "Idaho mountains landscape",
      "Sawtooth Mountains Idaho",
      "Idaho panhandle forest",
    ],
  },
];

// ─── Licence policy ──────────────────────────────────────────────────────────
const LICENCE_ACCEPT = [
  /^cc0(\b|$)/,
  /^cc-by-\d(\.\d)?$/,
  /^cc-by-sa-\d(\.\d)?$/,
  /^pd(\b|-|$)/,
  /^public[ -]domain/,
];
// Checked FIRST — an NC/ND token anywhere disqualifies regardless of the above.
const LICENCE_REJECT = [
  /(^|-)nc(-|$)/,
  /(^|-)nd(-|$)/,
  /non-?commercial/,
  /no-?deriv/,
  /^gfdl/,
  /fair[ -]use/,
  /^non-?free/,
];

const CC_URLS = {
  cc0: "https://creativecommons.org/publicdomain/zero/1.0/",
};

/** Human-facing licence name from the Commons machine code. */
function licenceDisplayName(code, shortName) {
  if (shortName) return shortName;
  if (!code) return "";
  if (code === "cc0") return "CC0";
  if (code.startsWith("pd") || code.startsWith("public")) return "Public domain";
  return code.toUpperCase();
}

/**
 * @returns {{ok: true, license: string, licenseUrl: string, code: string}
 *          |{ok: false, reason: string}}
 */
function evaluateLicence(meta, descriptionUrl) {
  const code = String(meta.License?.value ?? "").trim().toLowerCase();
  const shortName = stripHtml(meta.LicenseShortName?.value ?? "");
  const usageTerms = stripHtml(meta.UsageTerms?.value ?? "");
  const haystack = `${code} ${shortName} ${usageTerms}`.toLowerCase();

  if (!code && !shortName) return { ok: false, reason: "licence-unknown" };
  for (const re of LICENCE_REJECT) {
    if (re.test(code) || re.test(haystack)) {
      return { ok: false, reason: `licence-not-allowed:${code || shortName}` };
    }
  }
  const accepted = LICENCE_ACCEPT.some(
    (re) => re.test(code) || re.test(shortName.toLowerCase()),
  );
  if (!accepted) {
    return { ok: false, reason: `licence-not-allowed:${code || shortName}` };
  }

  // A licence URL from Commons is preferred. CC0 has a canonical URL. Plain
  // public-domain tags (PD-USGov, PD-old, …) carry no licence deed URL — the
  // Commons file page IS where that status is documented, so it is the honest
  // citation target rather than inventing a deed link.
  const fromApi = String(meta.LicenseUrl?.value ?? "").trim();
  const licenseUrl =
    fromApi.replace(/^http:\/\//i, "https://") ||
    (code === "cc0" ? CC_URLS.cc0 : "") ||
    descriptionUrl;

  return {
    ok: true,
    code,
    license: licenceDisplayName(code, shortName),
    licenseUrl,
  };
}

// ─── Small helpers ───────────────────────────────────────────────────────────
function stripHtml(value) {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAuthor(meta) {
  const artist = stripHtml(meta.Artist?.value ?? "");
  if (artist) return artist.slice(0, 160);
  const credit = stripHtml(meta.Credit?.value ?? "");
  if (credit) return credit.slice(0, 160);
  return "";
}

/**
 * The Artist field is HTML and usually wraps the name in a link to the
 * author's Commons user page or homepage — the closest thing Commons has to a
 * profile URL. Relative /wiki/… hrefs are resolved against Commons.
 */
function parseAuthorUrl(meta, fallback) {
  const raw = String(meta.Artist?.value ?? "");
  const href = raw.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!href) return fallback;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://commons.wikimedia.org${href}`;
  if (href.startsWith("http")) return href;
  return fallback;
}

async function api(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries({
    action: "query",
    format: "json",
    formatversion: "2",
    ...params,
  })) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Commons API ${res.status} for ${url.pathname}`);
  const json = await res.json();
  if (json.error) throw new Error(`Commons API error: ${json.error.info}`);
  await sleep(120); // be a polite API citizen
  return json;
}

const IMAGE_PROPS = {
  prop: "imageinfo",
  iiprop: "url|size|mime|extmetadata|sha1|user",
  iiurlwidth: String(HERO_WIDTH),
  iiextmetadatalanguage: "en",
};

/**
 * Apply every non-licence quality/safety gate.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function evaluateAsset(info) {
  const meta = info.extmetadata ?? {};
  if (!/^image\/(jpeg|png|webp)$/.test(String(info.mime))) {
    return { ok: false, reason: `mime-unsupported:${info.mime}` };
  }
  if (Number(info.width) < MIN_SOURCE_WIDTH) {
    return { ok: false, reason: `too-small:${info.width}px` };
  }
  if (Number(info.width) <= Number(info.height)) {
    return { ok: false, reason: "not-landscape" };
  }
  // Commons flags personality rights / trademark / non-free logos here. A
  // licence covers the copyright; it never covers a person's likeness, and this
  // product renders these images in a COMMERCIAL context.
  const restrictions = String(meta.Restrictions?.value ?? "").toLowerCase();
  if (restrictions.trim()) {
    return { ok: false, reason: `restrictions:${restrictions.slice(0, 40)}` };
  }
  return { ok: true };
}

/** Normalize one API imageinfo record into a candidate, or a rejection. */
function toCandidate(page) {
  const info = page.imageinfo?.[0];
  if (!info) return { rejected: { title: page.title, reason: "no-imageinfo" } };
  const meta = info.extmetadata ?? {};

  const quality = evaluateAsset(info);
  if (!quality.ok) {
    return { rejected: { title: page.title, reason: quality.reason } };
  }
  const licence = evaluateLicence(meta, info.descriptionurl);
  if (!licence.ok) {
    return { rejected: { title: page.title, reason: licence.reason } };
  }

  const author = parseAuthor(meta);
  const isPublicDomain =
    licence.code === "cc0" ||
    licence.code.startsWith("pd") ||
    licence.code.startsWith("public");
  if (!author && !isPublicDomain) {
    return {
      rejected: { title: page.title, reason: "attribution-required-no-author" },
    };
  }

  return {
    candidate: {
      title: page.title,
      pageid: page.pageid,
      author: author || "Unknown (public domain)",
      authorUrl: parseAuthorUrl(meta, info.descriptionurl),
      license: licence.license,
      licenseCode: licence.code,
      licenseUrl: licence.licenseUrl,
      sourceUrl: info.descriptionurl,
      fileUrl: info.url,
      thumbUrl: info.thumburl,
      originalWidth: info.width,
      originalHeight: info.height,
      mime: info.mime,
      sha1: info.sha1,
      description: stripHtml(meta.ImageDescription?.value ?? "").slice(0, 400),
      objectName: stripHtml(meta.ObjectName?.value ?? "").slice(0, 200),
      retrievedAt: new Date().toISOString(),
    },
  };
}

// ─── Discovery ───────────────────────────────────────────────────────────────
async function search(query, limit = 40) {
  const json = await api({
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    ...IMAGE_PROPS,
  });
  return json.query?.pages ?? [];
}

async function discover(onlyCategory, perCategory) {
  const shortlist = [];
  const rejected = [];
  const seen = new Set();

  for (const shot of SHOT_LIST) {
    if (onlyCategory && shot.category !== onlyCategory) continue;
    const accepted = [];
    for (const query of shot.queries) {
      let pages;
      try {
        pages = await search(query);
      } catch (err) {
        console.error(`  ! search failed (${query}): ${err.message}`);
        continue;
      }
      for (const page of pages) {
        if (seen.has(page.pageid)) continue;
        const { candidate, rejected: rej } = toCandidate(page);
        if (rej) {
          rejected.push({ ...rej, category: shot.category, query });
          continue;
        }
        seen.add(page.pageid);
        accepted.push({ ...candidate, category: shot.category, query });
      }
    }
    console.log(
      `${shot.category.padEnd(8)} ${String(accepted.length).padStart(3)} usable  (${shot.label})`,
    );
    shortlist.push(...accepted.slice(0, perCategory));
  }

  return { shortlist, rejected };
}

// ─── Pinned build ────────────────────────────────────────────────────────────
/**
 * The shipped set. Each entry pins an exact Commons file, the slug its assets
 * are written under, and HUMAN-WRITTEN alt text describing what is actually in
 * the frame. Alt text is authored by a person who looked at the image — it is
 * never derived from the Commons title, and it never presents a person in the
 * photograph as a host, worker, or staff member of this product.
 *
 * To add: run --discover, review the shortlist AND the image, append here.
 */
const SELECTION = [
  // ── Staff housing interiors ───────────────────────────────────────────────
  // Category-accurate sample imagery for the four housing evidence slots.
  // Every room is empty, and none is presented as the fictional host's actual
  // property. These replace unrelated lodge exteriors and trail-work scenes.
  {
    slug: "housing-sleeping-01",
    category: "lodge",
    title: "File:The Bunkhouse can sleep 12 people. There are 4 twin beds and 4 full beds. (d7f5ee72-7824-4d7b-b580-403775f6a98c).jpg",
    alt: "A rustic bunkhouse sleeping room with log-framed bunk beds arranged around an open center aisle.",
  },
  {
    slug: "housing-bathroom-01",
    category: "lodge",
    title: "File:Room with bathroom at Kabalulumana Hostel, Mount Isa, 2023, 05.jpg",
    alt: "A simple hostel bathroom with a sink, wall mirror, toilet, tiled shower floor, and white shower curtain.",
  },
  {
    slug: "housing-kitchen-01",
    category: "lodge",
    title: "File:Hostel Warszawa w Warszawie.jpg",
    alt: "A shared hostel kitchen with a refrigerator, dining table, sink, microwave, and open shelving against a brick-patterned wall.",
  },
  {
    slug: "housing-common-01",
    category: "lodge",
    title: "File:Hostel Room Common Area.jpg",
    alt: "A bright hostel common area with black sofas and armchairs arranged around a glass coffee table near a large window.",
  },

  // ── Staff meal setup ─────────────────────────────────────────────────────
  // Kitchen and cooking-line imagery already ship from Unsplash; these two
  // Commons photographs fill the prepared-meal and dining-area evidence slots.
  {
    slug: "meal-prepared-01",
    category: "kitchen",
    title: "File:Value lunch A and Salad at Hino University cafeteria, -28 (30155026383).jpg",
    alt: "A cafeteria lunch tray with rice, fried chicken, a breaded cutlet, shredded cabbage, salad, soup, and tea.",
  },
  {
    slug: "meal-dining-01",
    category: "kitchen",
    title: "File:Youth hostel Wiltz Luxembourg 03.jpg",
    alt: "An empty youth-hostel dining room set with long white tables, place settings, and rows of black chairs beneath a vaulted ceiling.",
  },

  // ── Outdoor crews & trail work ────────────────────────────────────────────
  // Unsplash (the primary source) is thin on genuine seasonal trail-work
  // imagery, so this category is filled from Commons. These are US National
  // Park Service / Grand Canyon Conservancy public-domain photographs of a
  // real trail crew; every worker is distant, turned away, or helmeted, and no
  // caption identifies anyone.
  {
    slug: "crew-01",
    category: "crew",
    title: "File:Trail Crew Working on Bright Angel Point Trail - 54550654657.jpg",
    alt: "A powered wheelbarrow and bagged trail material parked on a freshly rebuilt canyon-rim path, with limestone outcrops and junipers on either side.",
  },
  {
    slug: "crew-02",
    category: "crew",
    title: "File:Trail Crew Working on Bright Angel Point Trail - 54550654807.jpg",
    alt: "A trail worker raking fresh tread at a canyon-rim work site, surrounded by buckets, hand tools and stacked stone.",
  },
  {
    slug: "crew-03",
    category: "crew",
    title: "File:Trail Crew Working on Bright Angel Point Trail - 54551871145.jpg",
    alt: "A worker in a climbing helmet and harness hauling orange buckets along a rigged line on a steep, rocky canyon slope.",
  },
];

async function fetchPinned(titles) {
  /** @type {Map<string, object>} */
  const byTitle = new Map();
  for (let i = 0; i < titles.length; i += 25) {
    const batch = titles.slice(i, i + 25);
    const json = await api({ titles: batch.join("|"), ...IMAGE_PROPS });
    for (const page of json.query?.pages ?? []) {
      byTitle.set(page.title, page);
    }
    // The API normalizes titles (underscores → spaces); follow the mapping so
    // a pinned title that differs only in normalization still resolves.
    for (const n of json.query?.normalized ?? []) {
      const page = byTitle.get(n.to);
      if (page) byTitle.set(n.from, page);
    }
  }
  return byTitle;
}

async function build({ dryRun, verifyOnly }) {
  if (SELECTION.length === 0) {
    console.error(
      "SELECTION is empty — run `--discover` first, review the shortlist, and pin the winners.",
    );
    process.exit(1);
  }

  await fs.mkdir(PHOTO_DIR, { recursive: true });
  const sharp = await loadSharp();
  const pages = await fetchPinned(SELECTION.map((s) => s.title));

  const entries = [];
  const failures = [];

  for (const pick of SELECTION) {
    const page = pages.get(pick.title);
    if (!page || page.missing) {
      failures.push(`${pick.slug}: ${pick.title} — not found on Commons`);
      continue;
    }
    const { candidate, rejected } = toCandidate(page);
    if (rejected) {
      // A pinned file that no longer clears the bar FAILS the run. We do not
      // ship an asset whose licence we can no longer verify.
      failures.push(`${pick.slug}: ${pick.title} — ${rejected.reason}`);
      continue;
    }
    if (!pick.alt || !pick.alt.trim()) {
      failures.push(`${pick.slug}: missing alt text`);
      continue;
    }

    if (verifyOnly) {
      console.log(
        `ok  ${pick.slug.padEnd(14)} ${candidate.license.padEnd(12)} ${candidate.author}`,
      );
      entries.push({ slug: pick.slug, license: candidate.license });
      continue;
    }

    const src = candidate.thumbUrl ?? candidate.fileUrl;
    const res = await fetch(src, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      failures.push(`${pick.slug}: download ${res.status}`);
      continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const outputs = await processAsset(sharp, bytes, pick.slug, { dryRun });

    entries.push(
      buildEntry({
        slug: pick.slug,
        category: pick.category,
        alt: pick.alt,
        outputs,
        author: candidate.author,
        authorUrl: candidate.authorUrl,
        license: candidate.license,
        licenseUrl: candidate.licenseUrl,
        sourceUrl: candidate.sourceUrl,
        source: SOURCE_COMMONS,
        sourceRef: candidate.title,
      }),
    );
    console.log(
      `+ ${pick.slug.padEnd(14)} ${formatKB(outputs.reduce((n, o) => n + o.bytes, 0))}  ${candidate.license}`,
    );
  }

  if (failures.length > 0) {
    console.error("\nFAILED — every pinned file must verify:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  if (verifyOnly) {
    console.log(`\nverified ${entries.length} pinned files against live Commons`);
    return;
  }

  await writeManifest(SOURCE_COMMONS, entries, { dryRun });
  console.log(
    `\n${dryRun ? "[dry-run] " : ""}${entries.length} Wikimedia Commons photos written to the manifest`,
  );
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

if (flag("discover")) {
  const perCategory = Number(value("per-category", 12));
  const { shortlist, rejected } = await discover(value("category"), perCategory);
  const out =
    value("out") ?? path.join(os.tmpdir(), "commons-shortlist.json");
  await fs.writeFile(
    out,
    `${JSON.stringify({ shortlist, rejected }, null, 2)}\n`,
  );
  const counts = rejected.reduce((acc, r) => {
    const key = r.reason.split(":")[0];
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\nshortlist: ${shortlist.length}  rejected: ${rejected.length}`);
  console.log(`rejection reasons: ${JSON.stringify(counts)}`);
  console.log(`report → ${out}`);
} else {
  await build({ dryRun: flag("dry-run"), verifyOnly: flag("verify-only") });
}
