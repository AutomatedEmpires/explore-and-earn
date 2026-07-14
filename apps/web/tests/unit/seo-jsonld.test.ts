/**
 * Structured-data honesty tests (lib/seo.ts) across representative listing
 * types. Pins the no-fabrication rules: TELECOMMUTE only for genuinely remote
 * listings, no invented applicant-location country, no employmentType claim
 * (the data model records none), no baseSalary when pay is unstated, no
 * jobLocation when location is missing, valid dates passed through verbatim,
 * and script-breakout escaping.
 */
import { describe, expect, it } from "vitest";

import {
  generateBreadcrumbJsonLd,
  generateJobPostingJsonLd,
  generateOrganizationJsonLd,
} from "../../lib/seo";
import type { PublicListingDetail, PublicListingDetailHost } from "@explore-and-earn/db";

const BASE = "https://exploreandearn.com";

const host: PublicListingDetailHost = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  companyName: "Sunrise Orchards",
  photoUrl: null,
  about: null,
  primaryLocationName: "Hood River, OR",
  verified: true,
};

function listing(over: Partial<PublicListingDetail> = {}): PublicListingDetail {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Orchard crew",
    category: "farm",
    description: "Pick apples all fall with a small crew.",
    locationDisplay: "Hood River, OR",
    latitude: 45.7,
    longitude: -121.5,
    status: "live",
    housingIncluded: true,
    mealsIncluded: true,
    compensationSummary: "$18/hr",
    compensationMinCents: 180000,
    compensationMaxCents: 220000,
    compensationUnit: "hour",
    compensationCurrency: "USD",
    timelineSummary: null,
    beginsAt: "2026-09-01T00:00:00Z",
    endsAt: "2026-11-15T00:00:00Z",
    publishedAt: "2026-07-01T00:00:00Z",
    coverPhotoUrl: null,
    galleryPhotoUrls: [],
    hostProfileId: host.id,
    host,
    ...over,
  };
}

function parse(json: string | null): Record<string, unknown> {
  if (json === null) throw new Error("unexpected null JSON-LD");
  // Undo the JSON-LD HTML escaping for assertions.
  return JSON.parse(
    json
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&"),
  );
}

describe("JobPosting — representative listing types", () => {
  it("farm listing with full data: paid, located, dated", () => {
    const jp = parse(generateJobPostingJsonLd(listing(), host, BASE));
    expect(jp["@type"]).toBe("JobPosting");
    expect(jp.url).toBe(`${BASE}/listing/11111111-2222-3333-4444-555555555555`);
    expect(jp.datePosted).toBe("2026-07-01T00:00:00Z");
    expect(jp.validThrough).toBe("2026-11-15T00:00:00Z");
    const salary = jp.baseSalary as Record<string, unknown>;
    expect(salary["@type"]).toBe("MonetaryAmount");
    expect((salary.value as Record<string, unknown>).value).toBe(1800);
    const org = jp.hiringOrganization as Record<string, unknown>;
    expect(org.name).toBe("Sunrise Orchards");
    expect(org.sameAs).toBe(`${BASE}/host/${host.id}`);
    const loc = jp.jobLocation as Record<string, unknown>;
    expect((loc.geo as Record<string, unknown>).latitude).toBe(45.7);
    // Not remote → no TELECOMMUTE claim.
    expect(jp.jobLocationType).toBeUndefined();
  });

  it("remote listing: TELECOMMUTE without a fabricated country requirement", () => {
    const jp = parse(
      generateJobPostingJsonLd(
        listing({ category: "remote", locationDisplay: null, latitude: null, longitude: null }),
        host,
        BASE,
      ),
    );
    expect(jp.jobLocationType).toBe("TELECOMMUTE");
    // The data model records no country eligibility — none may be claimed.
    expect(jp.applicantLocationRequirements).toBeUndefined();
  });

  it("a non-remote listing MISSING its location emits NO JobPosting at all", () => {
    // Google requires jobLocation OR TELECOMMUTE; neither can be stated
    // honestly here, so no block is emitted (never a fabricated location,
    // never invalid structured data).
    const result = generateJobPostingJsonLd(
      listing({ locationDisplay: null, latitude: null, longitude: null }),
      host,
      BASE,
    );
    expect(result).toBeNull();
  });

  it("compensation-unspecified listing emits NO baseSalary (no placeholder)", () => {
    const jp = parse(
      generateJobPostingJsonLd(
        listing({ compensationMinCents: null, compensationMaxCents: null, compensationSummary: null }),
        host,
        BASE,
      ),
    );
    expect(jp.baseSalary).toBeUndefined();
  });

  it("no employmentType is asserted (the model records none)", () => {
    const jp = parse(generateJobPostingJsonLd(listing(), host, BASE));
    expect(jp.employmentType).toBeUndefined();
  });

  it("undated listing omits datePosted/validThrough instead of inventing them", () => {
    const jp = parse(
      generateJobPostingJsonLd(
        listing({ publishedAt: null, endsAt: null }),
        host,
        BASE,
      ),
    );
    expect(jp.datePosted).toBeUndefined();
    expect(jp.validThrough).toBeUndefined();
  });

  it("label-only location keeps the address, omits geo (no invented coordinates)", () => {
    const jp = parse(
      generateJobPostingJsonLd(listing({ latitude: null, longitude: null }), host, BASE),
    );
    const loc = jp.jobLocation as Record<string, unknown>;
    expect(loc).toBeDefined();
    expect(loc.geo).toBeUndefined();
  });

  it("hostless (preview) listings emit no dead host URL", () => {
    const jp = parse(
      generateJobPostingJsonLd(listing({ host: { ...host, id: "" } }), { ...host, id: "" }, BASE),
    );
    const org = jp.hiringOrganization as Record<string, unknown>;
    expect(org.sameAs).toBeUndefined();
  });

  it("escapes script-breakout characters from user-controlled fields", () => {
    const raw = generateJobPostingJsonLd(
      listing({ title: "</script><script>alert(1)</script>" }),
      host,
      BASE,
    );
    expect(raw).not.toContain("</script>");
    expect(raw).toContain("\\u003c");
  });
});

describe("Organization + BreadcrumbList", () => {
  it("organization JSON-LD is valid and canonical", () => {
    const org = parse(generateOrganizationJsonLd(BASE));
    expect(org["@type"]).toBe("Organization");
    expect(org.url).toBe(BASE);
    expect(org.name).toBe("Explore & Earn");
  });

  it("breadcrumbs number positions from 1 in order", () => {
    const bc = parse(
      generateBreadcrumbJsonLd([
        { name: "Home", url: BASE },
        { name: "Browse", url: `${BASE}/seek` },
        { name: "Orchard crew", url: `${BASE}/listing/x` },
      ]),
    );
    const items = bc.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[2]!.name).toBe("Orchard crew");
  });
});
