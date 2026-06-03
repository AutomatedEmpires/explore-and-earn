import type { OpportunityCategory } from "@explore-and-earn/contracts";
import type { IconKey } from "@explore-and-earn/ui";

/**
 * Canonical geographic map-pin icon per opportunity category.
 * Shared by OpportunityMap (/map) and JourneyTimeline (/journey) so the two
 * surfaces can never drift. Never use the deprecated mappin.location.
 */
export const MAPPIN_ICON: Record<OpportunityCategory, IconKey> = {
	farm: "mappin.farm",
	maritime: "mappin.maritime",
	remote: "mappin.remote",
	seasonal: "mappin.seasonal",
	mix: "mappin.mix",
};
