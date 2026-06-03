import {
  BucketChips,
  LifecycleList,
  PrimaryActionCard,
  SectionHeading,
  StatusStrip,
  MATCHED_LISTINGS,
  PRIMARY_ACTION_INPUT,
  SEEKER_STATUS,
} from "../../../components/seeker";
import styles from "./page.module.css";

export default function SeekerHomePage() {
  return (
    <>
      <section className={styles.block}>
        <SectionHeading
          title="Your adventure command center"
          description="What matters now, and your next best action."
        />
        <StatusStrip status={SEEKER_STATUS} />
      </section>

      <section className={styles.block}>
        <PrimaryActionCard input={PRIMARY_ACTION_INPUT} />
      </section>

      <section className={styles.block}>
        <SectionHeading
          title="Matched listings"
          description="Relevance is shown as a neutral signal — never a score to chase."
          actionLabel="See all"
          actionHref="/seek"
        />
        <LifecycleList
          items={MATCHED_LISTINGS.map((listing) => ({ listing }))}
          surface="matched"
          emptyTitle="No matches yet"
          emptyMessage="Complete your resume and preferences to start seeing matched opportunities."
        />
      </section>

      <section className={styles.block}>
        <SectionHeading title="Your applications" description="Jump back into any bucket." />
        <BucketChips status={SEEKER_STATUS} />
      </section>
    </>
  );
}
