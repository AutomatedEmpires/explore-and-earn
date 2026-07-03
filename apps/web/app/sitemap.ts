import type { MetadataRoute } from "next";

import { getPublicListings, getHostIdsWithLiveListings } from "@explore-and-earn/db";

import { getEditorialPosts } from "../lib/editorial";

export const dynamic = "force-dynamic";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/seek`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/search`, changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/for-hosts`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/blog`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/cookies`, changeFrequency: "monthly", priority: 0.2 },
  ];

  const blogEntries: MetadataRoute.Sitemap = getEditorialPosts().map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.publishedAt,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  let listingEntries: MetadataRoute.Sitemap = [];
  let hostEntries: MetadataRoute.Sitemap = [];

  try {
    const [listings, hostIds] = await Promise.all([
      // Sitemap wants near-complete URL coverage, so it overrides the feed's
      // default candidate cap with a large explicit ceiling.
      getPublicListings(5000),
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

  return [...staticEntries, ...blogEntries, ...listingEntries, ...hostEntries];
}
