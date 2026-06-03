import {
  HOST_LISTINGS,
  HostListingsManager,
  HostSectionHeading,
} from "../../../../components/host";
import { EmptyState } from "../../../../components/discovery";
import styles from "./page.module.css";

export default function HostListingsPage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Listings"
        description="Every opportunity you have posted, with live applicant counts. Filter by status to focus your pipeline."
        actionLabel="New listing"
        actionHref="/host/listings/new"
      />
      {HOST_LISTINGS.length > 0 ? (
        <HostListingsManager listings={HOST_LISTINGS} />
      ) : (
        <EmptyState
          title="No listings yet"
          message="Post your first opportunity to start receiving applicants."
        />
      )}
    </section>
  );
}
