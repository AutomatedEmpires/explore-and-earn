import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  SITE_PHOTOS,
  findSitePhoto,
  getSitePhoto,
  isAllowedSitePhotoLicense,
  sitePhotoSources,
  sitePhotosByCategory,
  type SitePhoto,
  type SitePhotoCategory,
} from "../../lib/sitePhotos";

/**
 * Site photography manifest integrity.
 *
 * The manifest is machine-written but HAND-REVIEWED (alt text especially), and
 * it is the licence record for imagery this product publishes commercially. So
 * this suite asserts against the SHIPPED BYTES on disk, not against the
 * generator's intentions:
 *
 *  1. every entry carries every field, non-empty;
 *  2. every licence is inside the allowlist (nothing NC/ND ever slips in);
 *  3. both rendition files exist on disk at the declared path;
 *  4. alt text is real prose, not a slug or a filler word;
 *  5. no shipped file carries EXIF/GPS metadata;
 *  6. the catalog accessors behave.
 *
 * A stricter bar than "the script ran": if someone hand-edits the manifest, or
 * an asset is deleted, or a photo is swapped for one under a worse licence,
 * this fails.
 */

const PUBLIC_DIR = path.join(__dirname, "../../public");
const PHOTO_DIR = path.join(PUBLIC_DIR, "photos");

