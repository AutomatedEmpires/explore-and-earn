import type { PublicListingDetail } from "@explore-and-earn/db";

import type { DiscoveryListing } from "./listing";
import { DISCOVERY_FIXTURES } from "./fixtures";

/**
 * Resolve a fixture id (lst_*) to the public listing-detail shape so the
 * dev/preview discover → inspect journey works end-to-end on fixture
 * inventory instead of dead-ending at the route error boundary.
 *
 * NEVER serves production traffic: fixture ids are non-UUIDs, which cannot
 * exist in the DB, and the NODE_ENV gate below refuses them in production
 * outright — an unknown id there is an honest 404.
 */
export function getFixtureListingDetail(id: string): PublicListingDetail | null {
	if (process.env.NODE_ENV === "production") return null;
	const fixture = DISCOVERY_FIXTURES.find((listing) => listing.id === id);
	return fixture ? toDetail(fixture) : null;
}

function toIso(display: string | undefined): string | null {
	if (!display) return null;
	const parsed = Date.parse(display);
	return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function toDetail(f: DiscoveryListing): PublicListingDetail {
	const provided = (p: string | undefined) => p === "provided" || p === "partial";
	return {
		id: f.id,
		title: f.title,
		category: f.category,
		description: f.host.tagline ?? null,
		locationDisplay: f.location,
		latitude: f.coordinates?.lat ?? null,
		longitude: f.coordinates?.lon ?? null,
		status: "live",
		housingIncluded: provided(f.benefits.housing.provision),
		mealsIncluded: provided(f.benefits.meals.provision),
		compensationSummary: f.benefits.pay.summary ?? null,
		compensationMinCents: f.payInsight?.minCents ?? null,
		compensationMaxCents: f.payInsight?.maxCents ?? null,
		compensationUnit: f.payInsight?.unit ?? null,
		compensationCurrency: f.payInsight?.currency ?? "USD",
		timelineSummary: f.opportunityWindow ?? null,
		beginsAt: toIso(f.begins),
		endsAt: toIso(f.ends),
		publishedAt: toIso(f.begins),
		coverPhotoUrl: f.coverImageUrl ?? null,
		galleryPhotoUrls: [],
		hostProfileId: null,
		host: {
			// Fixture hosts have no public profile row — the empty id tells
			// host-link renderers to skip the link.
			id: "",
			companyName: f.host.name,
			photoUrl: null,
			about: f.host.tagline ?? null,
			primaryLocationName: f.location,
			verified: f.host.verified === true,
		},
	};
}
