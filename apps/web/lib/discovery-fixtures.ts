import type { DiscoveryOpportunity } from "@explore-and-earn/ui"

/**
 * Demo-only fixtures for the discovery feed. These are static display strings,
 * NOT a data model: no persistence, no schema, no matching. The real data layer
 * remains founder-gated. Lanes mirror the five locked categories; "lodge" is a
 * setting under the seasonal lane, never its own category.
 */

export interface FeedLane {
	readonly category: DiscoveryOpportunity["category"]
	readonly title: string
}

export const FEED_LANES: readonly FeedLane[] = [
	{ category: "farm", title: "Farm & Orchard" },
	{ category: "maritime", title: "Maritime & Fisheries" },
	{ category: "remote", title: "Remote" },
	{ category: "seasonal", title: "Seasonal & Lodge" },
	{ category: "mix", title: "Mix & Multi-Category" },
]

export const DISCOVERY_FIXTURES: readonly DiscoveryOpportunity[] = [
	{
		id: "farm-001",
		category: "farm",
		jobTitle: "Orchard Harvest Hand",
		hostName: "Wandering Roots Farm",
		location: "Hood River, OR",
		opportunityWindow: "Aug – Oct 2026",
		triad: {
			housing: "Private cabin on-site",
			meals: "3 farm-grown meals daily",
			pay: "$18/hr + harvest bonus",
		},
		verifiedHost: true,
		conditionalBadges: ["featured"],
	},
	{
		id: "farm-002",
		category: "farm",
		jobTitle: "Greenhouse Grower",
		hostName: "Still Creek Gardens",
		location: "Asheville, NC",
		opportunityWindow: "Year-round",
		triad: {
			housing: "Shared farmhouse room",
			meals: "Produce + weekly stipend",
			pay: "$18.50/hr",
		},
		verifiedHost: true,
	},
	{
		id: "maritime-001",
		category: "maritime",
		jobTitle: "Deckhand — Salmon Season",
		hostName: "Kachemak Bay Charters",
		location: "Homer, AK",
		opportunityWindow: "Jun – Sep 2026",
		triad: {
			housing: "Bunk aboard vessel",
			meals: "All meals at sea",
			pay: "Crew share (~$9k/season)",
		},
		verifiedHost: true,
		conditionalBadges: ["boosted"],
	},
	{
		id: "maritime-002",
		category: "maritime",
		jobTitle: "Dock & Marina Attendant",
		hostName: "Friday Harbor Marine",
		location: "San Juan Island, WA",
		opportunityWindow: "May – Sep 2026",
		triad: {
			housing: "Staff dorm, walk to dock",
			meals: "Galley lunch provided",
			pay: "$20/hr",
		},
		verifiedHost: false,
	},
	{
		id: "remote-001",
		category: "remote",
		jobTitle: "Off-Grid Lodge Caretaker",
		hostName: "North Fork Retreat",
		location: "Methow Valley, WA",
		opportunityWindow: "Oct 2026 – Mar 2027",
		triad: {
			housing: "Private caretaker cabin",
			meals: "Stocked pantry + stipend",
			pay: "$2,800/mo",
		},
		verifiedHost: true,
	},
	{
		id: "seasonal-001",
		category: "seasonal",
		jobTitle: "Ski Lodge Front Desk",
		hostName: "Timberline Lodge Co.",
		location: "Government Camp, OR",
		opportunityWindow: "Dec 2026 – Apr 2027",
		triad: {
			housing: "On-mountain staff housing",
			meals: "Shift meals + lift pass",
			pay: "$19/hr + season pass",
		},
		verifiedHost: true,
		conditionalBadges: ["seasonal"],
	},
	{
		id: "mix-001",
		category: "mix",
		jobTitle: "Eco-Ranch Host & Trail Guide",
		hostName: "High Desert Collective",
		location: "Moab, UT",
		opportunityWindow: "Mar – Nov 2026",
		triad: {
			housing: "Furnished yurt",
			meals: "Communal kitchen + stipend",
			pay: "$17/hr + tips",
		},
		verifiedHost: true,
		conditionalBadges: ["featured", "boosted"],
	},
]
