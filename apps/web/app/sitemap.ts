import type { MetadataRoute } from "next";

import { getPublicListings, getHostIdsWithLiveListings } from "@explore-and-earn/db";

export const dynamic = "force-dynamic";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/seek`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/cookies`, changeFrequency: "monthly", priority: 0.2 },
  ];

  let listingEntries: MetadataRoute.Sitemap = [];
  let hostEntries: MetadataRoute.Sitemap = [];

  try {
    const [listings, hostIds] = await Promise.all([
      getPublicListings(),
      getHostIdsWithLiveListings(),
    ]);

    listingEntries = listings.map((listing) => ({
      url: `${baseUrl}/listing/${listing.id}`,
      lastModified: listing.published_at ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

    hostEntries = hostIds.map((hostId) => ({
      url: `${baseUrl}/host/${hostId}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // If queries fail (e.g. env not configured), still emit static entries.
  }

  return [...staticEntries, ...listingEntries, ...hostEntries];
}
