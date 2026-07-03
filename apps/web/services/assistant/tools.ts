import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  computeMatch,
  getPublicListingById,
  getSeekerApplications,
  getSeekerProfile,
  searchListings,
  type MatchListingInput,
  type MatchSeekerInput,
} from "@explore-and-earn/db";
import { matchReasonPhrase, topMatchReasons } from "@explore-and-earn/contracts";

/**
 * Seeker assistant tools — the trust boundary.
 *
 * Identity ({ token, userId }) is CLOSED OVER here at construction. The model
 * never supplies a user id; every tool acts only as the authenticated seeker via
 * the same RLS-scoped services the UI uses. Cross-user access is therefore
 * structurally impossible, not merely discouraged. All tools are read-only —
 * the assistant drafts and explains; the human acts.
 */

export interface SeekerToolContext {
  readonly token: string;
  readonly userId: string;
}

type SeekerProfile = NonNullable<Awaited<ReturnType<typeof getSeekerProfile>>>;
type Listing = NonNullable<Awaited<ReturnType<typeof getPublicListingById>>>;

function toSeekerInput(profile: SeekerProfile): MatchSeekerInput {
  return {
    desiredCategories: profile.desiredCategories ?? [],
    desiredRoles: profile.desiredRoles ?? [],
    housingPreference: profile.housingPreference,
    mealsPreference: profile.mealsPreference,
    locationPref: profile.locationPref,
    payExpectationMinCents: profile.payExpectationMinCents,
    payFlexible: profile.payFlexible,
  };
}

function toListingInput(listing: Listing): MatchListingInput {
  return {
    category: listing.category,
    housingIncluded: listing.housing_included,
    mealsIncluded: listing.meals_included,
    compensationMinCents: listing.compensation_min_cents,
    compensationMaxCents: listing.compensation_max_cents,
    isRemote: listing.category === "remote",
    locationDisplay: listing.location_display,
    visaSupport: listing.visa_support,
    beginsAt: listing.begins_at,
    endsAt: listing.ends_at,
    status: listing.status,
  };
}

export function buildSeekerTools(ctx: SeekerToolContext): ToolSet {
  return {
    find_opportunities: tool({
      description:
        "Search LIVE opportunities by keyword, category, housing/meals need, and pay floor. Use for 'find/show me ...' requests. Returns real listings only.",
      inputSchema: z.object({
        query: z.string().optional().describe("free-text keywords"),
        category: z
          .enum(["farm", "maritime", "remote", "seasonal", "mix"])
          .optional(),
        requiresHousing: z.boolean().optional(),
        requiresMeals: z.boolean().optional(),
        minPay: z.number().optional().describe("minimum pay in whole dollars"),
      }),
      execute: async ({ query, category, requiresHousing, requiresMeals, minPay }) => {
        const rows = await searchListings({
          query,
          categories: category ? [category] : undefined,
          hasHousing: requiresHousing,
          hasMeals: requiresMeals,
          payMin: minPay,
          limit: 8,
        });
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          category: row.category,
          location: row.location_display,
          housing: row.housing_included,
          meals: row.meals_included,
          payMinCents: row.compensation_min_cents,
          payMaxCents: row.compensation_max_cents,
          begins: row.begins_at,
          ends: row.ends_at,
        }));
      },
    }),

    explain_match: tool({
      description:
        "Explain how well ONE listing (by id) fits THIS seeker: match band, the top contributing reasons, and any blocking requirements. Use to answer 'why is this a good match / is X right for me'.",
      inputSchema: z.object({ listingId: z.string() }),
      execute: async ({ listingId }) => {
        const [listing, profile] = await Promise.all([
          getPublicListingById(listingId),
          getSeekerProfile(ctx.token, ctx.userId),
        ]);
        if (!listing) return { error: "listing_not_found" as const };
        if (!profile) {
          return {
            error: "profile_incomplete" as const,
            hint: "Complete your profile to get match insights.",
          };
        }
        const result = computeMatch(toSeekerInput(profile), toListingInput(listing), {
          nowMs: Date.now(),
        });
        return {
          listingTitle: listing.title,
          band: result.band,
          score: result.score,
          confidence: result.confidence,
          reasons: topMatchReasons(result.components).map((reason) => reason.label),
          summary: matchReasonPhrase(result.components),
          blockers: result.capsApplied,
        };
      },
    }),

    my_applications: tool({
      description: "List THIS seeker's applications and their current statuses.",
      inputSchema: z.object({}),
      execute: async () => {
        const applications = await getSeekerApplications(ctx.token, ctx.userId);
        return applications.map((application) => ({
          listingId: application.listingId,
          status: application.status,
          submittedAt: application.submittedAt,
        }));
      },
    }),

    profile_tips: tool({
      description:
        "Identify which of THIS seeker's profile fields are missing, so matches improve. Use for 'how do I improve my profile / matches'.",
      inputSchema: z.object({}),
      execute: async () => {
        const profile = await getSeekerProfile(ctx.token, ctx.userId);
        if (!profile) {
          return { missing: ["your whole profile"], complete: false };
        }
        const missing: string[] = [];
        if (!profile.desiredCategories?.length) missing.push("desired categories");
        if (!profile.housingPreference) missing.push("housing preference");
        if (!profile.locationPref) missing.push("location preference");
        if (profile.payExpectationMinCents == null) missing.push("pay expectation");
        if (!profile.shortBio) missing.push("a short bio");
        return { missing, complete: missing.length === 0 };
      },
    }),
  };
}
