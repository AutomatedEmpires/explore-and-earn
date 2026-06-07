import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { getApplicationsForSeekerWithListings } from "@explore-and-earn/db";

import { ApplicationCard, BucketPage } from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";
import styles from "../../../components/seeker/LifecycleList.module.css";

export const metadata: Metadata = {
  title: "Accepted",
};

// Per-seeker application data must never be statically cached.
export const dynamic = "force-dynamic";

export default async function AcceptedPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    return (
      <BucketPage
        title="Accepted"
        description="Your confirmed roles and pre-arrival steps."
      >
        <EmptyState
          title="Sign in to see your accepted roles"
          message="Sign in to see your confirmed roles and pre-arrival steps."
        />
      </BucketPage>
    );
  }

  const applications = await getApplicationsForSeekerWithListings(token, userId).catch(
    () => [],
  );
  const accepted = applications.filter(
    (application) => application.status === "accepted",
  );

  return (
    <BucketPage
      title="Accepted"
      description="Your confirmed roles and pre-arrival steps."
    >
      {accepted.length > 0 ? (
        <div className={styles.grid}>
          {accepted.map((application) => (
            <ApplicationCard key={application.id} application={application} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No accepted roles yet"
          message="When you accept an offer, your upcoming role will live here. Keep exploring opportunities under Seek."
        />
      )}
    </BucketPage>
  );
}
