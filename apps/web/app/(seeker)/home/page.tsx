import type { Metadata } from "next";

import { auth, currentUser } from "@clerk/nextjs/server";

import {
  BucketChips,
  LifecycleList,
  PrimaryActionCard,
  SectionHeading,
  StatusStrip,
  getMatchedListings,
  getPrimaryActionInput,
  getSeekerStatus,
} from "../../../components/seeker";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
};

export default async function SeekerHomePage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;
  const user = userId ? await currentUser() : null;
  const fallbackName = user?.firstName ?? null;

  const [status, primaryActionInput, matchedListings] = await Promise.all([
    getSeekerStatus(token, userId, fallbackName),
    getPrimaryActionInput(token, userId),
    getMatchedListings(token, userId),
  ]);
  return (
    <>
      <section className={styles.block}>
        <SectionHeading
          title="Your adventure command center"
          description="What matters now, and your next best action."
        />
        <StatusStrip status={status} />
      </section>

      <section className={styles.block}>
        <PrimaryActionCard input={primaryActionInput} />
      </section>

      <section className={styles.block}>
        <SectionHeading
          title="Matched listings"
          description="Relevance is shown as a neutral signal — never a score to chase."
          actionLabel="See all"
          actionHref="/seek"
        />
        <LifecycleList
          items={matchedListings.map((listing) => ({ listing }))}
          surface="matched"
          emptyTitle="No matches yet"
          emptyMessage="Complete your resume and preferences to start seeing matched opportunities."
        />
      </section>

      <section className={styles.block}>
        <SectionHeading title="Your applications" description="Jump back into any bucket." />
        <BucketChips status={status} />
      </section>
    </>
  );
}
