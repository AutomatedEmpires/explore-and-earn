import { describe, expect, it } from "vitest";

import { MARKETPLACE_LANES } from "@explore-and-earn/contracts";

import {
  CATEGORY_LANDING,
  LANDING_CATEGORIES,
  buildCategoryLandingMetadata,
  categoryLandingPath,
  isLandingCategory,
} from "../../lib/categoryLanding";
import { HOME_CATEGORIES } from "../../components/home/home-data";

/**
 * The /jobs/{lane} landing-page contract. Pins:
 *  1. Enumerated coverage over the founder-locked lanes (Record<> typing
 *     catches added union members; these tests catch removed/renamed entries).
 *  2. "mix" NEVER gets a landing page (DR-B6: derived presentation, not a lane).
 *  3. Copy PARITY with the founder source (HOME_CATEGORIES labels + blurbs) so
 *     the landing pages can't drift from approved language.
 *  4. Metadata honesty: canonical per lane, bare title, explicit robots.
 *  5. NO image field. The lane heroes were curated stock photos on an image CDN
 *     this product no longer uses; the hero band paints the lane's own cover
 *     gradient instead. This pins that the contract is copy-only, so a future
 *     re-add has to be deliberate (and has to ship the asset with it) rather
 *     than a resurrected slug pointing at nothing.
 */

/** Exactly the fields a landing entry may carry. */
const LANDING_COPY_KEYS = [
  "blurb",
  "description",
  "heading",
  "label",
  "title",
] as const;

describe("category landing contract", () => {
  it("covers exactly the founder-locked lanes (MARKETPLACE_LANES)", () => {
    expect([...LANDING_CATEGORIES]).toEqual([...MARKETPLACE_LANES]);
    expect(Object.keys(CATEGORY_LANDING).sort()).toEqual(
      [...MARKETPLACE_LANES].sort(),
    );
  });

  it("never exposes 'mix' as a landing lane", () => {
    expect(isLandingCategory("mix")).toBe(false);
    expect((LANDING_CATEGORIES as readonly string[]).includes("mix")).toBe(false);
  });

  it.each(["farm", "maritime", "remote", "seasonal"] as const)(
    "accepts the %s lane",
    (lane) => {
      expect(isLandingCategory(lane)).toBe(true);
    },
  );

  it.each(["", "jobs", "farm-jobs", "FARM", "lodge", "hospitality"])(
    "rejects non-lane slug %j",
    (raw) => {
      expect(isLandingCategory(raw)).toBe(false);
    },
  );

  it("labels and blurbs match the founder source (HOME_CATEGORIES) verbatim", () => {
    for (const home of HOME_CATEGORIES) {
      const landing = CATEGORY_LANDING[home.key as keyof typeof CATEGORY_LANDING];
      expect(landing, `missing landing entry for ${home.key}`).toBeDefined();
      expect(landing.label).toBe(home.label);
      expect(landing.blurb).toBe(home.blurb);
    }
  });

  it.each([...MARKETPLACE_LANES])(
    "%s carries copy only — no image field, no asset slug",
    (lane) => {
      const copy = CATEGORY_LANDING[lane];
      expect(Object.keys(copy).sort()).toEqual([...LANDING_COPY_KEYS]);
      // Nothing in the copy may smuggle in an asset reference.
      for (const value of Object.values(copy)) {
        expect(value).not.toMatch(/https?:\/\//);
      }
    },
  );

  it.each([...MARKETPLACE_LANES])("metadata for %s is honest and canonical", (lane) => {
    const meta = buildCategoryLandingMetadata(lane);
    expect(meta.alternates.canonical).toBe(`/jobs/${lane}`);
    expect(categoryLandingPath(lane)).toBe(`/jobs/${lane}`);
    // Bare title — the root template appends the brand; never bake it twice.
    expect(meta.title).not.toContain("Explore & Earn");
    // The triad promise is the founder register for these pages.
    expect(meta.title).toContain("housing, meals & pay upfront");
    expect(meta.robots).toEqual({ index: true, follow: true });
    // No invented numbers anywhere in static copy.
    expect(meta.description).not.toMatch(/\d/);
  });

  it.each([...MARKETPLACE_LANES])(
    "openGraph for %s survives the shallow-merge trap",
    (lane) => {
      const meta = buildCategoryLandingMetadata(lane);
      // A page-level openGraph key REPLACES the root-resolved object wholesale
      // (Next merges metadata shallowly), so siteName and type must be
      // restated here or the lane pages lose them — which is exactly what
      // shipped before W4.
      expect(meta.openGraph.siteName).toBe("Explore & Earn");
      expect(meta.openGraph.type).toBe("website");
      // The share image comes from the segment's opengraph-image.tsx file
      // convention; Next only re-injects it when the config declares NO
      // images property. Adding `images` here would silently drop the
      // per-lane card again.
      expect(Object.prototype.hasOwnProperty.call(meta.openGraph, "images")).toBe(
        false,
      );
    },
  );
});
