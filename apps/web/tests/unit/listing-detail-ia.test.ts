import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, webRoot), "utf8");

function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("listing detail information architecture", () => {
  const page = code(read("app/[locale]/listing/[id]/page.tsx"));
  const sectionNav = code(read("components/listing/ListingSectionNav.tsx"));

  it("provides accessible links only to data-backed sections", () => {
    expect(sectionNav).toContain("<nav");
    expect(sectionNav).toContain('aria-labelledby="listing-sections-label"');
    expect(sectionNav).toContain("<ul");
    expect(sectionNav).toContain("href={link.href}");

    expect(page).toContain("<ListingSectionNav links={sectionLinks} />");
    expect(page).toContain('{ href: "#listing-deal", label: "The deal" }');
    expect(page).toContain('{ href: "#listing-host", label: "Host" }');
    expect(page).toContain('{ href: "#listing-weather", label: "Weather" }');
    expect(page).toContain("if (positionTarget)");
    expect(page).toContain("if (contextLink) sectionLinks.push(contextLink)");
    expect(page).toContain("if (companyTarget)");
  });

  it("labels every context fallback for the section it actually targets", () => {
    expect(page).toContain(
      '{ href: "#listing-location", label: "Location" }',
    );
    expect(page).toContain('{ href: "#listing-life", label: "Life here" }');
    expect(page).toContain(
      '{ href: "#listing-connectivity", label: "Getting online" }',
    );
    expect(page).toContain('{ href: "#listing-maritime", label: "Vessel" }');
    expect(page).not.toContain(
      'sectionLinks.push({ href: locationTarget, label: "Location" })',
    );
  });

  it("orders the reading flow around deal, host, position, location, and company", () => {
    const deal = page.indexOf("<DealUpfront");
    const host = page.indexOf("<HostSummaryBlock");
    const position = page.indexOf("<ProseSection");
    const location = page.indexOf("<LocationContext");
    const weather = page.indexOf("<ListingWeatherSection");
    const company = page.indexOf("<WhyWorkForUs");
    const team = page.indexOf("<TeamGrid");

    for (const index of [deal, host, position, location, weather, company, team]) {
      expect(index).toBeGreaterThan(-1);
    }
    expect(deal).toBeLessThan(host);
    expect(host).toBeLessThan(position);
    expect(position).toBeLessThan(location);
    expect(location).toBeLessThan(weather);
    expect(weather).toBeLessThan(company);
    expect(company).toBeLessThan(team);

    expect(page).toContain('title="About the position"');
    expect(page).toContain("{hasLocation ? (");
  });

  it("preserves the Housing, Meals, Pay contract as the deal section", () => {
    const dealStart = page.indexOf("<DealUpfront");
    const dealEnd = page.indexOf("</DealUpfront>", dealStart);
    const deal = page.slice(dealStart, dealEnd);

    expect(deal).toContain("housingIncluded={listing.housingIncluded}");
    expect(deal).toContain("mealsIncluded={listing.mealsIncluded}");
    expect(deal).toContain("paySummary={paySummary}");
  });
});

describe("listing host, location, and weather truth", () => {
  const page = code(read("app/[locale]/listing/[id]/page.tsx"));
  const host = code(read("components/listing/HostSummaryBlock.tsx"));
  const location = code(read("components/listing/LocationContext.tsx"));
  const weather = code(read("components/listing/WeatherWidget.tsx"));
  const weatherSection = code(read("components/listing/ListingWeatherSection.tsx"));
  const weatherSource = code(read("lib/weather.ts"));

  it("offers a direct host-profile link", () => {
    expect(host).toContain('const profileHref = host.id ? `/host/${host.id}` : null');
    expect(host).toContain("href={profileHref}");
    expect(host).toContain("View host profile");
  });

  it("shows the stated location without requiring coordinates", () => {
    expect(location).toContain('title="About the location"');
    expect(location).toContain("locationDisplay?.trim() || null");
    expect(location).toContain("latitude != null && longitude != null");
    expect(location).toContain("{locationName ? (");
    expect(location).toContain("{coordinates ? (");
  });

  it("streams the listing while requesting an honest ten-day forecast", () => {
    expect(page).toContain("<Suspense");
    expect(page).toContain("<WeatherWidgetLoading");
    expect(page).not.toContain("await fetchWeather");
    expect(weatherSection).toContain("await fetchWeather(latitude, longitude)");
    expect(weatherSource).toContain('forecast_days: "10"');
    expect(weatherSource).toContain("Math.min(times.length, maxes.length, mins.length, codes.length)");
    expect(weather).toContain("outlook.days.length");
    expect(weather).toContain("The forecast isn&rsquo;t available right now.");
    expect(weather).toContain('headingId="listing-weather"');
    expect(weather).toContain("Loading the latest forecast&hellip;");
  });
});
