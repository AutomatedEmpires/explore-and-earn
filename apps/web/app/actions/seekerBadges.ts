"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  BADGE_KEYS,
  getSeekerBadges,
  resolveSeekerProfileIdAdmin,
  setSeekerFeaturedBadgeAdmin,
  type BadgeKey,
} from "@explore-and-earn/db";

const VALID_KEYS = new Set<string>(Object.values(BADGE_KEYS));

/**
 * Feature (or, with an empty value, un-feature) a badge on the seeker's profile.
 * Progressive-enhancement form action — no client JS required. Only an EARNED
 * badge can be featured; the write is service-role (RLS) and best-effort (a
 * missing service role / dev bench simply no-ops rather than throwing).
 */
export async function featureBadgeAction(formData: FormData): Promise<void> {
  const { userId, getToken } = await auth();
  if (!userId) return;
  const token = await getToken();
  if (!token) return;

  const raw = String(formData.get("badgeKey") ?? "");
  const badgeKey: BadgeKey | null =
    raw === "" ? null : VALID_KEYS.has(raw) ? (raw as BadgeKey) : null;
  // A non-empty but unrecognized key is a no-op (never write it).
  if (raw !== "" && badgeKey === null) return;

  try {
    if (badgeKey) {
      const earned = await getSeekerBadges(token, userId);
      if (!earned.some((b) => b.badgeKey === badgeKey)) return; // can't feature a locked badge
    }
    const seekerProfileId = await resolveSeekerProfileIdAdmin(userId);
    if (seekerProfileId) {
      await setSeekerFeaturedBadgeAdmin(seekerProfileId, badgeKey);
    }
  } catch {
    /* dev bench / no service role — no-op */
  }

  revalidatePath("/badges");
  revalidatePath("/profile");
}
