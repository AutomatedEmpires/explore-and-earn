export interface PublicHostLocationListing {
  readonly locationDisplay?: string | null;
}

export interface PublicHostLocationPoint {
  readonly label: string;
  readonly mapsUrl: string | null;
}

export interface PublicHostOpportunityLocation extends PublicHostLocationPoint {
  readonly opportunityCount: number;
}

export interface PublicHostLocationContext {
  readonly hostBase: PublicHostLocationPoint | null;
  readonly opportunityLocations: readonly PublicHostOpportunityLocation[];
}

function normalizeLocation(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function mapsUrlFor(location: string): string | null {
  // "Remote" is useful persisted context, but it is not a truthful map target.
  if (/\bremote\b/i.test(location)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

/**
 * Build public host location context from fields already returned by the host
 * profile and its live listings. There is deliberately no inferred geography,
 * fake map pin, weather lookup, or distance claim in this adapter.
 */
export function buildPublicHostLocationContext(
  primaryLocationName: string | null | undefined,
  listings: readonly PublicHostLocationListing[],
): PublicHostLocationContext | null {
  const hostBaseLabel = normalizeLocation(primaryLocationName);
  const hostBase = hostBaseLabel
    ? { label: hostBaseLabel, mapsUrl: mapsUrlFor(hostBaseLabel) }
    : null;

  const locations = new Map<
    string,
    { label: string; opportunityCount: number }
  >();
  for (const listing of listings) {
    const label = normalizeLocation(listing.locationDisplay);
    if (!label) continue;
    const key = label.toLocaleLowerCase("en-US");
    const current = locations.get(key);
    if (current) {
      current.opportunityCount += 1;
    } else {
      locations.set(key, { label, opportunityCount: 1 });
    }
  }

  const opportunityLocations = Array.from(locations.values(), (location) => ({
    ...location,
    mapsUrl: mapsUrlFor(location.label),
  }));

  if (!hostBase && opportunityLocations.length === 0) return null;
  return { hostBase, opportunityLocations };
}
