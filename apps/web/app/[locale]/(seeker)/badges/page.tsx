import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { BadgeGallery, BucketPage } from "../../../../components/seeker";
import { EmptyState } from "../../../../components/discovery";
import { syncSeekerBadges } from "../../../../lib/seekerBadges";

export const metadata: Metadata = {
  title: "Badges",
};

// Badges reflect the signed-in seeker's live activity — never statically cache.
export const dynamic = "force-dynamic";

export default async function BadgesPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  if (!userId || !token) {
    return (
      <BucketPage
        title="Badges"
        description="Milestones you earn as you explore & earn."
      >
        <EmptyState
          title="Sign in to see your badges"
          message="Earn badges as you build your profile, apply, and land roles."
        />
      </BucketPage>
    );
  }

  // Reconcile from current state (awards any newly-earned) and read back the set.
  const { stats, earned } = await syncSeekerBadges(token, userId);

  return (
    <BucketPage
      title="Badges"
      description="Milestones you earn as you explore & earn — collect them all."
    >
      <BadgeGallery earned={earned} stats={stats} />
    </BucketPage>
  );
}
