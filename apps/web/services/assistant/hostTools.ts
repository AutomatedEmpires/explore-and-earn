import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  getHostApplications,
  getHostListings,
  getMatchScoresForHost,
  matchScoreKey,
} from "@explore-and-earn/db";

/**
 * Host assistant tools — the listing-coach + applicant-ranking trust boundary.
 *
 * Identity ({ token, userId }) is CLOSED OVER at construction. Every tool acts
 * only as the authenticated host via the same RLS-scoped services the host
 * dashboard uses, so it can only ever see this host's own listings/applicants.
 * All tools are read-only — the assistant coaches and drafts; the host acts.
 */

export interface HostToolContext {
  readonly token: string;
  readonly userId: string;
}

type HostListing = Awaited<ReturnType<typeof getHostListings>>[number];

/** Concrete HOUSING/MEALS/PAY + copy gaps for a listing (what to coach). */
function listingGaps(listing: HostListing): string[] {
  const gaps: string[] = [];
  const description = listing.description?.trim() ?? "";
  if (description.length < 60) {
    gaps.push("a fuller description — a few sentences on the work AND the place/lifestyle");
  }
  if (listing.housing_included && !listing.housing_description?.trim()) {
    gaps.push("HOUSING details — where and what they'll sleep in");
  }
  if (listing.meals_included && !listing.meals_description?.trim()) {
    gaps.push("MEALS details — what food is actually provided");
  }
  if (listing.compensation_min_cents == null) {
    gaps.push("a PAY figure — an upfront number, not 'competitive'");
  }
  if (!listing.begins_at) {
    gaps.push("a start date");
  }
  return gaps;
}

export function buildHostTools(ctx: HostToolContext): ToolSet {
  return {
    my_listings: tool({
      description:
        "List THIS host's own listings (all statuses: draft, live, etc.). Use to see what they have before reviewing one.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await getHostListings(ctx.token, ctx.userId);
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          category: row.category,
          housingIncluded: row.housing_included,
          mealsIncluded: row.meals_included,
          payMinCents: row.compensation_min_cents,
          begins: row.begins_at,
        }));
      },
    }),

    review_listing: tool({
      description:
        "Review ONE of the host's listings (by id) for quality. Returns the listing's fields plus a concrete `gaps` list (missing HOUSING/MEALS/PAY info, weak copy). Coach the specific gaps — offer improved copy the host can paste.",
      inputSchema: z.object({ listingId: z.string() }),
      execute: async ({ listingId }) => {
        const rows = await getHostListings(ctx.token, ctx.userId);
        const listing = rows.find((row) => row.id === listingId);
        if (!listing) return { error: "listing_not_found" as const };
        return {
          title: listing.title,
          status: listing.status,
          category: listing.category,
          description: listing.description,
          housingIncluded: listing.housing_included,
          housingDescription: listing.housing_description,
          mealsIncluded: listing.meals_included,
          mealsDescription: listing.meals_description,
          payMinCents: listing.compensation_min_cents,
          payMaxCents: listing.compensation_max_cents,
          begins: listing.begins_at,
          ends: listing.ends_at,
          gaps: listingGaps(listing),
        };
      },
    }),

    top_applicants: tool({
      description:
        "Rank THIS host's applicants for a listing (by id) by real ADR-040 match fit (band + score), best fit first. Use to answer 'who fits best / who should I look at'.",
      inputSchema: z.object({ listingId: z.string() }),
      execute: async ({ listingId }) => {
        const [applications, scores] = await Promise.all([
          getHostApplications(ctx.token, ctx.userId),
          getMatchScoresForHost(ctx.token),
        ]);
        return applications
          .filter((application) => application.listingId === listingId)
          .map((application) => {
            const match = scores.get(matchScoreKey(application.listingId, application.seekerProfileId));
            return {
              seekerProfileId: application.seekerProfileId,
              status: application.status,
              matchBand: match?.band ?? null,
              matchScore: match?.score ?? null,
            };
          })
          .sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
      },
    }),
  };
}
