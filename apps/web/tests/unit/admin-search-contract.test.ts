import { describe, expect, it } from "vitest";

import {
  ADMIN_QUERY_MAX_LENGTH,
  adminPageHref,
  matchesAdminQuery,
  readAdminQuery,
  resolveAdminSearch,
} from "../../components/admin/adminSearch";

const APPLICATIONS_SEARCH = {
  action: "/applications",
  placeholder: "Search recent applications",
  ariaLabel:
    "Search the 50 most recent applications by seeker, listing, or status",
};

const LISTINGS_SEARCH = {
  action: "/listings",
  placeholder: "Search this listings page",
  ariaLabel: "Search listings on this page by title, host, category, or status",
};

const HOSTS_SEARCH = {
  action: "/hosts",
  placeholder: "Search this hosts page",
  ariaLabel:
    "Search hosts on this page by company, reference, verification, or listing count",
};

describe("readAdminQuery", () => {
  it("uses the first value, trims it, and caps it at 120 characters", () => {
    expect(ADMIN_QUERY_MAX_LENGTH).toBe(120);
    expect(readAdminQuery(["  Juniper Wake  ", "ignored"])).toBe(
      "Juniper Wake",
    );

    const oversized = `  ${"x".repeat(ADMIN_QUERY_MAX_LENGTH + 20)}  `;
    expect(readAdminQuery(oversized)).toBe(
      "x".repeat(ADMIN_QUERY_MAX_LENGTH),
    );
  });

  it("normalizes missing, empty, and blank values to an empty query", () => {
    expect(readAdminQuery(undefined)).toBe("");
    expect(readAdminQuery([])).toBe("");
    expect(readAdminQuery("")).toBe("");
    expect(readAdminQuery("   ")).toBe("");
  });
});

describe("resolveAdminSearch", () => {
  it.each([
    ["/applications", APPLICATIONS_SEARCH],
    ["/applications/application_123", APPLICATIONS_SEARCH],
    ["/en/applications", APPLICATIONS_SEARCH],
    ["/en/applications/application_123", APPLICATIONS_SEARCH],
    ["/listings", LISTINGS_SEARCH],
    ["/listings/listing_123", LISTINGS_SEARCH],
    ["/en/listings", LISTINGS_SEARCH],
    ["/en/listings/listing_123", LISTINGS_SEARCH],
    ["/hosts", HOSTS_SEARCH],
    ["/hosts/host_123", HOSTS_SEARCH],
    ["/en/hosts", HOSTS_SEARCH],
    ["/en/hosts/host_123", HOSTS_SEARCH],
  ] as const)("maps %s to its collection search", (pathname, expected) => {
    expect(resolveAdminSearch(pathname)).toEqual(expected);
  });

  it.each(["/admin", "/admin/reports", "/unknown/listings", ""])(
    "uses the truthful recent-applications fallback for %s",
    (pathname) => {
      expect(resolveAdminSearch(pathname)).toEqual(APPLICATIONS_SEARCH);
    },
  );
});

describe("matchesAdminQuery", () => {
  // Deliberately mirrors only text rendered on a host card. The fixture carries
  // a safe short reference and never places a raw Clerk identifier in search.
  const visibleHostValues = [
    "Juniper Wake",
    "#9P2K",
    "Trust attested",
    "Verified Host",
    3,
  ] as const;

  it("matches visible string and number values without case sensitivity", () => {
    expect(matchesAdminQuery("JUNIPER", visibleHostValues)).toBe(true);
    expect(matchesAdminQuery("#9p2k", visibleHostValues)).toBe(true);
    expect(matchesAdminQuery("verified host 3", visibleHostValues)).toBe(true);
    expect(matchesAdminQuery("awaiting", visibleHostValues)).toBe(false);
  });

  it("treats a blank query as an unfiltered view", () => {
    expect(matchesAdminQuery("   ", visibleHostValues)).toBe(true);
  });
});

describe("adminPageHref", () => {
  it("omits page one and empty queries", () => {
    expect(adminPageHref("/listings", 1, "")).toBe("/listings");
    expect(adminPageHref("/listings", 0, "   ")).toBe("/listings");
  });

  it("preserves a sanitized query while paging", () => {
    expect(adminPageHref("/hosts", 1, "  Juniper Wake  ")).toBe(
      "/hosts?q=Juniper+Wake",
    );
    expect(adminPageHref("/hosts", 2, "  Juniper Wake  ")).toBe(
      "/hosts?q=Juniper+Wake&page=2",
    );
    expect(adminPageHref("/hosts", 2, "")).toBe("/hosts?page=2");
  });

  it("encodes special characters in the query", () => {
    expect(adminPageHref("/hosts", 3, "Juniper & Wake/#9P2K")).toBe(
      "/hosts?q=Juniper+%26+Wake%2F%239P2K&page=3",
    );
  });
});
