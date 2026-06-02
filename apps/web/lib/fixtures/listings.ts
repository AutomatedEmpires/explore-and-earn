/**
 * Canonical UI fixtures — lead-owned, read-only for all feature lanes.
 *
 * Display strings only; see ./types.ts for scope + the founder gate note.
 * Categories are restricted to the locked taxonomy
 * (farm · maritime · remote · seasonal · mix); lodge is a Seasonal setting.
 */
import type {
	DiscoveryCardViewModel,
	ListingDetailViewModel,
} from "./types"

/** The canonical Verified-Host qualifier string (guardrail G22). */
const VERIFIED_QUALIFIER = "Self-Declared by Host" as const

export const listingFixtures: readonly ListingDetailViewModel[] = [
	{
		card: {
			id: "lst_farm_cedar_hollow",
			heroPhoto: {
				url: "https://picsum.photos/seed/cedarhollow/1200/800",
				alt: "Rows of vegetables at golden hour on Cedar Hollow Farm",
			},
			host: {
				id: "host_cedar_hollow",
				name: "Cedar Hollow Farm",
				avatar: {
					url: "https://picsum.photos/seed/cedarhollowhost/200/200",
					alt: "Cedar Hollow Farm logo",
				},
				verifiedQualifier: VERIFIED_QUALIFIER,
			},
			jobTitle: "Harvest & Market Crew",
			location: "Sonoma County, California",
			opportunityWindow: "Jun – Oct 2026",
			category: "farm",
			triad: {
				housing: "Private room in the farmhouse",
				meals: "3 farm-to-table meals daily",
				pay: "$16/hr + weekly produce share",
			},
			conditionalBadges: ["seasonal"],
		},
		summary:
			"Join a small regenerative farm for the summer harvest — hands in the soil, evenings at the market.",
		description: [
			"Cedar Hollow is a 40-acre regenerative vegetable farm an hour north of San Francisco.",
			"You'll help with morning harvests, washing and packing, and selling at two weekly farmers' markets.",
			"Expect early starts, real skills, and a tight-knit crew that shares every meal together.",
		],
		gallery: [
			{
				url: "https://picsum.photos/seed/cedarfield/1000/700",
				alt: "Crew harvesting greens in the morning",
			},
			{
				url: "https://picsum.photos/seed/cedarmarket/1000/700",
				alt: "Farmers' market stall with produce",
			},
		],
		benefits: {
			housing: { provision: "provided", summary: "Private room in the farmhouse" },
			meals: { provision: "provided", summary: "3 farm-to-table meals daily" },
			pay: { provision: "provided", summary: "$16/hr + weekly produce share" },
		},
		housingEvidence: [
			{
				url: "https://picsum.photos/seed/cedarroom/900/600",
				alt: "Private bedroom in the farmhouse",
			},
		],
		mealsEvidence: [
			{
				url: "https://picsum.photos/seed/cedarmeal/900/600",
				alt: "Shared dinner on the farmhouse porch",
			},
		],
		host: {
			id: "host_cedar_hollow",
			name: "Cedar Hollow Farm",
			avatar: {
				url: "https://picsum.photos/seed/cedarhollowhost/200/200",
				alt: "Cedar Hollow Farm logo",
			},
			verifiedQualifier: VERIFIED_QUALIFIER,
			tagline: "Regenerative farming, shared at the table",
			bio: "A family-run regenerative farm hosting seasonal crew since 2014. We teach as we grow.",
			location: "Sonoma County, California",
			listingIds: ["lst_farm_cedar_hollow"],
		},
	},
	{
		card: {
			id: "lst_maritime_blue_current",
			heroPhoto: {
				url: "https://picsum.photos/seed/schooner/1200/800",
				alt: "Schooner under full sail off the Maine coast",
			},
			host: {
				id: "host_blue_current",
				name: "Blue Current Sailing Co.",
				avatar: {
					url: "https://picsum.photos/seed/bluecurrenthost/200/200",
					alt: "Blue Current Sailing Co. logo",
				},
				verifiedQualifier: VERIFIED_QUALIFIER,
			},
			jobTitle: "Deckhand & Guest Crew",
			location: "Bar Harbor, Maine",
			opportunityWindow: "May – Sep 2026",
			category: "maritime",
			triad: {
				housing: "Bunk aboard the schooner",
				meals: "All meals aboard",
				pay: "$16/hr + tips",
			},
			conditionalBadges: ["featured"],
			matchScore: 92,
		},
		summary:
			"Crew a classic schooner running day sails and overnight charters along the Maine coast.",
		description: [
			"Blue Current runs a restored 1920s schooner out of Bar Harbor from late spring through early fall.",
			"You'll learn line handling, sail trim, and guest hospitality — no prior experience required, just sea legs and a good attitude.",
			"Nights are spent aboard or at quiet anchorages along Frenchman Bay.",
		],
		gallery: [
			{
				url: "https://picsum.photos/seed/deckwork/1000/700",
				alt: "Deckhand trimming a sail",
			},
			{
				url: "https://picsum.photos/seed/harbor/1000/700",
				alt: "Schooner at anchor at sunset",
			},
		],
		benefits: {
			housing: { provision: "provided", summary: "Bunk aboard the schooner" },
			meals: { provision: "provided", summary: "All meals aboard" },
			pay: { provision: "provided", summary: "$16/hr + tips" },
		},
		housingEvidence: [
			{
				url: "https://picsum.photos/seed/bunk/900/600",
				alt: "Crew bunk below deck",
			},
		],
		mealsEvidence: [
			{
				url: "https://picsum.photos/seed/galley/900/600",
				alt: "Meal served in the galley",
			},
		],
		host: {
			id: "host_blue_current",
			name: "Blue Current Sailing Co.",
			avatar: {
				url: "https://picsum.photos/seed/bluecurrenthost/200/200",
				alt: "Blue Current Sailing Co. logo",
			},
			verifiedQualifier: VERIFIED_QUALIFIER,
			tagline: "Wind, tide, and good company",
			bio: "A two-boat sailing outfit on the Maine coast crewing classic schooners with seasonal hands.",
			location: "Bar Harbor, Maine",
			listingIds: ["lst_maritime_blue_current"],
		},
	},
	{
		card: {
			id: "lst_seasonal_timberline",
			heroPhoto: {
				url: "https://picsum.photos/seed/timberline/1200/800",
				alt: "Snow-covered mountain lodge at dusk",
			},
			host: {
				id: "host_timberline",
				name: "Timberline Lodge",
				avatar: {
					url: "https://picsum.photos/seed/timberlinehost/200/200",
					alt: "Timberline Lodge crest",
				},
				verifiedQualifier: VERIFIED_QUALIFIER,
			},
			jobTitle: "Winter Hospitality Crew",
			location: "Aspen, Colorado",
			opportunityWindow: "Dec 2026 – Mar 2027",
			category: "seasonal",
			triad: {
				housing: "Shared staff cabin",
				meals: "Meals during shifts",
				pay: "$18/hr + season lift pass",
			},
			conditionalBadges: ["seasonal", "boosted"],
			boosted: true,
		},
		summary:
			"Spend a winter season running front-of-house at a mountain lodge — lift pass included.",
		description: [
			"Timberline Lodge sits slopeside in the Colorado Rockies and runs a full winter season.",
			"You'll rotate across front desk, dining, and guest services while learning resort hospitality.",
			"Staff get a season lift pass, shared cabin housing, and meals on every shift.",
		],
		gallery: [
			{
				url: "https://picsum.photos/seed/lodgeinterior/1000/700",
				alt: "Warm lodge common room with fireplace",
			},
			{
				url: "https://picsum.photos/seed/slopes/1000/700",
				alt: "Ski slopes above the lodge",
			},
		],
		benefits: {
			housing: { provision: "provided", summary: "Shared staff cabin" },
			meals: { provision: "partial", summary: "Meals provided during shifts" },
			pay: { provision: "provided", summary: "$18/hr + season lift pass" },
		},
		housingEvidence: [
			{
				url: "https://picsum.photos/seed/staffcabin/900/600",
				alt: "Shared staff cabin interior",
			},
		],
		mealsEvidence: [
			{
				url: "https://picsum.photos/seed/lodgemeal/900/600",
				alt: "Staff meal in the lodge kitchen",
			},
		],
		host: {
			id: "host_timberline",
			name: "Timberline Lodge",
			avatar: {
				url: "https://picsum.photos/seed/timberlinehost/200/200",
				alt: "Timberline Lodge crest",
			},
			verifiedQualifier: VERIFIED_QUALIFIER,
			tagline: "A full winter in the Rockies",
			bio: "A slopeside lodge hosting a seasonal hospitality crew each winter with housing and a lift pass.",
			location: "Aspen, Colorado",
			listingIds: ["lst_seasonal_timberline"],
		},
	},
]

/** Card view-models derived from the listing fixtures (feed / grid surfaces). */
export const cardFixtures: readonly DiscoveryCardViewModel[] =
	listingFixtures.map((listing) => listing.card)

/** Look up a single listing fixture by its card id. */
export function getListingFixtureById(
	id: string,
): ListingDetailViewModel | undefined {
	return listingFixtures.find((listing) => listing.card.id === id)
}
