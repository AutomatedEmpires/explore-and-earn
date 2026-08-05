/**
 * Canonical identities for discovery fixtures. Keeping these in a tiny module
 * lets client viewers recognise known local evidence without bundling the full
 * fixture catalogue into production UI code.
 */
export const DISCOVERY_FIXTURE_IDS = {
  orchardWenatchee: "lst_orchard_wenatchee",
  deckhandSitka: "lst_deckhand_sitka",
  remoteCommunity: "lst_remote_community",
  skiResortBreck: "lst_ski_resort_breck",
  ecoHostelLisbon: "lst_eco_hostel_lisbon",
  vineyardNapa: "lst_vineyard_napa",
  sourcedKelpFarm: "lst_sourced_kelp_farm",
} as const;

const KNOWN_DISCOVERY_FIXTURE_IDS: ReadonlySet<string> = new Set(
  Object.values(DISCOVERY_FIXTURE_IDS),
);

/** Known catalogue identity only; this function grants no runtime permission. */
export function isKnownDiscoveryFixtureId(
  listingId: string | undefined,
): boolean {
  return (
    typeof listingId === "string" &&
    KNOWN_DISCOVERY_FIXTURE_IDS.has(listingId)
  );
}

/**
 * Fixture evidence is authoritative only in a non-production build. Production
 * and unknown ids must continue through the public read and fail closed.
 */
export function isKnownDevDiscoveryFixtureId(
  listingId: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production" && isKnownDiscoveryFixtureId(listingId);
}
