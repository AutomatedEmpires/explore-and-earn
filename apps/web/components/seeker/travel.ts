import type { OpportunityCategory } from "@explore-and-earn/contracts";

/**
 * Seeker Travel Plans — LOCAL view model (Sprint Zero, no backend).
 *
 * Pre-trip planning for accepted roles, plus any travel snippets a host has
 * shared. UI-only; the persisted travel contract is founder-gated and not yet
 * in @explore-and-earn/contracts. The status values extend the seeker lifecycle
 * TravelPlanStatus ("not_started" | "shared") with a richer "booked" state for
 * display. Replace (or map from) the canonical contract when it lands.
 */
export type TravelStatus = "not_started" | "shared" | "booked";

export const TRAVEL_STATUS_LABEL: Record<TravelStatus, string> = {
	not_started: "Not started",
	shared: "Host shared details",
	booked: "Travel booked",
};

export interface TravelPlan {
	readonly id: string;
	readonly listingTitle: string;
	readonly hostName: string;
	readonly category: OpportunityCategory;
	readonly destination: string;
	readonly startDate: string;
	readonly status: TravelStatus;
	/** Optional travel snippet shared by the host. */
	readonly hostNote?: string;
}

export const TRAVEL_PLANS: readonly TravelPlan[] = [
	{
		id: "trv_breck",
		listingTitle: "Ski Resort Front Desk",
		hostName: "Summit Pass Hospitality",
		category: "seasonal",
		destination: "Breckenridge, Colorado",
		startDate: "Nov 14, 2026",
		status: "shared",
		hostNote:
			"Nearest airport is DEN; the staff shuttle runs from the terminal on arrival days.",
	},
	{
		id: "trv_sitka",
		listingTitle: "Deckhand — Salmon Season",
		hostName: "North Pacific Fisheries Co-op",
		category: "maritime",
		destination: "Sitka, Alaska",
		startDate: "Jun 10, 2026",
		status: "not_started",
	},
];
