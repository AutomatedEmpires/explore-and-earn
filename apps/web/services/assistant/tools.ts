import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  analyzeResume,
  buildMatchTrace,
  getListingMatchRequirements,
  getPublicListingById,
  getSeekerApplications,
  getSeekerProfile,
  getSeekerResume,
  prepareForListing,
  searchListings,
  toListingRowMatchInput,
  toSeekerMatchInput,
  type ListingRow,
} from "@explore-and-earn/db";
import {
  hasResumeExperienceIdentity,
  normalizeResumeExperienceIdentity,
  renderMatchTrace,
  type MatchTrace,
} from "@explore-and-earn/contracts";

import { checkRateLimit } from "../../lib/rateLimit";

/**
 * Seeker Guide tools — the trust boundary.
 *
 * Identity ({ token, userId }) is CLOSED OVER here at construction. The model
 * never supplies a user id; every tool acts only as the authenticated seeker
 * via the same RLS-scoped services the UI uses. Cross-user access is therefore
 * structurally impossible, not merely discouraged. All tools are read-only —
 * the Guide drafts, explains, and proposes; the human acts. Résumé suggestions
 * carry provenance and are REVIEW-ONLY: nothing the model sees or says can
 * write to the seeker's canonical profile.
 *
 * Fit math consistency: every fit/trace here goes through the SAME shared
 * mappers the /seek grid and listing page use (toSeekerMatchInput /
 * toListingRowMatchInput → buildMatchTrace), so the Guide can never quote a
 * score that disagrees with the UI.
 */

export interface SeekerToolContext {
  readonly token: string;
  readonly userId: string;
}

/** Compact listing summary shared by search/compare/prepare results. */
function listingSummary(row: ListingRow) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    location: row.location_display,
    housing: row.housing_included,
    housingDetails: row.housing_description,
    meals: row.meals_included,
    mealsDetails: row.meals_description,
    payMinCents: row.compensation_min_cents,
    payMaxCents: row.compensation_max_cents,
    paySummary: row.compensation_summary,
    begins: row.begins_at,
    ends: row.ends_at,
    visaSupport: row.visa_support,
  };
}

/** Fit fields safe to narrate (score + band + honest rendered evidence). */
function fitSummary(trace: MatchTrace) {
  return {
    band: trace.band,
    score: trace.score,
    confidence: trace.confidence,
    // Rendered from the structured trace ONLY (G34) — the model narrates
    // these lines; it must not invent additional reasons.
    reasons: renderMatchTrace(trace, "seeker", 4),
    blockers: trace.capsApplied,
  };
}

/**
 * Deterministic "questions worth asking the host" — derived from what the
 * listing genuinely leaves unanswered. Never speculative.
 */
function questionsForHost(row: ListingRow): string[] {
  const questions: string[] = [];
  if (row.housing_included && !row.housing_description?.trim()) {
    questions.push("What is the housing like — private or shared, and what does it include?");
  }
  if (!row.housing_included) {
    questions.push("Are there affordable housing options nearby that other crew use?");
  }
  if (row.meals_included && !row.meals_description?.trim()) {
    questions.push("Which meals are provided, and how does food work on days off?");
  }
  if (row.compensation_min_cents == null) {
    questions.push("What is the actual pay for this role?");
  }
  if (!row.begins_at) {
    questions.push("When does the season start, and how flexible is the start date?");
  }
  if (!row.ends_at) {
    questions.push("How long does the role run?");
  }
  return questions;
}

