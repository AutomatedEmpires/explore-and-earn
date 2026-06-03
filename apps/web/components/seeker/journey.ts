import type { OpportunityCategory } from "@explore-and-earn/contracts";

/**
 * Seeker Journey Map — LOCAL view model (Sprint Zero, no backend).
 *
 * A simple chronological record of where the seeker has been and where they are
 * going. UI-only; the persisted journey contract is founder-gated and not yet in
 * @explore-and-earn/contracts. Replace (or map from) it when it lands.
 */
export type JourneyStatus = "completed" | "in_progress" | "upcoming";

export const JOURNEY_STATUS_LABEL: Record<JourneyStatus, string> = {
	completed: "Completed",
	in_progress: "In progress",
	upcoming: "Upcoming",
};

export interface JourneyStop {
	readonly id: string;
	readonly title: string;
	readonly location: string;
	readonly category: OpportunityCategory;
	/** Human-readable window, e.g. "Aug–Oct 2025". */
	readonly dateRange: string;
	readonly status: JourneyStatus;
	readonly summary?: string;
}

export const JOURNEY_STOPS: readonly JourneyStop[] = [
	{
		id: "jrn_vineyard",
		title: "Vineyard Cellar Assistant",
		location: "Napa, California",
		category: "farm",
		dateRange: "Sep–Nov 2025",
		status: "completed",
		summary: "First harvest season — learned cellar operations end to end.",
	},
	{
		id: "jrn_lisbon",
		title: "Eco-Hostel Allrounder",
		location: "Lisbon, Portugal",
		category: "mix",
		dateRange: "Jan–Apr 2026",
		status: "completed",
		summary: "Front desk, events, and community dinners at a tiled eco-hostel.",
	},
	{
		id: "jrn_breck",
		title: "Ski Resort Front Desk",
		location: "Breckenridge, Colorado",
		category: "seasonal",
		dateRange: "Nov 2026–Apr 2027",
		status: "upcoming",
		summary: "Accepted role — winter season at Summit Pass Hospitality.",
	},
];
