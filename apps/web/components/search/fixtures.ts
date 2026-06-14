import type { SearchListing } from "./listing";

/**
 * Typed Search fixtures spanning all five marketplace lanes, with varied benefit
 * provision so the category and benefit filters visibly narrow the results.
 *
 * Cover imagery is intentionally omitted — DiscoveryCardData does not require it.
 */
export const SEARCH_FIXTURES: readonly SearchListing[] = [
	{
		id: "farm-vineyard-harvest",
		title: "Organic Vineyard Harvest Hand",
		hostName: "Cobblestone Ridge Vineyard",
		category: "farm",
		location: "Sonoma, CA",
		opportunityWindow: "Sep–Nov 2026",
		benefits: {
			housing: { provision: "provided", summary: "Private room on-site" },
			meals: { provision: "provided", summary: "3 meals/day during harvest" },
			pay: { provision: "provided", summary: "$22/hr" },
		},
		verifiedHost: true,
		conditionalBadges: ["boosted"],
	},
	{
		id: "farm-dairy-morning-crew",
		title: "Dairy Farm Morning Crew",
		hostName: "Greenfield Family Dairy",
		category: "farm",
		location: "Tillamook, OR",
		opportunityWindow: "Year-round",
		benefits: {
			housing: { provision: "provided", summary: "Shared bunkhouse" },
			meals: { provision: "partial", summary: "Lunch provided on shift" },
			pay: { provision: "provided", summary: "$20/hr" },
		},
	},
	{
		id: "maritime-whalewatch-deckhand",
		title: "Whale-Watch Charter Deckhand",
		hostName: "Inside Passage Charters",
		category: "maritime",
		location: "Juneau, AK",
		opportunityWindow: "May–Sep 2026",
		benefits: {
			housing: { provision: "provided", summary: "Crew quarters provided" },
			meals: { provision: "not_provided", summary: "Meals not included" },
			pay: { provision: "provided", summary: "$18/hr + tips" },
		},
		verifiedHost: true,
	},
	{
		id: "maritime-marina-dock-attendant",
		title: "Marina Dock Attendant",
		hostName: "Harborline Marina",
		category: "maritime",
		location: "Newport, RI",
		opportunityWindow: "Jun–Aug 2026",
		benefits: {
			housing: { provision: "not_provided", summary: "No housing" },
			meals: { provision: "not_provided", summary: "Meals not included" },
			pay: { provision: "provided", summary: "$19/hr" },
		},
	},
	{
		id: "remote-customer-support",
		title: "Customer Support Specialist",
		hostName: "Wanderwell Co.",
		category: "remote",
		location: "Remote · US",
		opportunityWindow: "Year-round",
		benefits: {
			housing: { provision: "not_provided", summary: "No housing" },
			meals: { provision: "not_provided", summary: "Meals not included" },
			pay: { provision: "provided", summary: "$24/hr" },
		},
		verifiedHost: true,
	},
	{
		id: "remote-travel-content-writer",
		title: "Travel Blog Content Writer",
		hostName: "Roamwise Media",
		category: "remote",
		location: "Remote · Global",
		opportunityWindow: "3-month contract",
		benefits: {
			housing: { provision: "not_provided", summary: "No housing" },
			meals: { provision: "not_provided", summary: "Meals not included" },
			pay: { provision: "partial", summary: "Monthly stipend + per-post bonus" },
		},
	},
	{
		id: "seasonal-ski-guest-services",
		title: "Ski Resort Guest Services",
		hostName: "Summit Peak Resort",
		category: "seasonal",
		location: "Breckenridge, CO",
		opportunityWindow: "Dec 2026–Mar 2027",
		benefits: {
			housing: { provision: "provided", summary: "On-site staff housing" },
			meals: { provision: "provided", summary: "Daily staff meals" },
			pay: { provision: "provided", summary: "$21/hr + season pass" },
		},
		verifiedHost: true,
		conditionalBadges: ["boosted"],
	},
	{
		id: "mix-eco-retreat-host",
		title: "Eco-Retreat Host & Trail Guide",
		hostName: "Selva Verde Retreat",
		category: "mix",
		location: "Tulum, MX",
		opportunityWindow: "Flexible · 1–3 months",
		benefits: {
			housing: { provision: "provided", summary: "Private cabana" },
			meals: { provision: "provided", summary: "Family-style meals" },
			pay: { provision: "not_provided", summary: "Work-exchange — no cash pay" },
		},
		conditionalBadges: ["boosted"],
	},
];
