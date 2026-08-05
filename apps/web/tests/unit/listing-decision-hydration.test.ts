import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) =>
  readFileSync(new URL(relative, webRoot), "utf8");

describe("persisted listing decision hydration", () => {
  const seekPage = read("app/[locale]/(seeker)/seek/page.tsx");
  const seekBrowser = read("components/seeker/SeekBrowser.tsx");
  const mapData = read("components/discovery/data.ts");
  const mapPage = read("app/[locale]/(seeker)/map/page.tsx");
  const mapView = read("components/map/MapView.tsx");

  it("threads the authenticated saved and skipped snapshot into Seek", () => {
    expect(seekPage).toContain("getSavedListingIds(token, userId)");
    expect(seekPage).toContain("skippedListingIds = [...scope.skippedIds]");
    expect(seekPage).toContain(
      "initialSavedListingIds={initialSavedListingIds}",
    );
    expect(seekPage).toContain(
      "initialSkippedListingIds={initialSkippedListingIds}",
    );
    expect(seekBrowser).toContain(
      "useState<ReadonlySet<string>>(hydratedSavedIds)",
    );
    expect(seekBrowser).toContain(
      "useState<ReadonlySet<string>>(hydratedSkippedIds)",
    );
    expect(seekBrowser).toContain("setSavedIds(hydratedSavedIds)");
    expect(seekBrowser).toContain("setSkippedIds(hydratedSkippedIds)");
  });

  it("threads the authenticated saved and skipped snapshot into Map", () => {
    expect(mapData).toContain(
      "getSavedListingIds(clerkToken, clerkUserId)",
    );
    expect(mapData).toContain("skippedListingIds = [...scope.skippedIds]");
    expect(mapPage).toContain(
      "initialSavedListingIds={mapData.initialSavedListingIds}",
    );
    expect(mapPage).toContain(
      "initialSkippedListingIds={mapData.initialSkippedListingIds}",
    );
    expect(mapView).toContain("decisionsRef.current = next");
    expect(mapView).toContain("setDecisions(next)");
  });

  it("keeps anonymous and fixture data empty and resolves stale overlap to saved", () => {
    expect(
      mapData.match(/initialSavedListingIds: \[\]/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      mapData.match(/initialSkippedListingIds: \[\]/g)?.length,
    ).toBeGreaterThanOrEqual(2);

    const mapSkipped = mapView.indexOf(
      'for (const id of initialSkippedListingIds) next.set(id, "skipped")',
    );
    const mapSaved = mapView.indexOf(
      'for (const id of initialSavedListingIds) next.set(id, "saved")',
    );
    expect(mapSkipped).toBeGreaterThan(-1);
    expect(mapSaved).toBeGreaterThan(mapSkipped);
    expect(seekBrowser).toContain(
      "initialSkippedListingIds.filter((id) => !hydratedSavedIds.has(id))",
    );
  });
});
