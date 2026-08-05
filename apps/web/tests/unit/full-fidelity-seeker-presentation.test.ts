import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { seekerDemoPerson } from "../../components/demo/full-fidelity/seeker/model";
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
