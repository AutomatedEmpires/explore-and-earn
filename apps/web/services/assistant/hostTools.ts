import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  analyzeResume,
  getHostApplications,
  getHostListings,
  getInviteEntitlement,
  getListingMatchRequirements,
  getMatchedSeekersForListing,
  getMatchScoresForHost,
  getSeekerResumeByProfileId,
  matchScoreKey,
  prepareForListing,
} from "@explore-and-earn/db";
import {
  hasResumeExperienceIdentity,
  topMatchReasons,
} from "@explore-and-earn/contracts";

import { checkRateLimit } from "../../lib/rateLimit";

/**
 * Host Guide tools — the listing-coach + applicant-screening trust boundary.
 *
 * Identity ({ token, userId }) is CLOSED OVER at construction. Every tool acts
 * only as the authenticated host via the same RLS-scoped services the host
 * dashboard uses, so it can only ever see this host's own listings/applicants;
 * applicant resume access is additionally gated in the database by migration
 * 084, which derives the host from the JWT and returns rows only for a seeker
 * who applied to, was invited by, or converses with them. All tools are read-only —
 * screening is ASSISTIVE: the Guide summarizes, compares, and prioritizes for
 * review; it never decides, never rejects, and never reveals anything to the
 * candidate. Protected characteristics play no role anywhere: every signal is
 * a work qualification (skills, certifications, dates, listing requirements).
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
        "Rank THIS host's applicants for a listing (by id) by real ADR-040 match fit (band + score), best fit first. Use to answer 'who fits best / who should I look at'. Ranking is a review PRIORITY, never a decision.",
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

    screen_applicant: tool({
      description:
        "Structured screening summary for ONE applicant (by seekerProfileId) to ONE of this host's listings (by listingId): their real resume against the listing's actual requirements, covered vs missing skills/certifications, information gaps, and grounded interview topics. ASSISTIVE ONLY — you summarize for the host's review; you never recommend rejecting anyone, never infer protected traits, and never invent work history.",
      inputSchema: z.object({
        listingId: z.string(),
        seekerProfileId: z.string(),
      }),
      execute: async ({ listingId, seekerProfileId }) => {
        const { allowed } = checkRateLimit(
          `assistant-screen:${ctx.userId}`,
          30,
          10 * 60 * 1000,
        );
        if (!allowed) return { error: "rate_limited" as const };

        // The applicant must have applied to a listing THIS host owns —
        // otherwise this tool reveals nothing (not even existence).
        const applications = await getHostApplications(ctx.token, ctx.userId);
        const application = applications.find(
          (app) => app.listingId === listingId && app.seekerProfileId === seekerProfileId,
        );
        if (!application) return { error: "applicant_not_found" as const };

        // The resume read is entitlement-checked again inside the database
        // (084) — defense in depth on top of the application check above.
        const [resume, requirements, scores] = await Promise.all([
          getSeekerResumeByProfileId(ctx.token, seekerProfileId),
          getListingMatchRequirements(listingId),
          getMatchScoresForHost(ctx.token),
        ]);
        if (!resume) return { error: "resume_unavailable" as const };

        const meaningfulExperiences = resume.experiences.filter(
          hasResumeExperienceIdentity,
        );
        const insights = analyzeResume(resume, Date.now());
        const preparation = requirements
          ? prepareForListing(insights, requirements, resume.certifications)
          : null;
        const match = scores.get(matchScoreKey(listingId, seekerProfileId));

        // Interview topics derive ONLY from real gaps between the listing's
        // stated requirements and the applicant's stored records.
        const interviewTopics: string[] = [];
        for (const skill of preparation?.missingSkills ?? []) {
          interviewTopics.push(`Experience with ${skill} (requested by the listing, not in their resume)`);
        }
        for (const cert of preparation?.missingCertifications ?? []) {
          interviewTopics.push(`Status of the ${cert} certification the listing requires`);
        }
        for (const experience of meaningfulExperiences) {
          if (!experience.summary?.trim() && experience.roleTitle) {
            interviewTopics.push(`Details of their time as ${experience.roleTitle}${experience.companyName ? ` at ${experience.companyName}` : ""}`);
          }
        }

        return {
          applicationStatus: application.status,
          coverMessage: application.coverMessage ?? null,
          matchBand: match?.band ?? null,
          matchScore: match?.score ?? null,
          resume: {
            displayName: resume.profile?.displayName ?? null,
            bio: resume.profile?.bio ?? null,
            skills: resume.profile?.generalSkills ?? [],
            experiences: meaningfulExperiences.map((experience) => ({
              role: experience.roleTitle,
              company: experience.companyName,
              start: experience.startDate,
              end: experience.endDate,
              current: experience.isCurrent,
              summary: experience.summary,
            })),
            certifications: resume.certifications.map((cert) => ({
              name: cert.name,
              expires: cert.expiresAt,
              doesNotExpire: cert.doesNotExpire,
            })),
          },
          requirements: preparation
            ? {
                coveredSkills: preparation.coveredSkills.map((s) => s.skill),
                missingSkills: preparation.missingSkills,
                coveredCertifications: preparation.coveredCertifications,
                missingCertifications: preparation.missingCertifications,
              }
            : null,
          missingInformation: insights.gaps.map((gap) => gap.code),
          interviewTopics,
        };
      },
    }),

    matched_seekers: tool({
      description:
        "Ranked matched seekers for ONE of this host's listings (by id) from real persisted ADR-040 scores, with the host's current invite allowance. Use for 'who should I invite / find candidates'. A shortlist, not the whole market — the full seeker search still exists.",
      inputSchema: z.object({ listingId: z.string() }),
      execute: async ({ listingId }) => {
        const [sourced, entitlement] = await Promise.all([
          getMatchedSeekersForListing(ctx.token, ctx.userId, listingId, 10),
          getInviteEntitlement(ctx.token, ctx.userId).catch(() => null),
        ]);
        if (!sourced) return { error: "listing_not_found" as const };
        return {
          seekers: sourced.seekers.map((seeker) => ({
            seekerProfileId: seeker.seekerProfileId,
            displayName: seeker.displayName,
            bio: seeker.shortBio,
            skills: seeker.generalSkills,
            matchBand: seeker.band,
            matchScore: seeker.score,
            topReasons: topMatchReasons(seeker.components).map((r) => r.label),
            alreadyInvited: seeker.alreadyInvited,
          })),
          invites: entitlement
            ? {
                monthlyAllowance: entitlement.monthlyAllowance,
                remainingThisMonth: entitlement.monthlyRemaining,
                purchasedBalance: entitlement.purchasedBalance,
                totalRemaining: entitlement.totalRemaining,
                metered: entitlement.ledgerAvailable,
              }
            : null,
        };
      },
    }),

    invite_entitlement: tool({
      description:
        "THIS host's current invite allowance: monthly included invites (by their real plan), used/remaining this month, and purchased credit balance. Use for 'how many invites do I have left'.",
      inputSchema: z.object({}),
      execute: async () => {
        const entitlement = await getInviteEntitlement(ctx.token, ctx.userId);
        if (!entitlement) return { error: "not_a_host" as const };
        return {
          tier: entitlement.tier,
          monthlyAllowance: entitlement.monthlyAllowance,
          usedThisMonth: entitlement.monthlyUsed,
          remainingThisMonth: entitlement.monthlyRemaining,
          purchasedBalance: entitlement.purchasedBalance,
          totalRemaining: entitlement.totalRemaining,
          // False = the usage ledger isn't live yet; don't quote balances.
          metered: entitlement.ledgerAvailable,
        };
      },
    }),
  };
}
