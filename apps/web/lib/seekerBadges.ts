import "server-only";

import {
  awardSeekerBadgesAdmin,
  BADGE_META,
  getSavedListingIds,
  getSeekerApplicationsRich,
  getSeekerBadges,
  getSeekerInvites,
  getSeekerProfile,
  getSeekerResume,
  resolveSeekerProfileIdAdmin,
  seekerResumeCompletion,
  qualifyingBadges,
  type BadgeKey,
  type SeekerBadgeStats,
} from "@explore-and-earn/db";

import { isDevBenchEnabled } from "./devBench";

const LANES = new Set(["farm", "maritime", "remote", "seasonal"]);

/**
 * Dev-bench fixture so /badges (and the profile strip) render a believable mix of
 * earned + locked badges without a Supabase. Its qualifying set is derived, so the
 * page stays internally consistent (a badge shown "earned" always meets its rule).
 */
export const DEV_BADGE_STATS: SeekerBadgeStats = {
  resumeCompletion: 72,
  hasBio: true,
  hasPhoto: true,
  skillsCount: 6,
  experiencesCount: 2,
  educationsCount: 1,
  certificationsCount: 1,
  appliedCount: 7,
  savedCount: 12,
  offersCount: 1,
  acceptedCount: 1,
  invitesCount: 2,
  lanesApplied: 3,
};

/** Snapshot the seeker's current activity — the input to badge evaluation. */
export async function gatherSeekerBadgeStats(
  token: string,
  userId: string,
): Promise<SeekerBadgeStats> {
  if (isDevBenchEnabled()) return DEV_BADGE_STATS;

  const [resume, profile, saved, apps, invites] = await Promise.all([
    getSeekerResume(token, userId).catch(() => ({
      profile: null,
      experiences: [],
      educations: [],
      certifications: [],
    })),
    getSeekerProfile(token, userId).catch(() => null),
    getSavedListingIds(token, userId).catch(() => [] as string[]),
    getSeekerApplicationsRich(token, userId).catch(() => []),
    getSeekerInvites(token, userId).catch(() => []),
  ]);

  const lanes = new Set<string>();
  for (const app of apps) {
    const category = (app as { category?: string | null }).category;
    if (category && LANES.has(category)) lanes.add(category);
  }
  const statusOf = (app: unknown) => String((app as { status?: string }).status ?? "");

  return {
    resumeCompletion: seekerResumeCompletion(resume).completion,
    hasBio: Boolean(resume.profile?.bio && resume.profile.bio.trim().length > 0),
    hasPhoto: Boolean(profile?.profilePhotoUrl),
    skillsCount: resume.profile?.generalSkills?.length ?? 0,
    experiencesCount: resume.experiences.length,
    educationsCount: resume.educations.length,
    certificationsCount: resume.certifications.length,
    appliedCount: apps.length,
    savedCount: saved.length,
    offersCount: apps.filter((a) => statusOf(a) === "offered").length,
    acceptedCount: apps.filter((a) => statusOf(a) === "accepted").length,
    invitesCount: invites.length,
    lanesApplied: lanes.size,
  };
}

/**
 * Reconcile a seeker's badges from their current state: award any newly-qualified
 * badges (service-role, idempotent) and return the stats + the earned key set.
 *
 * Best-effort awarding — if the service-role client is unavailable (e.g. the dev
 * bench, or a transient fault) the seeker still SEES their progress; nothing
 * throws. In the dev bench the earned set is derived from the fixture stats so the
 * surface is fully reviewable offline.
 */
export async function syncSeekerBadges(
  token: string,
  userId: string,
): Promise<{ stats: SeekerBadgeStats; earned: BadgeKey[]; featured: BadgeKey | null }> {
  const stats = await gatherSeekerBadgeStats(token, userId);
  const qualified = qualifyingBadges(stats);

  if (isDevBenchEnabled()) {
    // Feature the highest-tier earned badge so the "Featured" state is visible.
    const featured =
      qualified.find((k) => BADGE_META[k].tier === "elite") ??
      qualified[qualified.length - 1] ??
      null;
    return { stats, earned: qualified, featured };
  }

  try {
    const seekerProfileId = await resolveSeekerProfileIdAdmin(userId);
    if (seekerProfileId) {
      await awardSeekerBadgesAdmin(seekerProfileId, qualified);
    }
  } catch {
    /* service-role unavailable — skip awarding, still show progress */
  }

  const earnedRows = await getSeekerBadges(token, userId).catch(() => []);
  const featured =
    earnedRows.find((row) => (row.metadata as { featured?: boolean } | null)?.featured === true)
      ?.badgeKey ?? null;
  return { stats, earned: earnedRows.map((row) => row.badgeKey), featured };
}
