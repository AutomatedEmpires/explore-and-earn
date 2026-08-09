import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  seekerDemoListings,
  seekerDemoPerson,
} from "../../components/demo/full-fidelity/seeker/model";
import { getSitePhoto } from "../../lib/sitePhotos";
import {
  applicationHrefForListing,
  applicationStatus,
  profileEditHrefForApplication,
} from "../../components/demo/full-fidelity/seeker/presentation";

const webRoot = new URL("../../", import.meta.url);
const experienceSource = readFileSync(
  new URL("components/demo/full-fidelity/seeker/DemoSeekerExperience.tsx", webRoot),
  "utf8",
);
const demoStylesSource = readFileSync(
  new URL("components/demo/full-fidelity/seeker/SeekerDemo.module.css", webRoot),
  "utf8",
);
const profileEditRouteSource = readFileSync(
  new URL("app/[locale]/for-seekers/demo/profile/edit/page.tsx", webRoot),
  "utf8",
);

describe("full-fidelity seeker presentation", () => {
  it("uses a real local asset with honest sample-image alternative text", () => {
    expect(seekerDemoPerson.photoUrl).toMatch(/^\/photos\/.+\.webp$/);
    expect(
      existsSync(new URL(`public/${seekerDemoPerson.photoUrl.slice(1)}`, webRoot)),
    ).toBe(true);
    expect(seekerDemoPerson.photoAlt).toMatch(/illustrative/i);
    expect(seekerDemoPerson.photoAlt).toMatch(/fictional sample seeker/i);
    expect(experienceSource).toContain("src={seekerDemoPerson.photoUrl}");
  });

  it("exposes complete, category-accurate Housing and Meals photo sets", () => {
    const expected = {
      housing: [
        ["sleeping_area", "Sleeping area", "housing-sleeping-01"],
        ["bathroom", "Bathroom", "housing-bathroom-01"],
        ["kitchen", "Kitchen", "housing-kitchen-01"],
        ["dining_common", "Dining/common area", "housing-common-01"],
      ],
      meals: [
        ["kitchen", "Kitchen", "kitchen-01"],
        ["prepared", "Prepared Meal", "meal-prepared-01"],
        ["dining", "Dining Area", "meal-dining-01"],
        ["misc", "Misc", "kitchen-03"],
      ],
    } as const;

    expect(seekerDemoListings.length).toBeGreaterThan(0);
    for (const listing of seekerDemoListings) {
      for (const kind of ["housing", "meals"] as const) {
        const photos = listing.benefitPhotos[kind];
        expect(photos.map(({ slot, label }) => [slot, label])).toEqual(
          expected[kind].map(([slot, label]) => [slot, label]),
        );
        expect(photos).toHaveLength(4);

        for (const [index, photo] of photos.entries()) {
          const expectedSlug = expected[kind][index]?.[2];
          expect(expectedSlug).toBeDefined();
          const source = getSitePhoto(expectedSlug ?? "");
          expect(photo.imageUrl).toBe(source.sizes.card.src);
          expect(photo.imageUrl).toMatch(/^\/photos\/.+-800\.webp$/);
          expect(photo.imageWidth).toBe(source.sizes.card.width);
          expect(photo.imageHeight).toBe(source.sizes.card.height);
          expect(photo.imageAlt).toContain(source.alt);
          expect(photo.imageAlt).toMatch(/Illustrative demo example/i);
          expect(photo.imageAlt).toMatch(/category/i);
          expect(photo.imageAlt).toMatch(/not host-supplied evidence/i);
          expect(photo.presentation).toBe("illustrative_demo_scene");
        }
      }
    }
  });

  it("preserves complete photos and the locked gallery-heading hierarchy", () => {
    expect(demoStylesSource).toMatch(
      /\.benefitPhotoImage\s*\{[^}]*object-fit:\s*contain;/,
    );
    expect(demoStylesSource).toMatch(
      /\.benefitPhotoIntro h3\s*\{[^}]*font-family:\s*var\(--font-display\);[^}]*font-weight:\s*var\(--font-weight-bold\);/,
    );
  });

  it("preserves the listing identity through profile editing and back to apply", () => {
    const listingId = "demo listing/one";

    expect(profileEditHrefForApplication(listingId)).toBe(
      "/for-seekers/demo/profile/edit?apply=demo%20listing%2Fone",
    );
    expect(applicationHrefForListing(listingId)).toBe(
      "/for-seekers/demo/listing/demo%20listing%2Fone/apply",
    );
    expect(experienceSource).toContain(
      "href={profileEditHrefForApplication(listing.id)}",
    );
    expect(experienceSource).toContain("router.push(returnHref)");
    expect(profileEditRouteSource).toContain("pendingApplicationListingId");
  });

  it.each([
    ["not_selected", "Not selected"],
    ["rejected", "Not selected"],
    ["withdrawn", "Withdrawn"],
    ["expired", "Expired"],
  ])("keeps terminal state %s explicit", (status, label) => {
    expect(applicationStatus(status)).toEqual({ label, tone: "neutral" });
  });

  it("offers conversion only after profile or application value is complete", () => {
    expect(experienceSource).toContain('aria-labelledby="profile-conversion-heading"');
    expect(experienceSource).toContain('aria-labelledby="apply-conversion-heading"');
    expect(experienceSource).toContain('href="/sign-up?role=seeker"');
    expect(experienceSource).toContain("Build your seeker profile");
    expect(experienceSource).toContain("Explore more roles");
  });
});
