import {
  HOST_LISTINGS,
  HostListingCard,
  HostSectionHeading,
} from "../../../../components/host";
import { EmptyState } from "../../../../components/discovery";
import styles from "./page.module.css";

export default function HostListingsPage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Listings"
        description="Every opportunity you have posted, with live applicant counts."
        actionLabel="New listing"
        actionHref="/host/listings/new"
      />
      {HOST_LISTINGS.length > 0 ? (
        <div className={styles.stack}>
          {HOST_LISTINGS.map((item) => (
            <HostListingCard key={item.listing.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No listings yet"
          message="Post your first opportunity to start receiving applicants."
        />
      )}
    </section>
  );
}
