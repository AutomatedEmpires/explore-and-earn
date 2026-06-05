import { HostSectionHeading, ListingForm } from "../../../../../components/host";
import styles from "./page.module.css";

export default function HostNewListingPage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="New listing"
        description="Draft a new opportunity to share with seekers."
        actionLabel="All listings"
        actionHref="/host/listings"
      />
      <ListingForm mode="create" />
    </section>
  );
}