/** Resolve a manifest `src` ("/photos/x.webp") to a path on disk. */
function onDisk(src: string): string {
  return path.join(PUBLIC_DIR, src.replace(/^\//, ""));
}

const REQUIRED_STRING_FIELDS = [
  "slug",
  "category",
  "alt",
  "author",
  "authorUrl",
  "license",
  "licenseUrl",
  "sourceUrl",
  "source",
  "sourceRef",
  "retrievedAt",
] as const satisfies readonly (keyof SitePhoto)[];

const KNOWN_CATEGORIES: readonly SitePhotoCategory[] = [
  "lake",
  "lodge",
  "paddle",
  "dock",
  "trail",
  "kitchen",
  "crew",
  "idaho",
];

/** Words that would mean the alt text was never actually written. */
const FILLER_ALT = /^(photo|image|picture|photograph|untitled|alt)\b/i;

describe("site photo manifest", () => {
  it("ships a non-trivial catalog", () => {
    expect(SITE_PHOTOS.length).toBeGreaterThanOrEqual(12);
  });

  it("has unique slugs", () => {
    const slugs = SITE_PHOTOS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(SITE_PHOTOS.map((p) => [p.slug, p] as const))(
    "%s carries every required field, non-empty",
    (_slug, photo) => {
      for (const field of REQUIRED_STRING_FIELDS) {
        const value = photo[field];
        expect(typeof value, `${field} must be a string`).toBe("string");
        expect(String(value).trim(), `${field} must not be empty`).not.toBe("");
      }
      expect(KNOWN_CATEGORIES).toContain(photo.category);
      expect(photo.width).toBeGreaterThan(0);
      expect(photo.height).toBeGreaterThan(0);
    },
  );

  it.each(SITE_PHOTOS.map((p) => [p.slug, p] as const))(
    "%s uses an allowlisted licence",
    (_slug, photo) => {
      expect(
        isAllowedSitePhotoLicense(photo.license),
        `licence "${photo.license}" is outside the allowlist`,
      ).toBe(true);
      // Belt and braces: the two disqualifiers, named explicitly, so a future
      // widening of the allowlist regexes still cannot let these through.
      expect(photo.license).not.toMatch(/NonCommercial|\bNC\b/i);
      expect(photo.license).not.toMatch(/NoDeriv|\bND\b/i);
    },
  );

  it.each(SITE_PHOTOS.map((p) => [p.slug, p] as const))(
    "%s links attribution over https",
    (_slug, photo) => {
      for (const url of [photo.authorUrl, photo.licenseUrl, photo.sourceUrl]) {
        expect(url).toMatch(/^https:\/\//);
      }
    },
  );

  it.each(SITE_PHOTOS.map((p) => [p.slug, p] as const))(
    "%s has real descriptive alt text",
    (_slug, photo) => {
      expect(photo.alt.length).toBeGreaterThanOrEqual(25);
      expect(photo.alt).not.toMatch(FILLER_ALT);
      // Alt describes a scene, so it must not just echo the slug.
      expect(photo.alt.toLowerCase()).not.toContain(photo.slug.toLowerCase());
      expect(photo.alt.trim()).toBe(photo.alt);
    },
  );

  it.each(SITE_PHOTOS.map((p) => [p.slug, p] as const))(
    "%s ships both renditions on disk with the declared dimensions",
    (_slug, photo) => {
      for (const size of ["hero", "card"] as const) {
        const rendition = photo.sizes[size];
        expect(rendition.src).toMatch(/^\/photos\/.+\.webp$/);
        const file = onDisk(rendition.src);
        expect(existsSync(file), `${rendition.src} is missing on disk`).toBe(
          true,
        );
        expect(statSync(file).size).toBeGreaterThan(0);
        expect(rendition.width).toBeGreaterThan(0);
        expect(rendition.height).toBeGreaterThan(0);
      }
      // The hero is the entry's intrinsic size; the card is the smaller one.
      expect(photo.sizes.hero.width).toBe(photo.width);
      expect(photo.sizes.hero.height).toBe(photo.height);
      expect(photo.sizes.card.width).toBeLessThan(photo.sizes.hero.width);
    },
  );

  it("ships no orphan or unreferenced files in public/photos", () => {
    const referenced = new Set(
      SITE_PHOTOS.flatMap((p) => [p.sizes.hero.src, p.sizes.card.src]).map((s) =>
        path.basename(s),
      ),
    );
    const onDiskFiles = readdirSync(PHOTO_DIR).filter((f) => f.endsWith(".webp"));
    for (const file of onDiskFiles) {
      expect(referenced.has(file), `${file} is not referenced by the manifest`).toBe(
        true,
      );
    }
    expect(onDiskFiles.length).toBe(referenced.size);
  });
});

/**
 * EXIF/GPS scrub, asserted against the shipped bytes.
 *
 * A WebP file is a RIFF container: "RIFF" <size> "WEBP" then chunks. Camera
 * metadata rides in the optional "EXIF" and "XMP " chunks. sharp does not copy
 * input metadata unless .withMetadata() is called — this proves it stayed that
 * way, so no photographer's home coordinates ship in our marketing assets.
 */
describe("shipped photo files carry no camera metadata", () => {
  const files = SITE_PHOTOS.flatMap((p) => [p.sizes.hero.src, p.sizes.card.src]);

  it.each(files)("%s has no EXIF or XMP chunk", (src) => {
    const buf = readFileSync(onDisk(src));
    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WEBP");

    // Walk the RIFF chunk table rather than substring-scanning the whole file,
    // so compressed pixel data that happens to contain the bytes "EXIF" cannot
    // produce a false positive.
    const chunks: string[] = [];
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const fourcc = buf.subarray(offset, offset + 4).toString("ascii");
      const size = buf.readUInt32LE(offset + 4);
      chunks.push(fourcc);
      offset += 8 + size + (size % 2); // chunks are padded to even length
    }

    expect(chunks).not.toContain("EXIF");
    expect(chunks).not.toContain("XMP ");
  });
});

describe("site photo catalog accessors", () => {
  it("getSitePhoto returns the entry for a known slug", () => {
    const first = SITE_PHOTOS[0]!;
    expect(getSitePhoto(first.slug)).toEqual(first);
  });

  it("getSitePhoto throws loudly on an unknown slug", () => {
    expect(() => getSitePhoto("no-such-photo")).toThrow(/Unknown site photo slug/);
  });

  it("findSitePhoto returns undefined instead of throwing", () => {
    expect(findSitePhoto("no-such-photo")).toBeUndefined();
  });

  it("groups by category without losing or inventing entries", () => {
    const total = KNOWN_CATEGORIES.reduce(
      (n, category) => n + sitePhotosByCategory(category).length,
      0,
    );
    expect(total).toBe(SITE_PHOTOS.length);
  });

  it("reports every provider present in the catalog", () => {
    const sources = sitePhotoSources();
    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(SITE_PHOTOS.map((p) => p.source))).toEqual(new Set(sources));
  });
});
