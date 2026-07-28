/**
 * Explore & Earn — shared site-photography pipeline
 * ─────────────────────────────────────────────────────────────────────────────
 * The image-processing and manifest half of the acquisition scripts. Two source
 * scripts share it so the shipped set can mix providers without either script
 * owning the manifest:
 *
 *     scripts/fetch-unsplash-photos.mjs   PRIMARY source
 *     scripts/fetch-commons-photos.mjs    FALLBACK source (Wikimedia Commons)
 *
 * Each script rewrites ONLY the manifest entries carrying its own `source`
 * value and preserves every other entry, so re-running one provider never drops
 * the other's photos.
 *
 * ── EXIF / GPS ───────────────────────────────────────────────────────────────
 * sharp does not copy input metadata unless `.withMetadata()` is called, and it
 * is never called here. Every output is re-encoded from decoded pixels, so no
 * EXIF block, no GPS tag, and no camera serial reaches the repo. The
 * manifest-integrity test re-asserts this against the shipped bytes rather than
 * trusting this comment.
 */

import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..");
export const PHOTO_DIR = path.join(ROOT, "apps/web/public/photos");
export const MANIFEST_PATH = path.join(PHOTO_DIR, "manifest.json");

export const HERO_WIDTH = 1600;
export const CARD_WIDTH = 800;

/**
 * Per-file weight budget. Marketing photography that blows past this costs more
 * in LCP than it returns in fidelity, so encoding steps DOWN the quality ladder
 * until the rendition fits rather than shipping whatever q82 happened to
 * produce. Detailed frames (dense foliage, fog gradients) are the ones that
 * need it; simple frames never leave the first rung.
 */
export const MAX_ASSET_BYTES = 400 * 1024;
export const QUALITY_LADDER = [82, 76, 70, 64, 58, 52, 46];

/** The ONLY licences that may appear in the manifest. Never widen casually. */
export const LICENSE_ALLOWLIST = [
  /^CC0$/,
  /^Public domain$/,
  /^CC BY \d(\.\d)?$/,
  /^CC BY-SA \d(\.\d)?$/,
  /^Unsplash License$/,
];

export const SOURCE_UNSPLASH = "Unsplash";
export const SOURCE_COMMONS = "Wikimedia Commons";

/** Unsplash API guideline: attribute back with a referral-tagged link. */
export const UTM = "utm_source=explore_and_earn&utm_medium=referral";

export function withUtm(url) {
  if (!url) return url;
  return url.includes("?") ? `${url}&${UTM}` : `${url}?${UTM}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** sharp is a dependency of apps/web, not of the repo root. */
export async function loadSharp() {
  const requireFromWeb = createRequire(path.join(ROOT, "apps/web/package.json"));
  const mod = await import(pathToFileURL(requireFromWeb.resolve("sharp")).href);
  return mod.default;
}

/**
 * Re-encode one source image into the hero + card renditions.
 * @returns {Promise<{name: string, file: string, src: string, width: number,
 *                    height: number, bytes: number}[]>}
 */
export async function processAsset(sharp, bytes, slug, { dryRun = false } = {}) {
  const outputs = [];
  for (const [name, width] of [
    ["hero", HERO_WIDTH],
    ["card", CARD_WIDTH],
  ]) {
    const file = `${slug}-${width}.webp`;
    let data;
    let info;
    let quality = QUALITY_LADDER[0];
    for (const q of QUALITY_LADDER) {
      quality = q;
      ({ data, info } = await sharp(bytes)
        // Honour EXIF orientation BEFORE the metadata is discarded, otherwise a
        // rotated phone photo would ship sideways once the tag is stripped.
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: q, effort: 6 })
        .toBuffer({ resolveWithObject: true }));
      if (data.length <= MAX_ASSET_BYTES) break;
    }
    if (!dryRun) await fs.writeFile(path.join(PHOTO_DIR, file), data);
    outputs.push({
      name,
      file,
      src: `/photos/${file}`,
      width: info.width,
      height: info.height,
      bytes: data.length,
      quality,
    });
  }
  return outputs;
}

export async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  } catch {
    return { photos: [] };
  }
}

/**
 * Replace this source's entries, preserve every other source's, and write the
 * manifest back sorted by slug so diffs stay reviewable.
 */
export async function writeManifest(source, entries, { dryRun = false } = {}) {
  const existing = await readManifest();
  const kept = (existing.photos ?? []).filter((p) => p.source !== source);
  const photos = [...kept, ...entries].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );

  const manifest = {
    generatedBy: [
      "scripts/fetch-unsplash-photos.mjs",
      "scripts/fetch-commons-photos.mjs",
    ],
    licensePolicy: [
      "CC0",
      "Public domain",
      "CC BY",
      "CC BY-SA",
      "Unsplash License",
    ],
    photos,
  };
  if (!dryRun) {
    await fs.mkdir(PHOTO_DIR, { recursive: true });
    await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return manifest;
}

/** Assemble one manifest entry from a processed asset + its provenance. */
export function buildEntry({
  slug,
  category,
  alt,
  outputs,
  author,
  authorUrl,
  license,
  licenseUrl,
  sourceUrl,
  source,
  sourceRef,
}) {
  const hero = outputs.find((o) => o.name === "hero");
  const card = outputs.find((o) => o.name === "card");
  return {
    slug,
    category,
    alt: alt.trim(),
    width: hero.width,
    height: hero.height,
    sizes: {
      hero: { src: hero.src, width: hero.width, height: hero.height },
      card: { src: card.src, width: card.width, height: card.height },
    },
    author,
    authorUrl,
    license,
    licenseUrl,
    sourceUrl,
    source,
    sourceRef,
    retrievedAt: new Date().toISOString(),
  };
}

export function formatKB(bytes) {
  return `${String(Math.round(bytes / 1024)).padStart(4)} KB`;
}
