import type {
	BenefitTriad,
	ListingMedia,
	ListingStatus,
	MarketplaceCategory,
} from "@explore-and-earn/contracts"

import type { ListingHostSummary } from "./HostSummaryBlock"

export interface ListingDetailData {
	readonly id: string
	readonly title: string
	readonly category: MarketplaceCategory
	readonly status: ListingStatus
	readonly location: string
	readonly opportunityWindow: string
	readonly description: readonly string[]
	readonly gallery: readonly ListingMedia[]
	readonly benefits: BenefitTriad
	readonly host: ListingHostSummary
	readonly matchScore?: number
}

const SUNRISE_ORCHARD: ListingDetailData = {
	id: "sunrise-orchard",
	title: "Orchard Hand at Sunrise Valley",
	category: "farm",
	status: "live",
	location: "Hood River, Oregon",
	opportunityWindow: "August – October 2026",
	description: [
		"Sunrise Valley is a family-run pear and apple orchard in the Columbia River Gorge. We host a small crew each harvest to bring in the fruit, run the packing line, and keep the place humming.",
		"Days start early and finish mid-afternoon, leaving long evenings free for the river, the trails, and shared meals on the porch. No experience is required — just a willingness to learn and work alongside the family.",
		"This is hands-on outdoor work in a beautiful setting, ideal for someone who wants to trade city pace for orchard rhythm for a season.",
	],
	gallery: [
		{
			id: "so-cover",
			bucket: "cover_photo",
			masterPath: "/fixtures/listings/sunrise-orchard/cover.jpg",
			width: 1600,
			height: 1200,
			alt: "Rows of pear trees catching first light at Sunrise Valley",
		},
		{
			id: "so-housing",
			bucket: "housing",
			masterPath: "/fixtures/listings/sunrise-orchard/bunkhouse.jpg",
			width: 1600,
			height: 1200,
			alt: "Timber bunkhouse with shared sleeping quarters",
		},
		{
			id: "so-meals",
			bucket: "meals",
			masterPath: "/fixtures/listings/sunrise-orchard/table.jpg",
			width: 1600,
			height: 1200,
			alt: "Communal dinner laid out on the farmhouse porch",
		},
		{
			id: "so-facilities",
			bucket: "facilities",
			masterPath: "/fixtures/listings/sunrise-orchard/packing-barn.jpg",
			width: 1600,
			height: 1200,
			alt: "Packing barn with fruit sorting line",
		},
	],
	benefits: {
		housing: {
			provision: "provided",
			summary: "Private bunk in a shared timber bunkhouse; linens and laundry included.",
		},
		meals: {
			provision: "partial",
			summary: "Breakfast and a packed lunch on working days; shared kitchen stocked for dinners.",
		},
		pay: {
			provision: "provided",
			summary: "$18/hour plus a harvest-completion bonus paid at season end.",
		},
	},
	host: {
		id: "sunrise-valley-collective",
		name: "Sunrise Valley Collective",
		location: "Hood River, Oregon",
		verified: true,
		tagline: "Three generations growing pears and apples in the Columbia Gorge.",
		avatar: {
			masterPath: "/fixtures/hosts/sunrise-valley-collective/avatar.jpg",
			width: 480,
			height: 480,
			alt: "The Sunrise Valley Collective crew at the orchard gate",
		},
	},
	matchScore: 88,
}

const SALTLINE_DECKHAND: ListingDetailData = {
	id: "saltline-deckhand",
	title: "Deckhand aboard the Saltline Charter",
	category: "maritime",
	status: "live",
	location: "Sitka, Alaska",
	opportunityWindow: "May – September 2026",
	description: [
		"Saltline runs small-boat fishing and sightseeing charters out of Sitka. We are looking for a deckhand to help guests aboard, rig lines, handle the catch, and keep the vessel shipshape.",
		"You will learn the water, the weather, and the work from a tight two-person crew. Sea legs help, but a steady attitude and early mornings matter more.",
		"Expect physical days on the water and quiet evenings in one of Alaska's most beautiful harbor towns.",
	],
	gallery: [
		{
			id: "sl-cover",
			bucket: "cover_photo",
			masterPath: "/fixtures/listings/saltline-deckhand/cover.jpg",
			width: 1600,
			height: 1200,
			alt: "The Saltline charter boat moored against forested Alaskan shoreline",
		},
		{
			id: "sl-housing",
			bucket: "housing",
			masterPath: "/fixtures/listings/saltline-deckhand/berth.jpg",
			width: 1600,
			height: 1200,
			alt: "Compact cabin berth aboard the vessel",
		},
		{
			id: "sl-facilities",
			bucket: "facilities",
			masterPath: "/fixtures/listings/saltline-deckhand/deck.jpg",
			width: 1600,
			height: 1200,
			alt: "Open working deck with rigging and tackle",
		},
	],
	benefits: {
		housing: {
			provision: "provided",
			summary: "Cabin berth aboard the vessel for the season.",
		},
		meals: {
			provision: "provided",
			summary: "All meals aboard provided from the galley on charter days.",
		},
		pay: {
			provision: "provided",
			summary: "Daily rate plus a share of each successful catch.",
		},
	},
	host: {
		id: "saltline-charters",
		name: "Saltline Charters",
		location: "Sitka, Alaska",
		verified: false,
		tagline: "A small-boat charter crew on big Alaskan water.",
	},
	matchScore: 71,
}

const LISTINGS: ReadonlyArray<ListingDetailData> = [SUNRISE_ORCHARD, SALTLINE_DECKHAND]

export const LISTING_FIXTURES: ReadonlyArray<ListingDetailData> = LISTINGS

export function getListingFixture(id: string): ListingDetailData | undefined {
	return LISTINGS.find((listing) => listing.id === id)
}
