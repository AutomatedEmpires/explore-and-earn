import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { getApplicationsForSeekerWithListings } from "@explore-and-earn/db";

import { ApplicationCard, BucketPage } from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";
import styles from "../../../components/seeker/LifecycleList.module.css";

export const metadata: Metadata = {
  title: "Not selected",
};

// Per-seeker application data must never be statically cached.
export const dynamic = "force-dynamic";

export default async function NotSelectedPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    return (
      <BucketPage
        title="Not selected"
        description="Closure without the noise — explore similar opportunities."
      >
        <EmptyState
          title="Sign in to see your applications"
          message="Sign in to see the applications that have closed."
        />
      </BucketPage>
    );
  }

  const applications = await getApplicationsForSeekerWithListings(token, userId).catch(
    () => [],
  );
  const notSelected = applications
    .filter(
      (application) =>
        application.status === "not_selected" || application.status === "rejected",
    )
    .map((application) =>
      application.status === "rejected"
        ? { ...application, status: "not_selected" }
        : application,
    );

  return (
    <BucketPage
      title="Not selected"
      description="Closure without the noise — explore similar opportunities."
    >
      {notSelected.length > 0 ? (
        <div className={styles.grid}>
          {notSelected.map((application) => (
            <ApplicationCard key={application.id} application={application} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing here"
          message="Roles that didn't work out will be listed here, quietly and respectfully. Keep exploring opportunities under Seek."
        />
      )}
    </BucketPage>
  );
}
