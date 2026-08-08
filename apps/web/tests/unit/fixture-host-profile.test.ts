import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getFixtureListingDetail } from "../../components/discovery/fixtureDetail";
import {
  DISCOVERY_FIXTURES,
  FIXTURE_HOST_IDS,
} from "../../components/discovery/fixtures";
import { getFixtureHostProfileBundle } from "../../components/host/fixtureProfile";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fixture host profiles", () => {
  it("connects a first-party listing to an explicit fixture-only host identity", () => {
    const listing = getFixtureListingDetail("lst_orchard_wenatchee");

    expect(listing?.hostProfileId).toBeNull();
    expect(listing?.host?.id).toBe(FIXTURE_HOST_IDS.cascadeBloomOrchards);
    expect(listing?.host?.id).toMatch(/^fixture_host_/);
  });

  it("builds the public host page from the same honest listing fixture data", () => {
    const bundle = getFixtureHostProfileBundle(
      FIXTURE_HOST_IDS.cascadeBloomOrchards,
    );

    expect(bundle?.host).toMatchObject({
      id: FIXTURE_HOST_IDS.cascadeBloomOrchards,
      companyName: "Cascade Bloom Orchards",
      primaryLocationName: "Wenatchee, Washington",
      categoryScopes: ["farm"],
      housingOfferedGenerally: true,
      mealsOfferedGenerally: true,
      createdAt: null,
    });
    expect(bundle?.host.whyWorkForUs).toContain("family-run operation");
    expect(bundle?.host.team?.map((member) => member.role)).toEqual([
      "Orchard Manager",
      "Harvest Lead",
      "Seeker Coordinator",
    ]);
    expect(bundle?.listings.map((listing) => listing.id)).toEqual([
      "lst_orchard_wenatchee",
    ]);
    expect(bundle?.listings[0]).toMatchObject({
      latitude: expect.any(Number),
      longitude: expect.any(Number),
    });
    expect(bundle?.ratingSummary).toEqual({
      count: 0,
      average: 0,
      housingKeptPct: null,
      mealsKeptPct: null,
      payOnTimePct: null,
    });
    expect(bundle?.reviews).toEqual([]);
  });

  it("resolves every first-party fixture host and keeps sourced inventory hostless", () => {
    const firstParty = DISCOVERY_FIXTURES.filter(
      (fixture) => fixture.provenanceInfo?.provenance !== "sourced",
    );
    const fixtureHostIds = firstParty.map((fixture) => fixture.host.id);

    expect(fixtureHostIds.every(Boolean)).toBe(true);
    expect(new Set(fixtureHostIds).size).toBe(fixtureHostIds.length);
    for (const hostId of fixtureHostIds) {
      expect(getFixtureHostProfileBundle(hostId ?? "")).not.toBeNull();
    }

    expect(getFixtureListingDetail("lst_sourced_kelp_farm")?.host).toBeNull();
    expect(getFixtureHostProfileBundle("fixture_host_kodiak_kelp")).toBeNull();
  });

  it("refuses fixture listing and host identities in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(getFixtureListingDetail("lst_orchard_wenatchee")).toBeNull();
    expect(
      getFixtureHostProfileBundle(FIXTURE_HOST_IDS.cascadeBloomOrchards),
    ).toBeNull();
  });
});

describe("public host route fixture boundary", () => {
  const page = readFileSync(
    new URL("../../app/[locale]/host/[id]/page.tsx", import.meta.url),
    "utf8",
  );

  it("checks known fixture data before the UUID database path", () => {
    const fixtureRead = page.indexOf("getFixtureHostProfileBundle(id)");
    const uuidGuard = page.indexOf("if (!isUuid(id)) return null", fixtureRead);
    const databaseRead = page.indexOf(
      "getPublicHostProfileCached(id)",
      uuidGuard,
    );

    expect(fixtureRead).toBeGreaterThan(-1);
    expect(uuidGuard).toBeGreaterThan(fixtureRead);
    expect(databaseRead).toBeGreaterThan(uuidGuard);
  });

  it("keeps fixture hosts out of authenticated reviewability reads", () => {
    const reviewGuard = page.indexOf("if (!isFixture)");
    const authRead = page.indexOf("await optionalAuth()", reviewGuard);
    const reviewabilityRead = page.indexOf(
      "getReviewableEngagementForHost(",
      authRead,
    );

    expect(reviewGuard).toBeGreaterThan(-1);
    expect(authRead).toBeGreaterThan(reviewGuard);
    expect(reviewabilityRead).toBeGreaterThan(authRead);
  });

  it("does not present a placeholder forecast as public host data", () => {
    expect(page).not.toContain(
      'components/host/WeatherWidget',
    );
    expect(page).not.toMatch(/<WeatherWidget(?:\s|\/|>)/);
    expect(page).toContain("<ListingWeatherSection");
    expect(page).toContain("<WeatherWidgetLoading");
  });
});

describe("public host profile information architecture", () => {
  const view = readFileSync(
    new URL("../../components/host/PublicHostProfileView.tsx", import.meta.url),
    "utf8",
  );
  const hero = readFileSync(
    new URL("../../components/host/HostProfileHero.tsx", import.meta.url),
    "utf8",
  );

  it("leads from story to open opportunities before the deeper field guide", () => {
    const about = view.indexOf('id="about-heading"');
    const listings = view.indexOf("<ListingsSection", about);
    const workingHere = view.indexOf("<WorkingHereSection", listings);
    const livingHere = view.indexOf("<LifeHereSection", workingHere);
    const weather = view.indexOf("weatherSlot ?", livingHere);

    expect(about).toBeGreaterThan(-1);
    expect(listings).toBeGreaterThan(about);
    expect(workingHere).toBeGreaterThan(listings);
    expect(livingHere).toBeGreaterThan(workingHere);
    expect(weather).toBeGreaterThan(livingHere);
  });

  it("uses an honest triad field guide and no decorative fake map", () => {
    expect(view).toContain('aria-label="Housing meals and pay overview"');
    expect(view).toContain('name="benefit.housing"');
    expect(view).toContain('name="benefit.meals"');
    expect(view).toContain('name="benefit.pay"');
    expect(view).toContain('"Not stated"');
    expect(view).not.toContain("LocationMapCard");
    expect(view).not.toContain("mapContours");
  });

  it("keeps the no-photo hero compact and category-specific", () => {
    expect(hero).toContain('data-has-cover={coverPhotoUrl ? "true" : "false"}');
    expect(hero).toContain("data-category={primaryScope}");
    expect(hero).toContain("Employer field profile");
  });
});
