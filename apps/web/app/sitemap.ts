import type { MetadataRoute } from "next";

import { getPublicListings, getHostIdsWithLiveListings } from "@explore-and-earn/db";

import { LANDING_CATEGORIES, categoryLandingPath } from "../lib/categoryLanding";
import { getEditorialPosts } from "../lib/editorial";

export const dynamic = "force-dynamic";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/seek`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/map`, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/search`, changeFrequency: "daily", priority: 0.7 },
    // Category landing pages — the indexable non-brand keyword surface.
    { url: `${baseUrl}/jobs`, changeFrequency: "daily", priority: 0.8 },
    ...LANDING_CATEGORIES.map((category) => ({
      url: `${baseUrl}${categoryLandingPath(category)}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    // The two role gateways (V2 D18). /for-seekers is the seeker door and the
    // canonical answer to "what is this for me", so it belongs in the index
    // alongside its host counterpart. /community is deliberately ABSENT: it
    // became an authenticated seeker space and now redirects a crawler to
    // sign-in, so listing it would advertise a URL no bot can read.
    { url: `${baseUrl}/for-seekers`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/for-hosts`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/blog`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/sourced-listings`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/cookies`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${baseUrl}/refunds`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${baseUrl}/credits`, changeFrequency: "monthly", priority: 0.2 },
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