export function buildSeekerTools(ctx: SeekerToolContext): ToolSet {
  /** Load profile + live listing and build the shared-mapper trace. */
  async function traceForListing(listingId: string): Promise<
    | { error: "listing_not_found" | "profile_incomplete" }
    | { listing: ListingRow; trace: MatchTrace }
  > {
    const [listing, profile] = await Promise.all([
      getPublicListingById(listingId),
      getSeekerProfile(ctx.token, ctx.userId),
    ]);
    if (!listing) return { error: "listing_not_found" as const };
    if (!profile) return { error: "profile_incomplete" as const };
    const trace = buildMatchTrace(
      toSeekerMatchInput(profile),
      toListingRowMatchInput(listing),
      { nowMs: Date.now() },
    );
    return { listing, trace };
  }

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
        "Explain how well ONE listing (by id) fits THIS seeker: match band, honest evidence lines (positive, negative, and missing-information), and any hard blockers. Use to answer 'why is this a good match / is X right for me'. Report the reasons faithfully — including what CANNOT be evaluated yet.",
      inputSchema: z.object({ listingId: z.string() }),
      execute: async ({ listingId }) => {
        const loaded = await traceForListing(listingId);
        if ("error" in loaded) {
          return loaded.error === "profile_incomplete"
            ? {
                error: "profile_incomplete" as const,
                hint: "Complete your profile to get match insights.",
              }
            : { error: loaded.error };
        }
        return {
          listingTitle: loaded.listing.title,
          ...fitSummary(loaded.trace),
        };
      },
    }),

    prepare_application: tool({
      description:
        "Prepare THIS seeker to apply to ONE listing (by id): the honest fit picture, which of the listing's required skills/certifications their resume actually covers (with what's missing), profile fields still empty, and grounded questions worth asking the host. Use for 'help me apply / am I ready / how do I stand out'.",
      inputSchema: z.object({ listingId: z.string() }),
      execute: async ({ listingId }) => {
        const loaded = await traceForListing(listingId);
        if ("error" in loaded) return { error: loaded.error };

        const [resume, requirements] = await Promise.all([
          getSeekerResume(ctx.token, ctx.userId),
          getListingMatchRequirements(listingId),
        ]);
        const insights = analyzeResume(resume, Date.now());
        const preparation = requirements
          ? prepareForListing(insights, requirements, resume.certifications)
          : null;

        return {
          listingTitle: loaded.listing.title,
          fit: fitSummary(loaded.trace),
          resumeCompleteness: insights.completeness,
          resumeGaps: insights.gaps.map((gap) => gap.code),
          // null = the listing states no structured requirements (or they are
          // unavailable) — say so; do NOT invent requirements.
          requirements: preparation
            ? {
                coveredSkills: preparation.coveredSkills.map((s) => s.skill),
                missingSkills: preparation.missingSkills,
                coveredCertifications: preparation.coveredCertifications,
                missingCertifications: preparation.missingCertifications,
              }
            : null,
          questionsForHost: questionsForHost(loaded.listing),
        };
      },
    }),

    compare_opportunities: tool({
      description:
        "Compare 2-3 listings (by id) side by side for THIS seeker: housing/meals/pay, dates, location, and each one's honest fit. Use for 'which of these is better for me'.",
      inputSchema: z.object({
        listingIds: z.array(z.string()).min(2).max(3),
      }),
      execute: async ({ listingIds }) => {
        const unique = [...new Set(listingIds)];
        const results = await Promise.all(
          unique.map(async (id) => {
            const loaded = await traceForListing(id);
            if ("error" in loaded) return { id, error: loaded.error };
            return {
              ...listingSummary(loaded.listing),
              fit: fitSummary(loaded.trace),
            };
          }),
        );
        return { listings: results };
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

    resume_summary: tool({
      description:
        "Summarize THIS seeker's resume/profile and surface the gaps (missing bio, no experience, no education, no skills). Use for 'help with my resume / make my profile stronger' — then coach concrete additions or draft an experience bullet.",
      inputSchema: z.object({}),
      execute: async () => {
        const resume = await getSeekerResume(ctx.token, ctx.userId);
        const profile = resume.profile;
        const meaningfulExperiences = resume.experiences
          .filter(hasResumeExperienceIdentity)
          .map((experience) => ({
            ...experience,
            ...normalizeResumeExperienceIdentity(experience),
          }));
        const gaps: string[] = [];
        if (!profile?.bio?.trim()) gaps.push("a short bio that says who you are and what you're after");
        if (meaningfulExperiences.length === 0) gaps.push("at least one work experience with a concrete summary");
        if (resume.educations.length === 0) gaps.push("education or training");
        if ((profile?.generalSkills.length ?? 0) === 0) gaps.push("a few skills");
        if ((profile?.desiredCategories.length ?? 0) === 0) gaps.push("the categories of work you want");
        return {
          headline: profile?.headline ?? null,
          hasBio: Boolean(profile?.bio?.trim()),
          skills: profile?.generalSkills ?? [],
          desiredCategories: profile?.desiredCategories ?? [],
          experienceCount: meaningfulExperiences.length,
          educationCount: resume.educations.length,
          certificationCount: resume.certifications.length,
          experiences: meaningfulExperiences.map((experience) => ({
            role: experience.roleTitle,
            company: experience.companyName,
            hasSummary: Boolean(experience.summary?.trim()),
          })),
          gaps,
        };
      },
    }),

    resume_insights: tool({
      description:
        "Deep, deterministic analysis of THIS seeker's resume: skills with provenance (which real entry supports each one), gaps, date/duplicate conflicts, and REVIEW-ONLY improvement suggestions. Every suggestion is a PROPOSAL the seeker must apply themselves in the resume builder — you cannot and must not claim anything was saved. Distinguish parsed facts from inferences when narrating.",
      inputSchema: z.object({}),
      execute: async () => {
        const { allowed } = checkRateLimit(
          `assistant-resume-insights:${ctx.userId}`,
          30,
          10 * 60 * 1000,
        );
        if (!allowed) return { error: "rate_limited" as const };

        const resume = await getSeekerResume(ctx.token, ctx.userId);
        const insights = analyzeResume(resume, Date.now());
        return {
          completeness: insights.completeness,
          counts: insights.counts,
          skills: insights.skills.map((skill) => ({
            skill: skill.skill,
            onProfile: skill.onProfile,
            kind: skill.kind, // 'parsed' (their own words) vs 'inferred'
            confidence: skill.confidence,
            evidence: skill.evidence.map((e) => ({
              source: e.source,
              field: e.field,
              excerpt: e.excerpt ?? null,
            })),
          })),
          gaps: insights.gaps,
          conflicts: insights.conflicts,
          suggestions: insights.suggestions,
          // Structural honesty: proposals only — the Guide has no write tools.
          reviewRequired: true,
        };
      },
    }),
  };
}
