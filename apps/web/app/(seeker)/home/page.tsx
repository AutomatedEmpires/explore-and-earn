import type { Metadata } from "next";

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

export const metadata: Metadata = {
  title: "Home",
};

export default async function SeekerHomePage() {
  const [status, primaryActionInput, matchedListings] = await Promise.all([
    getSeekerStatus(),
    getPrimaryActionInput(),
    getMatchedListings(),
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
          description="Relevance is shown as a neutral signal \u2014 never a score to chase."
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
