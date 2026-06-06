import type { MetadataRoute } from "next";

import { getPublicListings } from "@explore-and-earn/db";

// Listing ids are read from Supabase at request time. force-dynamic avoids
// build-time evaluation of NEXT_PUBLIC_SUPABASE_URL, mirroring the listing
// detail route’s rationale.
export const dynamic = "force-dynamic";

const baseUrl =
	process.env.NEXT_PUBLIC_APP_URL ?? "https://explore-and-earn.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const staticEntries: MetadataRoute.Sitemap = [
		{ url: `${baseUrl}/`, changeFrequency: "daily", priority: 1 },
		{ url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.5 },
		{ url: `${baseUrl}/terms`, changeFrequency: "monthly", priority: 0.3 },
		{ url: `${baseUrl}/privacy`, changeFrequency: "monthly", priority: 0.3 },
	];

	let listingEntries: MetadataRoute.Sitemap = [];
	try {
		const listings = await getPublicListings();
		listingEntries = listings.map((listing) => ({
			url: `${baseUrl}/listing/${listing.id}`,
			changeFrequency: "weekly" as const,
			priority: 0.7,
		}));
	} catch {
		// If listings can’t be fetched (e.g. env not configured), still emit the
		// static entries rather than failing the whole sitemap.
		listingEntries = [];
	}

	return [...staticEntries, ...listingEntries];
}
