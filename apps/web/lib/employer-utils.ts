import type { DiscoveryListing } from "../components/discovery/listing";
import type { FeaturedEmployer } from "../components/public/FeaturedEmployersRail";

/**
 * Fisher-Yates shuffle — in-place, mutates the input array.
 * Called server-side on every request so every user gets a fresh ordering,
 * ensuring paid boosted employers share first-position impressions fairly.
 */
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j] as T;
    arr[j] = tmp as T;
  }
  return arr;
}

/**
 * Collapses listings by host name → one FeaturedEmployer per host (listing
 * count is the sum across all of that host's live listings), then shuffles
 * so no single employer holds the first-rail slot by default.
 *
 * TODO(paid-boost): replace the input with a `getFeaturedEmployers()` DB
 * query against a `featured_employer_boosts` table so only paying hosts
 * appear in this rail, ordered by boost tier then shuffled within tier.
 */
export function buildFeaturedEmployers(
  listings: readonly DiscoveryListing[],
  limit = 6,
): FeaturedEmployer[] {
  type Acc = { employer: FeaturedEmployer; count: number };
  const grouped = new Map<string, Acc>();

  for (const listing of listings) {
    const key = listing.host.name;
    const existing = grouped.get(key);
    if (existing) {
      grouped.set(key, {
        ...existing,
        employer: {
          ...existing.employer,
          listingCount: existing.employer.listingCount + 1,
        },
      });
      continue;
    }
    grouped.set(key, {
      employer: {
        hostName:      listing.host.name,
        hostId:        listing.host.id,
        listingId:     listing.id,
        location:      listing.location,
        listingCount:  1,
        verified:      listing.host.verified,
        tagline:       listing.host.tagline,
        coverImageUrl: listing.coverImageUrl,
        category:      listing.category,
      },
      count: 1,
    });
  }

  const employers = Array.from(grouped.values()).map((a) => a.employer);
  return shuffleInPlace(employers).slice(0, limit);
}
